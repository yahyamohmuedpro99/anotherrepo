import type * as THREE from 'three';
import type { Action, Cond, Manifest, TextRef } from '@rihla/pack-schema';
import type { PackData } from '@rihla/pack-schema/runtime';
import type { Params, Translator } from '@rihla/i18n';
import type { AudioSystem } from './audio.js';
import type { TierSettings } from './quality.js';
import type { GameState } from './state.js';
import type { LearningEvent, Telemetry } from './telemetry.js';
import type { SceneRuntime, EntityRT } from '../scene/scene.js';

/** What every subsystem can see of the engine. Implemented by `Engine` (engine.ts). */
export interface EngineApi {
  readonly pack: PackData;
  readonly manifest: Manifest;
  readonly state: GameState;
  readonly audio: AudioSystem;
  readonly telemetry: Telemetry;
  readonly root: HTMLElement;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer | null;
  quality: TierSettings;
  tr: Translator;
  /** Translator for the other language (bilingual place banners). */
  altTr: Translator;
  readonly isTouch: boolean;
  reducedMotion: boolean;
  scene: SceneRuntime | null;
  sceneId: string;
  readonly hints: boolean;
  t(key: string, params?: Params): string;
  text(ref: TextRef | undefined): string;
  check(c: Cond | undefined): boolean;
  run(actions: Action[] | undefined, src?: { entity?: EntityRT }): void;
  emit(verb: LearningEvent['verb'], object: LearningEvent['object'], result?: LearningEvent['result'], context?: Partial<LearningEvent['context']>): void;
  /** Engine-paced timer (stops while paused). */
  after(seconds: number, fn: () => void): void;
  goScene(id: string, spawn?: string, transition?: 'fade' | 'warp' | 'zoom-out' | 'none', toast?: string): void;
  save(): void;
  readonly paused: boolean;
  readonly movementLocked: boolean;
  /** The player's current focus (avatar position) and vehicle preset, for conditions and UI. */
  playerPos(): THREE.Vector3;
  vehicle(): string | null;
  altitude(): number;
  autopilot(): boolean;
  objectivesOf(kind: 'item' | 'card' | 'poi', id: string): string[];
}
