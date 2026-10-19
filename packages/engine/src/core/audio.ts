export type Bus = 'music' | 'ambience' | 'vo' | 'sfx';
export type Sfx = 'chime' | 'stamp' | 'whoosh' | 'click' | 'success' | 'error' | 'shutter';

/**
 * Four buses with separate volume; music and ambience duck under voice-over. Sound effects are synthesised
 * so packs work before any audio is recorded. Nothing plays until the first user gesture (autoplay rules).
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private buses = new Map<Bus, GainNode>();
  private volumes: Record<Bus, number> = { music: 0.6, ambience: 0.5, vo: 1, sfx: 0.8 };
  private ambience: AudioBufferSourceNode | null = null;
  private ambienceKind: 'wind' | 'space' | null = null;
  private voEl: HTMLAudioElement | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const master = this.ctx.createGain();
    master.connect(this.ctx.destination);
    for (const b of ['music', 'ambience', 'vo', 'sfx'] as Bus[]) {
      const g = this.ctx.createGain();
      g.gain.value = this.volumes[b];
      g.connect(master);
      this.buses.set(b, g);
    }
    if (this.ambienceKind) this.setAmbience(this.ambienceKind);
  }

  setVolume(bus: Bus, v: number): void {
    this.volumes[bus] = v;
    const g = this.buses.get(bus);
    if (g && this.ctx) g.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  getVolume(bus: Bus): number {
    return this.volumes[bus];
  }
  setMuted(m: boolean): void {
    this.muted = m;
    for (const b of this.buses.keys()) this.setVolume(b, this.volumes[b]);
  }

  private duck(on: boolean): void {
    if (!this.ctx) return;
    for (const b of ['music', 'ambience'] as Bus[]) {
      const g = this.buses.get(b);
      g?.gain.setTargetAtTime(this.muted ? 0 : this.volumes[b] * (on ? 0.3 : 1), this.ctx.currentTime, 0.15);
    }
  }

  /** Plays a voice-over clip if one exists; subtitles are always shown regardless. */
  playVo(url: string | null): void {
    this.voEl?.pause();
    if (!url) return;
    const el = new Audio(url);
    el.volume = this.muted ? 0 : this.volumes.vo;
    el.addEventListener('ended', () => this.duck(false));
    el.addEventListener('error', () => this.duck(false));
    this.voEl = el;
    this.duck(true);
    void el.play().catch(() => this.duck(false));
  }
  stopVo(): void {
    this.voEl?.pause();
    this.duck(false);
  }

  private noise(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown-ish
      d[i] = last * 3.5;
    }
    return buf;
  }

  setAmbience(kind: 'wind' | 'space' | null): void {
    this.ambienceKind = kind;
    if (!this.ctx) return;
    this.ambience?.stop();
    this.ambience = null;
    if (!kind) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(6);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'wind' ? 520 : 180;
    const g = this.ctx.createGain();
    g.gain.value = kind === 'wind' ? 0.18 : 0.1;
    src.connect(f).connect(g).connect(this.buses.get('ambience')!);
    src.start();
    this.ambience = src;
  }

  sfx(kind: Sfx): void {
    const ctx = this.ctx;
    const out = this.buses.get('sfx');
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(vol, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(out);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    const burst = (dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(dur);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t);
      return f;
    };
    switch (kind) {
      case 'chime':
        [880, 1108.7, 1318.5].forEach((f, i) => tone(f, i * 0.08, 0.6, 'sine', 0.18));
        break;
      case 'success':
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.5, 'triangle', 0.16));
        break;
      case 'stamp':
        tone(90, 0, 0.25, 'sine', 0.6);
        burst(0.12, 900, 0.5);
        break;
      case 'whoosh': {
        const f = burst(1.1, 300, 0.5, 'bandpass');
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
        break;
      }
      case 'click':
        tone(1400, 0, 0.05, 'square', 0.05);
        break;
      case 'error':
        tone(220, 0, 0.18, 'sawtooth', 0.08);
        tone(180, 0.12, 0.22, 'sawtooth', 0.08);
        break;
      case 'shutter':
        burst(0.08, 3000, 0.4, 'highpass');
        break;
    }
  }

  destroy(): void {
    this.ambience?.stop();
    this.voEl?.pause();
    void this.ctx?.close();
    this.ctx = null;
  }
}
