import * as THREE from 'three';
import type { Cond, CompositeModel, Entity, Scene, Spawn } from '@rihla/pack-schema';
import type { TierSettings } from '../core/quality.js';
import { buildModel, type Built, type BuildCtx, type SolidBox } from '../models/index.js';
import { tailAway, applyMotion, type MotionEnv } from './motion.js';
import { EnvironmentRuntime } from '../world/environment.js';
import { Materials } from '../world/materials.js';
import { buildTerrain, type TerrainRuntime } from '../world/terrain.js';
import { angLerp, clamp, damp } from '../math/noise.js';

export interface EntityRT {
  id: string;
  def: Entity;
  object: THREE.Object3D;
  built: Built;
  pos: THREE.Vector3;
  home: THREE.Vector3;
  prev: THREE.Vector3;
  delta: THREE.Vector3;
  yaw: number;
  baseYaw: number;
  speed: number;
  state: Record<string, number>;
  /** Object y offset from pos (pyramids sit at their lowest corner). */
  yOffset: number;
  visible: boolean;
  hidden: boolean;
  collect: number;
  rider: boolean;
  talking: boolean;
  faceT: number;
  labelY: number;
  standoff: number;
}

export interface SceneDeps {
  quality: TierSettings;
  models: Record<string, CompositeModel>;
  t: (key: string) => string;
  rtl: boolean;
  check: (c: Cond) => boolean;
}

export interface SphereCollider {
  ent: EntityRT;
  r: number;
  push: number;
  warn?: string;
}

const tmp = new THREE.Vector3();

/** One playable scene built from pack data: environment, terrain, entities, collision. */
export class SceneRuntime {
  readonly scene = new THREE.Scene();
  readonly env: EnvironmentRuntime;
  readonly terrain: TerrainRuntime;
  readonly materials: Materials;
  readonly entities: EntityRT[] = [];
  readonly byId = new Map<string, EntityRT>();
  readonly solids: SolidBox[] = [];
  readonly spheres: SphereCollider[] = [];
  readonly groundPickables: THREE.Object3D[] = [];
  readonly hitTargets: THREE.Object3D[] = [];
  readonly ctx: BuildCtx;
  T = 0;
  private zones: { id: string; center: [number, number]; r: number }[] = [];
  private tailOrigin: Map<string, THREE.Vector3> = new Map();

  constructor(
    readonly def: Scene,
    private deps: SceneDeps,
    zones: { id: string; scene: string; center: [number, number]; streamRadius: number }[] = [],
  ) {
    this.materials = new Materials({ ...(def.materials ?? {}) });
    this.terrain = buildTerrain(def.terrain, deps.quality.tier === 'low' ? 0.6 : 1);
    if (this.terrain.mesh) {
      this.terrain.mesh.receiveShadow = deps.quality.shadows;
      this.scene.add(this.terrain.mesh);
      this.groundPickables.push(this.terrain.mesh);
    }
    this.env = new EnvironmentRuntime(this.scene, def.environment, deps.quality);
    this.zones = zones.filter((z) => z.scene === def.id).map((z) => ({ id: z.id, center: z.center, r: z.streamRadius }));
    this.ctx = {
      materials: this.materials,
      models: deps.models,
      quality: deps.quality,
      height: this.terrain.height,
      t: deps.t,
      solids: this.solids,
      pickables: this.groundPickables,
      anims: [],
      nightAnims: [],
      redraws: [],
      shadows: deps.quality.shadows,
      rtl: deps.rtl,
    };
    for (const e of def.entities) {
      if (e.tierMin === 'mid' && deps.quality.tier === 'low') continue;
      if (e.tierMin === 'high' && deps.quality.tier !== 'high') continue;
      try {
        this.addEntity(e);
      } catch (err) {
        console.warn(`[rihla] entity ${e.id}:`, err);
      }
    }
    for (const so of def.environment.skyObjects ?? []) {
      const b = buildModel(so.model, this.ctx, { x: 0, y: 0, z: 0, ground: false });
      if (so.rot) b.object.rotation.set(...so.rot);
      this.scene.add(b.object);
      this.env.skyObjects.push({ obj: b.object, dir: new THREE.Vector3(...so.dir).normalize(), distance: so.distance, spin: so.spin ?? 0, offset: so.offset ? new THREE.Vector3(...so.offset) : null });
    }
    this.updateMotions(0);
  }

  get isTerrain(): boolean {
    return this.def.kind === 'terrain';
  }

  height = (x: number, z: number): number => this.terrain.height(x, z);

  /** Position of an entity's base, resolved from data. */
  private placementOf(e: Entity): { x: number; y: number; z: number; ground: boolean } {
    const at = e.at ?? [0, 0];
    const ground = e.ground ?? this.isTerrain;
    if (at.length === 2) return { x: at[0], y: ground ? this.height(at[0], at[1]) : 0, z: at[1], ground };
    return { x: at[0], y: ground ? this.height(at[0], at[2]) + at[1] : at[1], z: at[2], ground };
  }

  private addEntity(e: Entity): void {
    const at = this.placementOf(e);
    const built: Built = e.model ? buildModel(e.model, this.ctx, at) : { object: new THREE.Group() };
    const obj = built.object;
    const pos = new THREE.Vector3(at.x, at.y, at.z);
    const isInstances = e.model?.gen === 'instances' || e.model?.gen === 'strip' || e.model?.gen === 'water';
    const yOffset = built.baseY !== undefined ? built.baseY - at.y : 0;
    if (!isInstances) {
      obj.position.set(at.x, at.y + yOffset, at.z);
      if (e.yaw) obj.rotation.y = e.yaw;
      if (e.scale) obj.scale.multiplyScalar(e.scale);
    }
    this.scene.add(obj);
    const rt: EntityRT = {
      id: e.id,
      def: e,
      object: obj,
      built,
      pos,
      home: pos.clone(),
      prev: pos.clone(),
      delta: new THREE.Vector3(),
      yaw: e.yaw ?? 0,
      baseYaw: e.yaw ?? 0,
      speed: 0,
      state: {},
      yOffset,
      visible: true,
      hidden: false,
      collect: -1,
      rider: false,
      talking: false,
      faceT: 0,
      labelY: e.label?.y ?? built.labelY ?? 2.4,
      standoff: e.standoff ?? 6,
    };
    if (isInstances) rt.pos.set(at.x, at.y, at.z);
    const s = e.solid;
    if (s) {
      if (s.type === 'sphere') this.spheres.push({ ent: rt, r: (s.r ?? 1) * (e.scale ?? 1), push: s.push ?? 1, ...(typeof s.warn === 'string' ? { warn: s.warn } : {}) });
      else if (s.type === 'box') this.solids.push({ kind: 'box', x: at.x, z: at.z, hx: s.hx ?? 1, hz: s.hz ?? 1, y0: at.y + (s.yOffset ?? 0), h: s.h ?? 2 });
      else this.solids.push({ kind: 'pyr', x: at.x, z: at.z, hx: s.hx ?? 1, hz: s.hz ?? 1, y0: at.y, h: s.h ?? 1 });
    }
    const hit = built.hit ?? (e.triggers?.some((t) => t.on === 'tap') || e.tap || e.npc || e.vehicle || e.pick ? obj : null);
    if (hit) {
      hit.userData.entity = rt;
      hit.traverse((o) => (o.userData.entity = rt));
      this.hitTargets.push(hit);
    }
    if (e.motion?.tailAwayFrom) this.tailOrigin.set(e.id, new THREE.Vector3(...e.motion.tailAwayFrom));
    // Ground-snapped entities that are pickable surfaces (temples, causeway) already registered by builders.
    this.entities.push(rt);
    this.byId.set(e.id, rt);
    // An entity already collected when the scene loads is hidden without animation.
    if (e.hideWhen && this.deps.check(e.hideWhen)) {
      rt.hidden = true;
      obj.visible = false;
    }
  }

  /* ---------------------------------------------------------------- spatial queries */

  /** Ground height including the tops of solids (walking over a temple roof, balloon landing). */
  effGround(x: number, z: number): number {
    let h = this.height(x, z);
    for (const s of this.solids) {
      const ax = Math.abs(x - s.x), az = Math.abs(z - s.z);
      if (ax < s.hx + 1 && az < s.hz + 1) {
        const top = s.kind === 'pyr' ? s.y0 + s.h * (1 - Math.max(ax, az) / s.hx) : s.y0 + s.h;
        if (top > h) h = top;
      }
    }
    return h;
  }

  solidAt(x: number, y: number, z: number): boolean {
    for (const s of this.solids) {
      const ax = Math.abs(x - s.x), az = Math.abs(z - s.z);
      if (ax < s.hx && az < s.hz) {
        if (s.kind === 'pyr') {
          if (y < s.y0 + s.h * (1 - Math.max(ax, az) / s.hx)) return true;
        } else if (y < s.y0 + s.h) return true;
      }
    }
    return false;
  }

  /** Push a circle of radius `rad` out of solids and back inside the walkable bounds. */
  collide(x: number, z: number, rad: number, flying = false): [number, number] {
    if (!flying)
      for (let pass = 0; pass < 2; pass++)
        for (const s of this.solids) {
          const dx = x - s.x, dz = z - s.z, ex = s.hx + rad, ez = s.hz + rad;
          if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
            const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
            if (px < pz) x = s.x + (dx < 0 ? -ex : ex);
            else z = s.z + (dz < 0 ? -ez : ez);
          }
        }
    const b = this.def.player.bounds;
    if (b) {
      const R = flying ? (b.flyRadius ?? b.radius) : b.radius;
      const cx = x - b.center[0], cz = z - b.center[1], d = Math.hypot(cx, cz);
      if (d > R) {
        x = b.center[0] + (cx / d) * R;
        z = b.center[1] + (cz / d) * R;
      }
    }
    return [x, z];
  }

  private segHitsBox(ax: number, az: number, bx: number, bz: number, s: SolidBox, pad: number): boolean {
    const mnx = s.x - s.hx - pad, mxx = s.x + s.hx + pad, mnz = s.z - s.hz - pad, mxz = s.z + s.hz + pad, dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    for (const [p, d, mn, mx] of [[ax, dx, mnx, mxx], [az, dz, mnz, mxz]] as const) {
      if (Math.abs(d) < 1e-9) {
        if (p < mn || p > mx) return false;
      } else {
        let ta = (mn - p) / d, tb = (mx - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
      }
    }
    return true;
  }

  /** One-step detour around the nearest obstacle between a and b (good enough for open plateaus). */
  route(ax: number, az: number, bx: number, bz: number, rad: number): [number, number] | null {
    let best: SolidBox | null = null, bd = Infinity;
    for (const s of this.solids) {
      if (s.hx < 3 && s.hz < 3) continue;
      if (this.segHitsBox(ax, az, bx, bz, s, rad * 0.6)) {
        const d = Math.hypot(s.x - ax, s.z - az) - Math.max(s.hx, s.hz);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
    if (!best) return null;
    const pad = 1.6 + rad * 1.6;
    const cs: [number, number][] = [
      [best.x - best.hx - pad, best.z - best.hz - pad],
      [best.x + best.hx + pad, best.z - best.hz - pad],
      [best.x + best.hx + pad, best.z + best.hz + pad],
      [best.x - best.hx - pad, best.z + best.hz + pad],
    ];
    let pick: [number, number] | null = null, pl = Infinity, fallback: [number, number] | null = null, fl = Infinity;
    for (const c of cs) {
      const l = Math.hypot(c[0] - ax, c[1] - az) + Math.hypot(bx - c[0], bz - c[1]);
      if (l < fl) {
        fl = l;
        fallback = c;
      }
      if (this.segHitsBox(ax, az, c[0], c[1], best, rad * 0.6)) continue;
      if (l < pl) {
        pl = l;
        pick = c;
      }
    }
    return pick ?? fallback;
  }

  /** Resolves a spawn into a position and yaw (space spawns sit beside moving bodies). */
  spawnPoint(id: string | undefined): { pos: THREE.Vector3; yaw: number | undefined; spawn: Spawn | undefined; id: string | undefined } {
    const spawns = this.def.spawns;
    let key = id && spawns[id] ? id : this.def.defaultSpawn;
    if (key === 'random' || (!key && Object.keys(spawns).length)) {
      const eligible = Object.entries(spawns).filter(([, s]) => s.random);
      const pool = eligible.length ? eligible : Object.entries(spawns);
      key = pool[Math.floor(Math.random() * pool.length)]![0];
    }
    const sp = key ? spawns[key] : undefined;
    const pos = new THREE.Vector3();
    if (sp?.near) {
      const ent = this.byId.get(sp.near.entity);
      if (ent) {
        const dir = sp.near.dir ? tmp.set(...sp.near.dir).normalize() : sp.near.side === 'sun' ? tmp.copy(ent.pos).negate().normalize() : tmp.copy(ent.pos).normalize();
        pos.copy(ent.pos).addScaledVector(dir, sp.near.distance ?? ent.standoff);
      }
    } else if (sp?.at) {
      const at = sp.at;
      if (at.length === 2) pos.set(at[0], this.isTerrain ? this.height(at[0], at[1]) : 0, at[1]);
      else pos.set(at[0], this.isTerrain ? this.height(at[0], at[2]) + at[1] : at[1], at[2]);
    }
    return { pos, yaw: sp?.yaw, spawn: sp, id: key };
  }

  /* ---------------------------------------------------------------- per frame */

  private motionEnv: MotionEnv = {
    T: 0,
    dt: 0,
    positionOf: (id) => this.byId.get(id)?.pos ?? null,
    height: (x, z) => this.height(x, z),
    collide: (x, z, r) => this.collide(x, z, r),
    paused: (h) => (h as unknown as EntityRT).talking || (h as unknown as EntityRT).rider,
    terrain: false,
  };

  private updateMotions(dt: number): void {
    const env = this.motionEnv;
    env.T = this.T;
    env.dt = dt;
    env.terrain = this.isTerrain;
    for (const e of this.entities) {
      const m = e.def.motion;
      e.prev.copy(e.pos);
      if (m && !e.rider) {
        const moved = applyMotion(m, e, env);
        if (moved) e.object.position.set(e.pos.x, e.pos.y + e.yOffset, e.pos.z);
        if ((m.type === 'path' || m.type === 'wander') && !e.talking) {
          if (e.faceT <= 0) e.object.rotation.y = e.yaw;
        }
        if (m.lookAt && m.lookAt !== 'motion') {
          const t = typeof m.lookAt === 'string' ? this.byId.get(m.lookAt)?.pos : tmp.set(...m.lookAt);
          if (t) e.object.lookAt(t);
        }
        const origin = this.tailOrigin.get(e.id);
        const tail = e.built.parts?.tail;
        if (origin && tail) tailAway(tail, e.pos, origin);
      }
      e.delta.subVectors(e.pos, e.prev);
    }
  }

  update(dt: number, camera: THREE.Camera, check: (c: Cond) => boolean): void {
    this.T += dt;
    this.updateMotions(dt);
    const cam = camera.position;
    const dd = this.deps.quality.drawDistance;
    for (const e of this.entities) {
      // faces / idle anims
      if (e.faceT > 0) {
        e.faceT -= dt;
        if (e.faceT <= 0) e.object.rotation.y = e.def.motion ? e.yaw : e.baseYaw;
      }
      const rig = e.built.rig;
      if (rig && !e.rider && (rig.kind === 'human' || rig.kind === 'astronaut')) rig.animate(e.talking ? 0 : e.speed, dt);
      if (rig && !e.rider && (rig.kind === 'camel' || rig.kind === 'carriage')) rig.animate(0, dt, {}, 0);
      // collect animation then hide
      const d = e.def;
      if (d.hideWhen) {
        const gone = check(d.hideWhen);
        if (gone && !e.hidden && e.collect < 0) {
          if (d.collectAnim === 'rise') {
            e.collect = 0.001;
            e.object.userData.collecting = true;
          } else {
            e.hidden = true;
          }
        } else if (!gone && e.hidden) {
          e.hidden = false;
          e.collect = -1;
          e.object.userData.collecting = false;
          e.object.scale.setScalar(e.def.scale ?? 1);
          e.object.position.set(e.pos.x, e.pos.y + e.yOffset, e.pos.z);
        }
      }
      if (e.collect > 0 && e.collect < 1) {
        e.collect = Math.min(1, e.collect + dt * 1.4);
        const bug = e.built.extra?.bug as THREE.Object3D | undefined;
        if (bug) {
          bug.position.y = 1.3 + e.collect * 6;
          bug.scale.setScalar(1 + e.collect * 1.5);
        } else e.object.position.y = e.pos.y + e.collect * 6;
        const beam = e.built.extra?.beam as THREE.Object3D | undefined;
        const pool = e.built.extra?.pool as THREE.Object3D | undefined;
        if (beam) beam.visible = e.collect < 0.4;
        if (pool) pool.visible = e.collect < 0.4;
        if (e.collect >= 1) e.hidden = true;
      }
      let vis = !e.hidden;
      if (vis && d.showWhen) vis = check(d.showWhen);
      if (vis && d.lod) {
        const lim = d.lod * dd;
        vis = e.rider || (e.pos.x - cam.x) ** 2 + (e.pos.z - cam.z) ** 2 < lim * lim;
      }
      if (vis && d.zone) {
        const z = this.zones.find((zz) => zz.id === d.zone);
        if (z) vis = (z.center[0] - cam.x) ** 2 + (z.center[1] - cam.z) ** 2 < (z.r * 1.15) ** 2;
      }
      if (vis !== e.visible || e.object.visible !== vis) {
        e.visible = vis;
        e.object.visible = vis;
      }
    }
    for (const f of this.ctx.anims) f(dt, this.T);
  }

  /** Called after environment update so night-only effects see the current night amount. */
  updateNight(check: (c: Cond) => boolean): void {
    const n = this.env.night.amt;
    this.materials.update(n, this.T, check);
    for (const f of this.ctx.nightAnims) f(n, this.T);
  }

  /** Turn an NPC toward a point for a few seconds (when talking). */
  face(e: EntityRT, x: number, z: number): void {
    e.object.rotation.y = Math.atan2(x - e.pos.x, z - e.pos.z);
    e.faceT = 6;
  }

  /** Smoothly carry the vehicle object with the player (used by riding). */
  syncVehicle(e: EntityRT, x: number, y: number, z: number, yaw: number): void {
    e.pos.set(x, y, z);
    e.object.position.set(x, y, z);
    e.object.rotation.y = yaw;
    e.yaw = yaw;
  }

  redrawText(): void {
    for (const f of this.ctx.redraws) f();
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.materials.dispose();
    this.terrain.dispose();
    this.env.dispose();
  }
}

export { angLerp, clamp, damp };
