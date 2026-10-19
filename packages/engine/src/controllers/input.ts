/** Keyboard, on-screen joystick, hold buttons and pointer gestures (drag to look, pinch to zoom, tap). */
export interface Look {
  yaw: number;
  pitch: number;
  dist: number;
}

export class Input {
  keys: Record<string, boolean> = {};
  joy = { x: 0, y: 0, id: null as number | null };
  hold = { up: false, down: false, boost: false };
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { moved: number; multi: boolean; t: number } | null = null;
  private pinch = 0;
  onTap: (x: number, y: number) => void = () => {};
  onDrag: (dx: number, dy: number) => void = () => {};
  onZoom: (factor: number) => void = () => {};
  onKey: (code: string, repeat: boolean) => void = () => {};
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private root: HTMLElement) {
    const c = canvas;
    const down = (e: PointerEvent) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.gesture = { moved: 0, multi: false, t: performance.now() };
      else {
        if (this.gesture) this.gesture.multi = true;
        const p = [...this.pointers.values()];
        this.pinch = Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (this.gesture) this.gesture.moved += Math.abs(dx) + Math.abs(dy);
        this.onDrag(dx, dy);
      } else if (this.pointers.size === 2) {
        const q = [...this.pointers.values()], d = Math.hypot(q[0]!.x - q[1]!.x, q[0]!.y - q[1]!.y);
        if (this.pinch > 0) this.onZoom(this.pinch / d);
        this.pinch = d;
      }
    };
    const end = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      const g = this.gesture;
      if (e.type === 'pointerup' && g && !g.multi && g.moved < 9 && performance.now() - g.t < 500 && this.pointers.size === 1) {
        const r = c.getBoundingClientRect();
        this.onTap(e.clientX - r.left, e.clientY - r.top);
      }
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.gesture = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.onZoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    const ctx = (e: Event) => e.preventDefault();
    const kd = (e: KeyboardEvent) => {
      if (this.typing()) return;
      if (!root.isConnected) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && root.contains(document.activeElement ?? null) === false && document.activeElement !== document.body) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      this.onKey(e.code, e.repeat);
    };
    const ku = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };
    const blur = () => {
      this.keys = {};
      this.hold.up = this.hold.down = this.hold.boost = false;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', ctx);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    addEventListener('blur', blur);
    this.cleanup.push(() => {
      removeEventListener('keydown', kd);
      removeEventListener('keyup', ku);
      removeEventListener('blur', blur);
    });
  }

  typing(): boolean {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  /** Attach the on-screen stick. */
  bindJoystick(el: HTMLElement, knob: HTMLElement): void {
    const mv = (e: PointerEvent) => {
      const r = el.getBoundingClientRect(), max = r.width / 2 - 12;
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > max) {
        dx *= max / m;
        dy *= max / m;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.joy.x = dx / max;
      this.joy.y = -dy / max;
      el.classList.toggle('run', Math.hypot(this.joy.x, this.joy.y) > 0.9);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null;
      this.joy.x = this.joy.y = 0;
      knob.style.transform = '';
      el.classList.remove('run');
    };
    el.addEventListener('pointerdown', (e) => {
      this.joy.id = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      mv(e);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) mv(e);
    });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  bindHold(el: HTMLElement, key: 'up' | 'down' | 'boost', onPress?: () => void): void {
    const on = (e: Event) => {
      this.hold[key] = true;
      el.classList.add('on');
      onPress?.();
      e.preventDefault();
    };
    const off = () => {
      this.hold[key] = false;
      el.classList.remove('on');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  /** Movement intent: x = strafe, z = forward, both in [-1,1]; run when shift or stick pushed far. */
  axes(): { x: number; z: number; y: number; run: boolean } {
    let x = 0, z = 0, y = 0;
    const k = this.keys;
    if (!this.typing()) {
      if (k.KeyW || k.ArrowUp) z += 1;
      if (k.KeyS || k.ArrowDown) z -= 1;
      if (k.KeyA || k.ArrowLeft) x -= 1;
      if (k.KeyD || k.ArrowRight) x += 1;
    }
    x += this.joy.x;
    z += this.joy.y;
    const run = !!(k.ShiftLeft || k.ShiftRight || this.hold.boost || (this.joy.id !== null && Math.hypot(this.joy.x, this.joy.y) > 0.9));
    return { x, z, y, run };
  }

  destroy(): void {
    for (const f of this.cleanup) f();
  }
}
