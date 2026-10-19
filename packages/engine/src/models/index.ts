import * as THREE from 'three';
import type { ModelRef } from '@rihla/pack-schema';
import type { BuildCtx, Built } from './context.js';
import { buildComposite, buildInstances, partMesh } from './primitives.js';
import { buildPyramid, buildSign, buildSimplePyramid, buildStrip, type PyramidParams } from './structures.js';
import { buildAstronaut, buildHuman, type HumanParams } from './characters.js';
import { buildBalloon, buildCamel, buildCarriage, buildShip } from './vehicles.js';
import { buildBelt, buildBody, buildGalaxy, buildOrbitLine, haloSprite, type BodyParams, type GalaxyParams } from './space.js';
import { buildBeacon, buildBeams, buildLight, buildParticles, buildRing, buildScarab } from './effects.js';

export type { BuildCtx, Built, Rig, SolidBox } from './context.js';

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Ground snapping is on for this entity. */
  ground: boolean;
}

/** Builds any declared model. Unknown generators fail loudly so the Studio shows them. */
export function buildModel(ref: ModelRef, ctx: BuildCtx, at: Placement): Built {
  const p = (ref.params ?? {}) as Record<string, any>;
  switch (ref.gen) {
    case 'composite': {
      const m = ref.ref ? ctx.models[ref.ref] : undefined;
      if (!m) throw new Error(`Unknown composite model "${ref.ref}"`);
      return buildComposite(m, ctx);
    }
    case 'part':
      return { object: partMesh(ref.part!, ctx) };
    case 'instances':
      return buildInstances(ref, ctx, at.ground);
    case 'pyramid':
      return buildPyramid(p as PyramidParams, at.x, at.z, ctx);
    case 'pyramid-simple':
      return buildSimplePyramid(p.half, p.height, ctx);
    case 'strip':
    case 'water':
      return buildStrip(p.from, p.to, p.width, ref.material ?? (ref.gen === 'water' ? { color: '#2a6fa8', roughness: 0.25, metalness: 0.2 } : { color: '#cdb084', roughness: 1 }), p.lift ?? 0.12, p.segments ?? 60, ctx);
    case 'sign':
      return buildSign(p.text, p.w ?? 4.4, p.y ?? 2.6, p.bg ?? '#1d5a43', ctx);
    case 'human':
      return buildHuman(p as HumanParams, ctx);
    case 'astronaut':
      return buildAstronaut(ctx, p.flag);
    case 'camel':
      return buildCamel(p.blanket ?? '#b83a2e', ctx);
    case 'carriage':
      return buildCarriage(p.canopy ?? '#2f7a56', p.body ?? '#e9e1cf', p.horse ?? '#3b2a20', ctx);
    case 'balloon':
      return buildBalloon(ctx, p.colors);
    case 'ship':
      return buildShip(ctx, p.name);
    case 'body':
      return buildBody(p as BodyParams, ctx);
    case 'orbit-line':
      return buildOrbitLine(p.radius, p.color ?? '#4a5f96', p.opacity ?? 0.35);
    case 'belt':
      return buildBelt({ count: p.count ?? 700, rMin: p.rMin ?? 262, width: p.width ?? 36, seed: p.seed ?? 71, color: p.color ?? '#8d8172' }, ctx);
    case 'galaxy':
      return buildGalaxy(p as GalaxyParams, ctx);
    case 'beacon':
      return buildBeacon(p, ctx);
    case 'scarab':
      return buildScarab(p, ctx);
    case 'ring':
      return buildRing(p, ctx);
    case 'beams':
      return buildBeams(p as never, new THREE.Vector3(at.x, at.y, at.z), ctx);
    case 'halo':
      return { object: haloSprite(p.color ?? '#ffffff', p.size ?? 4, p.opacity ?? 1, p.additive ?? true) };
    case 'particles':
      return buildParticles(p as never, new THREE.Vector3(at.x, at.y, at.z), ctx);
    case 'light':
      return buildLight(p as never, ctx);
    case 'gltf':
      return buildGltf(ref, ctx, at);
    default:
      throw new Error(`Unknown model generator "${(ref as { gen: string }).gen}"`);
  }
}

/** glTF with the procedural model as placeholder and low-tier fallback. */
function buildGltf(ref: ModelRef, ctx: BuildCtx, at: Placement): Built {
  const holder = new THREE.Group();
  const low = ref.lowTier as ModelRef | undefined;
  if (low) holder.add(buildModel(low, ctx, at).object);
  if (ctx.quality.tier === 'low' && low) return { object: holder };
  if (ref.url) {
    void import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(ref.url!))
      .then((gltf) => {
        holder.clear();
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = ctx.shadows;
            o.receiveShadow = ctx.shadows;
          }
        });
        holder.add(gltf.scene);
      })
      .catch(() => {
        /* keep the procedural placeholder */
      });
  }
  return { object: holder };
}
