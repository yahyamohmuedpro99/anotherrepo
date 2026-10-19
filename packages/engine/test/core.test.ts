import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Manifest } from '@rihla/pack-schema';
import { createTranslator } from '@rihla/i18n';
import { GameState, pickSave } from '../src/core/state.js';
import { evalCond, resolveText, type CondEnv } from '../src/core/conditions.js';
import { applyMotion, type MotionEnv, type MotionHost } from '../src/scene/motion.js';
import { dirIndex } from '../src/gameplay/quests.js';

const manifest = {
  counters: [
    { id: 'scarabs', scope: 'save', of: 4 },
    { id: 'finds', scope: 'visit', of: 3 },
  ],
  flags: [{ id: 'done' }, { id: 'seen-area', scope: 'visit' }],
  stamps: [{ id: 'giza', title: 'stamp.giza', color: '#e9b44c' }],
} as unknown as Manifest;

const envFor = (state: GameState, over: Partial<CondEnv> = {}): CondEnv => ({
  state,
  vehicle: () => null,
  altitude: () => 0,
  night: () => false,
  sceneId: () => 'plateau',
  autopilot: () => false,
  ...over,
});

describe('GameState', () => {
  it('counts set members once and resets visit-scoped counters and flags on scene entry', () => {
    const s = new GameState(manifest);
    expect(s.add('scarabs', 'khufu')).toBe(true);
    expect(s.add('scarabs', 'khufu')).toBe(false);
    s.add('finds', '0');
    s.setFlag('seen-area');
    s.setFlag('done');
    s.resetVisit();
    expect(s.count('scarabs')).toBe(1);
    expect(s.count('finds')).toBe(0);
    expect(s.flags.has('seen-area')).toBe(false);
    expect(s.flags.has('done')).toBe(true);
  });

  it('round-trips through a save and keeps the save with more progress', () => {
    const a = new GameState(manifest);
    a.add('scarabs', 'khufu');
    a.giveStamp('giza');
    const b = new GameState(manifest);
    b.load(a.toSave());
    expect(b.count('scarabs')).toBe(1);
    expect(b.stamps.has('giza')).toBe(true);
    const empty = new GameState(manifest).toSave();
    expect(pickSave(manifest, empty, a.toSave())).toEqual(a.toSave());
  });
});

describe('conditions', () => {
  it('evaluates counters, stamps, flags and combinators', () => {
    const s = new GameState(manifest);
    s.add('scarabs', 'khufu');
    s.add('scarabs', 'boat');
    const env = envFor(s);
    expect(evalCond({ counter: 'scarabs', gte: 2 }, env)).toBe(true);
    expect(evalCond({ counter: 'scarabs', lt: 2 }, env)).toBe(false);
    expect(evalCond({ counter: 'scarabs', has: 'boat' }, env)).toBe(true);
    expect(evalCond({ all: [{ counter: 'scarabs', gte: 1 }, { not: { flag: 'done' } }] }, env)).toBe(true);
    expect(evalCond({ any: [{ stamp: 'giza' }, { scene: 'space' }] }, env)).toBe(false);
    expect(evalCond({ autopilot: true }, envFor(s, { autopilot: () => true }))).toBe(true);
    expect(evalCond(undefined, env)).toBe(true);
  });
});

describe('text', () => {
  it('fills ICU params from counters and other keys, with Arabic-Indic digits in Arabic', () => {
    const s = new GameState(manifest);
    s.add('scarabs', 'khufu');
    const tr = createTranslator('ar-EG', [{ 'scarab.who': 'جعران {n} من {m}: {where}', 'scarab.khufu.where': 'هرم خوفو' }]);
    const text = resolveText({ key: 'scarab.who', params: { n: { counter: 'scarabs' }, m: { counterOf: 'scarabs' }, where: { text: 'scarab.khufu.where' } } }, {
      t: (k, p) => tr.t(k, p),
      state: s,
      counterOf: () => 4,
      guide: () => '',
      next: () => '',
    });
    expect(text).toBe('جعران ١ من ٤: هرم خوفو');
  });
});

describe('motion', () => {
  const host = (): MotionHost => ({ pos: new THREE.Vector3(), object: new THREE.Object3D(), yaw: 0, speed: 0, home: new THREE.Vector3(), state: {} });
  const env = (T: number): MotionEnv => ({ T, dt: 0.016, positionOf: () => new THREE.Vector3(10, 0, 0), height: () => 0, collide: (x, z) => [x, z], paused: () => false, terrain: false });

  it('orbits a moving centre at the declared radius and period', () => {
    const h = host();
    applyMotion({ type: 'orbit', center: 'earth', radius: 34, period: 40 }, h, env(0));
    expect(h.pos.distanceTo(new THREE.Vector3(10, 0, 0))).toBeCloseTo(34, 5);
    applyMotion({ type: 'orbit', center: 'earth', radius: 34, period: 40 }, h, env(10));
    // a quarter period later the body has turned 90°
    expect(h.pos.x).toBeCloseTo(10, 5);
    expect(h.pos.z).toBeCloseTo(34, 5);
  });

  it('keeps the comet on its ellipse with the Sun near one focus', () => {
    const h = host();
    applyMotion({ type: 'ellipse', a: 380, b: 205, e: 0.84, rot: 0, period: 260, amp: 0 }, h, env(0));
    expect(h.pos.x).toBeCloseTo(380 * (1 - 0.84), 3);
  });
});

describe('quest directions', () => {
  it('maps bearings to the eight compass words (x east, z south)', () => {
    expect(dirIndex(0, -10)).toBe(0); // north
    expect(dirIndex(10, 0)).toBe(2); // east
    expect(dirIndex(0, 10)).toBe(4); // south
    expect(dirIndex(-10, 0)).toBe(6); // west
  });
});
