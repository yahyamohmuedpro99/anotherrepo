import type { CompositeModel, Entity, ModelRef, Scene } from './schema.js';

export type Tier = 'low' | 'mid' | 'high';
export interface SceneEstimate {
  entities: number;
  drawCalls: Record<Tier, number>;
  textureMB: Record<Tier, number>;
}

/**
 * Static upper-bound estimate of draw calls and texture memory per tier. The real numbers come from the
 * perf smoke test (renderer.info at each spawn); this exists so authors see a budget problem in the Studio
 * before anyone opens a phone.
 *
 * Model: entities with a `lod` distance are only partly on screen at once (counted at 35 %); the low tier
 * uses the lite character rigs, skips `tierMin` entities and renders no shadow pass; mid/high add a shadow
 * pass for casters.
 */
const RIG_PARTS: Record<string, { full: number; lite: number }> = {
  human: { full: 16, lite: 5 },
  camel: { full: 24, lite: 6 },
  carriage: { full: 40, lite: 8 },
  balloon: { full: 7, lite: 4 },
  ship: { full: 16, lite: 6 },
  astronaut: { full: 20, lite: 6 },
};

function modelCalls(m: ModelRef | undefined, models: Record<string, CompositeModel>, tier: Tier): number {
  if (!m) return 0;
  const p = (m.params ?? {}) as Record<string, unknown>;
  switch (m.gen) {
    case 'gltf':
      return tier === 'low' && m.lowTier ? modelCalls(m.lowTier as ModelRef, models, tier) : 8;
    case 'composite':
      return m.ref ? (models[m.ref]?.parts.length ?? 1) : 1;
    case 'part':
    case 'instances':
    case 'strip':
    case 'ring':
    case 'halo':
    case 'particles':
    case 'water':
    case 'orbit-line':
      return 1;
    case 'pyramid':
      return 1 + (p.casingFrom != null ? 1 : 0) + (p.granite ? 1 : 0) + (p.gash ? 1 : 0) + (p.mast ? 3 : 0);
    case 'pyramid-simple':
      return 1;
    case 'sign':
      return 4;
    case 'body':
      return 1 + (p.rings ? 1 : 0) + (p.clouds ? 1 : 0) + (p.atmosphere ? 1 : 0) + (p.glow ? 2 : 0);
    case 'belt':
      return 1 + 2 * (Array.isArray(p.gold) ? p.gold.length : 0);
    case 'galaxy':
      return 3;
    case 'beacon':
      return 4;
    case 'scarab':
      return 6;
    case 'beams':
      return Array.isArray(p.aims) ? p.aims.length : 4;
    default: {
      const rig = RIG_PARTS[m.gen];
      if (rig) return tier === 'low' ? rig.lite : rig.full;
      return 1;
    }
  }
}

function textureMBFor(m: ModelRef | undefined): number {
  if (!m) return 0;
  const p = (m.params ?? {}) as Record<string, unknown>;
  if (m.gen === 'body') {
    const w = typeof p.textureSize === 'number' ? p.textureSize : 256;
    return (w * (w / 2) * 4 * 1.33) / 1048576 + (p.clouds ? 0.17 : 0);
  }
  return 0;
}

export function estimateScene(scene: Scene, models: Record<string, CompositeModel>): SceneEstimate {
  const out: SceneEstimate = { entities: scene.entities.length, drawCalls: { low: 0, mid: 0, high: 0 }, textureMB: { low: 0, mid: 0, high: 0 } };
  const env = scene.environment;
  const textures = new Set<string>();
  const addTex = (t: unknown) => t && textures.add(JSON.stringify(t));
  for (const mat of Object.values(scene.materials ?? {})) {
    addTex(mat.map);
    addTex(mat.bumpMap);
    addTex(mat.emissiveMap);
  }
  if (scene.terrain?.texture) addTex(scene.terrain.texture);
  if (scene.terrain?.bump) addTex(scene.terrain.bump);
  for (const tier of ['low', 'mid', 'high'] as Tier[]) {
    let calls = 2; // sky + terrain
    if (env.stars) calls += 1 + (env.stars.band ? 1 : 0) + (env.stars.bright ? 1 : 0);
    if (env.clouds) calls += tier === 'low' ? Math.ceil(env.clouds.count / 2) : env.clouds.count;
    if (env.dust) calls += 1;
    calls += (env.skyObjects ?? []).length;
    let texMB = 0;
    for (const e of scene.entities as Entity[]) {
      if (tier === 'low' && e.tierMin && e.tierMin !== 'low') continue;
      if (tier === 'mid' && e.tierMin === 'high') continue;
      const c = modelCalls(e.model, models, tier) + (e.label ? 0 : 0);
      calls += e.lod ? Math.ceil(c * 0.35) : c;
      texMB += textureMBFor(e.model);
    }
    if (tier !== 'low' && scene.kind === 'terrain') calls = Math.round(calls * 1.6);
    out.drawCalls[tier] = calls;
    out.textureMB[tier] = +(texMB + textures.size * ((256 * 256 * 4 * 1.33) / 1048576)).toFixed(2);
  }
  return out;
}
