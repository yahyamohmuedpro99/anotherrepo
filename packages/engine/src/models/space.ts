import * as THREE from 'three';
import { TAU, rng } from '../math/noise.js';
import { canvasFor, haloTexture } from '../world/textures.js';
import type { BuildCtx, Built } from './context.js';

export function haloSprite(color: string, size: number, opacity = 1, additive = true, toneMapped = false): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, toneMapped }));
  sp.scale.set(size, size, 1);
  return sp;
}

export function ringGeometry(inner: number, outer: number, seg = 128): THREE.RingGeometry {
  const rg = new THREE.RingGeometry(inner, outer, seg, 1), p = rg.attributes.position as THREE.BufferAttribute, uv = rg.attributes.uv as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  return rg;
}

export interface BodyParams {
  radius: number;
  style: string;
  textureSize?: number;
  star?: boolean;
  glow?: [string, number, number][];
  clouds?: boolean;
  atmosphere?: { color: string; scale: number; opacity: number };
  rings?: { inner: number; outer: number; tilt: number };
  tilt?: number;
  spin?: number;
  segments?: number;
  fog?: boolean;
}

/** A planet, moon or star with a procedural map (replaceable by NASA imagery via a glTF/texture later). */
export function buildBody(p: BodyParams, ctx: BuildCtx): Built {
  const grp = new THREE.Group();
  const size = ctx.quality.tier === 'low' ? Math.min(256, p.textureSize ?? 256) : (p.textureSize ?? 256);
  const tx = new THREE.CanvasTexture(canvasFor({ gen: 'planet', size, params: { style: p.style } }));
  tx.colorSpace = THREE.SRGBColorSpace;
  const seg = p.segments ?? (ctx.quality.tier === 'low' ? 28 : 48);
  const mat = p.star
    ? new THREE.MeshBasicMaterial({ map: tx, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: tx, roughness: 1, metalness: 0, ...(p.fog === false ? { fog: false } : {}) });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, seg, Math.round(seg * 0.66)), mat);
  grp.add(mesh);
  for (const [c, s, o] of p.glow ?? []) grp.add(haloSprite(c, s, o));
  let clouds: THREE.Mesh | null = null;
  if (p.clouds) {
    const ct = new THREE.CanvasTexture(canvasFor({ gen: 'planet', size: 256, params: { style: 'clouds' } }));
    ct.colorSpace = THREE.SRGBColorSpace;
    clouds = new THREE.Mesh(new THREE.SphereGeometry(p.radius * 1.02, seg, Math.round(seg * 0.66)), new THREE.MeshStandardMaterial({ map: ct, transparent: true, depthWrite: false, roughness: 1 }));
    mesh.add(clouds);
  }
  if (p.atmosphere) grp.add(haloSprite(p.atmosphere.color, p.radius * p.atmosphere.scale, p.atmosphere.opacity, true, true));
  if (p.rings) {
    const rt = new THREE.CanvasTexture(canvasFor({ gen: 'rings', seed: 4 }));
    rt.colorSpace = THREE.SRGBColorSpace;
    const rm = new THREE.Mesh(ringGeometry(p.radius * p.rings.inner, p.radius * p.rings.outer), new THREE.MeshStandardMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    rm.rotation.x = -Math.PI / 2;
    const tiltG = new THREE.Group();
    tiltG.rotation.z = p.rings.tilt;
    tiltG.add(rm);
    grp.add(tiltG);
  } else if (p.tilt) mesh.rotation.z = p.tilt;
  if (p.spin || clouds)
    ctx.anims.push((dt) => {
      if (p.spin) mesh.rotation.y += dt * p.spin * 0.3;
      if (clouds) clouds.rotation.y += dt * 0.03;
    });
  mesh.userData.pickRoot = grp;
  return { object: grp, hit: mesh, labelY: p.radius * (p.star ? 1.15 : 1.35) + 1, extra: { mesh } };
}

export function buildOrbitLine(radius: number, color: string, opacity: number): Built {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return { object: new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity })) };
}

export function buildBelt(p: { count: number; rMin: number; width: number; seed: number; color: string }, ctx: BuildCtx): Built {
  const r = rng(p.seed), n = Math.round(p.count * Math.max(0.5, ctx.quality.particles));
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), ctx.materials.get({ color: p.color, roughness: 1, flatShading: true }), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < p.count; i++) {
    const a = r() * TAU, rad = p.rMin + r() * p.width, y = (r() - 0.5) * 5, s = 0.25 + Math.pow(r(), 2) * 1.4, rot = r() * TAU;
    if (i >= n) continue;
    o.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    o.scale.set(s, s * 0.7, s);
    o.rotation.set(rot, rot * 2, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  }
  im.frustumCulled = false;
  return { object: im };
}

export interface GalaxyParams {
  count: number;
  sunAt: [number, number];
  sunTheta: number;
  andromeda: [number, number, number];
  seed?: number;
}

/** The Milky Way as a barred four-arm spiral, the Sun's neighbourhood, and Andromeda in the distance. */
export function buildGalaxy(p: GalaxyParams, ctx: BuildCtx): Built {
  const grp = new THREE.Group();
  const N = Math.round(p.count * (ctx.quality.tier === 'low' ? 0.5 : ctx.quality.tier === 'mid' ? 0.75 : 1));
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), r = rng(p.seed ?? 99), c = new THREE.Color();
  const cIn = new THREE.Color('#ffe2a8'), cArm = new THREE.Color('#9fbaff'), cPink = new THREE.Color('#ff8fb8'), cW = new THREE.Color('#ffffff'), cHaze = new THREE.Color('#5c6890');
  const bar = 0.45, cb = Math.cos(bar), sb = Math.sin(bar);
  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number;
    const k = r();
    if (k < 0.2) {
      const rr = Math.pow(r(), 1.6) * 10, a = r() * TAU;
      const bx = Math.cos(a) * rr * 1.7, bz = Math.sin(a) * rr * 0.65;
      x = bx * cb - bz * sb;
      z = bx * sb + bz * cb;
      y = (r() - 0.5) * rr * 0.5;
      c.copy(cIn).lerp(cW, r() * 0.35);
    } else if (k < 0.9) {
      const arm = Math.floor(r() * 4), rr = 7 + Math.pow(r(), 0.85) * 45, th = Math.log(rr / 5) / 0.28 + (arm * Math.PI) / 2, sp = (r() - 0.5) * (0.9 + rr * 0.02);
      x = Math.cos(th + sp * 0.35) * rr + (r() - 0.5) * 1.6;
      z = Math.sin(th + sp * 0.35) * rr + (r() - 0.5) * 1.6;
      y = (r() - 0.5) * (1.4 - rr * 0.012);
      c.copy(cArm).lerp(cIn, Math.max(0, 1 - rr / 24) * 0.6);
      if (r() < 0.035) c.copy(cPink);
    } else {
      const rr = Math.sqrt(r()) * 52, a = r() * TAU;
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
      y = (r() - 0.5) * 1.2;
      c.copy(cHaze);
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  grp.add(new THREE.Points(g, new THREE.PointsMaterial({ map: haloTexture(), size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
  grp.add(haloSprite('#ffe2a0', 34, 0.8), haloSprite('#ffcf80', 90, 0.25));
  const [sx, sz] = p.sunAt, sunTh = p.sunTheta;
  {
    const n = 900, a = new Float32Array(n * 3), rr = rng(5);
    for (let i = 0; i < n; i++) {
      const t2 = (rr() - 0.5) * 14, off = (rr() - 0.5) * 1.6;
      a[i * 3] = sx + Math.cos(sunTh + 1.4) * t2 + Math.cos(sunTh) * off;
      a[i * 3 + 1] = (rr() - 0.5) * 0.6;
      a[i * 3 + 2] = sz + Math.sin(sunTh + 1.4) * t2 + Math.sin(sunTh) * off;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(a, 3));
    grp.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: haloTexture(), color: '#bcd0ff', size: 0.5, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  const you = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f6d58a', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  you.position.set(sx, 0, sz);
  grp.add(you);
  const yd = haloSprite('#ffe9a8', 3, 1);
  yd.position.set(sx, 0, sz);
  grp.add(yd);
  ctx.anims.push((_dt, T) => {
    const s = 1 + Math.sin(T * 4) * 0.25;
    you.scale.set(s, 1, s);
  });
  const andro = new THREE.Vector3(...p.andromeda);
  {
    const n = Math.round(7000 * (ctx.quality.tier === 'low' ? 0.5 : 1)), a = new Float32Array(n * 3), cc = new Float32Array(n * 3), rr = rng(7);
    const nrm = andro.clone().negate().normalize().add(new THREE.Vector3(0, 1.2, 0)).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const k = rr();
      let x: number, y: number, z: number;
      if (k < 0.3) {
        const rad = Math.pow(rr(), 1.5) * 9, an = rr() * TAU;
        x = Math.cos(an) * rad;
        z = Math.sin(an) * rad;
        y = (rr() - 0.5) * rad * 0.4;
        c.copy(cIn);
      } else {
        const arm = Math.floor(rr() * 2), rad = 6 + rr() * 34, th = Math.log(rad / 4) / 0.3 + arm * Math.PI;
        x = Math.cos(th) * rad + (rr() - 0.5) * 3;
        z = Math.sin(th) * rad + (rr() - 0.5) * 3;
        y = rr() - 0.5;
        c.copy(cArm);
      }
      v.set(x * 2.4, y * 2, z * 2.4).applyQuaternion(q).add(andro);
      a[i * 3] = v.x;
      a[i * 3 + 1] = v.y;
      a[i * 3 + 2] = v.z;
      cc[i * 3] = c.r;
      cc[i * 3 + 1] = c.g;
      cc[i * 3 + 2] = c.b;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(a, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    grp.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: haloTexture(), size: 5, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    const ac = haloSprite('#ffe9c0', 70, 0.6);
    ac.position.copy(andro);
    grp.add(ac);
  }
  {
    const n = 3000, a = new Float32Array(n * 3), rr = rng(13);
    for (let i = 0; i < n; i++) {
      const u = rr() * 2 - 1, th = rr() * TAU, s = Math.sqrt(1 - u * u);
      a[i * 3] = s * Math.cos(th) * 7000;
      a[i * 3 + 1] = u * 7000;
      a[i * 3 + 2] = s * Math.sin(th) * 7000;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const st = new THREE.Points(gg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.6, depthWrite: false }));
    st.frustumCulled = false;
    grp.add(st);
  }
  grp.traverse((o) => {
    o.frustumCulled = false;
  });
  return { object: grp };
}
