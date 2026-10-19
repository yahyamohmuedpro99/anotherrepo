import { Engine, type MountOptions } from './engine.js';
import type { TeacherCommand } from './gameplay/teacher.js';
import type { SaveData } from './core/state.js';

export type { MountOptions } from './engine.js';
export type { LearningEvent } from './core/telemetry.js';
export type { TeacherCommand } from './gameplay/teacher.js';
export type { SaveData } from './core/state.js';
export { ENGINE_STRINGS } from './locales/strings.js';
export { guessTier, settingsFor } from './core/quality.js';
export { transliterate } from './gameplay/glyphs.js';

export interface RihlaHandle {
  /** Resolves when the pack is loaded and the first frame is drawn. */
  ready: Promise<void>;
  pause(): void;
  resume(): void;
  goto(poiId: string): void;
  setLocale(locale: string): void;
  getState(): SaveData | null;
  teacher: { dispatch(cmd: TeacherCommand): void };
  destroy(): void;
  /** Escape hatch for tests and the Studio preview. */
  readonly engine: Engine;
}

/**
 * Mounts the engine into an element. The portal, the QR landing page and the Studio preview all use this
 * same call: `Rihla.mount(el, { packUrl, startPoi, locale, user, roomToken, onEvent })`.
 */
export function mount(el: HTMLElement, opts: MountOptions): RihlaHandle {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const engine = new Engine(el, opts);
  const ready = engine.start();
  return {
    ready,
    pause: () => engine.pause(),
    resume: () => engine.resume(),
    goto: (id) => engine.goto(id),
    setLocale: (l) => engine.switchLocale(l),
    getState: () => engine.getState(),
    teacher: { dispatch: (c) => engine.teacher(c) },
    destroy: () => engine.destroy(),
    engine,
  };
}

export const Rihla = { mount };
export default Rihla;
