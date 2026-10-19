import * as THREE from 'three';
import { clamp, lerp } from '../math/noise.js';
import { haloTexture, makeCanvas, textureFor } from '../world/textures.js';
import type { BuildCtx, Built, Rig } from './context.js';

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });

function adder(ctx: BuildCtx) {
  return (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = ctx.shadows;
    parent.add(o);
    return o;
  };
}

/** Four-legged gait shared by camels and horses. */
function gait(legs: THREE.Object3D[], head: THREE.Object3D | null, offsets: number[], perMetre: number, wheels: THREE.Object3D[] = []) {
  let phase = 0;
  return (speed: number, dt: number, dist = 0) => {
    phase += dist * perMetre;
    const amp = clamp(speed * 0.09, 0, 0.55);
    legs.forEach((l, i) => {
      l.rotation.x = lerp(l.rotation.x, Math.sin(phase + offsets[i]!) * amp, 1 - Math.exp(-dt * 12));
    });
    for (const w of wheels) w.rotation.x += dist / 0.78;
    if (head) head.rotation.x = Math.sin(phase * 2) * 0.05 * Math.min(1, speed / 3) + (speed < 0.3 ? Math.sin(performance.now() * 0.0009) * 0.08 : 0);
  };
}

export function buildCamel(blanket: string, ctx: BuildCtx): Built {
  const lite = ctx.quality.liteRigs;
  const g = new THREE.Group(), m = ctx.materials.get({ color: '#b98b58', roughness: 0.95, flatShading: true }), bm = ctx.materials.get({ color: blanket, roughness: 0.9 });
  const add = adder(ctx);
  const lg = new THREE.BoxGeometry(0.22, 1.7, 0.22).translate(0, -0.85, 0), legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.32, 0.85], [0.32, 0.85], [-0.32, -0.85], [0.32, -0.85]]) {
    const l = add(lg, m, x!, 1.75, z!, g);
    legs.push(l);
    if (!lite) add(new THREE.BoxGeometry(0.3, 0.1, 0.34), m, 0, -1.66, 0.04, l).castShadow = false;
  }
  add(new THREE.BoxGeometry(0.9, 0.9, 2.3), m, 0, 2.15, 0, g);
  const hump = add(new THREE.SphereGeometry(0.62, 10, 8), m, 0, 2.62, -0.1, g);
  hump.scale.set(0.9, 0.8, 1.2);
  add(new THREE.BoxGeometry(1.04, 0.55, 1.15), bm, 0, 2.42, -0.1, g);
  if (!lite) {
    add(new THREE.BoxGeometry(0.7, 0.22, 0.9), ctx.materials.get({ color: '#7a2f22', roughness: 0.8 }), 0, 3.0, -0.12, g);
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.05, 0.32, 0.05), ctx.materials.get({ color: i % 2 ? '#e9b44c' : '#2f63b0' }), s * 0.53, 2.05, -0.55 + i * 0.3, g).castShadow = false;
  }
  const neck = new THREE.Group();
  neck.position.set(0, 2.4, 1.1);
  g.add(neck);
  const nk = add(new THREE.BoxGeometry(0.38, 1.3, 0.42), m, 0, 0.35, 0.25, neck);
  nk.rotation.x = 0.55;
  add(new THREE.BoxGeometry(0.36, 0.38, 0.8), m, 0, 0.95, 0.75, neck);
  if (!lite) {
    add(new THREE.BoxGeometry(0.4, 0.08, 0.5), bm, 0, 1.16, 0.65, neck);
    add(new THREE.BoxGeometry(0.08, 0.7, 0.08), m, 0, 1.9, -1.2, g).rotation.x = 0.2;
  }
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.8, 8).translate(0, 1.9, 0), HIT_MAT);
  g.add(hit);
  g.scale.setScalar(0.82);
  const anim = gait(legs, neck, [0, Math.PI, 0, Math.PI], 1.2);
  const rig: Rig = { kind: 'camel', animate: (speed, dt, _o, dist) => anim(speed, dt, dist), seat: { y: 2.98 * 0.82, z: -0.1, sit: 'straddle' } };
  return { object: g, rig, hit, labelY: 3.7 };
}

export function buildCarriage(canopy: string, body: string, horseCol: string, ctx: BuildCtx): Built {
  const lite = ctx.quality.liteRigs;
  const g = new THREE.Group(), hm = ctx.materials.get({ color: horseCol, roughness: 0.85, flatShading: true }), dk = ctx.materials.get({ color: '#2a1d14', roughness: 0.9 });
  const wood = ctx.materials.get({ color: '#5e3a22', roughness: 0.85 }), red = ctx.materials.get({ color: '#d63a2a' });
  const add = adder(ctx);
  add(new THREE.BoxGeometry(0.56, 0.64, 1.6), hm, 0, 1.38, 1.95, g);
  const neck = new THREE.Group();
  neck.position.set(0, 1.6, 2.65);
  g.add(neck);
  add(new THREE.BoxGeometry(0.34, 0.9, 0.42), hm, 0, 0.35, 0.1, neck).rotation.x = -0.45;
  add(new THREE.BoxGeometry(0.3, 0.32, 0.72), hm, 0, 0.78, 0.45, neck);
  if (!lite) {
    add(new THREE.BoxGeometry(0.08, 0.55, 0.32), dk, 0, 0.55, -0.02, neck).rotation.x = -0.45;
    add(new THREE.SphereGeometry(0.12, 8, 6), red, 0, 1.06, 0.2, neck);
  }
  const lg = new THREE.BoxGeometry(0.14, 1.08, 0.14).translate(0, -0.54, 0), legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.18, 2.55], [0.18, 2.55], [-0.18, 1.35], [0.18, 1.35]]) legs.push(add(lg, hm, x!, 1.12, z!, g));
  if (!lite) {
    add(new THREE.BoxGeometry(0.1, 0.7, 0.1), dk, 0, 1.25, 1.1, g).rotation.x = 0.3;
    add(new THREE.BoxGeometry(0.6, 0.14, 0.5), red, 0, 1.72, 1.95, g);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.06, 2.1), wood, s * 0.4, 1.15, 1.35, g).rotation.x = 0.06;
  }
  const wheels: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.95, 0.78, -0.35);
    g.add(w);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.05, 6, 24), dk);
    rim.rotation.y = Math.PI / 2;
    w.add(rim);
    if (!lite)
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.44, 0.04), wood);
        sp.rotation.x = (i / 6) * Math.PI;
        w.add(sp);
      }
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10).rotateZ(Math.PI / 2), dk));
    wheels.push(w);
  }
  const bm = ctx.materials.get({ color: body, roughness: 0.6 });
  add(new THREE.BoxGeometry(1.5, 0.5, 1.7), bm, 0, 1.08, -0.35, g);
  add(new THREE.BoxGeometry(1.36, 0.3, 0.6), ctx.materials.get({ color: '#8a2f2a', roughness: 0.8 }), 0, 1.46, -0.75, g);
  add(new THREE.BoxGeometry(1.4, 0.65, 0.1), bm, 0, 1.78, -1.12, g);
  const cm = ctx.materials.get({ color: canopy, roughness: 0.85, doubleSide: true });
  const can = add(new THREE.CylinderGeometry(0.82, 0.82, 1.5, 16, 1, true, -Math.PI / 2, Math.PI), cm, 0, 2.4, -0.55, g);
  can.rotation.x = -Math.PI / 2;
  if (!lite) for (const [x, z] of [[-0.72, 0.15], [0.72, 0.15], [-0.72, -1.12], [0.72, -1.12]]) add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), wood, x!, 1.9, z!, g);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 8).translate(0, 1.5, 0.6), HIT_MAT);
  g.add(hit);
  const anim = gait(legs, neck, [0, Math.PI, Math.PI, 0], 2.1, wheels);
  const rig: Rig = { kind: 'carriage', animate: (speed, dt, _o, dist) => anim(speed, dt, dist), seat: { y: 1.62, z: -0.72, sit: 'bench' } };
  return { object: g, rig, hit, labelY: 3.3 };
}

export function buildBalloon(ctx: BuildCtx, colors?: string[]): Built {
  const g = new THREE.Group();
  const pts = [[1.5, 5], [2.6, 6.5], [4.6, 8.8], [6.8, 11.4], [8.4, 14], [9.2, 17], [9.1, 20], [8.2, 23], [6.4, 25.6], [3.8, 27.4], [0.05, 28.2]].map(([r, y]) => new THREE.Vector2(r, y));
  const envMat = new THREE.MeshStandardMaterial({ map: textureFor({ gen: 'balloon-panels', ...(colors ? { colors } : {}) }), roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color('#ff9a3c'), emissiveIntensity: 0 });
  const env = new THREE.Mesh(new THREE.LatheGeometry(pts, ctx.quality.tier === 'low' ? 20 : 36), envMat);
  env.castShadow = ctx.shadows;
  g.add(env);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.8), ctx.materials.get({ map: { gen: 'wicker', repeat: [3, 2] }, roughness: 0.95 }));
  basket.position.y = 0.55;
  basket.castShadow = ctx.shadows;
  g.add(basket);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.12, 1.92), ctx.materials.get({ color: '#4a2e18', roughness: 0.8 }));
  rim.position.y = 1.12;
  g.add(rim);
  const lines: number[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) lines.push(sx! * 0.85, 1.12, sz! * 0.85, sx! * 0.45, 3.4, sz! * 0.45, sx! * 0.45, 3.4, sz! * 0.45, sx! * 1.35, 5.05, sz! * 1.35);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3a2a1c' })));
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.5, 12), ctx.materials.get({ color: '#9aa0a6', metalness: 0.8, roughness: 0.35 }));
  burner.position.y = 3.4;
  g.add(burner);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffae4a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  flame.position.y = 4.2;
  flame.scale.set(2.2, 3.2, 1);
  g.add(flame);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 29, 10).translate(0, 14.5, 0), HIT_MAT);
  g.add(hit);
  const rig: Rig = {
    kind: 'balloon',
    seat: { y: 0.12, z: 0, sit: false },
    animate(_s, dt, o = {}) {
      const burn = !!o.burn;
      const fm = flame.material as THREE.SpriteMaterial;
      fm.opacity = burn ? 0.75 + Math.random() * 0.25 : lerp(fm.opacity, 0, 1 - Math.exp(-dt * 8));
      envMat.emissiveIntensity = lerp(envMat.emissiveIntensity, burn ? 0.22 : 0, 1 - Math.exp(-dt * 4));
    },
  };
  return { object: g, rig, hit, labelY: 31 };
}

/** The Horus spaceship (horus-voyage), with its name painted on both sides. */
export function buildShip(ctx: BuildCtx, nameKey?: string): Built {
  const g = new THREE.Group();
  const hull = ctx.materials.get({ color: '#eef0f3', roughness: 0.45, metalness: 0.25 });
  const gold = ctx.materials.get({ color: '#d9a441', roughness: 0.35, metalness: 0.7 });
  const lapis = ctx.materials.get({ color: '#1f3f8f', roughness: 0.5, metalness: 0.3 });
  const glass = ctx.materials.get({ color: '#2fd0c0', roughness: 0.1, metalness: 0.6, emissive: '#0d4a46', emissiveIntensity: 0.6 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 6, 20).rotateX(Math.PI / 2), hull));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.8, 20).rotateX(Math.PI / 2), hull);
  nose.position.z = 4.4;
  g.add(nose);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1, 16).rotateX(Math.PI / 2), gold);
  tip.position.z = 5.95;
  g.add(tip);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), glass);
  cock.scale.set(0.8, 0.55, 1.5);
  cock.position.set(0, 0.62, 2.2);
  g.add(cock);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 2.2), gold);
    w.position.set(s * 2.6, -0.15, -1.4);
    w.rotation.y = s * 0.42;
    w.rotation.z = s * -0.1;
    g.add(w);
    const tipw = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 1.6), lapis);
    tipw.position.set(s * 4.6, 0.2, -2.4);
    g.add(tipw);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.4, 14).rotateX(Math.PI / 2), lapis);
    pod.position.set(s * 1.6, -0.35, -2.6);
    g.add(pod);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 2), lapis);
  fin.position.set(0, 1.3, -2.4);
  fin.rotation.x = -0.25;
  g.add(fin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 8, 24), gold);
  ring.position.z = -2.9;
  g.add(ring);
  if (nameKey) {
    const c = makeCanvas(256, 64), cg = c.getContext('2d')!, dt = new THREE.CanvasTexture(c);
    dt.colorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      cg.clearRect(0, 0, 256, 64);
      cg.fillStyle = '#d9a441';
      cg.font = '700 44px "Aref Ruqaa", "Reem Kufi", Tahoma, serif';
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.direction = 'rtl';
      cg.fillText(ctx.t(nameKey), 128, 36);
      dt.needsUpdate = true;
    };
    draw();
    ctx.redraws.push(draw);
    for (const s of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false }));
      decal.position.set(s * 1.09, 0.15, 0.3);
      decal.rotation.y = (s * Math.PI) / 2;
      g.add(decal);
    }
  }
  const sprite = (c: string, s: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.scale.set(s, s, 1);
    return sp;
  };
  const flame = sprite('#7fd8ff', 2.6);
  flame.position.z = -3.6;
  g.add(flame);
  const flame2 = sprite('#ffb35a', 1.6);
  flame2.position.z = -4.6;
  g.add(flame2);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = ctx.shadows;
  });
  const rig: Rig = {
    kind: 'ship',
    animate(_s, _dt, o = {}) {
      const f = o.thrust ?? 0, fl = 0.6 + f * 1.6 + Math.random() * 0.25;
      flame.scale.set(fl * 1.3, fl * 1.3, 1);
      flame2.scale.set(fl * 0.9, fl * 0.9, 1);
      (flame.material as THREE.SpriteMaterial).opacity = clamp(0.25 + f * 0.6, 0, 1);
      (flame2.material as THREE.SpriteMaterial).opacity = clamp(f * 0.7, 0, 1);
    },
  };
  return { object: g, rig, extra: { flame, flame2 } };
}
