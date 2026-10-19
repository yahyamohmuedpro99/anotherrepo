import * as THREE from 'three';
import type { Environment, SkyColors } from '@rihla/pack-schema';
import { TAU, clamp, lerp, rng, smooth } from '../math/noise.js';
import type { TierSettings } from '../core/quality.js';
import { canvasFor, haloTexture } from './textures.js';

const SUNSET_FRAG = `uniform vec3 top;uniform vec3 up;uniform vec3 mid;uniform vec3 hor;uniform vec3 bot;uniform vec3 sunDir;uniform vec3 sunCol;uniform float sunAmt;varying vec3 vDir;
void main(){vec3 d=normalize(vDir);float h=d.y;vec3 sd=normalize(sunDir);float s=max(dot(d,sd),0.0);
vec3 col=mix(hor,mid,smoothstep(0.0,0.09,h));col=mix(col,up,smoothstep(0.08,0.3,h));col=mix(col,top,smoothstep(0.28,0.8,h));
col=mix(col,hor,pow(s,4.0)*0.55*sunAmt*(1.0-smoothstep(0.0,0.5,h)));col=mix(col,bot,1.0-smoothstep(-0.18,0.0,h));
col+=sunCol*(pow(s,380.0)*5.0+pow(s,40.0)*0.35+pow(s,8.0)*0.25)*sunAmt;gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const SIMPLE_FRAG = `uniform vec3 top;uniform vec3 hor;uniform vec3 bot;uniform vec3 sunDir;uniform vec3 sunCol;uniform float sunSize;varying vec3 vDir;
void main(){vec3 d=normalize(vDir);float h=d.y;vec3 col=mix(hor,top,smoothstep(0.0,0.55,h));col=mix(col,bot,1.0-smoothstep(-0.2,0.0,h));
float s=max(dot(d,normalize(sunDir)),0.0);if(sunSize>0.0){float ang=0.014*sunSize;float disk=smoothstep(cos(ang*1.15),cos(ang),s);col=mix(col,sunCol*2.2,disk);col+=sunCol*(pow(s,60.0/max(sunSize,0.2))*0.35+pow(s,6.0)*0.08);}
gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const SKY_VERT = 'varying vec3 vDir;void main(){vDir=(modelMatrix*vec4(position,0.0)).xyz;vec4 p=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);gl_Position=p.xyww;}';

type ColorKey = 'top' | 'up' | 'mid' | 'hor' | 'bot';
const C = (c: string | undefined, fb: string) => new THREE.Color(c ?? fb);

function palette(s: SkyColors) {
  return {
    top: C(s.top, '#3d6cae'),
    up: C(s.up ?? s.top, '#86a6cf'),
    mid: C(s.mid ?? s.hor, '#e7a990'),
    hor: C(s.hor, '#f7b672'),
    bot: C(s.bot, '#e6b07f'),
    fog: C(s.fog ?? s.bot, '#e6b07f'),
    sun: C(s.sunColor, '#ffc085'),
    sunI: s.sunIntensity ?? 3.1,
    hemiSky: C(s.hemiSky, '#ffe3c2'),
    hemiGround: C(s.hemiGround, '#8f6a44'),
    hemiI: s.hemiIntensity ?? 1.1,
    cloud: C(s.cloud, '#ffd9b6'),
    cloudO: s.cloudOpacity ?? 0.85,
    exposure: s.exposure ?? 1.08,
    sunAmt: s.sunAmount ?? 1,
  };
}

export interface FocusInfo {
  x: number;
  y: number;
  z: number;
  groundY: number;
}

/**
 * Sky, lights, fog, stars, clouds, dust and "sky objects" for one scene, with a day ↔ night blend that
 * `set.timeOfDay` drives. Colours, intensities and exposure all interpolate.
 */
export class EnvironmentRuntime {
  readonly night = { amt: 0, target: 0 };
  readonly sun: THREE.DirectionalLight | null = null;
  readonly hemi: THREE.HemisphereLight | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private rig = new THREE.Group();
  private stars: THREE.Points[] = [];
  private cloudMat: THREE.SpriteMaterial | null = null;
  private dust: { pts: THREE.Points; pos: Float32Array; vel: Float32Array; box: number; drift: [number, number] } | null = null;
  private winds: { pts: THREE.Points; speed: number } | null = null;
  private day: ReturnType<typeof palette>;
  private nite: ReturnType<typeof palette>;
  private sunDir: THREE.Vector3;
  private fogBase: { near: number; far: number; alt: number } | null = null;
  readonly skyObjects: { obj: THREE.Object3D; dir: THREE.Vector3; distance: number; spin: number; offset: THREE.Vector3 | null }[] = [];
  private tmp = new THREE.Vector3();
  exposure = 1.08;

  constructor(
    private scene: THREE.Scene,
    private env: Environment,
    private quality: TierSettings,
  ) {
    this.sunDir = new THREE.Vector3(...(env.sunDir ?? [-0.78, 0.3, 0.55])).normalize();
    const skyDay = env.sky?.day ?? { top: '#000000', hor: '#000000', bot: '#000000' };
    this.day = palette(skyDay);
    this.nite = palette(env.sky?.night ?? skyDay);
    this.night.amt = this.night.target = env.timeOfDay === 'night' ? 1 : 0;
    scene.add(this.rig);
    if (env.background) scene.background = new THREE.Color(env.background);

    // sky dome
    if (env.sky && env.sky.style !== 'space') {
      const sunset = env.sky.style === 'sunset-gradient';
      const u: Record<string, THREE.IUniform> = {
        top: { value: this.day.top.clone() },
        hor: { value: this.day.hor.clone() },
        bot: { value: this.day.bot.clone() },
        sunDir: { value: this.sunDir.clone() },
        sunCol: { value: C(env.sky.sunDiskColor ?? env.sky.day.sunColor, '#ffcf8a') },
      };
      if (sunset) {
        u.up = { value: this.day.up.clone() };
        u.mid = { value: this.day.mid.clone() };
        u.sunAmt = { value: 1 };
      } else u.sunSize = { value: env.sky.sunDisk ?? 1 };
      this.skyMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: sunset ? SUNSET_FRAG : SIMPLE_FRAG, side: THREE.BackSide, depthWrite: false });
      this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(sunset ? 6000 : 4000, 32, 16), this.skyMat);
      this.skyMesh.frustumCulled = false;
      this.skyMesh.renderOrder = -2;
      scene.add(this.skyMesh);
    }

    // lights
    if (env.sky && env.sky.style !== 'space') {
      const hemi = new THREE.HemisphereLight(this.day.hemiSky.clone(), this.day.hemiGround.clone(), this.day.hemiI);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(this.day.sun.clone(), this.day.sunI);
      const sh = env.shadows;
      if (sh && quality.shadows) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
        const c = sun.shadow.camera;
        c.left = -sh.extent;
        c.right = sh.extent;
        c.top = sh.extent;
        c.bottom = -sh.extent;
        c.near = 5;
        c.far = sh.far ?? 1700;
        sun.shadow.bias = -0.0004;
        sun.shadow.normalBias = 0.1;
      }
      scene.add(sun, sun.target);
      (this as { sun: THREE.DirectionalLight }).sun = sun;
      (this as { hemi: THREE.HemisphereLight }).hemi = hemi;
    }
    if (env.pointLight) {
      const p = new THREE.PointLight(env.pointLight.color, env.pointLight.intensity, 0, 0);
      if (env.pointLight.at) p.position.set(...env.pointLight.at);
      scene.add(p);
    }
    if (env.ambient) scene.add(new THREE.AmbientLight(env.ambient.color, env.ambient.intensity));
    if (env.fog) {
      scene.fog = new THREE.Fog(this.day.fog.clone(), env.fog.near, env.fog.far);
      this.fogBase = { near: env.fog.near, far: env.fog.far, alt: env.fog.altitudeScale ?? 0 };
    }

    // stars
    if (env.stars) this.buildStars(env.stars);
    // clouds
    if (env.clouds) {
      this.cloudMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvasFor({ gen: 'clouds', seed: 19 })), color: this.day.cloud.clone(), transparent: true, opacity: this.day.cloudO, fog: false, depthWrite: false });
      const r = rng(env.clouds.seed);
      const n = Math.round(env.clouds.count * quality.clouds);
      for (let i = 0; i < env.clouds.count; i++) {
        const a = i < 7 ? 2.2 + r() * 1.9 : -0.9 + r() * 1.6, R = 4600;
        const y = 380 + r() * 620, w = 1500 + r() * 1500;
        if (i >= n) continue;
        const sp = new THREE.Sprite(this.cloudMat);
        sp.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
        sp.scale.set(w, w * 0.32, 1);
        this.rig.add(sp);
      }
    }
    if (env.dust) {
      const n = Math.round(env.dust.count * quality.particles), box = env.dust.box ?? 50;
      const pos = new Float32Array(n * 3), vel = new Float32Array(n), r = rng(88);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * box;
        pos[i * 3 + 1] = r() * 8;
        pos[i * 3 + 2] = (r() - 0.5) * box;
        vel[i] = 0.4 + r() * 0.9;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: haloTexture(), color: env.dust.color, size: env.dust.size ?? 0.16, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      scene.add(pts);
      this.dust = { pts, pos, vel, box, drift: (env.dust.drift as [number, number]) ?? [1.6, 0.5] };
    }
    if (env.winds) {
      const n = Math.round(env.winds.count * quality.particles), a = new Float32Array(n * 3), r = rng(44);
      for (let i = 0; i < n; i++) {
        a[i * 3] = (r() - 0.5) * 120;
        a[i * 3 + 1] = r() * 40;
        a[i * 3 + 2] = (r() - 0.5) * 120;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: haloTexture(), size: 0.9, transparent: true, opacity: 0.7, depthWrite: false, color: env.winds.color, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      scene.add(pts);
      this.winds = { pts, speed: env.winds.speed };
    }
  }

  private buildStars(s: NonNullable<Environment['stars']>): void {
    const R = s.radius ?? 5600;
    const mk = (n: number, size: number, op: number, band: boolean, colored: boolean, hemisphere: boolean) => {
      const a = new Float32Array(n * 3), c = new Float32Array(n * 3), r = rng(n + R), col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        let x: number, y: number, z: number;
        if (band) {
          const th = r() * TAU, off = (r() + r() + r() - 1.5) * 0.18;
          x = Math.cos(th);
          y = off;
          z = Math.sin(th);
          const l = Math.hypot(x, y, z);
          x /= l;
          y /= l;
          z /= l;
          const ty = y * 0.5 - z * 0.866, tz = y * 0.866 + z * 0.5;
          y = ty;
          z = tz;
        } else if (hemisphere) {
          const th = r() * TAU, ph = Math.acos(r() * 0.94 + 0.06);
          x = Math.sin(ph) * Math.cos(th);
          y = Math.cos(ph);
          z = Math.sin(ph) * Math.sin(th);
        } else {
          const u = r() * 2 - 1, th = r() * TAU, sq = Math.sqrt(1 - u * u);
          x = sq * Math.cos(th);
          y = u;
          z = sq * Math.sin(th);
        }
        a[i * 3] = x * R;
        a[i * 3 + 1] = y * R;
        a[i * 3 + 2] = z * R;
        const k = r();
        col.set(!colored ? '#fff6e0' : k < 0.15 ? '#a9c4ff' : k < 0.3 ? '#ffe2b0' : '#ffffff');
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: op, depthWrite: false, fog: false }));
      p.frustumCulled = false;
      p.userData.baseOpacity = op;
      this.rig.add(p);
      this.stars.push(p);
    };
    const space = this.env.sky?.style === 'space' || !this.env.sky;
    const n = Math.round(s.count * Math.max(0.5, this.quality.particles));
    mk(n, s.size ?? (space ? 1.4 : 1.7), space ? 0.85 : 1, false, space, !space);
    if (s.bright) mk(s.bright, 2.4, 1, false, true, false);
    if (s.band) mk(Math.round(s.band * this.quality.particles), 1.1, 0.45, true, true, false);
    if (s.nightOnly) for (const p of this.stars) p.visible = false;
  }

  setTimeOfDay(v: 'day' | 'night' | 'toggle'): void {
    this.night.target = v === 'toggle' ? (this.night.target > 0.5 ? 0 : 1) : v === 'night' ? 1 : 0;
  }
  isNight(): boolean {
    return this.night.target > 0.5;
  }

  update(dt: number, T: number, camera: THREE.Camera, focus: FocusInfo, renderer: THREE.WebGLRenderer, reducedMotion: boolean): void {
    const N = this.night;
    const d = N.target - N.amt;
    if (Math.abs(d) > 0.0005) N.amt += Math.sign(d) * Math.min(Math.abs(d), dt * (reducedMotion ? 1 : 0.22));
    const n = smooth(0, 1, N.amt);
    const D = this.day, Nt = this.nite;
    if (this.skyMat) {
      const U = this.skyMat.uniforms;
      for (const k of ['top', 'up', 'mid', 'hor', 'bot'] as ColorKey[]) if (U[k]) (U[k]!.value as THREE.Color).copy(D[k]).lerp(Nt[k], n);
      if (U.sunAmt) U.sunAmt.value = lerp(D.sunAmt, this.env.sky?.night ? 0 : D.sunAmt, n);
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(D.fog).lerp(Nt.fog, n);
      if (this.fogBase) {
        const camH = clamp(camera.position.y - focus.groundY, 0, 450) * this.fogBase.alt;
        this.scene.fog.near = this.fogBase.near + camH * 2;
        this.scene.fog.far = this.fogBase.far + camH * 4;
      }
    }
    if (this.cloudMat) {
      this.cloudMat.color.copy(D.cloud).lerp(Nt.cloud, n);
      this.cloudMat.opacity = lerp(D.cloudO, Nt.cloudO, n);
    }
    if (this.sun) {
      this.sun.intensity = lerp(D.sunI, Nt.sunI, n);
      this.sun.color.copy(D.sun).lerp(Nt.sun, n);
      this.sun.target.position.set(focus.x, focus.groundY, focus.z);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, this.env.shadows?.distance ?? 800);
    }
    if (this.hemi) {
      this.hemi.intensity = lerp(D.hemiI, Nt.hemiI, n);
      this.hemi.color.copy(D.hemiSky).lerp(Nt.hemiSky, n);
      this.hemi.groundColor.copy(D.hemiGround).lerp(Nt.hemiGround, n);
    }
    if (this.env.stars?.nightOnly)
      for (const p of this.stars) {
        p.visible = n > 0.01;
        (p.material as THREE.PointsMaterial).opacity = n * (p.userData.baseOpacity as number);
      }
    this.exposure = lerp(D.exposure, Nt.exposure, n);
    renderer.toneMappingExposure = this.exposure;
    // things that live at infinity follow the camera
    this.skyMesh?.position.copy(camera.position);
    this.rig.position.copy(camera.position);
    for (const so of this.skyObjects) {
      if (so.offset) so.obj.position.copy(camera.position).add(so.offset);
      else so.obj.position.copy(camera.position).addScaledVector(so.dir, so.distance);
      if (so.spin) so.obj.rotation.y += dt * so.spin;
    }
    if (this.dust) {
      const { pos, vel, box, drift } = this.dust, h = box / 2;
      const fx = focus.x, fy = focus.groundY, fz = focus.z;
      for (let i = 0; i < vel.length; i++) {
        let x = pos[i * 3] + dt * vel[i] * drift[0], y = pos[i * 3 + 1] + Math.sin(T * 0.7 + i) * dt * 0.3, z = pos[i * 3 + 2] + dt * vel[i] * drift[1];
        if (x - fx > h) x -= box;
        else if (x - fx < -h) x += box;
        if (z - fz > h) z -= box;
        else if (z - fz < -h) z += box;
        if (y < fy + 0.2) y = fy + 7;
        else if (y > fy + 8) y = fy + 0.3;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
      }
      this.dust.pts.geometry.attributes.position!.needsUpdate = true;
      (this.dust.pts.material as THREE.PointsMaterial).opacity = lerp(0.6, 0.25, n);
    }
    if (this.winds) {
      const wa = this.winds.pts.geometry.attributes.position!.array as Float32Array;
      for (let i = 0; i < wa.length; i += 3) {
        wa[i] += dt * this.winds.speed;
        if (wa[i] - focus.x > 60) wa[i] -= 120;
        else if (wa[i] - focus.x < -60) wa[i] += 120;
        if (wa[i + 2] - focus.z > 60) wa[i + 2] -= 120;
        else if (wa[i + 2] - focus.z < -60) wa[i + 2] += 120;
        if (wa[i + 1] - focus.y > 20) wa[i + 1] -= 40;
        else if (wa[i + 1] - focus.y < -20) wa[i + 1] += 40;
      }
      this.winds.pts.geometry.attributes.position!.needsUpdate = true;
    }
    void this.tmp;
  }

  dispose(): void {
    this.skyMat?.dispose();
    this.skyMesh?.geometry.dispose();
    for (const s of this.stars) s.geometry.dispose();
  }
}
