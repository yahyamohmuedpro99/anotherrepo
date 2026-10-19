import type { Trigger } from '@rihla/pack-schema';
import type { EngineApi } from '../core/api.js';
import type { Player } from '../controllers/player.js';
import type { EntityRT } from '../scene/scene.js';
import type { ActionView, ContextView } from '../ui/hud.js';

export interface TriggerHooks {
  mount(e: EntityRT): void;
  dismount(): void;
  land(): void;
  photo(): void;
  walkingTo(name: string): void;
  interacting(e: EntityRT): void;
}

/**
 * Enter triggers fire when the player comes within range; interact triggers become the gold action button
 * (or a context card, e.g. "In orbit around Mars · Land"); tap triggers run when a label or the model is
 * tapped. Vehicles and photo spots get their interactions implicitly.
 */
export class TriggerSystem {
  private inside = new Set<string>();
  action: ActionView | null = null;
  context: ContextView | null = null;

  constructor(
    private e: EngineApi,
    private player: Player,
    private hooks: TriggerHooks,
  ) {}

  reset(): void {
    this.inside.clear();
    this.action = null;
    this.context = null;
  }

  private key(ent: EntityRT, i: number): string {
    return `${this.e.sceneId}:${ent.id}:${i}`;
  }

  private dist(ent: EntityRT, t: Trigger): { d: number; inRange: boolean } {
    const p = this.player.pos;
    const r = t.radius ?? 4;
    const dh = Math.hypot(ent.pos.x - p.x, ent.pos.z - p.z);
    if (t.mode === '3d') {
      if (t.height !== undefined) {
        const ok = this.player.probes.some((off) => Math.abs(p.y + off - ent.pos.y) < t.height!);
        return { d: dh, inRange: dh < r && ok };
      }
      const d3 = Math.hypot(ent.pos.x - p.x, ent.pos.y - (p.y + 1), ent.pos.z - p.z);
      return { d: d3, inRange: d3 < r };
    }
    if (this.player.mode === 'spacecraft') {
      const d3 = p.distanceTo(ent.pos);
      return { d: d3, inRange: d3 < r };
    }
    return { d: dh, inRange: dh < r };
  }

  /** Called a few times per second. */
  update(): void {
    const sc = this.e.scene;
    if (!sc || this.e.paused || this.player.descent) return;
    const grounded = this.player.vehPreset !== 'balloon' || this.player.altitude < 3;
    let bestA: { d: number; v: ActionView } | null = null;
    let bestC: { d: number; v: ContextView } | null = null;
    const considerA = (d: number, v: ActionView) => {
      if (!bestA || d < bestA.d) bestA = { d, v };
    };
    for (const ent of sc.entities) {
      if (!ent.visible || ent.hidden || ent.rider) continue;
      const trig = ent.def.triggers ?? [];
      trig.forEach((t, i) => {
        if (t.on === 'tap') return;
        if (t.grounded && !grounded) return;
        if (!this.e.check(t.when)) {
          if (t.on === 'enter') this.inside.delete(this.key(ent, i));
          return;
        }
        const { d, inRange } = this.dist(ent, t);
        const k = this.key(ent, i);
        if (t.on === 'enter') {
          if (inRange) {
            if (this.inside.has(k)) return;
            this.inside.add(k);
            if (t.once !== false && this.e.state.fired.has(k)) return;
            this.e.state.fired.add(k);
            this.e.run(t.do, { entity: ent });
          } else if (t.once === false) this.inside.delete(k);
          return;
        }
        if (!inRange || this.player.veh) return;
        if (t.style === 'card' && t.card) {
          const v: ContextView = {
            id: k,
            kicker: this.e.text(t.card.kicker),
            title: this.e.text(t.card.title),
            sub: this.e.text(t.card.sub),
            ...(t.card.swatch ? { swatch: t.card.swatch } : {}),
            label: this.e.text(t.label),
            fn: () => this.interact(ent, t),
          };
          if (!bestC || d < bestC.d) bestC = { d, v };
        } else considerA(d, { id: k, icon: t.icon ?? 'talk', label: this.e.text(t.label), fn: () => this.interact(ent, t) });
      });
      if (this.player.veh || this.player.mode !== 'walk') continue;
      const veh = ent.def.vehicle;
      if (veh) {
        const lim = veh.preset === 'balloon' ? 9 : 4.8;
        const d = Math.hypot(ent.pos.x - this.player.pos.x, ent.pos.z - this.player.pos.z) - 0.5;
        if (d < lim) considerA(d, { id: `v:${ent.id}`, icon: veh.preset, label: veh.rideLabel ? this.e.text(veh.rideLabel) : this.e.t(veh.preset === 'balloon' ? 'engine.board' : 'engine.ride', { name: this.e.t(veh.name) }), fn: () => this.hooks.mount(ent) });
      }
      const ph = ent.def.photo;
      if (ph && !ph.sky) {
        const d = Math.hypot(ent.pos.x - this.player.pos.x, ent.pos.z - this.player.pos.z) - 1;
        if (d < (ph.radius ?? 6)) considerA(d, { id: `p:${ent.id}`, icon: 'camera', label: this.e.t('engine.photoHere'), fn: () => this.hooks.photo() });
      }
    }
    if (this.player.veh) {
      const balloon = this.player.vehPreset === 'balloon';
      const alt = this.player.altitude;
      bestA = balloon && alt > 0.8 ? { d: 0, v: { id: 'land', icon: 'down', label: this.e.t('engine.landNow'), fn: () => this.hooks.land() } } : { d: 0, v: { id: 'off', icon: 'exit', label: this.e.t('engine.dismount'), fn: () => this.hooks.dismount() } };
    }
    this.action = (bestA as { v: ActionView } | null)?.v ?? null;
    this.context = this.e.autopilot() ? null : ((bestC as { v: ContextView } | null)?.v ?? null);
  }

  interact(ent: EntityRT, t: Trigger): void {
    this.hooks.interacting(ent);
    this.e.run(t.do, { entity: ent });
  }

  /** Tap on an entity's model or label. */
  tap(ent: EntityRT): void {
    const d = ent.def;
    if (d.tap) {
      this.e.run(d.tap, { entity: ent });
      return;
    }
    const tapT = d.triggers?.find((t) => t.on === 'tap' && this.e.check(t.when));
    if (tapT) {
      this.e.run(tapT.do, { entity: ent });
      return;
    }
    if (this.player.mode === 'spacecraft' && (d.standoff || d.kind === 'body' || d.kind === 'craft' || d.kind === 'pickup')) {
      this.player.flyTo(ent, this.e.text(d.label?.text));
      return;
    }
    if (this.player.mode === 'jetpack' || (this.player.mode === 'walk' && d.kind === 'pickup')) {
      this.player.walkTo(ent.pos.x, ent.pos.z, undefined, this.player.mode === 'jetpack' ? ent.pos.y : undefined);
      if (this.player.mode === 'jetpack') this.player.marker.visible = false;
      return;
    }
    if (this.player.vehPreset === 'balloon') {
      this.e.run([{ do: 'show.toast', text: 'engine.inBalloon' }]);
      return;
    }
    const it = d.triggers?.find((t) => t.on === 'interact' && this.e.check(t.when));
    const name = d.label ? this.e.text(d.label.text) : '';
    const dist = Math.hypot(ent.pos.x - this.player.pos.x, ent.pos.z - this.player.pos.z);
    if (it) {
      const near = (it.radius ?? 4) * (d.npc ? 8 : 3);
      if (dist > near) {
        this.player.walkTo(ent.pos.x + (this.player.pos.x > ent.pos.x ? 2.5 : -2.5), ent.pos.z, undefined);
        this.hooks.walkingTo(name);
        return;
      }
      this.interact(ent, it);
      return;
    }
    if (d.vehicle) {
      const lim = d.vehicle.preset === 'balloon' ? 14 : 6;
      if (dist > lim) {
        this.player.walkTo(ent.pos.x + (this.player.pos.x > ent.pos.x ? 3 : -3) * (d.vehicle.preset === 'balloon' ? 3 : 1), ent.pos.z, undefined);
        this.hooks.walkingTo(this.e.t(d.vehicle.name));
        return;
      }
      this.hooks.mount(ent);
    }
  }
}
