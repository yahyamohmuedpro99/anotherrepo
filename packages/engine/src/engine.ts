import * as THREE from 'three';
import type { Action, Cond, Manifest, TextRef } from '@rihla/pack-schema';
import { bundleFetcher, loadPack, stringsFor, type PackBundle, type PackData } from '@rihla/pack-schema/runtime';
import { createTranslator, dirOf, langOf, type Params, type Translator } from '@rihla/i18n';
import type { EngineApi } from './core/api.js';
import { AudioSystem } from './core/audio.js';
import { evalCond, resolveText, type CondEnv, type TextEnv } from './core/conditions.js';
import { FpsProbe, guessTier, lowerTier, settingsFor, type Tier, type TierSettings } from './core/quality.js';
import { GameState, pickSave, type SaveData } from './core/state.js';
import { passport, storage } from './core/storage.js';
import { Telemetry, deviceId, uuid, type LearningEvent } from './core/telemetry.js';
import { Input } from './controllers/input.js';
import { Player } from './controllers/player.js';
import { AreaSystem } from './gameplay/areas.js';
import { drawCartouche } from './gameplay/glyphs.js';
import { PhotoSystem } from './gameplay/photo.js';
import { QuestSystem } from './gameplay/quests.js';
import { TriggerSystem } from './gameplay/triggers.js';
import { ENGINE_STRINGS } from './locales/strings.js';
import { SceneRuntime, type EntityRT } from './scene/scene.js';
import { cardLines, renderItem, type DLine } from './ui/dialog.js';
import { h } from './ui/dom.js';
import { Hud, type ButtonDef } from './ui/hud.js';
import { buildIntro, buildLoading, buildSplash } from './ui/intro.js';
import { makeTag, type Tag } from './ui/labels.js';
import { MapRenderer, type MapMark } from './ui/map.js';
import { activityCount, logCount, openActivities, openAlbum, openCredits, openLog, openPassport, openSettings } from './ui/panels.js';
import { themeVars } from './ui/styles.js';
import { refreshTextTextures, setMaxAnisotropy } from './world/textures.js';
import { renderTwoD } from './fallback/twod.js';
import type { TeacherCommand } from './gameplay/teacher.js';

export interface MountOptions {
  /** Pack folder URL (ending in /) or a built bundle URL (bundle.<hash>.json). */
  packUrl: string;
  startPoi?: string;
  locale?: string;
  user?: { displayName: string; studentId?: string; classId?: string };
  roomToken?: string;
  roomUrl?: string;
  assignment?: { id: string; hints?: boolean; preQuiz?: boolean; postQuiz?: boolean };
  quality?: 'auto' | Tier;
  mode?: 'guest' | 'student' | 'preview';
  /** Force the cards-and-questions mode (very weak devices). */
  twoD?: boolean;
  onEvent?: (e: LearningEvent) => void;
  telemetryUrl?: string;
  telemetryHeaders?: () => Record<string, string>;
  /** Cloud save (signed-in students). */
  loadSave?: () => Promise<SaveData | null>;
  onSave?: (s: SaveData) => void;
  onReady?: () => void;
  onExit?: () => void;
  perf?: boolean;
  /** Studio preview: called with the world point under a click (click-to-place). */
  onPick?: (p: { x: number; y: number; z: number; entity?: string }) => void;
  skipIntro?: boolean;
}

type Phase = 'loading' | 'intro' | 'play' | 'ended';

const tmpV = new THREE.Vector3();

export class Engine implements EngineApi {
  pack!: PackData;
  manifest!: Manifest;
  state!: GameState;
  readonly audio = new AudioSystem();
  telemetry!: Telemetry;
  root: HTMLElement;
  camera = new THREE.PerspectiveCamera(55, 1, 0.35, 14000);
  renderer: THREE.WebGLRenderer | null = null;
  quality: TierSettings = settingsFor('mid');
  tr!: Translator;
  altTr!: Translator;
  readonly isTouch = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  scene: SceneRuntime | null = null;
  sceneId = '';
  hints = true;
  paused = false;
  movementLocked = false;

  private hud!: Hud;
  private input!: Input;
  player!: Player;
  private quests!: QuestSystem;
  private triggers!: TriggerSystem;
  private areas!: AreaSystem;
  private photo!: PhotoSystem;
  private map!: MapRenderer;
  private scenes = new Map<string, SceneRuntime>();
  private phase: Phase = 'loading';
  private timers: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private raf = 0;
  private last = 0;
  private acc = { slow: 0, act: 0, save: 0, perf: 0, frame: 0 };
  private realDt = 0;
  private introT = 0;
  private blend: { from: THREE.Vector3; look: THREE.Vector3; t: number } | null = null;
  private entityTags = new Map<string, { tag: Tag; ent: EntityRT }>();
  private myTag: Tag | null = null;
  private probe: FpsProbe | null = null;
  private qualityPref: 'auto' | Tier = 'auto';
  private textScale = 1;
  private locale = 'ar-EG';
  private warned = new Map<string, number>();
  private transitioning = false;
  private destroyed = false;
  private bigMapClose: (() => void) | null = null;
  private teacherText: string | null = null;
  private rooms: { send: (type: string, data: unknown) => void; leave: () => void } | null = null;
  private others = new Map<string, { tag: Tag; obj: THREE.Object3D; pos: THREE.Vector3; target: THREE.Vector3; color: string; name: string }>();
  private resizeObs: ResizeObserver | null = null;
  private sessionId = uuid();
  private startedAt = Date.now();

  constructor(
    private host: HTMLElement,
    readonly opts: MountOptions,
  ) {
    this.root = host;
    this.hints = opts.assignment?.hints !== false;
  }

  /* ================================================================ EngineApi helpers */

  t(key: string, params?: Params): string {
    return this.tr.t(key, params);
  }
  private textEnv(): TextEnv {
    return {
      t: (k, p) => this.t(k, p),
      state: this.state,
      counterOf: (id) => this.manifest.counters.find((c) => c.id === id)?.of ?? 0,
      guide: (q) => this.quests.hintLine(q),
      next: (q) => this.quests.nextLabel(q),
    };
  }
  text(ref: TextRef | undefined): string {
    return resolveText(ref, this.textEnv());
  }
  private condEnv: CondEnv = {
    state: null as unknown as GameState,
    vehicle: () => this.vehicle(),
    altitude: () => this.altitude(),
    night: () => !!this.scene?.env.isNight(),
    sceneId: () => this.sceneId,
    autopilot: () => this.autopilot(),
  };
  check = (c: Cond | undefined): boolean => evalCond(c, this.condEnv);
  playerPos(): THREE.Vector3 {
    return this.player?.pos ?? tmpV.set(0, 0, 0);
  }
  vehicle(): string | null {
    return this.player?.vehPreset ?? null;
  }
  altitude(): number {
    return this.player?.altitude ?? 0;
  }
  autopilot(): boolean {
    return !!this.player?.shipAuto;
  }
  objectivesOf(kind: 'item' | 'card' | 'poi', id: string): string[] {
    if (kind === 'item') return this.pack.items[id]?.objectives ?? [];
    if (kind === 'card') return this.pack.cards[id]?.objectives ?? [];
    return this.pack.pois[id]?.objectives ?? [];
  }
  emit(verb: LearningEvent['verb'], object: LearningEvent['object'], result?: LearningEvent['result'], context?: Partial<LearningEvent['context']>): void {
    this.telemetry?.emit(verb, object, result, { sceneId: this.sceneId, ...(context ?? {}) });
  }
  after(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.clock + seconds, fn });
  }
  save(): void {
    if (!this.state) return;
    const s = this.state.toSave();
    s.locale = this.locale;
    storage.set(`rihla.save.${this.manifest.id}`, JSON.stringify(s));
    this.opts.onSave?.(s);
  }

  /* ================================================================ start-up */

  async start(): Promise<void> {
    const loading = buildLoading('…');
    this.host.append(loading.el);
    try {
      this.pack = await this.loadPack((p) => loading.set(p, '…'));
    } catch (err) {
      loading.set(0, ENGINE_STRINGS['ar-EG']['engine.errLoad']! + ' · ' + ENGINE_STRINGS.en['engine.errLoad']!);
      console.error('[rihla] pack load failed', err);
      throw err;
    }
    this.manifest = this.pack.manifest;
    const m = this.manifest;
    this.state = new GameState(m);
    this.condEnv.state = this.state;
    const local = storage.json<SaveData | null>(`rihla.save.${m.id}`, null);
    let cloud: SaveData | null = null;
    try {
      cloud = (await this.opts.loadSave?.()) ?? null;
    } catch {
      cloud = null;
    }
    this.state.load(pickSave(m, local, cloud));
    if (this.opts.user?.displayName) this.state.name = this.opts.user.displayName;
    this.locale = this.opts.locale ?? this.state.locale ?? m.defaultLocale;
    if (!m.locales.includes(this.locale) && !this.pack.overlays[this.locale]) this.locale = m.defaultLocale;
    this.buildTranslators();
    this.textScale = Number(storage.get('rihla.textScale') ?? '1') || 1;
    this.reducedMotion = storage.get('rihla.reducedMotion') === '1' || this.reducedMotion;
    this.qualityPref = this.opts.quality ?? ((storage.get('rihla.quality') as 'auto' | Tier | null) ?? 'auto');

    this.telemetry = new Telemetry({ ...(this.opts.telemetryUrl ? { url: this.opts.telemetryUrl } : {}), ...(this.opts.telemetryHeaders ? { headers: this.opts.telemetryHeaders } : {}), ...(this.opts.onEvent ? { sink: this.opts.onEvent } : {}) });
    this.telemetry.setContext({
      actor: { deviceId: deviceId(), ...(this.opts.user?.studentId ? { studentId: this.opts.user.studentId } : {}), ...(this.opts.user?.classId ? { classId: this.opts.user.classId } : {}) },
      context: { packId: m.id, packVersion: m.version, locale: this.locale, sessionId: this.sessionId, mode: this.opts.mode ?? (this.opts.user?.studentId ? 'student' : 'guest'), ...(this.opts.assignment ? { assignmentId: this.opts.assignment.id } : {}), phase: 'play' },
    });
    this.telemetry.start();

    this.hud = new Hud(this.host, themeVars(m.theme.preset, m.theme.band), { next: () => this.t('engine.next'), close: () => this.t('engine.close') });
    loading.el.remove();
    this.hud.root.style.setProperty('--rs', String(this.textScale));
    this.hud.root.classList.toggle('calm', this.reducedMotion);
    this.applyLocaleToHud();

    const wantTwoD = this.opts.twoD || !this.makeRenderer();
    if (wantTwoD) {
      this.phase = 'play';
      renderTwoD(this, this.hud, () => this.opts.onExit?.());
      this.emit('launched', { type: 'pack', id: m.id }, undefined, { phase: 'play' });
      this.opts.onReady?.();
      return;
    }
    this.input = new Input(this.hud.canvas, this.hud.root);
    this.player = new Player(this.camera, this.input, {
      toast: (t, k) => this.hud.toast(t, { ...(k ? { kind: k } : {}) }),
      t: (k, p) => this.t(k, p),
      warn: (k) => this.warnOnce(k, k),
      jumped: (hh, earth, key) => this.hud.toast(this.t(key, { h: Math.round(hh * 10) / 10, e: Math.round(earth * 10) / 10 }), { ms: 4200 }),
      tooDeep: (k) => this.warnOnce(k, k, 'warn'),
      maxAltitude: () => this.hud.toast(this.t('engine.maxAlt')),
      autopilotArrived: () => this.refreshSlow(),
      locked: () => this.movementLocked || this.paused || this.transitioning,
    });
    this.quests = new QuestSystem(this);
    this.areas = new AreaSystem(this);
    this.areas.onBanner = (a, b, la, lb) => this.hud.banner(a, b, la, lb);
    this.photo = new PhotoSystem(this, this.player);
    this.photo.onFrame = (on) => {
      this.hud.frame.hidden = !on;
      this.hud.labels.hideAll = on;
    };
    this.photo.onFlash = () => this.hud.flashOnce();
    this.triggers = new TriggerSystem(this, this.player, {
      mount: (e) => this.mount(e),
      dismount: () => this.dismount(),
      land: () => {
        this.player.descend = true;
        this.player.stopAuto();
        this.hud.toast(this.t('engine.descending'));
      },
      photo: () => this.photo.take(),
      walkingTo: (n) => this.hud.toast(this.t('engine.walkingTo', { name: n })),
      interacting: (e) => this.faceNpc(e),
    });
    this.map = new MapRenderer(() => this.scene);
    this.wireInput();
    this.wireHud();
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.hud.root);
    document.fonts?.ready.then(() => {
      refreshTextTextures();
      this.scene?.redrawText();
    });
    document.addEventListener('visibilitychange', this.onVisibility);

    // First scene renders behind the intro card.
    const startPoi = this.opts.startPoi ? this.pack.pois[this.opts.startPoi] : undefined;
    const sceneId = startPoi?.scene ?? m.startScene;
    this.enterScene(sceneId, undefined, true);
    this.phase = 'intro';
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.emit('launched', { type: 'pack', id: m.id });
    if (this.opts.roomToken) void this.connectRooms();

    const begin = (fromPoi?: string) => void this.beginPlay(fromPoi);
    if (startPoi || this.opts.skipIntro) {
      const poiTitle = startPoi ? this.t(startPoi.title) : null;
      this.hud.root.append(buildSplash(this, poiTitle, () => begin(startPoi?.id), 3));
    } else this.showIntro(begin);
    this.opts.onReady?.();
  }

  private async loadPack(progress: (p: number) => void): Promise<PackData> {
    const url = this.opts.packUrl;
    if (/\.json(\?|$)/.test(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const bundle = (await res.json()) as PackBundle;
      progress(1);
      const base = url.replace(/[^/]*$/, '');
      return loadPack(bundleFetcher(bundle), base);
    }
    const base = url.endsWith('/') ? url : url + '/';
    let n = 0;
    return loadPack(async (p) => {
      const res = await fetch(base + p);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${p}`);
      progress(Math.min(0.95, ++n / 60));
      return res.json();
    }, base);
  }

  private buildTranslators(): void {
    const engineLoc = (l: string) => (langOf(l) === 'ar' ? 'ar-EG' : 'en') as 'ar-EG' | 'en';
    const mk = (l: string) =>
      createTranslator(l, [stringsFor(this.pack, l), ENGINE_STRINGS[engineLoc(l)]], {
        fallbackTables: [stringsFor(this.pack, this.manifest.defaultLocale), ENGINE_STRINGS['ar-EG']],
        ...(this.pack.overlays[l]?.overlay.numerals ? { numerals: this.pack.overlays[l]!.overlay.numerals! } : {}),
        onMissing: (k) => console.warn(`[rihla] missing string "${k}" (${l})`),
      });
    this.tr = mk(this.locale);
    const other = this.manifest.locales.find((l) => langOf(l) !== langOf(this.locale)) ?? this.manifest.locales[1] ?? this.locale;
    this.altTr = mk(other);
  }

  private applyLocaleToHud(): void {
    this.hud.setLocale(langOf(this.locale), dirOf(this.locale));
  }

  private makeRenderer(): boolean {
    let r: THREE.WebGLRenderer;
    try {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const tier = this.qualityPref !== 'auto' ? this.qualityPref : guessTier(nav);
      this.quality = settingsFor(tier, devicePixelRatio || 1, this.isTouch);
      r = new THREE.WebGLRenderer({ canvas: this.hud.canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!r.getContext()) throw new Error('no context');
    } catch {
      this.hud.toast(this.t('engine.errGL'), { ms: 8000 });
      return false;
    }
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(this.quality.pixelRatio);
    setMaxAnisotropy(r.capabilities.getMaxAnisotropy());
    this.renderer = r;
    if (this.qualityPref === 'auto' && this.quality.tier !== 'low')
      this.probe = new FpsProbe(this.quality.maxFps, () => {
        const t = lowerTier(this.quality.tier);
        this.applyTier(t);
        this.hud.toast(this.t('engine.liteNote'), { ms: 3000 });
      });
    return true;
  }

  private applyTier(tier: Tier): void {
    this.quality = settingsFor(tier, devicePixelRatio || 1, this.isTouch);
    if (!this.renderer) return;
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.resize();
    // Models keep their build-time detail until the next scene build.
    for (const [id, s] of this.scenes) if (s !== this.scene) {
      s.dispose();
      this.scenes.delete(id);
    }
  }

  private resize = (): void => {
    if (!this.renderer || !this.hud) return;
    const w = this.hud.root.clientWidth || innerWidth, hh = this.hud.root.clientHeight || innerHeight;
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / Math.max(1, hh);
    this.camera.updateProjectionMatrix();
    this.layoutMini();
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.save();
      void this.telemetry.flush();
    } else if (!this.destroyed) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  /* ================================================================ intro & play */

  private introEl: HTMLElement | null = null;
  private showIntro(begin: () => void): void {
    this.introEl?.remove();
    this.introEl = buildIntro(
      this,
      (r) => {
        this.audio.unlock();
        this.state.name = r.name;
        this.state.color = r.color;
        this.save();
        this.introEl?.remove();
        this.introEl = null;
        begin();
      },
      () => {
        this.switchLocale();
        this.showIntro(begin);
      },
      this.state.progress() > 0,
    );
    this.hud.root.append(this.introEl);
  }

  private async beginPlay(fromPoi?: string): Promise<void> {
    this.audio.unlock();
    if (this.opts.assignment?.preQuiz && this.manifest.prePost?.pre.length && !this.state.seen.has('quiz:pre')) await this.runQuiz('pre');
    const poi = fromPoi ? this.pack.pois[fromPoi] : undefined;
    this.blend = { from: this.camera.position.clone(), look: new THREE.Vector3().copy(this.introLook), t: poi ? 1 : 0 };
    this.placePlayer(poi?.spawn?.spawn, poi);
    this.phase = 'play';
    this.hud.showHud(true);
    this.joyVisible();
    this.refreshSlow();
    this.setHint(true);
    if (poi) this.areas.markVisited(poi.id);
    const resumed = this.state.progress() > 0;
    this.run(resumed ? (this.manifest.intro.onResume ?? this.manifest.intro.onStart) : this.manifest.intro.onStart);
  }

  private placePlayer(spawnId: string | undefined, poi?: PackData['pois'][string]): void {
    const sc = this.scene!;
    let { pos, yaw, spawn } = sc.spawnPoint(spawnId);
    if (poi && !spawnId) {
      const at = poi.spawn?.at ?? poi.at;
      pos = at.length === 2 ? new THREE.Vector3(at[0], sc.height(at[0], at[1]), at[1]) : new THREE.Vector3(at[0], at[1], at[2]);
      yaw = poi.spawn?.yaw ?? yaw;
    }
    const robe = this.manifest.intro.palette?.colors[this.state.color];
    const skins = ['#8a5636', '#a66d45', '#6c4129', '#bf8760', '#94603e'];
    let h = 2166136261;
    for (let i = 0; i < this.state.name.length; i++) h = Math.imul(h ^ this.state.name.charCodeAt(i), 16777619);
    const yawToCenter = yaw ?? (sc.isTerrain ? Math.atan2(pos.x - (sc.def.intro?.center[0] ?? 0), pos.z - (sc.def.intro?.center[2] ?? 0)) : 0);
    this.player.attach(sc, pos, yawToCenter, robe, skins[(h >>> 0) % skins.length], spawn?.camera);
    this.myTagSetup();
    if (spawn?.name && this.tr.has('arrival')) this.after(1.2, () => this.hud.toast(this.t('arrival', { place: this.t(spawn!.name!) }), { ms: 5500 }));
  }

  private myTagSetup(): void {
    if (this.myTag) this.hud.labels.remove(this.myLabel);
    this.myTag = null;
    if (!this.player.avatar || this.player.mode === 'spacecraft') return;
    const robe = this.manifest.intro.palette?.colors[this.state.color] ?? '#e9b44c';
    this.myTag = makeTag(this.state.name || this.t(this.manifest.intro.defaultName), { dot: robe, me: true });
    const title = [...this.state.titles][0];
    if (title) {
      this.myTag.chip.textContent = this.t(this.manifest.titles?.find((t) => t.id === title)?.text ?? title);
      this.myTag.chip.hidden = false;
    }
    this.myLabel = this.hud.labels.add(this.myTag.el, (v) => v.copy(this.player.avatar!.object.position).add(tmpV.set(0, 2.4, 0)), { max: 500 });
  }
  private myLabel: ReturnType<Hud['labels']['add']> | null = null;

  /* ================================================================ scenes */

  private getScene(id: string): SceneRuntime {
    let s = this.scenes.get(id);
    if (s) return s;
    const def = this.pack.scenes[id];
    if (!def) throw new Error(`Unknown scene ${id}`);
    s = new SceneRuntime(def, { quality: this.quality, models: this.pack.models, t: (k) => this.t(k), rtl: this.tr.dir === 'rtl', check: this.check }, this.manifest.zones ?? []);
    this.scenes.set(id, s);
    // keep memory bounded on phones: at most 4 built scenes
    if (this.scenes.size > 4)
      for (const [k, v] of this.scenes) {
        if (k === id || v === this.scene || k === this.manifest.startScene) continue;
        v.dispose();
        this.scenes.delete(k);
        break;
      }
    return s;
  }

  private introLook = new THREE.Vector3();

  private enterScene(id: string, spawn: string | undefined, initial = false): void {
    const prev = this.scene;
    const sc = this.getScene(id);
    if (prev && prev !== sc) for (const e of prev.entities) e.rider = false;
    this.scene = sc;
    this.sceneId = id;
    this.state.resetVisit();
    this.triggers.reset();
    this.areas.reset();
    this.hud.dialog.reset();
    this.hud.setContext(null);
    this.telemetry.patchContext({ sceneId: id });
    this.buildEntityLabels();
    this.audio.setAmbience(sc.def.kind === 'terrain' ? 'wind' : sc.def.kind === 'galaxy' || sc.def.kind === 'space' ? 'space' : 'wind');
    this.layoutMini();
    if (!initial) {
      this.placePlayer(spawn);
      const d = sc.def.enter?.descent;
      const lander = d ? sc.byId.get(d.entity) : undefined;
      if (d && lander) {
        this.player.descent = { t: 0, ent: lander, height: d.height, seconds: this.reducedMotion ? 0.3 : d.seconds, land: lander.pos.clone() };
        if (this.player.avatar) this.player.avatar.object.visible = false;
      }
      this.emit('entered-zone', { type: 'scene', id });
      const onceKey = `enter:${id}`;
      if (!this.state.fired.has(onceKey)) {
        this.state.fired.add(onceKey);
        this.run(sc.def.enter?.once);
      }
      this.run(sc.def.enter?.every);
      this.joyVisible();
      this.refreshSlow();
      this.setHint(true);
    } else {
      const i = sc.def.intro;
      if (i) this.introLook.set(...i.center);
      // the player exists invisibly so conditions and the map have a position
      const { pos } = sc.spawnPoint(undefined);
      this.player.attach(sc, pos, 0, undefined, undefined);
      if (this.player.avatar) this.player.avatar.object.visible = false;
    }
  }

  goScene(id: string, spawn?: string, transition: 'fade' | 'warp' | 'zoom-out' | 'none' = 'fade', toast?: string): void {
    if (this.transitioning) return;
    if (this.player.veh) this.player.dismount();
    this.transitioning = true;
    this.hud.dialog.reset();
    this.audio.sfx('whoosh');
    const go = () => {
      this.enterScene(id, spawn);
      if (toast) this.hud.toast(toast, { ms: 2400 });
    };
    const done = () => {
      this.transitioning = false;
    };
    if (transition === 'none') {
      go();
      done();
    } else if (transition === 'warp') void this.hud.warpThrough(go, this.reducedMotion).then(done);
    else if (transition === 'zoom-out' && this.player.mode === 'spacecraft' && !this.reducedMotion) {
      const t0 = performance.now();
      const step = (now: number) => {
        this.player.pullBack = Math.min(1, (now - t0) / 1500);
        if (this.player.pullBack < 1) requestAnimationFrame(step);
        else void this.hud.fadeThrough(() => {
          this.player.pullBack = 0;
          go();
        }, this.reducedMotion).then(done);
      };
      requestAnimationFrame(step);
    } else void this.hud.fadeThrough(go, this.reducedMotion).then(done);
  }

  private buildEntityLabels(): void {
    this.hud.labels.clear();
    this.entityTags.clear();
    this.myTag = null;
    this.myLabel = null;
    const sc = this.scene!;
    for (const ent of sc.entities) {
      const L = ent.def.label;
      if (!L) continue;
      const style = L.style ?? (ent.def.npc ? 'npc' : ent.def.vehicle ? 'ride' : '');
      const iconName = ent.def.vehicle ? ent.def.vehicle.preset : undefined;
      if (style === 'monument') {
        const el = h('div', { class: 'mlabel', text: this.text(L.text) });
        this.hud.labels.add(el, (v) => v.copy(ent.pos).add(tmpV.set(0, ent.labelY, 0)), { max: L.max ?? 2800, min: L.min ?? 0, cond: () => ent.visible && this.check(L.when) });
        this.entityTags.set(ent.id, { tag: { el, nm: el, chip: el, bang: el, ok: el, bubble: el }, ent });
        continue;
      }
      const tag = makeTag(this.text(L.text), { style, ...(L.dot ? { dot: L.dot } : style === 'npc' ? { dot: '#e9b44c' } : {}), ...(iconName ? { icon: iconName } : {}) });
      tag.el.addEventListener('click', () => this.tapEntity(ent));
      this.hud.labels.add(tag.el, (v) => v.copy(ent.pos).add(tmpV.set(0, ent.labelY, 0)), {
        max: L.max ?? 140,
        min: L.min ?? 0,
        ...(L.fade !== undefined ? { fade: L.fade } : {}),
        cond: () => ent.visible && !ent.hidden && !ent.rider && this.check(L.when),
      });
      this.entityTags.set(ent.id, { tag, ent });
    }
    this.refreshLabels();
  }

  private refreshLabels(): void {
    for (const { tag, ent } of this.entityTags.values()) {
      const L = ent.def.label!;
      const txt = this.text(L.text);
      if (tag.nm.textContent !== txt) tag.nm.textContent = txt;
      if (L.style === 'monument') continue;
      tag.ok.hidden = !(L.check && this.check(L.check));
      tag.bang.hidden = !(L.bang && this.check(L.bang));
      if (L.chip) {
        tag.chip.hidden = !this.check(L.chip.when);
        tag.chip.textContent = this.t(L.chip.text);
      }
    }
  }

  /* ================================================================ actions */

  run(actions: Action[] | undefined, src: { entity?: EntityRT } = {}): void {
    if (!actions) return;
    for (const a of actions) {
      try {
        this.runOne(a, src);
      } catch (err) {
        console.warn('[rihla] action failed', a, err);
      }
    }
  }

  private runOne(a: Action, src: { entity?: EntityRT }): void {
    switch (a.do) {
      case 'show.toast':
        this.hud.toast(this.text(a.text), { ...(a.kind ? { kind: a.kind } : {}), ...(a.ms ? { ms: a.ms } : {}) });
        return;
      case 'show.dialogue':
        this.showDialogue(a.dialogue, src.entity);
        return;
      case 'show.card': {
        const c = this.pack.cards[a.card];
        if (!c) return;
        const who = c.who ? this.text(c.who) : c.title ? this.t(c.title) : '';
        this.hud.dialog.open(cardLines(c, (k) => this.t(k), who, c.glyph ?? '!'), { ttl: c.ttl ?? 30, onEnd: () => this.run(c.then) });
        this.emit('viewed-card', { type: 'card', id: c.id }, undefined, { objectives: c.objectives ?? [] });
        this.audio.sfx('chime');
        return;
      }
      case 'ask.item':
        this.askItem(a.item, a.onCorrect, 'play');
        return;
      case 'give.stamp': {
        if (!this.state.giveStamp(a.stamp)) return;
        passport.add(this.manifest.id, a.stamp);
        const s = this.manifest.stamps.find((x) => x.id === a.stamp);
        this.audio.sfx('stamp');
        this.hud.toast(this.t('engine.stampEarned', { title: s ? this.t(s.title) : a.stamp }), { kind: 'gold', ms: 4500 });
        this.emit('earned-stamp', { type: 'stamp', id: a.stamp });
        this.save();
        return;
      }
      case 'give.title': {
        if (this.state.titles.has(a.title)) return;
        this.state.titles.add(a.title);
        this.state.changed();
        const def = this.manifest.titles?.find((x) => x.id === a.title);
        const title = this.t(def?.text ?? a.title);
        this.hud.toast(this.t('engine.titleEarned', { title }), { kind: 'gold', ms: 5500 });
        if (this.myTag) {
          this.myTag.chip.textContent = title;
          this.myTag.chip.hidden = false;
        }
        return;
      }
      case 'set.flag':
        this.state.setFlag(a.flag, a.value ?? true);
        return;
      case 'add.counter':
        if (this.state.add(a.counter, a.value)) this.audio.sfx('chime');
        return;
      case 'start.quest':
        return;
      case 'complete.quest':
        this.quests.complete(a.quest);
        return;
      case 'quest.go':
        this.quests.go(a.quest, a.button ?? 0);
        return;
      case 'set.timeOfDay':
        this.scene?.env.setTimeOfDay(a.value);
        return;
      case 'go.scene':
        this.goScene(a.scene, a.spawn, a.transition ?? 'fade', a.toast ? this.text(a.toast) : undefined);
        return;
      case 'travel.to':
        this.travelTo(a.target, a.mode ?? 'auto');
        return;
      case 'vehicle.mount': {
        const v = this.scene?.byId.get(a.entity);
        if (!v) return;
        const home = v.home;
        if (v.def.vehicle?.home && v.pos.distanceTo(home) > 30 && this.player.pos.distanceTo(home) < 60) {
          v.pos.copy(home);
          v.object.position.copy(home);
          this.hud.toast(this.t('engine.balloonBack'));
        }
        if (Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z) < 40) this.mount(v);
        else this.triggers.tap(v);
        return;
      }
      case 'vehicle.dismount':
        this.dismount();
        return;
      case 'player.buff':
        this.player.buffRun = a.runSpeed;
        this.player.buffT = a.seconds;
        return;
      case 'show.glyphs':
        this.showGlyphs(a.alphabet);
        return;
      case 'open.panel':
        this.openPanel(a.panel);
        return;
      case 'camera.flyTo': {
        const p = this.targetPoint(a.target);
        if (p) this.player.cam.yaw = Math.atan2(this.player.pos.x - p.x, this.player.pos.z - p.z);
        return;
      }
      case 'photo.take':
        this.photo.take();
        return;
      case 'play.vo':
        this.audio.playVo(this.voUrl(a.key));
        return;
      case 'play.sfx':
        this.audio.sfx(a.sfx);
        return;
      case 'control.if':
        this.run(this.check(a.when) ? a.then : a.else, src);
        return;
      case 'control.delay':
        this.after(a.seconds, () => this.run(a.then, src));
        return;
      case 'hud.hint':
        if (a.show) this.setHint(true);
        else this.hud.hideHint();
        return;
    }
  }

  private voUrl(key: string): string | null {
    return `${this.pack.base}audio/vo/${this.locale}/${key}.mp3`;
  }

  private showDialogue(id: string, ent?: EntityRT): void {
    const d = this.pack.dialogues[id];
    if (!d) return;
    const chars = this.manifest.characters;
    const anchor = d.anchor ? this.scene?.byId.get(d.anchor) : ent;
    if (anchor) {
      anchor.talking = true;
      this.faceNpc(anchor);
    }
    const lines: DLine[] = d.lines
      .map((l) => {
        const ch = l.speaker ? chars[l.speaker] : undefined;
        return {
          who: l.who ? this.text(l.who) : ch ? this.t(ch.name) : '',
          glyph: l.glyph ?? (ch ? this.t(ch.glyph) : ''),
          text: this.text(l.text),
          ...(l.options
            ? {
                options: l.options
                  .filter((o) => this.check(o.when))
                  .map((o) => ({ text: this.text(o.text), ...(o.prime ? { prime: true } : {}), fn: () => this.run(o.do, { ...(anchor ? { entity: anchor } : {}) }) })),
              }
            : {}),
          ...(l.do ? { onShow: () => this.run(l.do) } : {}),
          vo: l.vo ? `${this.pack.base}${l.vo}` : null,
        };
      });
    this.hud.dialog.open(lines, {
      ...(d.locked ? { locked: true } : {}),
      ...(d.ttl ? { ttl: d.ttl } : {}),
      ...(d.endLabel ? { endLabel: this.t(d.endLabel) } : {}),
      ...(anchor ? { anchor } : {}),
      onEnd: () => this.run(d.onEnd),
      onClose: () => {
        if (anchor) anchor.talking = false;
      },
    });
  }

  private faceNpc(e: EntityRT): void {
    if (!e.def.npc || e.def.npc.faceOnTalk === false) return;
    this.scene?.face(e, this.player.pos.x, this.player.pos.z);
  }

  private askItem(id: string, onCorrect: Action[] | undefined, phase: 'play' | 'pre' | 'post' | 'teacher', after?: () => void): void {
    const item = this.pack.items[id];
    if (!item) return;
    const who = item.who ? this.text(item.who) : this.t(phase === 'teacher' ? 'engine.teacherQuestion' : 'engine.quizTitle');
    renderItem(this.hud.dialog, item, who, {
      t: (k, p) => this.t(k, p),
      num: (n) => this.tr.num(n),
      hints: this.hints,
      oneShot: phase === 'pre' || phase === 'post',
      onAttempt: (correct, attempt, response) => this.emit('answered', { type: 'item', id }, { correct, attempt, response }, { objectives: item.objectives, phase }),
      onHint: () => this.emit('hint-used', { type: 'item', id }, undefined, { objectives: item.objectives, phase }),
      onCorrect: () => {
        this.run(onCorrect);
        after?.();
      },
      toast: (t, k) => this.hud.toast(t, { ...(k ? { kind: k } : {}), ms: 3500 }),
      sfx: (k) => this.audio.sfx(k),
    });
  }

  /** Five-question pre/post quiz, first answer counts (BRIEF §13). */
  runQuiz(kind: 'pre' | 'post'): Promise<void> {
    const ids = this.manifest.prePost?.[kind] ?? [];
    return new Promise((resolve) => {
      let i = 0;
      const nextQ = () => {
        if (i >= ids.length) {
          this.state.seen.add(`quiz:${kind}`);
          this.state.changed();
          this.hud.toast(this.t('engine.quizDone'), { kind: 'gold' });
          resolve();
          return;
        }
        this.askItem(ids[i++]!, undefined, kind, nextQ);
      };
      this.hud.showHud(true);
      this.hud.dialog.open([{ who: this.t(kind === 'pre' ? 'engine.prequiz' : 'engine.postquiz'), glyph: '؟', text: this.t('engine.quizIntro') }], { onEnd: nextQ, locked: true });
    });
  }

  private targetPoint(target: Extract<Action, { do: 'travel.to' }>['target']): THREE.Vector3 | null {
    const sc = this.scene;
    if (!sc) return null;
    if (typeof target === 'string') return sc.byId.get(target)?.pos ?? null;
    if ('at' in target) {
      const at = target.at;
      return at.length === 2 ? new THREE.Vector3(at[0], sc.height(at[0], at[1]), at[1]) : new THREE.Vector3(...at);
    }
    if (target.nearest === 'quest-step') return this.quests.guideTarget(target.quest);
    let best: EntityRT | null = null, bd = Infinity;
    for (const e of sc.entities) {
      if (e.def.kind !== 'pickup' || e.hidden || !e.visible) continue;
      const d = Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) + (e.def.label?.style === 'gold' ? 15 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best?.pos ?? null;
  }

  private travelTo(target: Extract<Action, { do: 'travel.to' }>['target'], mode: 'walk' | 'fast' | 'auto'): void {
    this.hud.closeModals();
    const sc = this.scene;
    if (!sc) return;
    if (this.player.mode === 'spacecraft' && typeof target === 'string') {
      const ent = sc.byId.get(target);
      if (ent) this.player.flyTo(ent, this.text(ent.def.label?.text));
      return;
    }
    const p = this.targetPoint(target);
    if (!p) return;
    if (this.player.mode === 'jetpack') {
      this.player.walkTo(p.x, p.z, true, p.y);
      return;
    }
    if (this.player.mode !== 'walk') return;
    const d = Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z);
    const lim = mode === 'fast' ? 240 : mode === 'auto' ? 420 : Infinity;
    if (this.player.vehPreset === 'balloon' || d < lim) this.player.walkTo(p.x, p.z, true);
    else void this.fastTravel(p.x, p.z);
  }

  private async fastTravel(x: number, z: number): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.hud.dialog.reset();
    await this.hud.fadeThrough(() => {
      this.player.teleport(x, z);
      this.hud.toast(this.t('engine.fastTravel'), { ms: 3000 });
      this.areas.reset();
    }, this.reducedMotion);
    this.transitioning = false;
  }

  private mount(v: EntityRT): void {
    if (this.player.mode !== 'walk' || this.player.veh) return;
    if (this.player.mount(v)) {
      this.hud.dialog.close(false);
      const vd = v.def.vehicle!;
      if (vd.mountLine) this.hud.toast(this.t(vd.mountLine), { ms: 5000 });
      this.state.add('rides', vd.preset);
      this.joyVisible();
      this.refreshSlow();
      this.setHint(true);
    }
  }
  private dismount(): void {
    if (this.player.dismount()) {
      this.refreshSlow();
      this.setHint(true);
    }
  }

  private tapEntity(ent: EntityRT): void {
    if (this.phase !== 'play' || this.transitioning || this.paused) return;
    if (this.player.vehPreset === 'balloon' && ent.def.npc) {
      this.hud.toast(this.t('engine.inBalloon'));
      return;
    }
    this.triggers.tap(ent);
  }

  private showGlyphs(id: string): void {
    const a = this.pack.glyphs[id];
    if (!a) return;
    const go = () => {
      const r = drawCartouche(this.state.name || this.t(this.manifest.intro.defaultName), a, this.t(a.footer), this.tr.dir === 'rtl');
      if (!r) {
        this.hud.toast(this.t(a.empty));
        return;
      }
      if (a.counterFlag) this.state.setFlag(a.counterFlag);
      const url = r.canvas.toDataURL('image/png');
      let close = () => {};
      const legend = h('div', { class: 'legend' }, ...r.legend.map(([g, s]) => h('span', {}, h('b', { text: g }), h('i', { style: 'font-style:normal', text: `= ${s}` }))));
      const save = h('button', {
        type: 'button',
        class: 'btn gold',
        text: this.t(a.saveLabel),
        onclick: () => {
          const c = document.createElement('canvas');
          c.width = 480;
          c.height = 213;
          c.getContext('2d')!.drawImage(r.canvas, 0, 0, 480, 213);
          this.photo.add(c.toDataURL('image/jpeg', 0.85), this.state.name);
          this.hud.toast(this.t(a.saved), { kind: 'gold' });
          close();
        },
      });
      close = this.hud.modal(
        h(
          'section',
          { class: 'pane card' },
          h('div', { class: 'band' }),
          h('div', { class: 'pbody' }, h('div', { class: 'ph' }, h('h2', { text: this.t(a.title) }), h('button', { class: 'icon', type: 'button', text: '×', 'aria-label': this.t('engine.close'), onclick: () => close() })), h('div', { class: 'cartwrap' }, h('img', { src: url, alt: this.state.name })), legend, h('p', { class: 'pnote', text: this.t(a.note) }), h('div', { class: 'mrow' }, save)),
        ),
      );
    };
    let ran = false;
    const once = () => {
      if (ran) return;
      ran = true;
      go();
    };
    if (document.fonts?.load) {
      void document.fonts.load(`64px "${a.font}"`, String.fromCodePoint(0x13153)).then(once, once);
      setTimeout(once, 2500);
    } else once();
  }

  openPanel(p: 'passport' | 'activities' | 'album' | 'map' | 'log' | 'settings'): void {
    this.hud.closeModals();
    if (p === 'passport') openPassport(this, this.hud);
    else if (p === 'activities') openActivities(this, this.hud);
    else if (p === 'album') openAlbum(this, this.hud);
    else if (p === 'log') openLog(this, this.hud);
    else if (p === 'map') this.openBigMap();
    else if (p === 'settings')
      openSettings(this, this.hud, {
        setTextScale: (s) => {
          this.textScale = s;
          storage.set('rihla.textScale', String(s));
          this.hud.root.style.setProperty('--rs', String(s));
        },
        textScale: () => this.textScale,
        setReducedMotion: (v) => {
          this.reducedMotion = v;
          storage.set('rihla.reducedMotion', v ? '1' : '0');
          this.hud.root.classList.toggle('calm', v);
        },
        setQuality: (q) => {
          this.qualityPref = q;
          storage.set('rihla.quality', q);
          if (q !== 'auto') this.applyTier(q);
        },
        quality: () => this.qualityPref,
      });
  }

  private warnOnce(id: string, key: string, kind: 'warn' | 'gold' = 'warn'): void {
    const n = performance.now();
    if (n - (this.warned.get(id) ?? 0) < 4500) return;
    this.warned.set(id, n);
    this.hud.toast(this.t(key), { kind });
  }

  /* ================================================================ HUD wiring */

  private wireInput(): void {
    const inp = this.input;
    inp.bindJoystick(this.hud.joy, this.hud.knob);
    inp.onDrag = (dx, dy) => {
      if (this.phase === 'play') this.player.drag(dx, dy);
    };
    inp.onZoom = (f) => {
      if (this.phase === 'play') this.player.zoom(f);
    };
    inp.onTap = (x, y) => {
      this.audio.unlock();
      if (this.phase !== 'play' || this.photo.req || this.paused || this.transitioning) return;
      const r = this.player.pick(x, y, this.hud.root.clientWidth, this.hud.root.clientHeight);
      if (this.opts.onPick) {
        const p = r.ground ?? r.ent?.pos;
        if (p) this.opts.onPick({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ...(r.ent ? { entity: r.ent.id } : {}) });
      }
      if (r.ent) this.tapEntity(r.ent);
      else if (r.ground && (this.player.mode === 'walk' || this.player.mode === 'jetpack') && this.scene?.isTerrain && this.cfgTap()) this.player.walkTo(r.ground.x, r.ground.z);
    };
    inp.onKey = (code, repeat) => {
      if (code === 'Escape') {
        if (this.hud.closeModals()) return;
        if (this.hud.dialog.isOpen && !this.hud.dialog.locked) this.hud.dialog.close(false);
        return;
      }
      if (this.phase !== 'play' || repeat || this.hud.modalOpen) return;
      if (code === 'KeyE' || code === 'KeyF') {
        const a = this.hud.action;
        if (a) a.fn();
        else this.triggers.context?.fn();
      }
      if (code === 'KeyP' && this.manifest.hud.panels.includes('album')) this.photo.take();
      if (code === 'KeyM' && this.scene?.def.map) this.toggleBigMap();
      if (code === 'KeyH') this.hud.toggleHint();
      if (code === 'Space') this.player.jump();
    };
    this.hud.onHold = (k, on) => {
      this.input.hold[k] = on;
      if (k === 'up' && on) this.player.descend = false;
    };
    this.hud.root.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
  }

  private cfgTap(): boolean {
    return this.scene?.def.player.tapToWalk !== false;
  }

  private joyVisible(): void {
    this.hud.joy.hidden = !this.isTouch || this.player.mode === 'orbit';
  }

  private wireHud(): void {
    this.hud.mini.addEventListener('click', () => this.openBigMap());
    this.hud.mini.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openBigMap();
      }
    });
    this.hud.dialog.onChange = (open) => {
      if (open) this.hud.hideHint();
    };
    this.hud.dialog.onVo = (url) => {
      if (url) this.audio.playVo(url);
      else this.audio.stopVo();
    };
    this.state.on(() => {
      this.dirtyUi = true;
    });
  }
  private dirtyUi = true;

  private hintKey(): string {
    if (this.player.vehPreset === 'balloon') return 'balloon';
    if (this.player.veh) return 'ride';
    return 'default';
  }
  private setHint(show: boolean): void {
    const hints = this.scene?.def.hud?.hints;
    const H = hints?.[this.hintKey()] ?? hints?.default;
    if (!H) {
      this.hud.hideHint();
      return;
    }
    this.hud.setHint(this.t(this.isTouch ? H.touch : H.desk), show, 16);
  }

  /** Slower HUD refresh: quest card, info card, buttons, travel bar, counts. */
  private refreshSlow(): void {
    if (this.phase !== 'play' || !this.scene) return;
    const sc = this.scene, m = this.manifest;
    if (this.player.mode !== 'spacecraft' || !this.player.shipAuto) this.hud.updateQuest(this.quests.view());
    else {
      const v = this.quests.view();
      if (v) this.hud.updateQuest({ ...v, goal: this.tr.has('quest.flying') ? this.t('quest.flying', { name: this.player.shipAuto.label }) : v.goal, buttons: [] });
    }
    const ic = sc.def.hud?.infoCard;
    this.hud.updateInfo(
      ic
        ? {
            kicker: this.text(ic.kicker),
            title: this.text(ic.title),
            rows: (ic.rows ?? []).map((r) => [this.text(r.label), this.text(r.value)] as [string, string]),
            ...(ic.note ? { note: this.text(ic.note) } : {}),
            progress: (ic.progress ?? []).map((p) => ({ label: this.text(p.label), n: Math.min(p.of, this.state.count(p.counter)), of: p.of, style: p.style ?? 'dots' })),
            buttons: (ic.buttons ?? []).filter((b) => this.check(b.when)).map((b) => ({ label: this.text(b.label), ...(b.icon ? { icon: b.icon } : {}), style: b.style ?? 'gold', fn: () => this.run(b.do) })),
          }
        : null,
    );
    // vehicle card
    const v = this.player.veh;
    if (v) {
      const balloon = this.player.vehPreset === 'balloon';
      const alt = Math.max(0, Math.round(this.player.altitude));
      this.hud.updateVehicle({
        kicker: this.t(balloon ? 'engine.flyingBalloon' : 'engine.riding'),
        title: this.t(v.def.vehicle!.name),
        sub: balloon ? this.t('engine.altitude', { m: alt }) + (this.tr.has('balloon.rings') ? ` · ${this.text({ key: 'balloon.rings', params: { n: { counter: 'rings' } } })}` : '') : this.t('engine.speed', { k: Math.round(this.player.speed * 3.6) }),
        ...(balloon ? { alt: alt / (sc.def.player.bounds?.maxAltitude ?? 480) } : {}),
      });
    } else this.hud.updateVehicle(null);
    // top buttons
    const tops: Parameters<Hud['setTopButtons']>[0] = [];
    if (this.rooms) tops.push({ id: 'class', label: this.t('engine.classmates', { n: this.others.size }), icon: 'people', fn: () => this.openPhrases() });
    for (const p of m.hud.panels) {
      if (p === 'passport') tops.push({ id: p, label: this.t('engine.passport'), icon: 'book', count: this.tr.num(this.state.stamps.size), fn: () => this.openPanel('passport') });
      if (p === 'activities') tops.push({ id: p, label: this.t(m.collections?.activities?.button ?? 'engine.activities'), icon: 'list', count: activityCount(this), fn: () => this.openPanel('activities') });
      if (p === 'log' && sc.def.kind !== 'galaxy') tops.push({ id: p, label: this.t(m.collections?.log?.button ?? 'engine.log'), icon: 'list', count: this.tr.num(logCount(this)), fn: () => this.openPanel('log') });
    }
    for (const tg of m.hud.toggles ?? []) if (this.check(tg.when)) tops.push({ id: tg.id, label: this.t(this.check(tg.state) ? tg.on : tg.off), icon: tg.icon ?? 'star', fn: () => (this.run(tg.do), this.after(0.05, () => this.refreshSlow())) });
    for (const b of sc.def.hud?.buttons ?? []) if (!b.hold && this.check(b.when) && b.icon === 'galaxy') tops.push({ id: b.id, label: this.text(b.label), icon: b.icon, fn: () => this.run(b.do) });
    if (m.hud.panels.includes('settings')) tops.push({ id: 'settings', label: this.t('engine.settings'), icon: 'gear', fn: () => this.openPanel('settings'), short: true });
    tops.push({ id: 'lang', label: this.t('engine.langShort'), icon: '', fn: () => this.switchLocale(), short: true });
    this.hud.setTopButtons(tops);
    // travel bar
    const tb = sc.def.hud?.travelBar;
    this.hud.setTravelBar(
      tb
        ? tb.flatMap((it) => {
            const e = sc.byId.get(it.entity);
            if (!e) return [];
            return [{ id: it.entity, label: this.text(e.def.label?.text), color: e.def.label?.dot ?? '#999999', here: this.nearBody() === e, done: this.check(it.check), fn: () => this.travelTo(it.entity, 'auto') }];
          })
        : null,
    );
    // bottom buttons
    const balloon = this.player.vehPreset === 'balloon';
    const defs: ButtonDef[] = [];
    if (m.hud.panels.includes('album')) defs.push({ id: 'photo', label: this.t('engine.photo'), icon: 'camera', fn: () => this.photo.take(), visible: true });
    if (sc.def.map) defs.push({ id: 'map', label: this.t('engine.map'), icon: 'map', fn: () => this.toggleBigMap(), visible: true });
    if (m.hud.wave) defs.push({ id: 'wave', label: this.t('engine.wave'), icon: 'hand', fn: () => this.wave(), visible: !balloon });
    defs.push({ id: 'down', label: this.t('engine.down'), icon: 'down', hold: 'down', round: true, visible: balloon });
    defs.push({ id: 'up', label: this.t('engine.up'), icon: 'flame', hold: 'up', round: true, visible: balloon });
    for (const b of sc.def.hud?.buttons ?? []) {
      if (b.icon === 'galaxy' && !b.hold) continue;
      defs.push({ id: b.id, label: this.text(b.label), ...(b.icon ? { icon: b.icon } : {}), ...(b.hold ? { hold: b.hold } : {}), round: !!b.hold, ...(b.do ? { fn: () => this.run(b.do) } : {}), visible: this.check(b.when) });
    }
    this.hud.setButtons(defs, () => this.player.jump());
    this.hud.mapWrap.hidden = !sc.def.map;
    this.hud.north.textContent = this.t('engine.north');
    this.refreshLabels();
  }

  private nearBody(): EntityRT | null {
    if (this.player.mode !== 'spacecraft' || !this.scene) return null;
    let best: EntityRT | null = null, br = Infinity;
    for (const e of this.scene.entities) {
      if (!e.def.carry) continue;
      const r = this.player.pos.distanceTo(e.pos) / e.standoff;
      if (r < br) {
        br = r;
        best = e;
      }
    }
    return br < 1.8 ? best : null;
  }

  private wave(): void {
    this.player.waveT = 2.2;
    this.rooms?.send('emote', { kind: 'wave' });
  }

  /* ================================================================ map */

  private layoutMini(): void {
    if (!this.hud) return;
    const c = this.hud.mini, w = c.clientWidth || 132, d = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(w * d);
    c.height = Math.round(w * d);
    c.getContext('2d')!.setTransform(d, 0, 0, d, 0, 0);
  }

  private marks(): MapMark[] {
    const out: MapMark[] = [];
    for (const e of this.scene?.entities ?? []) {
      const mm = e.def.mapMarker;
      if (!mm || e.rider || e.hidden || !this.check(mm.when)) continue;
      out.push({ x: e.pos.x, z: e.pos.z, color: mm.color, shape: mm.shape ?? 'dot', size: mm.size ?? 3.4, edge: mm.edge ?? false });
    }
    for (const o of this.others.values()) out.push({ x: o.pos.x, z: o.pos.z, color: o.color, shape: 'triangle', size: 4, edge: true });
    return out;
  }

  private drawMini(): void {
    const sc = this.scene, def = sc?.def.map;
    if (!sc || !def) return;
    const c = this.hud.mini, ctx = c.getContext('2d')!, W = c.clientWidth || 132, R = W / 2;
    const range = this.player.vehPreset === 'balloon' ? (def.miniRangeFlying ?? def.miniRange * 1.8) : def.miniRange;
    const s = R / range, cx = this.player.pos.x, cz = this.player.pos.z;
    const X = (x: number) => R + (x - cx) * s, Z = (z: number) => R + (z - cz) * s;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    this.map.drawWorld(ctx, X, Z, s, W, W);
    for (const mk of this.marks()) {
      let px = X(mk.x) - R, pz = Z(mk.z) - R;
      const d = Math.hypot(px, pz);
      if (d < R - 8) MapRenderer.mark(ctx, R + px, R + pz, mk, false);
      else if (mk.edge) {
        px *= (R - 7) / d;
        pz *= (R - 7) / d;
        ctx.save();
        ctx.translate(R + px, R + pz);
        ctx.rotate(Math.atan2(pz, px));
        ctx.fillStyle = mk.color;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-3, 4.5);
        ctx.lineTo(-3, -4.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    const g = ctx.createRadialGradient(R, R, R * 0.6, R, R, R);
    g.addColorStop(0, 'rgba(12,21,48,0)');
    g.addColorStop(1, 'rgba(12,21,48,.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
    ctx.restore();
    MapRenderer.arrow(ctx, R, R, this.player.yaw, 8);
  }

  private toggleBigMap(): void {
    if (this.bigMapClose) {
      this.bigMapClose();
      return;
    }
    this.openBigMap();
  }

  private openBigMap(): void {
    const def = this.scene?.def.map;
    if (!def || this.phase !== 'play') return;
    const { x0, x1, z0, z1 } = def.bounds;
    const maxW = Math.min(this.hud.root.clientWidth - 64, 820), maxH = this.hud.root.clientHeight - 190;
    let w = maxW, hh = (w * (z1 - z0)) / (x1 - x0);
    if (hh > maxH) {
      hh = maxH;
      w = (hh * (x1 - x0)) / (z1 - z0);
    }
    const cv = h('canvas', { 'aria-label': this.t(def.title) });
    cv.style.width = `${w}px`;
    cv.style.height = `${hh}px`;
    const d = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(w * d);
    cv.height = Math.round(hh * d);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const s = Math.min(w / (x1 - x0), hh / (z1 - z0)), ox = (w - (x1 - x0) * s) / 2, oz = (hh - (z1 - z0) * s) / 2;
    const X = (x: number) => ox + (x - x0) * s, Z = (z: number) => oz + (z - z0) * s;
    this.map.drawWorld(ctx, X, Z, s, w, hh);
    for (const mk of this.marks()) MapRenderer.mark(ctx, X(mk.x), Z(mk.z), mk, true);
    MapRenderer.arrow(ctx, X(this.player.pos.x), Z(this.player.pos.z), this.player.yaw, 11);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2b1d0b';
    const ar = this.tr.dir === 'rtl';
    ctx.font = ar ? '700 17px "Aref Ruqaa", Tahoma, serif' : '600 13px "Reem Kufi", Tahoma, sans-serif';
    ctx.direction = ar ? 'rtl' : 'ltr';
    for (const l of def.labels ?? []) ctx.fillText(this.t(l.text), X(l.at[0]), Z(l.at[1]));
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = x0 + (e.clientX - r.left - ox) / s, z = z0 + (e.clientY - r.top - oz) / s;
      this.bigMapClose?.();
      if (this.player.mode === 'walk') this.player.walkTo(x, z, true);
    });
    this.hud.closeModals();
    this.bigMapClose = this.hud.modal(
      h('div', { class: 'card bigmap', style: 'max-width:100%' }, h('div', { class: 'band' }), h('div', { class: 'pbody' }, h('div', { class: 'ph' }, h('h2', { text: this.t(def.title) }), h('button', { class: 'icon', type: 'button', text: '×', 'aria-label': this.t('engine.close'), onclick: () => this.bigMapClose?.() })), cv, h('div', { class: 'pnote', text: this.t(def.note ?? 'engine.mapNote') }))),
      () => (this.bigMapClose = null),
    );
  }

  /* ================================================================ locale */

  switchLocale(to?: string): void {
    const m = this.manifest;
    const next = to ?? m.locales.find((l) => langOf(l) !== langOf(this.locale)) ?? m.defaultLocale;
    this.locale = next;
    this.state.locale = next;
    this.buildTranslators();
    this.applyLocaleToHud();
    this.telemetry.patchContext({ locale: next });
    this.save();
    for (const s of this.scenes.values()) s.redrawText();
    if (this.hud.dialog.isOpen && !this.hud.dialog.locked) this.hud.dialog.close(false);
    this.dirtyUi = true;
    this.refreshSlow();
    this.setHint(false);
    if (this.myTag) this.myTag.nm.textContent = this.state.name || this.t(m.intro.defaultName);
    this.areas?.reset();
  }

  /* ================================================================ loop */

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const elapsed = (now - this.last) / 1000;
    const minFrame = 1 / this.quality.maxFps;
    if (elapsed < minFrame * 0.9) return;
    // Simulation steps are capped so a stalled tab does not teleport the player; fps is measured on real time.
    const dt = Math.min(0.05, elapsed);
    this.realDt = Math.min(1, elapsed);
    this.last = now;
    if (!this.paused) this.clock += dt;
    this.step(dt);
  };

  private step(dt: number): void {
    const sc = this.scene;
    if (!sc || !this.renderer) return;
    const running = !this.paused;
    // timers
    if (running && this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.clock);
      this.timers = this.timers.filter((t) => t.at > this.clock);
      for (const t of due) t.fn();
    }
    if (this.phase === 'play') {
      if (running && !this.transitioning) this.player.update(dt, (id) => {
        const e = sc.byId.get(id);
        return e ? { pos: e.pos, standoff: e.standoff } : null;
      });
      this.probe?.tick(this.realDt);
    }
    if (running) sc.update(dt, this.camera, this.check);
    const focus = this.player.pos;
    sc.env.update(dt, this.clock, this.camera, { x: focus.x, y: focus.y, z: focus.z, groundY: sc.isTerrain ? sc.height(focus.x, focus.z) : 0 }, this.renderer, this.reducedMotion);
    sc.updateNight(this.check);
    // camera
    if (this.phase === 'intro' || this.phase === 'loading') {
      this.introT += dt;
      const i = sc.def.intro;
      if (i) {
        const a = (i.phase ?? 0.55) + this.introT * i.speed;
        this.camera.position.set(i.center[0] + Math.sin(a) * i.radius, i.height, i.center[2] + Math.cos(a) * i.radius);
        this.camera.lookAt(i.center[0], i.center[1], i.center[2]);
      }
    } else {
      if (this.blend && this.blend.t < 1) this.blend.t = Math.min(1, this.blend.t + dt / 2);
      this.player.updateCamera(dt, this.blend);
      this.photo.applyCamera(this.camera);
    }
    this.renderer.render(sc.scene, this.camera);
    if (this.phase === 'play') this.photo.afterRender(dt, this.renderer.domElement, () => this.currentAreaName());
    this.hud.labels.update(this.camera, this.hud.root.clientWidth, this.hud.root.clientHeight);
    this.hud.dialog.tick(dt, this.phase === 'play' ? this.player.pos : null);
    this.updateOthers(dt);
    if (this.phase !== 'play') return;
    this.acc.act += dt;
    if (this.acc.act > 0.15) {
      this.acc.act = 0;
      this.triggers.update();
      const busy = this.transitioning || !!this.photo.req;
      this.hud.setAction(busy ? null : this.triggers.action, !this.isTouch);
      this.hud.setContext(busy ? null : this.triggers.context);
    }
    this.acc.slow += dt;
    if (this.acc.slow > 0.2) {
      this.acc.slow = 0;
      this.quests.check();
      this.areas.update(this.hud.dialog.isOpen);
      this.refreshSlow();
      this.dirtyUi = false;
      this.drawMini();
      this.sendPresence();
    }
    this.acc.save += dt;
    if (this.acc.save > 2) {
      this.acc.save = 0;
      if (this.state.takeDirty()) this.save();
    }
    if (this.opts.perf) {
      this.acc.perf += this.realDt;
      this.acc.frame++;
      if (this.acc.perf > 0.5) {
        const info = this.renderer.info;
        this.hud.perf.hidden = false;
        this.hud.perf.textContent = `${this.quality.tier} · fps ${Math.round(this.acc.frame / this.acc.perf)} · draw ${info.render.calls} · tris ${info.render.triangles} · geo ${info.memory.geometries} · tex ${info.memory.textures}`;
        (this.hud.perf.dataset as DOMStringMap).calls = String(info.render.calls);
        (this.hud.perf.dataset as DOMStringMap).fps = String(Math.round(this.acc.frame / this.acc.perf));
        this.acc.perf = 0;
        this.acc.frame = 0;
      }
    }
  }

  private currentAreaName(): string {
    return this.t(this.manifest.hud.album?.defaultCaption ?? this.manifest.title);
  }

  /* ================================================================ teacher & rooms */

  teacher(cmd: TeacherCommand): void {
    switch (cmd.type) {
      case 'pause':
        this.paused = true;
        this.setTeacherOverlay(this.t('engine.paused'));
        break;
      case 'resume':
        this.paused = false;
        this.setTeacherOverlay(null);
        break;
      case 'lockMovement':
        this.movementLocked = cmd.on;
        this.hud.toast(this.t(cmd.on ? 'engine.locked' : 'engine.resume'));
        break;
      case 'gather':
        this.hud.toast(this.t('engine.gathering'));
        this.goto(cmd.poiId);
        break;
      case 'spotlight':
        this.hud.toast(this.t('engine.spotlight', { name: cmd.name }), { ms: 6000 });
        if (cmd.at && this.player.mode === 'walk') this.player.cam.yaw = Math.atan2(this.player.pos.x - cmd.at[0], this.player.pos.z - cmd.at[1]);
        break;
      case 'pushQuestion':
        this.askItem(cmd.itemId, undefined, 'teacher');
        break;
      case 'end':
        this.paused = true;
        this.phase = 'ended';
        this.setTeacherOverlay(this.t('engine.sessionEnded'));
        this.save();
        void this.telemetry.flush();
        break;
    }
  }
  private setTeacherOverlay(text: string | null): void {
    this.teacherText = text;
    this.hud.teacher(text);
  }

  goto(poiId: string): void {
    const poi = this.pack.pois[poiId];
    if (!poi || this.phase !== 'play') return;
    const at = poi.spawn?.at ?? poi.at;
    if (poi.scene !== this.sceneId) {
      this.goScene(poi.scene, poi.spawn?.spawn, 'fade');
      return;
    }
    if (this.player.mode === 'walk') void this.fastTravel(at[0], at.length === 3 ? at[2]! : at[1]);
    else if (this.player.mode === 'spacecraft') {
      const ent = this.scene?.entities.find((e) => e.def.poi === poiId);
      if (ent) this.player.flyTo(ent, this.t(poi.title));
    }
  }

  private async connectRooms(): Promise<void> {
    try {
      const { connectRoom } = await import('./net/rooms.js');
      this.rooms = await connectRoom(this.opts.roomUrl ?? '', this.opts.roomToken!, {
        onTeacher: (c) => this.teacher(c),
        onPeer: (id, p) => this.peer(id, p),
        onLeave: (id) => this.dropPeer(id),
        onPhrase: (id, key) => {
          const o = this.others.get(id);
          if (!o) return;
          o.tag.bubble.textContent = this.t(`engine.phrase.${key}`);
          o.tag.bubble.hidden = false;
          setTimeout(() => (o.tag.bubble.hidden = true), 5000);
        },
      });
    } catch (e) {
      // Solo fallback: the student keeps playing with no visible error (BRIEF §10).
      console.info('[rihla] rooms unavailable, playing solo', e);
      this.rooms = null;
    }
  }
  private presenceT = 0;
  private sendPresence(): void {
    if (!this.rooms) return;
    const now = performance.now();
    if (now - this.presenceT < 100) return;
    this.presenceT = now;
    const p = this.player.pos;
    this.rooms.send('pos', { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +this.player.yaw.toFixed(2), scene: this.sceneId });
  }
  private peer(id: string, p: { name: string; color: string; x: number; y: number; z: number; scene: string }): void {
    if (!this.scene) return;
    let o = this.others.get(id);
    if (p.scene !== this.sceneId) {
      if (o) this.dropPeer(id);
      return;
    }
    if (!o) {
      const sc = this.scene;
      const obj = sc.def.player.controller === 'spacecraft' ? new THREE.Group() : peerFigure(p.color);
      sc.scene.add(obj);
      const tag = makeTag(p.name, { dot: p.color });
      const pos = new THREE.Vector3(p.x, p.y, p.z);
      o = { tag, obj, pos, target: pos.clone(), color: p.color, name: p.name };
      const oo = o;
      this.hud.labels.add(tag.el, (v) => v.copy(oo.pos).add(tmpV.set(0, 2.4, 0)), { max: 300 });
      this.others.set(id, o);
    }
    o.target.set(p.x, p.y, p.z);
  }
  private dropPeer(id: string): void {
    const o = this.others.get(id);
    if (!o) return;
    o.obj.removeFromParent();
    o.tag.el.remove();
    this.others.delete(id);
  }
  private updateOthers(dt: number): void {
    for (const o of this.others.values()) {
      o.pos.lerp(o.target, 1 - Math.exp(-dt * 8));
      o.obj.position.copy(o.pos);
    }
  }
  private openPhrases(): void {
    let close = () => {};
    const keys = ['come', 'found', 'help', 'look', 'wait'];
    const row = h('div', { class: 'phrases' }, ...keys.map((k) => h('button', { type: 'button', class: 'btn', text: this.t(`engine.phrase.${k}`), onclick: () => (this.rooms?.send('phrase', { key: k }), close()) })));
    close = this.hud.modal(h('section', { class: 'pane card' }, h('div', { class: 'band' }), h('div', { class: 'pbody' }, h('div', { class: 'ph' }, h('h2', { text: this.t('engine.phrases') }), h('button', { class: 'icon', type: 'button', text: '×', onclick: () => close() })), row)));
  }

  /* ================================================================ host API */

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    if (!this.teacherText) this.paused = false;
  }
  getState(): SaveData | null {
    return this.state?.toSave() ?? null;
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.phase === 'play' && !this.state.questsDone.has(this.manifest.hud.quest ?? '')) this.emit('abandoned', { type: 'pack', id: this.manifest.id }, { durationMs: Date.now() - this.startedAt });
    this.save();
    void this.telemetry?.flush();
    this.telemetry?.stop();
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObs?.disconnect();
    this.rooms?.leave();
    this.input?.destroy();
    for (const s of this.scenes.values()) s.dispose();
    this.scenes.clear();
    this.renderer?.dispose();
    this.audio.destroy();
    this.hud?.destroy();
  }
}

function peerFigure(color: string): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.16, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: '#a66d45' }));
  head.position.y = 1.7;
  g.add(body, head);
  return g;
}
