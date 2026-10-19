import * as THREE from 'three';
import type { PlayerConfig } from '@rihla/pack-schema';
import { angLerp, clamp, damp, lerp } from '../math/noise.js';
import { buildModel, type Built } from '../models/index.js';
import type { EntityRT, SceneRuntime } from '../scene/scene.js';
import type { Input } from './input.js';

type Mode = 'walk' | 'jetpack' | 'spacecraft' | 'orbit';

interface Spec {
  w: number;
  r: number;
  acc: number;
  rad: number;
  cam: number;
  eye: number;
}
const VSPEC: Record<string, Spec> = {
  walk: { w: 5, r: 10, acc: 10, rad: 0.5, cam: 10, eye: 1.7 },
  camel: { w: 4.2, r: 10, acc: 2.6, rad: 1.2, cam: 12, eye: 3.2 },
  carriage: { w: 6.5, r: 15, acc: 2.2, rad: 1.6, cam: 13, eye: 2.4 },
  balloon: { w: 12, r: 22, acc: 0.9, rad: 2, cam: 46, eye: 6 },
};

export interface PlayerHooks {
  toast(text: string, kind?: 'gold' | 'warn'): void;
  t(key: string, params?: Record<string, string | number>): string;
  /** Called when the avatar touches a sphere collider that warns (the Sun). */
  warn(key: string): void;
  jumped(h: number, earth: number, feedbackKey: string): void;
  tooDeep(key: string): void;
  maxAltitude(): void;
  autopilotArrived(): void;
  locked(): boolean;
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3(), rightV = new THREE.Vector3(), upV = new THREE.Vector3(), WUP = new THREE.Vector3(0, 1, 0), dummy = new THREE.Object3D();
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

export class Player {
  mode: Mode = 'walk';
  cfg: PlayerConfig = { controller: 'walk' };
  scene: SceneRuntime | null = null;
  readonly pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  vy = 0;
  onGround = true;
  private peakY = 0;
  private startY = 0;
  avatar: Built | null = null;
  veh: EntityRT | null = null;
  auto: { x: number; z: number; y?: number | null; run: boolean } | null = null;
  shipAuto: { key: string; label: string } | null = null;
  private wp: [number, number] | null = null;
  private wpT = 0;
  private stuck = 0;
  buffRun = 0;
  buffT = 0;
  waveT = 0;
  descend = false;
  thrust = 0;
  private roll = 0;
  private shipQuat = new THREE.Quaternion();
  cam = { yaw: 0.6, pitch: 0.3, dist: 10, cur: 10, tx: 0, ty: 0, tz: 0 };
  /** Galaxy target distance (smoothly approached). */
  camTarget = 120;
  pullBack = 0;
  private maxAltT = 0;
  marker: THREE.Mesh;
  /** Lander descent animation on arrival. */
  descent: { t: number; ent: EntityRT; height: number; seconds: number; land: THREE.Vector3 } | null = null;
  readonly look = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private hooks: PlayerHooks,
  ) {
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e9b44c', transparent: true, opacity: 0.9, depthWrite: false }));
    this.marker.visible = false;
  }

  get spec(): Spec {
    const s = { ...VSPEC[this.vehPreset ?? 'walk']! };
    if (!this.veh) {
      if (this.cfg.walk) s.w = this.cfg.walk;
      if (this.cfg.run) s.r = this.cfg.run;
      if (this.cfg.eye) s.eye = this.cfg.eye;
      if (this.cfg.camera) s.cam = this.cfg.camera.dist;
    }
    return s;
  }
  get vehPreset(): string | null {
    return this.veh?.def.vehicle?.preset ?? null;
  }
  get altitude(): number {
    if (!this.scene) return 0;
    if (this.mode === 'walk' && this.vehPreset === 'balloon') return this.pos.y - this.scene.effGround(this.pos.x, this.pos.z);
    if (this.mode === 'jetpack') return this.pos.y;
    return 0;
  }
  /** Heights above the avatar origin that count for 3D triggers (balloon: basket and envelope). */
  get probes(): number[] {
    return this.vehPreset === 'balloon' ? [1, 14] : [1];
  }

  /* ---------------------------------------------------------------- scene attach */

  attach(scene: SceneRuntime, pos: THREE.Vector3, yaw: number | undefined, robe: string | undefined, skin: string | undefined, camOverride?: { dist?: number; pitch?: number; yaw?: number }): void {
    if (this.avatar) this.avatar.object.removeFromParent();
    this.marker.removeFromParent();
    this.scene = scene;
    this.cfg = scene.def.player;
    this.mode = this.cfg.controller as Mode;
    this.veh = null;
    this.auto = null;
    this.shipAuto = null;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.onGround = true;
    this.descend = false;
    this.pos.copy(pos);
    this.avatar = null;
    const kind = this.cfg.avatar ?? (this.mode === 'spacecraft' ? 'ship' : this.mode === 'orbit' ? 'none' : 'human');
    if (kind !== 'none') {
      const gen = kind === 'ship' ? 'ship' : kind === 'astronaut' ? 'astronaut' : 'human';
      const params = gen === 'human' ? { robe: robe ?? '#2f63b0', skin: skin ?? '#8a5636', hat: 'cap' } : gen === 'ship' ? { name: 'engine.shipName' } : {};
      this.avatar = buildModel({ gen, params }, scene.ctx, { x: pos.x, y: pos.y, z: pos.z, ground: false });
      scene.scene.add(this.avatar.object);
    }
    scene.scene.add(this.marker);
    if (this.mode === 'walk' && scene.isTerrain) {
      [this.pos.x, this.pos.z] = scene.collide(pos.x, pos.z, 0.6);
      this.pos.y = scene.height(this.pos.x, this.pos.z);
    }
    if (this.mode === 'jetpack') this.pos.y = Math.max(pos.y, 6);
    const c = this.cfg.camera;
    this.cam.dist = camOverride?.dist ?? c?.dist ?? (this.mode === 'spacecraft' ? 16 : 10);
    this.cam.cur = this.cam.dist;
    this.cam.pitch = camOverride?.pitch ?? c?.pitch ?? (this.mode === 'spacecraft' ? 0.18 : 0.3);
    this.cam.yaw = camOverride?.yaw ?? (yaw !== undefined ? yaw : this.cam.yaw);
    this.yaw = this.cam.yaw + Math.PI;
    this.cam.tx = this.pos.x;
    this.cam.ty = this.pos.y + this.spec.eye;
    this.cam.tz = this.pos.z;
    if (this.mode === 'orbit') {
      this.cam.dist = 420;
      this.camTarget = c?.dist ?? 110;
      this.cam.pitch = c?.pitch ?? 0.55;
    }
    this.syncAvatar(0);
  }

  get camLimits(): [number, number, number] {
    if (this.mode === 'spacecraft') return [8, 140, -1.3];
    if (this.mode === 'orbit') return [18, 700, -1.4];
    if (this.vehPreset === 'balloon') return [18, 260, -0.5];
    const c = this.cfg.camera;
    return [c?.min ?? 3, c?.max ?? 120, c?.minPitch ?? 0.04];
  }

  drag(dx: number, dy: number): void {
    const L = this.camLimits;
    this.cam.yaw -= dx * 0.0062;
    this.cam.pitch = clamp(this.cam.pitch + dy * 0.0045, L[2], this.mode === 'orbit' || this.mode === 'spacecraft' ? 1.4 : 1.35);
  }
  zoom(f: number): void {
    const L = this.camLimits;
    if (this.mode === 'orbit') this.camTarget = clamp(this.camTarget * f, L[0], L[1]);
    else this.cam.dist = clamp(this.cam.dist * f, L[0], L[1]);
  }

  /* ---------------------------------------------------------------- travel */

  walkTo(x: number, z: number, run?: boolean, y?: number | null): void {
    const sc = this.scene;
    if (!sc) return;
    if (this.mode === 'walk' && this.vehPreset !== 'balloon') [x, z] = sc.collide(x, z, this.spec.rad + 0.3);
    this.auto = { x, z, run: run ?? Math.hypot(x - this.pos.x, z - this.pos.z) > 45, ...(y !== undefined ? { y } : {}) };
    this.wp = null;
    this.wpT = 0;
    this.stuck = 0;
    if (this.mode === 'walk' || (this.mode === 'jetpack' && y == null)) {
      this.marker.position.set(x, (sc.isTerrain ? sc.height(x, z) : 0) + 0.08, z);
      this.marker.visible = this.mode === 'walk';
    }
  }
  stopAuto(): void {
    this.auto = null;
    this.marker.visible = false;
  }
  flyTo(ent: EntityRT, label: string): void {
    this.shipAuto = { key: ent.id, label };
  }

  /** Instantly move (fast travel / teacher gather). */
  teleport(x: number, z: number, y?: number): void {
    const sc = this.scene;
    if (!sc) return;
    if (this.mode === 'walk' && sc.isTerrain) {
      [x, z] = sc.collide(x, z, this.spec.rad + 0.3);
      this.pos.set(x, sc.height(x, z), z);
    } else this.pos.set(x, y ?? this.pos.y, z);
    this.vel.set(0, 0, 0);
    this.cam.tx = this.pos.x;
    this.cam.tz = this.pos.z;
    this.cam.ty = this.pos.y + this.spec.eye;
    this.stopAuto();
    if (this.veh) sc.syncVehicle(this.veh, this.pos.x, this.pos.y, this.pos.z, this.yaw);
  }

  /* ---------------------------------------------------------------- vehicles */

  mount(v: EntityRT): boolean {
    const sc = this.scene;
    if (!sc || this.veh || v.rider || this.mode !== 'walk') return false;
    this.stopAuto();
    this.veh = v;
    v.rider = true;
    this.pos.set(v.pos.x, v.def.vehicle?.preset === 'balloon' ? v.pos.y : sc.height(v.pos.x, v.pos.z), v.pos.z);
    this.yaw = v.object.rotation.y;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.descend = false;
    const s = this.spec;
    this.cam.dist = Math.max(this.cam.dist, s.cam);
    if (this.vehPreset !== 'balloon' && this.cam.dist > 40) this.cam.dist = s.cam;
    if (this.vehPreset === 'balloon') this.cam.pitch = Math.max(this.cam.pitch, 0.2);
    return true;
  }

  /** Returns false (and explains) when the balloon is still in the air. */
  dismount(): boolean {
    const sc = this.scene, v = this.veh;
    if (!sc || !v) return false;
    if (this.vehPreset === 'balloon' && this.pos.y - sc.effGround(this.pos.x, this.pos.z) > 0.8) {
      this.hooks.toast(this.hooks.t('engine.landFirst'));
      return false;
    }
    const balloon = this.vehPreset === 'balloon';
    v.rider = false;
    this.veh = null;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw), off = balloon ? 2.6 : 2.2;
    const [x, z] = sc.collide(v.pos.x + cs * off, v.pos.z - sn * off, 0.5);
    this.pos.set(x, sc.height(x, z), z);
    v.pos.y = balloon ? sc.effGround(v.pos.x, v.pos.z) : sc.height(v.pos.x, v.pos.z);
    v.object.position.y = v.pos.y;
    v.built.rig?.animate(0, 1, { burn: false }, 0);
    if (this.cam.dist > 40) this.cam.dist = 12;
    this.cam.pitch = clamp(this.cam.pitch, 0.04, 1.35);
    return true;
  }

  jump(): void {
    if (this.mode !== 'walk' || !this.cfg.jump || !this.onGround || this.descent || this.veh) return;
    this.vy = this.cfg.jump.velocity;
    this.onGround = false;
    this.startY = this.pos.y;
    this.peakY = this.pos.y;
  }

  /* ---------------------------------------------------------------- per frame */

  update(dt: number, autopilotTarget: (id: string) => { pos: THREE.Vector3; standoff: number } | null): void {
    if (!this.scene || this.descent) return;
    if (this.hooks.locked()) {
      this.vel.multiplyScalar(Math.exp(-dt * 8));
      this.speed = 0;
      this.syncAvatar(dt);
      return;
    }
    if (this.waveT > 0) this.waveT -= dt;
    if (this.buffT > 0) this.buffT -= dt;
    switch (this.mode) {
      case 'walk':
        if (this.vehPreset === 'balloon') this.updateBalloon(dt);
        else this.updateWalk(dt);
        break;
      case 'jetpack':
        this.updateJetpack(dt);
        break;
      case 'spacecraft':
        this.updateShip(dt, autopilotTarget);
        break;
      case 'orbit':
        break;
    }
    this.syncAvatar(dt);
  }

  private intent(): { mag: number; dx: number; dz: number; run: boolean; y: number } {
    const a = this.input.axes();
    const mag = Math.hypot(a.x, a.z);
    if (mag <= 0.08) return { mag: 0, dx: 0, dz: 0, run: a.run, y: 0 };
    const nx = a.x / Math.max(1, mag), nz = a.z / Math.max(1, mag), y = this.cam.yaw;
    const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const dx = fx * nz + rx * nx, dz = fz * nz + rz * nx, l = Math.hypot(dx, dz) || 1;
    return { mag: Math.min(1, mag), dx: dx / l, dz: dz / l, run: a.run, y: 0 };
  }

  private updateWalk(dt: number): void {
    const sc = this.scene!, sp0 = this.spec, inp = this.intent();
    let { dx, dz, mag, run } = inp;
    if (mag > 0) this.stopAuto();
    else if (this.auto) {
      const a = this.auto;
      this.wpT -= dt;
      if (!this.wp || this.wpT <= 0 || Math.hypot(this.wp[0] - this.pos.x, this.wp[1] - this.pos.z) < 1.2 + sp0.rad) {
        this.wp = (sc.isTerrain ? sc.route(this.pos.x, this.pos.z, a.x, a.z, sp0.rad) : null) ?? [a.x, a.z];
        this.wpT = 0.3;
      }
      const tx = this.wp[0] - this.pos.x, tz = this.wp[1] - this.pos.z, d = Math.hypot(tx, tz) || 1;
      if (Math.hypot(a.x - this.pos.x, a.z - this.pos.z) < 1.1 + sp0.rad) this.stopAuto();
      else {
        dx = tx / d;
        dz = tz / d;
        mag = 1;
        run = a.run;
      }
    }
    let top = run ? sp0.r : sp0.w;
    if (!this.veh && this.buffT > 0 && run) top = this.buffRun;
    const air = !this.onGround;
    const sp = mag * top, k = damp(air ? 2.5 : sp0.acc, dt);
    this.vel.x = lerp(this.vel.x, dx * sp, k);
    this.vel.z = lerp(this.vel.z, dz * sp, k);
    const ox = this.pos.x, oz = this.pos.z;
    const [nx, nz] = sc.collide(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, sp0.rad);
    this.pos.x = nx;
    this.pos.z = nz;
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.speed = moved / Math.max(dt, 1e-4);
    if (this.auto) {
      if (this.speed < 0.6) this.stuck += dt;
      else this.stuck = 0;
      if (this.stuck > 1.4) this.stopAuto();
    }
    if (Math.hypot(this.vel.x, this.vel.z) > 0.4) this.yaw = angLerp(this.yaw, Math.atan2(this.vel.x, this.vel.z), damp(this.veh ? 3.5 : 12, dt));
    const gy = sc.height(this.pos.x, this.pos.z);
    if (!this.onGround && this.cfg.gravity) {
      this.vy -= this.cfg.gravity * 9.81 * dt;
      this.pos.y += this.vy * dt;
      this.peakY = Math.max(this.peakY, this.pos.y);
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        this.vy = 0;
        this.onGround = true;
        const hgt = this.peakY - this.startY;
        const j = this.cfg.jump;
        if (hgt > 0.3 && j) {
          const v = j.velocity, g0 = j.earthGravity ?? 9.81;
          this.hooks.jumped(hgt, (v * v) / (2 * g0), j.feedback ?? 'engine.jumped');
        }
      }
    } else this.pos.y = gy;
    const v = this.veh;
    if (v) {
      sc.syncVehicle(v, this.pos.x, this.pos.y, this.pos.z, this.yaw);
      v.built.rig?.animate(this.speed, dt, {}, moved);
    }
  }

  private updateBalloon(dt: number): void {
    const sc = this.scene!, v = this.veh!, inp = this.intent();
    const k = this.input.keys;
    let up = this.input.hold.up || (!this.input.typing() && !!k.Space), down = this.input.hold.down || (!this.input.typing() && !!k.KeyC);
    if (up) this.descend = false;
    if (this.descend) down = true;
    const floor = sc.effGround(this.pos.x, this.pos.z);
    let alt = this.pos.y - floor;
    if (this.auto && !down && alt < 45) up = true;
    const target = up ? 6.5 : down ? -5.5 : 0;
    this.vy = lerp(this.vy, target, damp(1.4, dt));
    this.pos.y += this.vy * dt + (alt > 3 ? Math.sin(performance.now() * 0.0011) * 0.01 : 0);
    const maxA = this.cfg.bounds?.maxAltitude ?? 480;
    if (this.pos.y > maxA) {
      this.pos.y = maxA;
      if (this.vy > 0) this.vy = 0;
      const n = performance.now();
      if (n - this.maxAltT > 6000) {
        this.maxAltT = n;
        this.hooks.maxAltitude();
      }
    }
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vy < 0) this.vy = 0;
    }
    alt = this.pos.y - floor;
    const air = alt > 1.5;
    if (!air && this.descend && this.vy >= -0.05) this.descend = false;
    let { dx, dz, mag, run } = inp;
    if (mag > 0) this.stopAuto();
    else if (this.auto) {
      const a = this.auto, tx = a.x - this.pos.x, tz = a.z - this.pos.z, d = Math.hypot(tx, tz);
      if (d < 6) this.stopAuto();
      else if (air) {
        dx = tx / d;
        dz = tz / d;
        mag = 1;
        run = d > 220;
      }
    }
    const spd = air ? mag * (run ? 22 : 12) : 0;
    const kk = damp(0.9, dt);
    this.vel.x = lerp(this.vel.x, dx * spd, kk);
    this.vel.z = lerp(this.vel.z, dz * spd, kk);
    if (!air) {
      this.vel.x *= Math.exp(-dt * 5);
      this.vel.z *= Math.exp(-dt * 5);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    [this.pos.x, this.pos.z] = sc.collide(this.pos.x, this.pos.z, 0, true);
    const nf = sc.effGround(this.pos.x, this.pos.z);
    if (this.pos.y < nf) this.pos.y = lerp(this.pos.y, nf, damp(6, dt));
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.yaw += dt * 0.04;
    sc.syncVehicle(v, this.pos.x, this.pos.y, this.pos.z, this.yaw);
    v.built.rig?.animate(0, dt, { burn: up && this.vy > -1 });
  }

  private updateJetpack(dt: number): void {
    const sc = this.scene!, inp = this.intent(), k = this.input.keys;
    let iy = 0;
    if (!this.input.typing()) {
      if (k.Space || this.input.hold.up) iy += 1;
      if (k.KeyC || this.input.hold.down) iy -= 1;
    }
    let { dx, dz, mag, run } = inp;
    if (mag > 0 || iy) this.stopAuto();
    else if (this.auto) {
      const a = this.auto, tx = a.x - this.pos.x, tz = a.z - this.pos.z, d = Math.hypot(tx, tz);
      if (a.y != null) {
        const ty = a.y - this.pos.y;
        iy = clamp(ty * 0.4, -1, 1);
        if (d < 1.2 && Math.abs(ty) < 1) this.stopAuto();
      }
      if (d > 1.1) {
        dx = tx / d;
        dz = tz / d;
        mag = 1;
        run = d > 25;
      } else if (a.y == null) this.stopAuto();
    }
    const sp = mag * (run ? (this.cfg.run ?? 20) : (this.cfg.walk ?? 10)), kk = damp(10, dt);
    this.vel.x = lerp(this.vel.x, dx * sp, kk);
    this.vel.z = lerp(this.vel.z, dz * sp, kk);
    const ox = this.pos.x, oz = this.pos.z;
    [this.pos.x, this.pos.z] = sc.collide(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, 0.4, true);
    this.speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-4);
    this.vy = lerp(this.vy, iy * 7, damp(5, dt));
    this.pos.y += this.vy * dt + Math.sin(performance.now() * 0.002) * 0.004;
    const b = this.cfg.bounds;
    if (this.pos.y < (b?.minY ?? 1.2)) {
      this.pos.y = b?.minY ?? 1.2;
      if (b?.lowWarn) this.hooks.tooDeep(b.lowWarn);
    }
    if (this.pos.y > (b?.maxY ?? 60)) this.pos.y = b?.maxY ?? 60;
    if (Math.hypot(this.vel.x, this.vel.z) > 0.4) this.yaw = angLerp(this.yaw, Math.atan2(this.vel.x, this.vel.z), damp(10, dt));
  }

  private updateShip(dt: number, target: (id: string) => { pos: THREE.Vector3; standoff: number } | null): void {
    const sc = this.scene!, c = this.cam, cp = Math.cos(c.pitch), k = this.input.keys;
    fwd.set(-Math.sin(c.yaw) * cp, -Math.sin(c.pitch), -Math.cos(c.yaw) * cp).normalize();
    rightV.crossVectors(fwd, WUP).normalize();
    upV.crossVectors(rightV, fwd).normalize();
    const a = this.input.axes();
    let iy = 0;
    if (!this.input.typing()) {
      if (k.KeyE || this.input.hold.up) iy += 1;
      if (k.KeyQ || this.input.hold.down) iy -= 1;
    }
    const boost = a.run;
    const mag = Math.hypot(a.x, a.z, iy);
    const maxSp = this.cfg.speed ?? 45, boostSp = this.cfg.boost ?? 150;
    if (mag > 0.08) {
      if (this.shipAuto) this.shipAuto = null;
      tmp.set(0, 0, 0).addScaledVector(fwd, a.z).addScaledVector(rightV, a.x).addScaledVector(upV, iy).normalize();
      this.vel.addScaledVector(tmp, (boost ? 190 : 70) * dt * Math.min(1, mag));
      const max = boost ? boostSp : maxSp;
      if (this.vel.length() > max) this.vel.setLength(lerp(this.vel.length(), max, damp(4, dt)));
      this.thrust = lerp(this.thrust, boost ? 1.6 : 1, damp(6, dt));
      this.roll = lerp(this.roll, -a.x * 0.5, damp(4, dt));
    } else if (this.shipAuto) {
      const b = target(this.shipAuto.key);
      if (!b) this.shipAuto = null;
      else {
        // stop at the standoff point on our side of the target
        tmp2.subVectors(this.pos, b.pos);
        if (tmp2.lengthSq() < 1e-4) tmp2.set(1, 0.2, 0);
        tmp2.normalize();
        tmp2.y = clamp(tmp2.y, -0.35, 0.35);
        tmp2.normalize();
        const tgt = new THREE.Vector3().copy(b.pos).addScaledVector(tmp2, b.standoff);
        let goal = tgt;
        const ab = tmp.subVectors(tgt, this.pos), len = ab.length();
        // detour around the Sun at the origin
        if (this.shipAuto.key !== 'sun' && len > 1) {
          const tp = clamp(-this.pos.dot(ab) / (len * len), 0, 1);
          const cx = this.pos.x + ab.x * tp, cy = this.pos.y + ab.y * tp, cz = this.pos.z + ab.z * tp, dc = Math.hypot(cx, cy, cz);
          if (dc < 85 && this.pos.length() > 80) {
            goal = new THREE.Vector3(cx, 0, cz);
            if (goal.lengthSq() < 1) goal.set(-ab.z, 0, ab.x);
            goal.setLength(120);
          }
        }
        tmp.subVectors(goal, this.pos);
        const d = tmp.length();
        const desired = tmp.normalize().multiplyScalar(Math.min(170, d * 1.4 + 2));
        this.vel.lerp(desired, damp(2.6, dt));
        this.thrust = lerp(this.thrust, clamp(this.vel.length() / 60, 0.2, 1.6), damp(4, dt));
        this.roll = lerp(this.roll, 0, damp(3, dt));
        if (goal === tgt && d < 1.4) {
          this.vel.set(0, 0, 0);
          this.shipAuto = null;
          this.hooks.autopilotArrived();
        }
      }
    } else {
      this.vel.multiplyScalar(Math.exp(-dt * 1.3));
      this.thrust = lerp(this.thrust, 0, damp(4, dt));
      this.roll = lerp(this.roll, 0, damp(3, dt));
    }
    this.pos.addScaledVector(this.vel, dt);
    // ride along with the nearest moving body (so orbiting a planet keeps you next to it)
    let near: EntityRT | null = null, nr = Infinity;
    for (const e of sc.entities) {
      if (!e.def.carry) continue;
      const r = this.pos.distanceTo(e.pos) / e.standoff;
      if (r < nr) {
        nr = r;
        near = e;
      }
    }
    if (near && nr < (near.def.carry ?? 3)) this.pos.add(near.delta);
    for (const s of sc.spheres) {
      tmp.subVectors(this.pos, s.ent.pos);
      const d = tmp.length();
      if (d < s.r) {
        tmp.normalize();
        this.pos.copy(s.ent.pos).addScaledVector(tmp, s.r);
        const vn = this.vel.dot(tmp);
        if (vn < 0) this.vel.addScaledVector(tmp, -vn * s.push);
        if (s.warn) this.hooks.warn(s.warn);
      }
    }
    const R = this.cfg.bounds?.radius ?? 1500;
    if (this.pos.length() > R) this.pos.setLength(R);
    const sp = this.vel.length();
    tmp.copy(sp > 2 ? this.vel : fwd).normalize();
    dummy.position.copy(this.pos);
    dummy.up.copy(WUP);
    dummy.lookAt(tmp2.copy(this.pos).add(tmp));
    dummy.rotateZ(this.roll);
    this.shipQuat.slerp(dummy.quaternion, damp(5, dt));
    this.speed = sp;
  }

  private syncAvatar(dt: number): void {
    const a = this.avatar;
    if (!a) return;
    const o = a.object;
    if (this.mode === 'spacecraft') {
      o.position.copy(this.pos);
      o.quaternion.copy(this.shipQuat);
      a.rig?.animate(0, dt, { thrust: this.thrust });
      return;
    }
    const v = this.veh;
    if (v && this.vehPreset === 'balloon') {
      o.position.set(this.pos.x + 0.3, this.pos.y + 0.12, this.pos.z);
      o.rotation.y = this.cam.yaw + Math.PI;
      a.rig?.animate(0, dt, { waving: this.waveT > 0 });
      return;
    }
    if (v) {
      const s = v.built.rig?.seat ?? { y: 2, z: 0, sit: 'straddle' as const };
      const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
      o.position.set(this.pos.x + sn * s.z, this.pos.y + s.y - (s.sit ? 0.66 : 0), this.pos.z + cs * s.z);
      o.rotation.y = this.yaw;
      a.rig?.animate(0, dt, { waving: this.waveT > 0, sit: s.sit });
      return;
    }
    o.position.copy(this.pos);
    o.rotation.y = this.yaw;
    a.rig?.animate(this.speed, dt, { waving: this.waveT > 0, air: !this.onGround, fly: this.mode === 'jetpack' });
  }

  /* ---------------------------------------------------------------- camera */

  updateCamera(dt: number, blend: { from: THREE.Vector3; look: THREE.Vector3; t: number } | null): void {
    const sc = this.scene;
    if (!sc) return;
    const cam = this.camera;
    if (this.descent) {
      const D = this.descent;
      D.t = Math.min(1, D.t + dt / D.seconds);
      const e = 1 - Math.pow(1 - D.t, 3), gp = D.land;
      D.ent.object.position.set(gp.x, gp.y + (1 - e) * D.height, gp.z);
      D.ent.built.rig?.animate(0, dt, { thrust: 1 + (1 - e) * 2 });
      cam.position.set(gp.x + 12, gp.y + 8 + (1 - e) * 30, gp.z + 16);
      cam.lookAt(D.ent.object.position);
      if (D.t >= 1) {
        D.ent.built.rig?.animate(0, dt, { thrust: sc.def.kind === 'deck' ? 1 : 0 });
        this.descent = null;
        if (this.avatar) this.avatar.object.visible = true;
      }
      return;
    }
    if (this.mode === 'orbit') {
      const c = this.cam;
      c.dist = lerp(c.dist, this.camTarget, damp(2, dt));
      const cp = Math.cos(c.pitch);
      cam.position.set(Math.sin(c.yaw) * cp * c.dist, Math.sin(c.pitch) * c.dist, Math.cos(c.yaw) * cp * c.dist);
      cam.lookAt(0, 0, 0);
      return;
    }
    if (this.mode === 'spacecraft') {
      const c = this.cam, cp = Math.cos(c.pitch), dist = c.dist + this.pullBack * this.pullBack * 2600;
      cam.position.set(this.pos.x + Math.sin(c.yaw) * cp * dist, this.pos.y + Math.sin(c.pitch) * dist, this.pos.z + Math.cos(c.yaw) * cp * dist);
      cam.lookAt(this.pos.x, this.pos.y + 0.8, this.pos.z);
      return;
    }
    const spec = this.spec, c = this.cam, k = damp(this.mode === 'jetpack' ? 10 : 12, dt);
    c.tx = lerp(c.tx, this.pos.x, k);
    c.ty = lerp(c.ty, this.pos.y + (this.mode === 'jetpack' ? 1.6 : spec.eye), k);
    c.tz = lerp(c.tz, this.pos.z, k);
    const cp = Math.cos(c.pitch), dx = Math.sin(c.yaw) * cp, dy = Math.sin(c.pitch), dz = Math.cos(c.yaw) * cp;
    let allowed = c.dist;
    if (sc.isTerrain) {
      const steps = sc.def.kind === 'terrain' && this.mode === 'walk' ? 16 : 12;
      for (let i = 1; i <= steps; i++) {
        const d = (i / steps) * c.dist, px = c.tx + dx * d, py = c.ty + dy * d, pz = c.tz + dz * d;
        if (py < sc.height(px, pz) + 0.5 || sc.solidAt(px, py, pz)) {
          allowed = Math.max(2.5, ((i - 1) / steps) * c.dist);
          break;
        }
      }
    }
    c.cur = allowed < c.cur ? allowed : lerp(c.cur, allowed, damp(3, dt));
    tmp.set(c.tx + dx * c.cur, c.ty + dy * c.cur, c.tz + dz * c.cur);
    if (sc.isTerrain) {
      const gh = sc.height(tmp.x, tmp.z) + 0.6;
      if (tmp.y < gh) tmp.y = gh;
    } else if (tmp.y < 0.8) tmp.y = 0.8;
    this.look.set(c.tx, c.ty, c.tz);
    if (blend && blend.t < 1) {
      const e = blend.t * blend.t * (3 - 2 * blend.t);
      cam.position.lerpVectors(blend.from, tmp, e);
      tmp2.lerpVectors(blend.look, this.look, e);
      cam.lookAt(tmp2);
    } else {
      cam.position.copy(tmp);
      cam.lookAt(this.look);
    }
    if (this.marker.visible) {
      const s = 1 + Math.sin(performance.now() * 0.006) * 0.12;
      this.marker.scale.set(s, 1, s);
    }
  }

  /* ---------------------------------------------------------------- picking */

  /** Raycast a screen point: returns the entity hit, or a ground point for tap-to-walk. */
  pick(px: number, py: number, w: number, hgt: number): { ent: EntityRT | null; ground: THREE.Vector3 | null } {
    const sc = this.scene;
    if (!sc) return { ent: null, ground: null };
    ndc.set((px / w) * 2 - 1, -(py / hgt) * 2 + 1);
    raycaster.setFromCamera(ndc, this.camera);
    const gt = sc.isTerrain ? this.groundT() : null;
    const hits = raycaster.intersectObjects([...sc.hitTargets, ...sc.groundPickables], true);
    for (const hh of hits) {
      if (gt !== null && hh.distance > gt + 0.5) break;
      let o: THREE.Object3D | null = hh.object;
      while (o && !o.userData.entity && !o.userData.ground) o = o.parent;
      if (!o || !o.visible) continue;
      const ent = o.userData.entity as EntityRT | undefined;
      if (ent) {
        if (ent.rider || !ent.visible) continue;
        return { ent, ground: null };
      }
      if (o.userData.ground) return { ent: null, ground: hh.point.clone() };
    }
    if (gt !== null) return { ent: null, ground: raycaster.ray.at(gt, new THREE.Vector3()) };
    return { ent: null, ground: null };
  }

  private groundT(): number | null {
    const sc = this.scene!, o = raycaster.ray.origin, d = raycaster.ray.direction;
    let s = 0.5, prev = 0;
    for (let i = 0; i < 600; i++) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (y < sc.height(x, z)) {
        let a = prev, b = s;
        for (let j = 0; j < 16; j++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m < sc.height(o.x + d.x * m, o.z + d.z * m)) b = m;
          else a = m;
        }
        return b;
      }
      prev = s;
      s += Math.max(0.5, s * 0.02);
      if (s > 4000) break;
    }
    return null;
  }

  /** Where labels and the camera consider "the player" to be. */
  focus(): THREE.Vector3 {
    return this.pos;
  }

  dispose(): void {
    this.avatar?.object.removeFromParent();
    this.marker.removeFromParent();
  }
}
