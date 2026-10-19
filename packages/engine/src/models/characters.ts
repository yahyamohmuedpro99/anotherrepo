import * as THREE from 'three';
import { lerp } from '../math/noise.js';
import { haloTexture } from '../world/textures.js';
import type { BuildCtx, Built, Rig, RigAnimOptions } from './context.js';

let G: Record<string, THREE.BufferGeometry> | null = null;
function geos(): Record<string, THREE.BufferGeometry> {
  if (G) return G;
  G = {
    leg: new THREE.BoxGeometry(0.17, 0.66, 0.19).translate(0, -0.33, 0),
    arm: new THREE.BoxGeometry(0.14, 0.62, 0.15).translate(0, -0.29, 0),
    hand: new THREE.SphereGeometry(0.085, 8, 6),
    foot: new THREE.BoxGeometry(0.19, 0.08, 0.3),
    body: new THREE.CylinderGeometry(0.26, 0.42, 1.16, 12),
    belt: new THREE.TorusGeometry(0.335, 0.035, 6, 18),
    head: new THREE.SphereGeometry(0.2, 18, 14),
    eye: new THREE.SphereGeometry(0.026, 6, 4),
    cap: new THREE.CylinderGeometry(0.17, 0.19, 0.13, 14),
    turban: new THREE.TorusGeometry(0.17, 0.075, 8, 18),
    brim: new THREE.CylinderGeometry(0.36, 0.36, 0.03, 18),
    hit: new THREE.CylinderGeometry(0.9, 0.9, 2.6, 8).translate(0, 1.3, 0),
  };
  return G;
}
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

export interface HumanParams {
  robe: string;
  skin: string;
  hat?: 'cap' | 'turban' | 'brim' | 'none';
  hatColor?: string;
  sash?: string;
  mustache?: boolean;
  jug?: boolean;
  camera?: boolean;
  staff?: boolean;
}

interface HumanParts {
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  upper: THREE.Object3D;
  phase: number;
}

export function buildHuman(p: HumanParams, ctx: BuildCtx): Built {
  const g = geos();
  const lite = ctx.quality.liteRigs;
  const grp = new THREE.Group();
  const robeMat = new THREE.MeshStandardMaterial({ color: p.robe, roughness: 0.88, flatShading: true });
  const skinMat = ctx.materials.get({ color: p.skin, roughness: 0.75 });
  const dark = ctx.materials.get({ color: '#2b231d', roughness: 0.9 });
  const sandal = ctx.materials.get({ color: '#6b4a2c', roughness: 0.9 });
  const brass = ctx.materials.get({ color: '#d4a043', roughness: 0.3, metalness: 0.85 });
  const legL = new THREE.Mesh(g.leg, dark);
  legL.position.set(-0.11, 0.66, 0);
  const legR = new THREE.Mesh(g.leg, dark);
  legR.position.set(0.11, 0.66, 0);
  if (!lite)
    for (const l of [legL, legR]) {
      const f = new THREE.Mesh(g.foot, sandal);
      f.position.set(0, -0.63, 0.05);
      l.add(f);
    }
  const upper = new THREE.Group();
  const body = new THREE.Mesh(g.body, robeMat);
  body.position.y = 0.9;
  const armL = new THREE.Mesh(g.arm, robeMat);
  armL.position.set(-0.35, 1.42, 0);
  const armR = new THREE.Mesh(g.arm, robeMat);
  armR.position.set(0.35, 1.42, 0);
  const head = new THREE.Mesh(g.head, skinMat);
  head.position.y = 1.7;
  upper.add(body, armL, armR, head);
  if (!lite) {
    const belt = new THREE.Mesh(g.belt, ctx.materials.get({ color: p.sash ?? '#e9b44c', roughness: 0.6, metalness: 0.2 }));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.0;
    upper.add(belt);
    for (const a of [armL, armR]) {
      const h = new THREE.Mesh(g.hand, skinMat);
      h.position.y = -0.64;
      a.add(h);
    }
    for (const ex of [-0.07, 0.07]) {
      const e = new THREE.Mesh(g.eye, dark);
      e.position.set(ex, 1.73, 0.185);
      upper.add(e);
    }
    if (p.mustache) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04), dark);
      m.position.set(0, 1.64, 0.19);
      upper.add(m);
    }
  }
  const hm = ctx.materials.get({ color: p.hatColor ?? '#efe8da', roughness: 0.9 });
  const hat = p.hat ?? 'cap';
  if (hat === 'cap') {
    const c = new THREE.Mesh(g.cap, hm);
    c.position.y = 1.86;
    upper.add(c);
  } else if (hat === 'turban') {
    const tb = new THREE.Mesh(g.turban, hm);
    tb.rotation.x = Math.PI / 2;
    tb.position.y = 1.84;
    upper.add(tb);
    if (!lite) {
      const tp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), hm);
      tp.position.y = 1.9;
      tp.scale.y = 0.7;
      upper.add(tp);
    }
  } else if (hat === 'brim') {
    const b = new THREE.Mesh(g.brim, hm);
    b.position.y = 1.85;
    upper.add(b);
    if (!lite) {
      const c = new THREE.Mesh(g.cap, hm);
      c.position.y = 1.92;
      upper.add(c);
    }
  }
  if (p.jug && !lite) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), brass);
    j.scale.set(1, 1.25, 0.85);
    j.position.set(0, 1.15, 0.38);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.5, 10), brass);
    n.position.set(0.18, 1.58, 0.48);
    n.rotation.z = -0.5;
    upper.add(j, n);
    for (const s of [-1, 1]) {
      const cy = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 12), brass);
      cy.rotation.x = Math.PI / 2;
      cy.position.set(0, -0.62, 0.06 * s);
      armR.add(cy);
    }
  }
  if (p.camera && !lite) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), dark);
    c.position.set(0, 1.3, 0.33);
    upper.add(c);
  }
  if (p.staff) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), ctx.materials.get({ color: '#6b4a2c' }));
    st.position.set(0.45, 1.0, 0.12);
    grp.add(st);
  }
  const hit = new THREE.Mesh(g.hit, HIT_MAT);
  grp.add(legL, legR, upper, hit);
  grp.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== hit) o.castShadow = ctx.shadows;
  });
  const parts: HumanParts = { legL, legR, armL, armR, upper, phase: 0 };
  const rig: Rig = {
    kind: 'human',
    animate: (speed, dt, opts) => animateHuman(parts, speed, dt, opts),
    setColor: (hex) => robeMat.color.set(hex),
  };
  return { object: grp, rig, hit, labelY: 2.4 };
}

function animateHuman(h: HumanParts, speed: number, dt: number, o: RigAnimOptions = {}): void {
  const sit = o.sit;
  const moving = speed > 0.4 && !sit;
  if (moving) h.phase += dt * (3.2 + speed * 0.55);
  const amp = moving ? Math.min(0.75, 0.3 + speed * 0.04) : 0, s = Math.sin(h.phase) * amp, k = 1 - Math.exp(-dt * 12);
  const L = h.legL.rotation, R = h.legR.rotation;
  if (sit === 'straddle') {
    L.x = lerp(L.x, -1.35, k);
    R.x = lerp(R.x, -1.35, k);
    L.z = lerp(L.z, -0.55, k);
    R.z = lerp(R.z, 0.55, k);
  } else if (sit === 'bench') {
    L.x = lerp(L.x, -1.3, k);
    R.x = lerp(R.x, -1.3, k);
    L.z = lerp(L.z, 0, k);
    R.z = lerp(R.z, 0, k);
  } else {
    L.x = lerp(L.x, s, k);
    R.x = lerp(R.x, -s, k);
    L.z = lerp(L.z, 0, k);
    R.z = lerp(R.z, 0, k);
  }
  h.armL.rotation.x = lerp(h.armL.rotation.x, sit ? -0.6 : -s * 0.8, k);
  if (o.waving) {
    h.armR.rotation.x = lerp(h.armR.rotation.x, 0, k);
    h.armR.rotation.z = lerp(h.armR.rotation.z, 2.5 + Math.sin(performance.now() * 0.012) * 0.35, k);
  } else {
    h.armR.rotation.x = lerp(h.armR.rotation.x, sit ? -0.6 : s * 0.8, k);
    h.armR.rotation.z = lerp(h.armR.rotation.z, 0, k);
  }
  h.upper.position.y = moving ? Math.abs(Math.sin(h.phase)) * 0.05 : lerp(h.upper.position.y, 0, k);
}

/* ---------------------------------------------------------------- astronaut (horus-voyage) */

export function buildAstronaut(ctx: BuildCtx, flagColors: string[] = ['#ce1126', '#ffffff', '#111111']): Built {
  const lite = ctx.quality.liteRigs;
  const g = new THREE.Group();
  const suit = ctx.materials.get({ color: '#eef0f3', roughness: 0.6 });
  const joint = ctx.materials.get({ color: '#9aa3ad', roughness: 0.6 });
  const visor = ctx.materials.get({ color: '#d9a441', roughness: 0.18, metalness: 0.85, emissive: '#3a2a08', emissiveIntensity: 0.5 });
  const teal = ctx.materials.get({ color: '#2fb3a6', roughness: 0.5 });
  const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.24).translate(0, -0.36, 0);
  const legL = new THREE.Mesh(legGeo, suit);
  legL.position.set(-0.13, 0.74, 0);
  const legR = new THREE.Mesh(legGeo, suit);
  legR.position.set(0.13, 0.74, 0);
  if (!lite)
    for (const l of [legL, legR]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.34), joint);
      b.position.set(0, -0.66, 0.04);
      l.add(b);
    }
  const upper = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.78, 14), suit);
  torso.position.y = 1.13;
  const armGeo = new THREE.BoxGeometry(0.17, 0.66, 0.18).translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, suit);
  armL.position.set(-0.42, 1.45, 0);
  const armR = new THREE.Mesh(armGeo, suit);
  armR.position.set(0.42, 1.45, 0);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 16), suit);
  helmet.position.y = 1.78;
  const vis = new THREE.Mesh(new THREE.SphereGeometry(0.295, 20, 16, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.28, Math.PI * 0.4), visor);
  vis.position.y = 1.78;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.26), ctx.materials.get({ color: '#d9dde2', roughness: 0.6 }));
  pack.position.set(0, 1.18, -0.32);
  upper.add(torso, armL, armR, helmet, vis, pack);
  if (!lite) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), teal);
    panel.position.set(0, 1.2, 0.3);
    upper.add(panel);
    for (const a of [armL, armR]) {
      const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), joint);
      hnd.position.y = -0.66;
      a.add(hnd);
    }
    const flagP = new THREE.Group();
    flagColors.forEach((c, i) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.16), ctx.materials.get({ color: c }));
      s.position.y = 0.05 - i * 0.05;
      flagP.add(s);
    });
    flagP.position.set(-0.095, -0.12, 0);
    armL.add(flagP);
  }
  const jets: THREE.Sprite[] = [];
  for (const sx of [-0.15, 0.15]) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffb35a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    f.position.set(sx, 0.75, -0.36);
    f.scale.set(0.5, 0.9, 1);
    f.visible = false;
    upper.add(f);
    jets.push(f);
  }
  g.add(legL, legR, upper);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = ctx.shadows;
  });
  let phase = 0;
  const rig: Rig = {
    kind: 'astronaut',
    animate(speed, dt, o = {}) {
      const air = !!o.air, fly = !!o.fly;
      const moving = speed > 0.4 && !air;
      if (moving) phase += dt * (3 + speed * 0.6);
      const amp = moving ? Math.min(0.7, 0.3 + speed * 0.05) : 0, s = Math.sin(phase) * amp, k = 1 - Math.exp(-dt * 10);
      legL.rotation.x = lerp(legL.rotation.x, fly ? 0.15 : air ? 0.35 : s, k);
      legR.rotation.x = lerp(legR.rotation.x, fly ? -0.1 : air ? -0.25 : -s, k);
      armL.rotation.x = lerp(armL.rotation.x, air || fly ? -0.4 : -s * 0.7, k);
      armR.rotation.x = lerp(armR.rotation.x, air || fly ? -0.4 : s * 0.7, k);
      armL.rotation.z = lerp(armL.rotation.z, air ? -0.5 : 0, k);
      armR.rotation.z = lerp(armR.rotation.z, air ? 0.5 : 0, k);
      upper.position.y = moving ? Math.abs(Math.sin(phase)) * 0.04 : lerp(upper.position.y, 0, k);
      for (const j of jets) {
        j.visible = fly;
        if (fly) {
          const f = 0.8 + Math.random() * 0.4;
          j.scale.set(0.45 * f, 0.9 * f, 1);
        }
      }
    },
  };
  return { object: g, rig, labelY: 2.4 };
}
