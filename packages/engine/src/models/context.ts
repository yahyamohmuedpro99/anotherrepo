import type * as THREE from 'three';
import type { CompositeModel } from '@rihla/pack-schema';
import type { TierSettings } from '../core/quality.js';
import type { Materials } from '../world/materials.js';
import type { HeightFn } from '../world/terrain.js';

export interface SolidBox {
  kind: 'box' | 'pyr';
  x: number;
  z: number;
  hx: number;
  hz: number;
  y0: number;
  h: number;
}

export interface BuildCtx {
  materials: Materials;
  models: Record<string, CompositeModel>;
  quality: TierSettings;
  height: HeightFn;
  /** Translate a locale key (signs and other text drawn into textures). */
  t: (key: string) => string;
  solids: SolidBox[];
  pickables: THREE.Object3D[];
  /** Per-frame callbacks registered by generators (T = seconds since scene start). */
  anims: ((dt: number, T: number) => void)[];
  /** Night-only callbacks (show lasers): receive the night amount. */
  nightAnims: ((night: number, T: number) => void)[];
  /** Re-draw callbacks for canvases that contain text, run on language change and font load. */
  redraws: (() => void)[];
  shadows: boolean;
  rtl: boolean;
}

/** A built model. `rig` is present for animated characters and vehicles. */
export interface Built {
  object: THREE.Object3D;
  rig?: Rig;
  parts?: Record<string, THREE.Object3D>;
  /** Invisible pick volume, if the generator made one. */
  hit?: THREE.Object3D;
  /** Height of the label above the origin. */
  labelY?: number;
  /** Ground y used to place the model (pyramids sink to their lowest corner). */
  baseY?: number;
  extra?: Record<string, unknown>;
}

export interface RigAnimOptions {
  waving?: boolean;
  sit?: 'straddle' | 'bench' | false;
  air?: boolean;
  fly?: boolean;
  burn?: boolean;
  thrust?: number;
}

export interface Rig {
  kind: 'human' | 'astronaut' | 'camel' | 'carriage' | 'balloon' | 'ship';
  /** speed in m/s; `dist` metres travelled this frame (wheels, gait). */
  animate(speed: number, dt: number, opts?: RigAnimOptions, dist?: number): void;
  seat?: { y: number; z: number; sit: 'straddle' | 'bench' | false };
  setColor?(hex: string): void;
}
