import * as THREE from 'three';
import type { CompositeModel, ModelRef, Part, Scatter } from '@rihla/pack-schema';
import { TAU, rng } from '../math/noise.js';
import { haloTexture } from '../world/textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from '../world/materials.js';
import type { BuildCtx, Built } from './context.js';

const num = (v: number | boolean | undefined, d: number) => (typeof v === 'number' ? v : d);
const bool = (v: number | boolean | undefined, d: boolean) => (typeof v === 'boolean' ? v : d);

export function partGeometry(p: Part): THREE.BufferGeometry {
  const a = p.args ?? [];
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case 'box':
      g = new THREE.BoxGeometry(num(a[0], 1), num(a[1], 1), num(a[2], 1));
      if (a[3] === true) {
        // plain top and bottom: sample one texel of the facade instead of windows
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 8; i < 16; i++) uv.setXY(i, 0.5, 0.97);
      }
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(num(a[0], 1), num(a[1], 16), num(a[2], 12), num(a[3], 0), num(a[4], TAU), num(a[5], 0), num(a[6], Math.PI));
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(num(a[0], 1), num(a[1], 1), num(a[2], 1), num(a[3], 12), 1, bool(a[4], false), num(a[5], 0), num(a[6], TAU));
      break;
    case 'cone':
      g = new THREE.ConeGeometry(num(a[0], 1), num(a[1], 1), num(a[2], 12), num(a[3], 1), bool(a[4], false));
      break;
    case 'torus':
      g = new THREE.TorusGeometry(num(a[0], 1), num(a[1], 0.2), num(a[2], 8), num(a[3], 24));
      break;
    case 'plane':
      g = new THREE.PlaneGeometry(num(a[0], 1), num(a[1], 1));
      break;
    case 'circle':
      g = new THREE.CircleGeometry(num(a[0], 1), num(a[1], 24));
      break;
    case 'ring':
      g = new THREE.RingGeometry(num(a[0], 0.5), num(a[1], 1), num(a[2], 32));
      break;
    case 'icosahedron':
      g = new THREE.IcosahedronGeometry(num(a[0], 1), num(a[1], 0));
      break;
    case 'octahedron':
      g = new THREE.OctahedronGeometry(num(a[0], 1), num(a[1], 0));
      break;
    case 'capsule':
      g = new THREE.CapsuleGeometry(num(a[0], 0.5), num(a[1], 1), 4, 8);
      break;
    case 'extrude': {
      const pts = p.points ?? [];
      const sh = new THREE.Shape();
      sh.moveTo(pts[0]![0]!, pts[0]![1]!);
      for (let i = 1; i < pts.length; i++) {
        const q = pts[i]!;
        if (q.length === 4) sh.quadraticCurveTo(q[0]!, q[1]!, q[2]!, q[3]!);
        else sh.lineTo(q[0]!, q[1]!);
      }
      const bev = p.bevel;
      g = new THREE.ExtrudeGeometry(sh, {
        depth: p.depth ?? 1,
        bevelEnabled: !!bev,
        bevelThickness: bev?.[0] ?? 0,
        bevelSize: bev?.[1] ?? 0,
        bevelSegments: bev?.[2] ?? 1,
        curveSegments: num(a[0], 10),
      });
      break;
    }
    case 'lathe':
      g = new THREE.LatheGeometry((p.points ?? []).map(([r, y]) => new THREE.Vector2(r, y)), num(a[0], 36));
      break;
    case 'triangles': {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute((p.points ?? []).flat(), 3));
      g.computeVertexNormals();
      break;
    }
    default:
      g = new THREE.BoxGeometry(1, 1, 1);
  }
  if (p.geoRot) {
    if (p.geoRot[0]) g.rotateX(p.geoRot[0]);
    if (p.geoRot[1]) g.rotateY(p.geoRot[1]);
    if (p.geoRot[2]) g.rotateZ(p.geoRot[2]);
  }
  if (p.pivot) g.translate(p.pivot[0], p.pivot[1], p.pivot[2]);
  return g;
}

export function place(o: THREE.Object3D, p: { at?: number[]; rot?: number[]; rotOrder?: string; scale?: number | number[] }): void {
  if (p.at) o.position.set(p.at[0] ?? 0, p.at[1] ?? 0, p.at[2] ?? 0);
  if (p.rotOrder) o.rotation.order = p.rotOrder as THREE.EulerOrder;
  if (p.rot) o.rotation.set(p.rot[0] ?? 0, p.rot[1] ?? 0, p.rot[2] ?? 0);
  if (typeof p.scale === 'number') o.scale.setScalar(p.scale);
  else if (p.scale) o.scale.set(p.scale[0] ?? 1, p.scale[1] ?? 1, p.scale[2] ?? 1);
}

export function partMesh(p: Part, ctx: BuildCtx, materials: Materials = ctx.materials): THREE.Object3D {
  if (p.shape === 'sprite') {
    const def = typeof p.material === 'string' ? undefined : p.material;
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: def?.color ?? '#ffffff', transparent: true, opacity: def?.opacity ?? 1, blending: def?.type === 'basic' ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, toneMapped: def?.toneMapped ?? false }),
    );
    const sz = num(p.args?.[0], 1);
    sp.scale.set(sz, num(p.args?.[1], sz), 1);
    if (p.at) sp.position.set(p.at[0], p.at[1], p.at[2]);
    return sp;
  }
  const mesh = new THREE.Mesh(partGeometry(p), materials.get(p.material));
  place(mesh, p);
  mesh.castShadow = ctx.shadows && (p.shadow ?? true);
  mesh.receiveShadow = ctx.shadows;
  if (p.ground) {
    mesh.userData.ground = true;
    ctx.pickables.push(mesh);
  }
  return mesh;
}

/** Composite model: a list of primitives, optionally parented to named parts. Model-local materials are
 * registered in the scene's material set under "<model>:<id>" so night/glow animation applies to them too.
 * Static composites (no named/animated parts) are merged into one mesh per material to save draw calls. */
export function buildComposite(model: CompositeModel, ctx: BuildCtx): Built {
  const group = new THREE.Group();
  const local = model.materials ?? {};
  for (const [id, def] of Object.entries(local)) ctx.materials.define(`${model.id}:${id}`, def);
  const resolved = model.parts.map((raw) => (typeof raw.material === 'string' && local[raw.material] ? { ...raw, material: `${model.id}:${raw.material}` } : raw));
  const parts: Record<string, THREE.Object3D> = {};
  const animated = resolved.some((p) => p.name || p.parent);
  if (!animated) {
    const byMat = new Map<string, { mat: Part['material']; geos: THREE.BufferGeometry[]; ground: boolean; shadow: boolean }>();
    for (const p of resolved) {
      if (p.shape === 'sprite') {
        group.add(partMesh(p, ctx));
        continue;
      }
      const key = JSON.stringify(p.material);
      let b = byMat.get(key);
      if (!b) byMat.set(key, (b = { mat: p.material, geos: [], ground: false, shadow: false }));
      const g = partGeometry(p);
      const o = new THREE.Object3D();
      place(o, p);
      o.updateMatrix();
      g.applyMatrix4(o.matrix);
      b.geos.push(normalizeGeometry(g));
      b.ground ||= !!p.ground;
      b.shadow ||= p.shadow ?? true;
    }
    for (const b of byMat.values()) {
      const merged = b.geos.length === 1 ? b.geos[0]! : mergeGeometries(b.geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, ctx.materials.get(b.mat));
      mesh.castShadow = ctx.shadows && b.shadow;
      mesh.receiveShadow = ctx.shadows;
      if (b.ground) {
        mesh.userData.ground = true;
        ctx.pickables.push(mesh);
      }
      group.add(mesh);
      if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    }
  } else
    for (const p of resolved) {
      const m = partMesh(p, ctx);
      if (p.name) parts[p.name] = m;
      const parent = p.parent ? parts[p.parent] : undefined;
      (parent ?? group).add(m);
    }
  if (model.scale) group.scale.setScalar(model.scale);
  return { object: group, parts };
}

/** Same attribute set on every geometry so they can be merged. */
function normalizeGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position!.count) * 2), 2));
  n.clearGroups();
  return n;
}

interface InstanceSpec {
  x: number;
  y: number;
  z: number;
  rot: [number, number, number];
  scale: [number, number, number];
  color?: string;
}

function scatterItems(s: Scatter, ctx: BuildCtx): InstanceSpec[] {
  const r = rng(s.seed);
  const out: InstanceSpec[] = [];
  const sc = () => {
    if (s.scaleXYZ) return s.scaleXYZ.map(([a, b]) => a + r() * (b - a)) as [number, number, number];
    const k = s.scale ? s.scale[0] + r() * (s.scale[1] - s.scale[0]) : 1;
    const q = s.squash ? s.squash[0] + r() * (s.squash[1] - s.squash[0]) : 1;
    return [k, k * q, k] as [number, number, number];
  };
  const push = (x: number, z: number) => {
    if (s.xMax !== undefined && x > s.xMax) return false;
    if (s.exclude?.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return false;
    if (s.avoidSolids !== undefined && ctx.solids.some((b) => Math.abs(x - b.x) < b.hx + s.avoidSolids! && Math.abs(z - b.z) < b.hz + s.avoidSolids!)) return false;
    const scale = sc();
    const y = ctx.height(x, z) + (s.lift ?? 0) * scale[1];
    out.push({ x, y, z, rot: [0, s.yaw ? r() * TAU : 0, 0], scale, ...(s.colors ? { color: s.colors[Math.floor(r() * s.colors.length)] } : {}) });
    return true;
  };
  const jitter = () => (s.jitter ? (r() - 0.5) * s.jitter : 0);
  if (s.type === 'ring') {
    const [cx, cz] = s.center ?? [0, 0];
    let guard = 0;
    while (out.length < (s.count ?? 10) && guard++ < (s.count ?? 10) * 30) {
      const a = r() * TAU, d = (s.rMin ?? 0) + r() * ((s.rMax ?? 100) - (s.rMin ?? 0));
      push(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
    }
  } else if (s.type === 'line') {
    const [x0, z0] = s.from ?? [0, 0], [x1, z1] = s.to ?? [0, 100];
    const L = Math.hypot(x1 - x0, z1 - z0), step = typeof s.step === 'number' ? s.step : 10;
    for (let d = 0; d <= L; d += step) push(x0 + ((x1 - x0) * d) / L + jitter(), z0 + ((z1 - z0) * d) / L + jitter());
  } else if (s.type === 'grid') {
    const [x0, z0] = s.from ?? [0, 0], [x1, z1] = s.to ?? [100, 100];
    const [sx, sz] = typeof s.step === 'number' ? [s.step, s.step] : (s.step ?? [10, 10]);
    for (let x = x0; x <= x1; x += sx) for (let z = z0; z <= z1; z += sz) if (!(s.skip && r() < s.skip)) push(x + jitter(), z + jitter());
  } else {
    const [x0, z0] = s.from ?? [0, 0], [x1, z1] = s.to ?? [100, 100];
    for (let i = 0; i < (s.count ?? 10); i++) push(x0 + r() * (x1 - x0), z0 + r() * (z1 - z0));
  }
  return out;
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Many copies of one primitive in one draw call (palms, rocks, houses, crowds). */
export function buildInstances(ref: ModelRef, ctx: BuildCtx, groundSnap: boolean): Built {
  const p = ref.part!;
  const params = (ref.params ?? {}) as { solid?: boolean; solidPad?: number; animate?: string; crowd?: boolean; countScale?: number };
  let items: InstanceSpec[] = (ref.items ?? []).map((it) => {
    const at = it.at;
    const x = at[0];
    const z = at.length === 3 ? at[2]! : at[1]!;
    const yRaw = at.length === 3 ? at[1]! : 0;
    const y = at.length === 3 && !groundSnap ? yRaw : ctx.height(x, z) + yRaw + (it.lift ?? 0);
    const sc = typeof it.scale === 'number' ? ([it.scale, it.scale, it.scale] as [number, number, number]) : ((it.scale as [number, number, number]) ?? [1, 1, 1]);
    return { x, y, z, rot: (it.rot as [number, number, number]) ?? [0, 0, 0], scale: sc, ...(it.color ? { color: it.color } : {}) };
  });
  if (ref.scatter) items = items.concat(scatterItems(ref.scatter, ctx));
  if (params.crowd && ctx.quality.crowd < 1) items = items.filter((_v, i) => i % Math.round(1 / ctx.quality.crowd) === 0);
  const geo = partGeometry(p);
  const mat = ctx.materials.get(p.material);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.order = (p.rotOrder as THREE.EulerOrder) ?? 'XYZ';
    dummy.rotation.set(it.rot[0], it.rot[1], it.rot[2]);
    dummy.scale.set(it.scale[0], it.scale[1], it.scale[2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color) mesh.setColorAt(i, tmpColor.set(it.color));
    if (params.solid || ref.scatter?.solid) {
      const pad = params.solidPad ?? 0;
      ctx.solids.push({ kind: 'box', x: it.x, z: it.z, hx: it.scale[0] / 2 + pad, hz: it.scale[2] / 2 + pad, y0: it.y, h: it.scale[1] });
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = ctx.shadows && (p.shadow ?? true);
  mesh.receiveShadow = ctx.shadows;
  mesh.frustumCulled = false;
  if (p.ground) {
    mesh.userData.ground = true;
    ctx.pickables.push(mesh);
  }
  if (params.animate === 'tumble') {
    const base = items.map((it) => ({ ...it }));
    ctx.anims.push((_dt, T) => {
      base.forEach((d, i) => {
        dummy.position.set(d.x, d.y + Math.sin(T * 0.6 + i) * 0.6, d.z);
        dummy.scale.set(d.scale[0], d.scale[1], d.scale[2]);
        dummy.rotation.set(T * 0.2 + d.rot[1], T * 0.3 + i, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
  return { object: mesh, extra: { items } };
}
