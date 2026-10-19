import type { EngineApi } from '../core/api.js';

/**
 * Place-name banners (in both languages) when the player enters an area, the area's evidence card on the
 * first visit, and `visited-poi` learning events for POIs.
 */
export class AreaSystem {
  private cur: string | null = null;
  private pendingCard: string | null = null;
  private visited = new Set<string>();
  onBanner: (a: string, b: string, langA: string, langB: string) => void = () => {};

  constructor(private e: EngineApi) {}

  reset(): void {
    this.cur = null;
    this.pendingCard = null;
  }

  update(dialogOpen: boolean): void {
    const sc = this.e.scene;
    if (!sc) return;
    const p = this.e.playerPos();
    const A = sc.def.areas;
    if (A) {
      let best: (typeof A.list)[number] | null = null, bs = 1;
      for (const a of A.list) {
        const s = Math.hypot(a.at[0] - p.x, a.at[1] - p.z) / a.r;
        if (s < bs) {
          bs = s;
          best = a;
        }
      }
      let nameKey: string | null = null, id: string | null = null, card: string | undefined;
      if (best) {
        nameKey = best.name ?? (best.poi ? this.e.pack.pois[best.poi]?.title ?? null : null);
        id = best.id;
        card = best.card;
      } else
        for (const f of A.fallback ?? []) {
          const ok = !f.any || f.any.some((r) => (r.xGt === undefined || p.x > r.xGt) && (r.xLt === undefined || p.x < r.xLt) && (r.zGt === undefined || p.z > r.zGt) && (r.zLt === undefined || p.z < r.zLt));
          if (ok) {
            nameKey = f.name;
            id = `fallback:${f.name}`;
            break;
          }
        }
      if (this.pendingCard && !dialogOpen && this.pendingCard === id) this.showCard(card);
      if (id && id !== this.cur && nameKey) {
        this.cur = id;
        this.onBanner(this.e.t(nameKey), this.e.altTr.t(nameKey), this.e.tr.locale, this.e.altTr.locale);
        if (card && !this.e.state.seen.has(`card:${card}`)) {
          if (dialogOpen) this.pendingCard = id;
          else {
            const want = id;
            this.e.after(1.6, () => {
              if (this.cur === want && !dialogOpen) this.showCard(card);
              else this.pendingCard = want;
            });
          }
        }
      }
    }
    for (const poi of Object.values(this.e.pack.pois)) {
      if (poi.scene !== this.e.sceneId || this.visited.has(poi.id)) continue;
      const [x, z] = poi.at.length === 3 ? [poi.at[0], poi.at[2]] : [poi.at[0], poi.at[1]];
      const d = sc.def.kind === 'space' ? Math.hypot(x - p.x, (poi.at.length === 3 ? poi.at[1] : 0) - p.y, z - p.z) : Math.hypot(x - p.x, z - p.z);
      if (d < poi.radius) {
        this.visited.add(poi.id);
        this.e.emit('visited-poi', { type: 'poi', id: poi.id }, undefined, { objectives: poi.objectives });
      }
    }
  }

  /** Marks a POI visited (spawns at a POI count as a visit). */
  markVisited(id: string): void {
    if (this.visited.has(id)) return;
    this.visited.add(id);
    const poi = this.e.pack.pois[id];
    this.e.emit('visited-poi', { type: 'poi', id }, undefined, { objectives: poi?.objectives ?? [] });
  }

  private showCard(card: string | undefined): void {
    this.pendingCard = null;
    if (!card || this.e.state.seen.has(`card:${card}`)) return;
    this.e.state.seen.add(`card:${card}`);
    this.e.state.changed();
    this.e.run([{ do: 'show.card', card }]);
  }
}
