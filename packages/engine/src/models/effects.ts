import * as THREE from 'three';
import { TAU, rng } from '../math/noise.js';
import { fadeTexture, haloTexture } from '../world/textures.js';
import type { BuildCtx, Built } from './context.js';
import { haloSprite } from './space.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

/** Glowing collectible with a light beam: Giza's blue faience scarab. */
export function buildScarab(p: { beam?: number; color?: string; glow?: string }, ctx: BuildCtx): Built {
  const g = new THREE.Group();
  const faience = ctx.materials.get({ color: p.color ?? '#2b8fd0', emissive: '#19a7a0', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.15 });
  const dark = ctx.materials.get({ color: '#2b231d', roughness: 0.9 });
  const bug = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries([new THREE.SphereGeometry(0.5, 18, 14).scale(0.8, 0.45, 1), new THREE.SphereGeometry(0.2, 12, 8).translate(0, 0, 0.55)])!, faience);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.9), dark);
  seam.position.y = 0.21;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#7ff0e2', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(4.2, 4.2, 1);
  bug.add(body, seam, halo);
  bug.position.y = 1.3;
  g.add(bug);
  const H = p.beam ?? 220;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, H, 12, 1, true), new THREE.MeshBasicMaterial({ color: p.glow ?? '#3fe0d0', alphaMap: fadeTexture(), transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = H / 2;
  g.add(beam);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTexture(), color: p.glow ?? '#3fe0d0', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.y = 0.12;
  g.add(pool);
  const seed = Math.random() * 10;
  ctx.anims.push((dt, T) => {
    bug.rotation.y += dt * 1.2;
    if (!g.userData.collecting) bug.position.y = 1.3 + Math.sin(T * 2 + seed) * 0.25;
    pool.scale.setScalar(1 + Math.sin(T * 2.4 + seed) * 0.12);
  });
  return { object: g, labelY: 3, extra: { bug, beam, pool } };
}

/** Horus surface discovery orb (teal) or landmark gem (gold), with a beam. */
export function buildBeacon(p: { gold?: boolean; beam?: number }, ctx: BuildCtx): Built {
  const g = new THREE.Group();
  const gold = !!p.gold;
  const col = gold ? '#e9b44c' : '#2fd0c0', em = gold ? '#a8701a' : '#1aa79b';
  const orb = new THREE.Mesh(gold ? new THREE.OctahedronGeometry(0.7, 0) : new THREE.IcosahedronGeometry(0.55, 1), ctx.materials.get({ color: col, emissive: em, emissiveIntensity: 1.2, roughness: 0.3, flatShading: true }));
  const halo = haloSprite(gold ? '#ffd88a' : '#7ff0e2', 4, 1, true, true);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), HIT_MAT);
  g.add(orb, halo, hit);
  const H = p.beam ?? 70;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, H, 10, 1, true), new THREE.MeshBasicMaterial({ color: gold ? '#f2c25a' : '#3fe0d0', alphaMap: fadeTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = H / 2;
  g.add(beam);
  const seed = Math.random() * 10;
  ctx.anims.push((dt, T) => {
    orb.rotation.y += dt * (gold ? 0.7 : 1);
    orb.position.y = Math.sin(T * (gold ? 1.6 : 2) + seed) * (gold ? 0.3 : 0.25);
  });
  return { object: g, hit, labelY: 2.6, extra: { orb, beam } };
}

export function buildRing(p: { radius?: number; tube?: number }, ctx: BuildCtx): Built {
  const m = new THREE.Mesh(new THREE.TorusGeometry(p.radius ?? 16, p.tube ?? 0.9, 10, 56), ctx.materials.get({ color: '#f2c25a', emissive: '#b77a12', emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.6 }));
  m.rotation.x = Math.PI / 2;
  ctx.anims.push((dt) => {
    m.rotation.z += dt * 0.15;
  });
  return { object: m };
}

/** Night show light beams from one base toward moving aims. */
export function buildBeams(p: { aims: [number, number, number][]; colors: string[]; sweep?: number }, origin: THREE.Vector3, ctx: BuildCtx): Built {
  const grp = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.45, 0.45, 1, 8, 1, true).translate(0, 0.5, 0);
  const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const beams = p.aims.map((a, i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: p.colors[i % p.colors.length], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.visible = false;
    grp.add(m);
    return { m, aim: new THREE.Vector3(...a), i };
  });
  const sweep = p.sweep ?? 30;
  ctx.nightAnims.push((n, T) => {
    for (const L of beams) {
      L.m.visible = n > 0.05;
      if (!L.m.visible) continue;
      tmp.copy(L.aim);
      tmp.x += Math.sin(T * 0.6 + L.i * 1.7) * sweep;
      tmp.z += Math.cos(T * 0.5 + L.i) * sweep;
      tmp.sub(origin);
      const len = tmp.length();
      L.m.quaternion.setFromUnitVectors(UP, tmp.normalize());
      L.m.scale.set(1, len, 1);
      (L.m.material as THREE.MeshBasicMaterial).opacity = n * 0.35;
    }
  });
  return { object: grp };
}

/** Particle effects: sparkle (ice), vortex (dust devil), cloud (static puffs). */
export function buildParticles(p: { mode: 'sparkle' | 'vortex' | 'static'; count: number; color: string; size: number; radius?: number; height?: number; opacity?: number; additive?: boolean }, base: THREE.Vector3, ctx: BuildCtx): Built {
  const n = Math.max(8, Math.round(p.count * ctx.quality.particles));
  const a = new Float32Array(n * 3), seeds = new Float32Array(n), r = rng(21);
  for (let i = 0; i < n; i++) {
    seeds[i] = r();
    if (p.mode !== 'vortex') {
      const ang = r() * TAU, d = Math.sqrt(r()) * (p.radius ?? 6.5);
      a[i * 3] = Math.cos(ang) * d;
      a[i * 3 + 1] = 0.3 + r() * (p.height ?? 0.4);
      a[i * 3 + 2] = Math.sin(ang) * d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const mat = new THREE.PointsMaterial({ map: haloTexture(), color: p.color, size: p.size, transparent: true, opacity: p.opacity ?? 0.55, depthWrite: false, ...(p.additive !== false ? { blending: THREE.AdditiveBlending } : {}) });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  if (p.mode === 'sparkle') ctx.anims.push((_dt, T) => (mat.opacity = 0.5 + 0.5 * Math.sin(T * 3)));
  if (p.mode === 'vortex') {
    const H = p.height ?? 40;
    ctx.anims.push((_dt, T) => {
      const cx = Math.cos(T * 0.12) * 8, cz = Math.sin(T * 0.12) * 8, gy = ctx.height(base.x + cx, base.z + cz) - base.y;
      for (let i = 0; i < n; i++) {
        const s = seeds[i]!, hh = (s * H + T * 6) % H, rad = 0.6 + hh * 0.12, ang = s * TAU * 7 + T * (4 - hh * 0.05);
        a[i * 3] = cx + Math.cos(ang) * rad;
        a[i * 3 + 1] = gy + hh;
        a[i * 3 + 2] = cz + Math.sin(ang) * rad;
      }
      g.attributes.position!.needsUpdate = true;
    });
  }
  return { object: pts };
}

export function buildLight(p: { color: string; intensity: number; distance?: number; decay?: number; pulse?: { min: number; max: number; speed: number } }, ctx: BuildCtx): Built {
  const l = new THREE.PointLight(p.color, p.intensity, p.distance ?? 40, p.decay ?? 1.5);
  if (p.pulse) ctx.anims.push((_dt, T) => (l.intensity = p.pulse!.min + (p.pulse!.max - p.pulse!.min) * (0.5 + 0.5 * Math.sin(T * p.pulse!.speed))));
  return { object: l };
}
