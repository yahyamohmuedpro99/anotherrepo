export type Tier = 'low' | 'mid' | 'high';

export interface TierSettings {
  tier: Tier;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMap: number;
  drawDistance: number;
  particles: number;
  crowd: number;
  liteRigs: boolean;
  maxFps: number;
  clouds: number;
}

export function settingsFor(tier: Tier, dpr = 1, touch = false): TierSettings {
  switch (tier) {
    case 'low':
      return { tier, pixelRatio: Math.min(dpr, 1), antialias: false, shadows: false, shadowMap: 512, drawDistance: 0.6, particles: 0.35, crowd: 0.5, liteRigs: true, maxFps: 30, clouds: 0.5 };
    case 'mid':
      return { tier, pixelRatio: Math.min(dpr, touch ? 1.25 : 1.5), antialias: true, shadows: true, shadowMap: 1024, drawDistance: 0.85, particles: 0.7, crowd: 1, liteRigs: false, maxFps: 60, clouds: 1 };
    default:
      return { tier, pixelRatio: Math.min(dpr, touch ? 1.5 : 2), antialias: true, shadows: true, shadowMap: 2048, drawDistance: 1, particles: 1, crowd: 1, liteRigs: false, maxFps: 60, clouds: 1 };
  }
}

interface NavLike {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent?: string;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** First guess from device hints; the fps probe can only move it down. */
export function guessTier(nav: NavLike = (globalThis.navigator ?? {}) as NavLike, gpu?: string): Tier {
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const ua = nav.userAgent ?? '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  if (nav.connection?.saveData) return 'low';
  if (gpu && /(Mali-4|Mali-T|Adreno \(TM\) [3-5]\d\d|PowerVR SGX|SwiftShader|llvmpipe)/i.test(gpu)) return 'low';
  if (mem <= 3 || cores <= 4 && mobile && mem <= 4) return 'low';
  if (mobile || mem <= 6) return 'mid';
  return 'high';
}

/** Watches the first seconds of play and steps the tier down when frames are slow. */
export class FpsProbe {
  private frames = 0;
  private elapsed = 0;
  private done = false;
  constructor(
    private target: number,
    private onSlow: () => void,
    private seconds = 3,
  ) {}
  tick(dt: number): void {
    if (this.done) return;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= this.seconds) {
      const fps = this.frames / this.elapsed;
      this.done = true;
      if (fps < this.target * 0.75) this.onSlow();
    }
  }
  reset(): void {
    this.frames = 0;
    this.elapsed = 0;
    this.done = false;
  }
}

export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'mid' : 'low');
