import type { Cond, ParamSource, TextRef } from '@rihla/pack-schema';
import type { Params } from '@rihla/i18n';
import type { GameState } from './state.js';

export interface CondEnv {
  state: GameState;
  vehicle: () => string | null;
  altitude: () => number;
  night: () => boolean;
  sceneId: () => string;
  autopilot: () => boolean;
}

export function evalCond(c: Cond | undefined, env: CondEnv): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => evalCond(x, env));
  if ('any' in c) return c.any.some((x) => evalCond(x, env));
  if ('not' in c) return !evalCond(c.not, env);
  if ('flag' in c) return env.state.flags.has(c.flag);
  if ('counter' in c) {
    const n = env.state.count(c.counter);
    if (c.has !== undefined && !env.state.has(c.counter, c.has)) return false;
    if (c.gte !== undefined && n < c.gte) return false;
    if (c.lt !== undefined && n >= c.lt) return false;
    return true;
  }
  if ('stamp' in c) return env.state.stamps.has(c.stamp);
  if ('quest' in c) return c.status === 'done' ? env.state.questsDone.has(c.quest) : !env.state.questsDone.has(c.quest);
  if ('vehicle' in c) return env.vehicle() === c.vehicle;
  if ('altitudeGte' in c) return env.altitude() >= c.altitudeGte;
  if ('timeOfDay' in c) return (c.timeOfDay === 'night') === env.night();
  if ('scene' in c) return env.sceneId() === c.scene;
  if ('autopilot' in c) return env.autopilot() === c.autopilot;
  return false;
}

export interface TextEnv {
  t: (key: string, params?: Params) => string;
  state: GameState;
  counterOf: (id: string) => number;
  guide: (questId: string) => string;
  next: (questId: string) => string;
}

export function paramValue(p: ParamSource, env: TextEnv): string | number {
  if ('counter' in p) return env.state.count(p.counter);
  if ('counterOf' in p) return env.counterOf(p.counterOf);
  if ('guide' in p) return env.guide(p.guide);
  if ('next' in p) return env.next(p.next);
  if ('player' in p) return env.state.name;
  if ('text' in p) return env.t(p.text);
  return p.literal;
}

export function resolveText(ref: TextRef | undefined, env: TextEnv): string {
  if (ref === undefined) return '';
  if (typeof ref === 'string') return env.t(ref);
  const params: Params = {};
  for (const [k, v] of Object.entries(ref.params ?? {})) params[k] = paramValue(v, env);
  return env.t(ref.key, params);
}
