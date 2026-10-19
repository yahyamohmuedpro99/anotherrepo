import * as THREE from 'three';
import type { Motion } from '@rihla/pack-schema';
import { TAU, angLerp, clamp } from '../math/noise.js';

export interface MotionHost {
  pos: THREE.Vector3;
  object: THREE.Object3D;
  /** Orientation the motion wants (yaw for walkers). */
  yaw: number;
  speed: number;
  home: THREE.Vector3;
  state: Record<string, number>;
}

export interface MotionEnv {
  T: number;
  dt: number;
  positionOf: (id: string) => THREE.Vector3 | null;
  height: (x: number, z: number) => number;
  collide: (x: number, z: number, rad: number) => [number, number];
  paused: (host: MotionHost) => boolean;
  terrain: boolean;
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), UP = new THREE.Vector3(0, -1, 0);

/** Applies one declarative motion. Returns true when the host moved this frame. */
export function applyMotion(m: Motion, h: MotionHost, env: MotionEnv): boolean {
  const { T, dt } = env;
  switch (m.type) {
    case 'orbit': {
      const c = typeof m.center === 'string' ? env.positionOf(m.center) : m.center ? tmp.set(...m.center) : tmp.set(0, 0, 0);
      if (!c) return false;
      const a = (m.phase ?? 0) + ((m.direction ?? 1) * T * TAU) / (m.period ?? 60);
      const r = m.radius ?? 10;
      h.pos.set(c.x + Math.cos(a) * r, c.y + Math.sin(a) * (m.amp ?? 0), c.z + Math.sin(a) * r);
      if (m.lookAt === 'motion') h.object.rotation.y = -a + Math.PI;
      return true;
    }
    case 'anchor': {
      // Sits `radial` units further out than the anchor entity (away from the origin), `up` above.
      const c = m.entity ? env.positionOf(m.entity) : null;
      if (!c) return false;
      tmp2.copy(c).normalize();
      h.pos.copy(c).addScaledVector(tmp2, m.radial ?? 0);
      h.pos.y += m.up ?? 0;
      return true;
    }
    case 'ellipse': {
      // Comet: x = a(cos E − e), z = b sin E, rotated by `rot`, small vertical wobble.
      const E = (T * TAU) / (m.period ?? 260) + (m.phase ?? 0);
      const ex = (m.a ?? 380) * (Math.cos(E) - (m.e ?? 0.84)), ez = (m.b ?? 205) * Math.sin(E), ca = Math.cos(m.rot ?? 0), sa = Math.sin(m.rot ?? 0);
      h.pos.set(ex * ca - ez * sa, (m.amp ?? 12) * Math.sin(E * 2), ex * sa + ez * ca);
      return true;
    }
    case 'spin': {
      const ax = m.axis ?? 'y';
      h.object.rotation[ax] += dt * (m.speed ?? 0.1);
      return false;
    }
    case 'bob': {
      h.pos.y = h.home.y + Math.sin(T * (m.speed ?? 1.2) + (m.phase ?? 0)) * (m.amp ?? 0.3);
      return true;
    }
    case 'circle': {
      // Birds: circle a centre at a height, banking into the turn, gently rising and falling.
      const c = (m.center as [number, number, number]) ?? [h.home.x, 0, h.home.z];
      const r = m.radius ?? 100, sp = m.speed ?? 8, dir = m.direction ?? 1, ph = m.phase ?? 0;
      const a = ph + ((T * sp) / r) * dir;
      h.pos.set(c[0] + Math.cos(a) * r, (m.height ?? 100) + Math.sin(T * 0.3 + ph) * 6, c[2] + Math.sin(a) * r);
      h.object.rotation.set(0, -a + (dir > 0 ? 0 : Math.PI), 0.25 * dir);
      return true;
    }
    case 'line': {
      const from = m.from ?? [0, 0, 0], to = m.to ?? [0, 0, 100];
      if (m.period) {
        // ping-pong (a felucca drifting along the Nile)
        const k = 0.5 + 0.5 * Math.sin((T * TAU) / m.period + (m.phase ?? 0));
        h.pos.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k);
      } else {
        // looping traffic (buses on Pyramids Road)
        const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        const s = (h.state.s ?? (m.phase ?? 0) * len) + dt * (m.speed ?? 10);
        h.state.s = s % len;
        const k = h.state.s / len;
        h.pos.set(from[0] + (to[0] - from[0]) * k, 0, from[2] + (to[2] - from[2]) * k);
        h.object.rotation.y = Math.atan2(to[0] - from[0], to[2] - from[2]);
      }
      if (env.terrain) h.pos.y = env.height(h.pos.x, h.pos.z) + (m.up ?? 0) + (m.amp ? Math.sin(T * 1.4) * m.amp : 0);
      return true;
    }
    case 'path': {
      if (env.paused(h)) {
        h.speed = 0;
        return false;
      }
      const pts = m.points ?? [];
      if (pts.length < 2) return false;
      const seg = h.state.seg ?? 0;
      const p = pts[(seg + 1) % pts.length]!;
      const dx = p[0] - h.pos.x, dz = p[1] - h.pos.z, d = Math.hypot(dx, dz), sp = m.speed ?? 1.3;
      if (d < 0.8) h.state.seg = (seg + 1) % pts.length;
      else {
        h.pos.x += (dx / d) * sp * dt;
        h.pos.z += (dz / d) * sp * dt;
        h.yaw = angLerp(h.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
      }
      h.speed = sp;
      h.pos.y = env.height(h.pos.x, h.pos.z);
      return true;
    }
    case 'wander': {
      if (env.paused(h)) {
        h.speed = 0;
        return false;
      }
      const st = h.state;
      if ((st.wait ?? 0) > 0) {
        st.wait = (st.wait ?? 0) - dt;
        h.speed = 0;
        return false;
      }
      if (st.tx === undefined) {
        st.tx = h.pos.x;
        st.tz = h.pos.z;
      }
      const dx = st.tx - h.pos.x, dz = st.tz! - h.pos.z, d = Math.hypot(dx, dz), sp = m.speed ?? 1.1;
      if (d < 0.5) {
        st.wait = 2 + Math.random() * 6;
        const a = Math.random() * TAU, r = Math.random() * (m.radius ?? 14);
        [st.tx, st.tz] = env.collide(h.home.x + Math.cos(a) * r, h.home.z + Math.sin(a) * r, 0.6);
        h.speed = 0;
      } else {
        h.pos.x += (dx / d) * sp * dt;
        h.pos.z += (dz / d) * sp * dt;
        h.yaw = angLerp(h.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        h.speed = sp;
      }
      h.pos.y = env.height(h.pos.x, h.pos.z);
      return true;
    }
  }
  return false;
}

/** Points an object's -y axis (comet tail) away from a point, scaling with distance. */
export function tailAway(tail: THREE.Object3D, pos: THREE.Vector3, from: THREE.Vector3): void {
  const dir = tmp.copy(pos).sub(from).normalize();
  tail.quaternion.setFromUnitVectors(UP, dir);
  tail.scale.setScalar(clamp(260 / pos.distanceTo(from), 0.35, 2.2));
}
