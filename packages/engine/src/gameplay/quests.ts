import * as THREE from 'three';
import type { Quest, QuestStep } from '@rihla/pack-schema';
import type { EngineApi } from '../core/api.js';
import type { QuestView } from '../ui/hud.js';

/** Bearing → one of eight compass words (x = east, z = south). */
export function dirIndex(dx: number, dz: number): number {
  const a = Math.atan2(dx, -dz);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

export class QuestSystem {
  private completed = new Set<string>();

  constructor(private e: EngineApi) {
    for (const id of e.state.questsDone) this.completed.add(id);
  }

  quest(id: string | undefined): Quest | null {
    return id ? (this.e.pack.quests[id] ?? null) : null;
  }
  get main(): Quest | null {
    return this.quest(this.e.manifest.hud.quest);
  }

  /** Where a step's target is in the current scene (null if elsewhere or unknown). */
  targetPos(step: QuestStep): THREE.Vector3 | null {
    const t = step.target, sc = this.e.scene;
    if (!t || !sc) return null;
    if (typeof t === 'string') return sc.byId.get(t)?.pos ?? null;
    if ('at' in t) {
      if (t.scene && t.scene !== this.e.sceneId) return null;
      const at = t.at;
      return at.length === 2 ? new THREE.Vector3(at[0], sc.height(at[0], at[1]), at[1]) : new THREE.Vector3(at[0], at[1], at[2]);
    }
    return null;
  }

  nextStep(q: Quest | null): QuestStep | null {
    if (!q || this.e.check(q.done)) return null;
    const open = q.steps.filter((s) => this.e.check(s.when) && !this.e.check(s.done));
    if (!open.length) return null;
    if (q.mode === 'ordered') return open[0]!;
    const p = this.e.playerPos();
    let best: QuestStep | null = null, bd = Infinity;
    for (const s of open) {
      const tp = this.targetPos(s);
      const d = tp ? Math.hypot(tp.x - p.x, tp.z - p.z) : 1e9;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private distDir(step: QuestStep): { m: number; dir: string } | null {
    const tp = this.targetPos(step);
    if (!tp) return null;
    const p = this.e.playerPos();
    const dx = tp.x - p.x, dz = tp.z - p.z;
    return { m: Math.round(Math.hypot(dx, dz)), dir: this.e.t(`engine.dir.${dirIndex(dx, dz)}`) };
  }

  nextLabel(id: string): string {
    const s = this.nextStep(this.quest(id));
    return s ? this.e.t(s.label) : '';
  }

  hintLine(id: string): string {
    const s = this.nextStep(this.quest(id));
    if (!s) return '';
    const dd = this.distDir(s);
    if (!dd) return this.e.t(s.label);
    return this.e.t('engine.hint', { where: this.e.t(s.label), m: dd.m, dir: dd.dir });
  }

  view(): QuestView | null {
    const q = this.main;
    if (!q) return null;
    if (q.scenes && !q.scenes.includes(this.e.sceneId)) return null;
    const progress = q.progress ? { n: Math.min(q.progress.of, this.e.state.count(q.progress.counter)), of: q.progress.of, style: q.progress.style } : undefined;
    const base = { title: this.e.t(q.title), ...(q.kicker ? { kicker: this.e.t(q.kicker) } : {}), ...(progress ? { progress } : {}) };
    if (q.goal.busy && this.e.check(q.goal.busy.when)) return { ...base, goal: this.e.t(q.goal.busy.text), buttons: [] };
    const step = this.nextStep(q);
    if (!step) return { ...base, goal: this.e.t(q.goal.done), buttons: [] };
    const dd = this.distDir(step);
    const goal = dd ? this.e.t(q.goal.next, { where: this.e.t(step.label), m: dd.m, dir: dd.dir }) : this.e.t(q.goal.noTarget ?? q.goal.next, { where: this.e.t(step.label), m: '', dir: '' });
    const buttons = (step.buttons ?? [])
      .filter((b) => this.e.check(b.when))
      .map((b) => ({ label: this.e.text(b.label), ...(b.icon ? { icon: b.icon } : {}), style: b.style ?? 'gold', fn: () => this.e.run(b.do) }));
    if (!step.buttons && step.target) buttons.push({ label: this.e.t(q.guideButton ?? 'engine.guide'), icon: 'compass', style: 'gold', fn: () => this.e.run([{ do: 'travel.to', target: { nearest: 'quest-step', quest: q.id }, mode: 'auto' }]) });
    return { ...base, goal, buttons };
  }

  /** Runs a step button (used by dialogue options such as "Warp to Mars"). */
  go(id: string, button = 0): void {
    const s = this.nextStep(this.quest(id));
    const b = s?.buttons?.filter((x) => this.e.check(x.when))[button];
    if (b) this.e.run(b.do);
  }

  /** Fires onComplete exactly once per quest (persisted). */
  check(): void {
    for (const q of Object.values(this.e.pack.quests)) {
      if (this.completed.has(q.id)) continue;
      if (this.e.check(q.done)) this.complete(q.id);
    }
  }

  complete(id: string): void {
    if (this.completed.has(id)) return;
    const q = this.quest(id);
    if (!q) return;
    this.completed.add(id);
    this.e.state.questsDone.add(id);
    this.e.state.changed();
    this.e.emit('completed-quest', { type: 'quest', id }, undefined, { objectives: q.objectives ?? [] });
    if (id === this.e.manifest.hud.quest) this.e.emit('completed', { type: 'pack', id: this.e.manifest.id });
    this.e.run(q.onComplete);
  }

  /** Target of the guided step, for "Guide me". */
  guideTarget(id: string | undefined): THREE.Vector3 | null {
    const s = this.nextStep(this.quest(id ?? this.e.manifest.hud.quest));
    return s ? this.targetPos(s) : null;
  }
}
