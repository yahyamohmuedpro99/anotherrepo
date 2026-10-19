import * as THREE from 'three';
import type { Cond, MaterialDef, MaterialRef } from '@rihla/pack-schema';
import { fadeTexture, textureFor } from './textures.js';

interface Live {
  mat: THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number };
  def: MaterialDef;
  baseEmissive: THREE.Color | null;
  index: number;
}

/**
 * Builds three.js materials from pack material definitions and animates the declarative bits:
 * `night` (emissive follows night amount, optionally hue-cycling for the light show), `pulse` and
 * `glowWhen` (emissive on while a condition holds).
 */
export class Materials {
  private byKey = new Map<string, Live>();
  private live: Live[] = [];

  constructor(private defs: Record<string, MaterialDef> = {}) {}

  define(id: string, def: MaterialDef): void {
    this.defs[id] = def;
  }

  get(ref: MaterialRef | undefined): THREE.Material {
    if (ref === undefined) return this.get({ color: '#cccccc' });
    const key = typeof ref === 'string' ? `#${ref}` : JSON.stringify(ref);
    const hit = this.byKey.get(key);
    if (hit) return hit.mat;
    const def = typeof ref === 'string' ? this.defs[ref] : ref;
    if (!def) throw new Error(`Unknown material "${String(ref)}"`);
    const mat = build(def);
    const live: Live = { mat, def, baseEmissive: mat.emissive ? mat.emissive.clone() : null, index: this.live.length };
    this.byKey.set(key, live);
    if (def.night || def.glowWhen || def.pulse) this.live.push(live);
    return mat;
  }

  update(night: number, T: number, check: (c: Cond) => boolean): void {
    for (const L of this.live) {
      const m = L.mat;
      if (!m.emissive) continue;
      const d = L.def;
      let intensity = d.emissiveIntensity ?? (L.baseEmissive && L.baseEmissive.getHex() ? 1 : 0);
      if (d.night) {
        if (d.night.mode === 'hue-cycle') {
          if (night < 0.01) {
            m.emissive.setRGB(0, 0, 0);
            continue;
          }
          m.emissive.setHSL((T * 0.035 + L.index * 0.29) % 1, 0.85, 0.5);
          intensity = night * d.night.intensity;
        } else intensity = night * d.night.intensity;
      }
      if (d.pulse) intensity = d.pulse.min + (d.pulse.max - d.pulse.min) * (0.5 + 0.5 * Math.sin(T * d.pulse.speed));
      if (d.glowWhen) intensity = check(d.glowWhen.when) ? d.glowWhen.intensity + night * (d.glowWhen.nightBoost ?? 0) : d.night ? intensity : 0;
      m.emissiveIntensity = intensity;
    }
  }

  dispose(): void {
    for (const L of this.byKey.values()) L.mat.dispose();
    this.byKey.clear();
    this.live = [];
  }
}

function build(d: MaterialDef): THREE.Material & { emissive?: THREE.Color } {
  const side = d.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
  const common = {
    transparent: d.transparent ?? (d.opacity !== undefined && d.opacity < 1) ?? false,
    opacity: d.opacity ?? 1,
    side,
    ...(d.depthWrite !== undefined ? { depthWrite: d.depthWrite } : {}),
    ...(d.fog !== undefined ? { fog: d.fog } : {}),
    ...(d.toneMapped !== undefined ? { toneMapped: d.toneMapped } : {}),
    vertexColors: d.vertexColors ?? false,
  };
  if (d.type === 'basic' || d.type === 'additive') {
    const m = new THREE.MeshBasicMaterial({
      ...common,
      color: new THREE.Color(d.color ?? '#ffffff'),
      ...(d.map ? { map: textureFor(d.map) } : {}),
      ...(d.alphaFade ? { alphaMap: fadeTexture(), transparent: true } : {}),
    });
    if (d.type === 'additive') {
      m.blending = THREE.AdditiveBlending;
      m.transparent = true;
      m.depthWrite = false;
    }
    return m;
  }
  const m = new THREE.MeshStandardMaterial({
    ...common,
    color: new THREE.Color(d.color ?? '#ffffff'),
    roughness: d.roughness ?? 0.9,
    metalness: d.metalness ?? 0,
    flatShading: d.flatShading ?? false,
    emissive: new THREE.Color(d.emissive ?? '#000000'),
    emissiveIntensity: d.emissiveIntensity ?? 1,
    ...(d.map ? { map: textureFor(d.map) } : {}),
    ...(d.bumpMap ? { bumpMap: textureFor(d.bumpMap), bumpScale: d.bumpScale ?? 1 } : {}),
    ...(d.emissiveMap ? { emissiveMap: textureFor(d.emissiveMap) } : {}),
    ...(d.alphaFade ? { alphaMap: fadeTexture(), transparent: true } : {}),
  });
  if (d.night || d.glowWhen) m.emissiveIntensity = 0;
  return m;
}
