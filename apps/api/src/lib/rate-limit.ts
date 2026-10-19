/**
 * In-process fixed-window limiter (ADR-0010). Good for one API node; move the counters to Redis when we run
 * more than one.
 */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}
  /** Returns true when the call is allowed. */
  take(key: string): boolean {
    const t = this.now();
    let h = this.hits.get(key);
    if (!h || h.reset <= t) {
      h = { n: 0, reset: t + this.windowMs };
      this.hits.set(key, h);
      if (this.hits.size > 50_000) this.sweep(t);
    }
    h.n++;
    return h.n <= this.limit;
  }
  private sweep(t: number): void {
    for (const [k, v] of this.hits) if (v.reset <= t) this.hits.delete(k);
  }
}
