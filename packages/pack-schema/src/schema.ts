/**
 * The Rihla pack format, as TypeBox schemas. TypeBox gives us the JSON Schema (for the Studio and external
 * tools) and the TypeScript types (for the engine) from one definition.
 *
 * Conventions:
 * - Every user-facing string is a locale key (TextKey) or a TextRef with ICU params. Packs never hold display
 *   text inline, so the validator can prove every string exists in every locale.
 * - Coordinates: x = east, y = up, z = south, metres in terrain scenes, scene units in space scenes.
 * - Everything a pack can *do* is in the closed lists in behaviours.ts. Adding one is an engine PR.
 */
import { Type, type Static, type TSchema, type TLiteral, type TUnion } from '@sinclair/typebox';
import {
  ACTIONS,
  CONTROLLERS,
  ENTITY_KINDS,
  ITEM_TYPES,
  MODEL_GENS,
  MOTIONS,
  PANELS,
  REVIEW_STATES,
  TRIGGERS,
  TEXTURE_GENS,
} from './behaviours.js';

const Strict = { additionalProperties: false } as const;
const lit = <const T extends readonly string[]>(values: T): TUnion<TLiteral<T[number]>[]> => Type.Union(values.map((v) => Type.Literal(v))) as TUnion<TLiteral<T[number]>[]>;

export const Id = Type.String({ pattern: '^[a-z0-9][a-z0-9._:-]*$', maxLength: 80 });
export const TextKey = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', maxLength: 120, description: 'Locale key' });
export const Color = Type.String({ pattern: '^#[0-9a-fA-F]{6}$' });
export const Vec2 = Type.Tuple([Type.Number(), Type.Number()]);
export const Vec3 = Type.Tuple([Type.Number(), Type.Number(), Type.Number()]);
/** A point: [x, z] snaps to the ground, [x, y, z] is absolute (or relative to ground when `ground: true`). */
export const Point = Type.Union([Vec2, Vec3]);

/* ---------------------------------------------------------------- text */

export const ParamSource = Type.Union([
  Type.Object({ counter: Id }, Strict),
  Type.Object({ counterOf: Id }, { ...Strict, description: 'The declared size (`of`) of a counter' }),
  Type.Object({ guide: Id }, { ...Strict, description: 'Hint line for the next step of a quest' }),
  Type.Object({ next: Id }, { ...Strict, description: 'Label of the next step of a quest' }),
  Type.Object({ player: Type.Literal('name') }, Strict),
  Type.Object({ text: TextKey }, Strict),
  Type.Object({ literal: Type.Union([Type.String(), Type.Number()]) }, Strict),
]);
export type ParamSource = Static<typeof ParamSource>;

export const TextRef = Type.Union([
  TextKey,
  Type.Object({ key: TextKey, params: Type.Optional(Type.Record(Type.String(), ParamSource)) }, Strict),
]);
export type TextRef = Static<typeof TextRef>;

/* ---------------------------------------------------------------- conditions */

export const Cond = Type.Recursive(
  (Self) =>
    Type.Union([
      Type.Object({ flag: Id }, Strict),
      Type.Object({ counter: Id, gte: Type.Optional(Type.Number()), has: Type.Optional(Type.String()), lt: Type.Optional(Type.Number()) }, Strict),
      Type.Object({ stamp: Id }, Strict),
      Type.Object({ quest: Id, status: lit(['active', 'done'] as const) }, Strict),
      Type.Object({ vehicle: Type.Union([Type.String(), Type.Null()]) }, { ...Strict, description: 'Vehicle preset the player is on, or null' }),
      Type.Object({ altitudeGte: Type.Number() }, Strict),
      Type.Object({ timeOfDay: lit(['day', 'night'] as const) }, Strict),
      Type.Object({ scene: Id }, Strict),
      Type.Object({ autopilot: Type.Boolean() }, Strict),
      Type.Object({ not: Self }, Strict),
      Type.Object({ all: Type.Array(Self) }, Strict),
      Type.Object({ any: Type.Array(Self) }, Strict),
    ]),
  { $id: 'Cond' },
);
export type Cond = Static<typeof Cond>;

/* ---------------------------------------------------------------- actions */

const Target = Type.Union([
  Id,
  Type.Object({ scene: Type.Optional(Id), at: Point }, Strict),
  Type.Object({ nearest: Type.Union([Type.Literal('pickup'), Type.Literal('quest-step')]), quest: Type.Optional(Id) }, { ...Strict, description: 'Nearest unfinished pickup in the scene, or the guided quest step' }),
]);

export const Action = Type.Recursive(
  (Self) =>
    Type.Union([
      Type.Object({ do: Type.Literal('show.toast'), text: TextRef, kind: Type.Optional(lit(['gold', 'warn', 'info'] as const)), ms: Type.Optional(Type.Number()) }, Strict),
      Type.Object({ do: Type.Literal('show.dialogue'), dialogue: Id }, Strict),
      Type.Object({ do: Type.Literal('show.card'), card: Id }, Strict),
      Type.Object({ do: Type.Literal('ask.item'), item: Id, onCorrect: Type.Optional(Type.Array(Self)) }, Strict),
      Type.Object({ do: Type.Literal('give.stamp'), stamp: Id }, Strict),
      Type.Object({ do: Type.Literal('give.title'), title: Id }, Strict),
      Type.Object({ do: Type.Literal('set.flag'), flag: Id, value: Type.Optional(Type.Boolean()) }, Strict),
      Type.Object({ do: Type.Literal('add.counter'), counter: Id, value: Type.String() }, Strict),
      Type.Object({ do: Type.Literal('start.quest'), quest: Id }, Strict),
      Type.Object({ do: Type.Literal('complete.quest'), quest: Id }, Strict),
      Type.Object({ do: Type.Literal('quest.go'), quest: Id, button: Type.Optional(Type.Integer({ minimum: 0 })) }, Strict),
      Type.Object({ do: Type.Literal('set.timeOfDay'), value: lit(['day', 'night', 'toggle'] as const) }, Strict),
      Type.Object({ do: Type.Literal('go.scene'), scene: Id, spawn: Type.Optional(Id), transition: Type.Optional(lit(['fade', 'warp', 'zoom-out', 'none'] as const)), toast: Type.Optional(TextRef) }, Strict),
      Type.Object({ do: Type.Literal('travel.to'), target: Target, mode: Type.Optional(lit(['walk', 'fast', 'auto'] as const)) }, Strict),
      Type.Object({ do: Type.Literal('vehicle.mount'), entity: Id }, Strict),
      Type.Object({ do: Type.Literal('vehicle.dismount') }, Strict),
      Type.Object({ do: Type.Literal('player.buff'), runSpeed: Type.Number(), seconds: Type.Number() }, Strict),
      Type.Object({ do: Type.Literal('show.glyphs'), alphabet: Id }, Strict),
      Type.Object({ do: Type.Literal('open.panel'), panel: lit(PANELS) }, Strict),
      Type.Object({ do: Type.Literal('camera.flyTo'), target: Target, seconds: Type.Optional(Type.Number()) }, Strict),
      Type.Object({ do: Type.Literal('photo.take') }, Strict),
      Type.Object({ do: Type.Literal('play.vo'), key: TextKey }, Strict),
      Type.Object({ do: Type.Literal('play.sfx'), sfx: lit(['chime', 'stamp', 'whoosh', 'click', 'success', 'error', 'shutter'] as const) }, Strict),
      Type.Object({ do: Type.Literal('control.if'), when: Cond, then: Type.Array(Self), else: Type.Optional(Type.Array(Self)) }, Strict),
      Type.Object({ do: Type.Literal('control.delay'), seconds: Type.Number(), then: Type.Array(Self) }, Strict),
      Type.Object({ do: Type.Literal('hud.hint'), show: Type.Boolean() }, Strict),
    ]),
  { $id: 'Action' },
);
export type Action = Static<typeof Action>;
// Compile-time check that the schema and the closed list agree.
type _ActionNames = Action['do'];
const _actionsCovered: Record<_ActionNames, true> = Object.fromEntries(ACTIONS.map((a) => [a, true])) as Record<_ActionNames, true>;
void _actionsCovered;

/* ---------------------------------------------------------------- materials, textures, models */

export const TextureRef = Type.Object(
  {
    gen: lit(TEXTURE_GENS),
    seed: Type.Optional(Type.Number()),
    repeat: Type.Optional(Vec2),
    colors: Type.Optional(Type.Array(Color)),
    size: Type.Optional(Type.Integer({ minimum: 4, maximum: 1024 })),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  Strict,
);
export type TextureRef = Static<typeof TextureRef>;

export const MaterialDef = Type.Object(
  {
    type: Type.Optional(lit(['standard', 'basic', 'additive'] as const)),
    color: Type.Optional(Color),
    map: Type.Optional(TextureRef),
    bumpMap: Type.Optional(TextureRef),
    bumpScale: Type.Optional(Type.Number()),
    emissiveMap: Type.Optional(TextureRef),
    emissive: Type.Optional(Color),
    emissiveIntensity: Type.Optional(Type.Number()),
    roughness: Type.Optional(Type.Number()),
    metalness: Type.Optional(Type.Number()),
    flatShading: Type.Optional(Type.Boolean()),
    doubleSide: Type.Optional(Type.Boolean()),
    transparent: Type.Optional(Type.Boolean()),
    opacity: Type.Optional(Type.Number()),
    vertexColors: Type.Optional(Type.Boolean()),
    depthWrite: Type.Optional(Type.Boolean()),
    fog: Type.Optional(Type.Boolean()),
    toneMapped: Type.Optional(Type.Boolean()),
    alphaFade: Type.Optional(Type.Boolean({ description: 'Vertical alpha fade (light beams)' })),
    /** Emissive intensity follows the night amount (windows, show lighting). */
    night: Type.Optional(Type.Object({ intensity: Type.Number(), mode: Type.Optional(lit(['fixed', 'hue-cycle'] as const)) }, Strict)),
    /** Emissive intensity oscillates (lava). */
    pulse: Type.Optional(Type.Object({ min: Type.Number(), max: Type.Number(), speed: Type.Number() }, Strict)),
    /** Emissive turns on while a condition holds (the Sphinx's eyes). */
    glowWhen: Type.Optional(Type.Object({ when: Cond, intensity: Type.Number(), nightBoost: Type.Optional(Type.Number()) }, Strict)),
  },
  Strict,
);
export type MaterialDef = Static<typeof MaterialDef>;

export const MaterialRef = Type.Union([Id, MaterialDef]);
export type MaterialRef = Static<typeof MaterialRef>;

/** One primitive in a composite model or an instanced set. */
export const Part = Type.Object(
  {
    shape: lit(['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'circle', 'ring', 'icosahedron', 'octahedron', 'extrude', 'lathe', 'triangles', 'capsule', 'sprite'] as const),
    /** Shape parameters, e.g. box: [w,h,d]; sphere: [r, wSeg?, hSeg?, phiStart?, phiLen?, thetaStart?, thetaLen?]; cylinder: [rTop, rBottom, h, seg?, openEnded?, thetaStart?, thetaLen?]. */
    args: Type.Optional(Type.Array(Type.Union([Type.Number(), Type.Boolean()]))),
    /** extrude: 2D outline; entries [x,y] or [cx,cy,x,y] (quadratic curve). lathe: [r,y] points. triangles: flat xyz list. */
    points: Type.Optional(Type.Array(Type.Array(Type.Number()))),
    depth: Type.Optional(Type.Number()),
    bevel: Type.Optional(Type.Tuple([Type.Number(), Type.Number(), Type.Number()])),
    at: Type.Optional(Vec3),
    rot: Type.Optional(Vec3),
    rotOrder: Type.Optional(Type.String()),
    scale: Type.Optional(Type.Union([Vec3, Type.Number()])),
    /** Applied to the geometry before placement: [x,y,z] translate (e.g. pivot at the base). */
    pivot: Type.Optional(Vec3),
    geoRot: Type.Optional(Vec3),
    material: MaterialRef,
    shadow: Type.Optional(Type.Boolean()),
    ground: Type.Optional(Type.Boolean({ description: 'Walkable/pickable surface for tap-to-walk' })),
    name: Type.Optional(Type.String({ description: 'Animated part handle (e.g. "head", "legL")' })),
    parent: Type.Optional(Type.String()),
  },
  Strict,
);
export type Part = Static<typeof Part>;

export const InstanceItem = Type.Object(
  {
    at: Point,
    rot: Type.Optional(Vec3),
    scale: Type.Optional(Type.Union([Vec3, Type.Number()])),
    color: Type.Optional(Color),
    lift: Type.Optional(Type.Number()),
  },
  Strict,
);

export const Scatter = Type.Object(
  {
    type: lit(['ring', 'grid', 'line', 'box'] as const),
    seed: Type.Number(),
    count: Type.Optional(Type.Integer()),
    center: Type.Optional(Vec2),
    rMin: Type.Optional(Type.Number()),
    rMax: Type.Optional(Type.Number()),
    from: Type.Optional(Vec2),
    to: Type.Optional(Vec2),
    step: Type.Optional(Type.Union([Type.Number(), Vec2])),
    jitter: Type.Optional(Type.Number()),
    skip: Type.Optional(Type.Number({ description: 'Probability of skipping a slot' })),
    /** Exclusion rectangles [x0,z0,x1,z1] and a max-x cut. */
    exclude: Type.Optional(Type.Array(Type.Tuple([Type.Number(), Type.Number(), Type.Number(), Type.Number()]))),
    avoidSolids: Type.Optional(Type.Number()),
    xMax: Type.Optional(Type.Number()),
    scale: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    scaleXYZ: Type.Optional(Type.Tuple([Vec2, Vec2, Vec2], { description: 'Per-axis [min,max]' })),
    squash: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    yaw: Type.Optional(Type.Boolean()),
    colors: Type.Optional(Type.Array(Color)),
    lift: Type.Optional(Type.Number()),
    solid: Type.Optional(Type.Boolean()),
  },
  Strict,
);
export type Scatter = Static<typeof Scatter>;

export const ModelRef = Type.Object(
  {
    gen: lit(MODEL_GENS),
    ref: Type.Optional(Id),
    url: Type.Optional(Type.String()),
    lowTier: Type.Optional(Type.Unknown({ description: 'ModelRef used on the low tier and while a glTF loads' })),
    parts: Type.Optional(Type.Array(Part)),
    part: Type.Optional(Part),
    items: Type.Optional(Type.Array(InstanceItem)),
    scatter: Type.Optional(Scatter),
    material: Type.Optional(MaterialRef),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  Strict,
);
export type ModelRef = Static<typeof ModelRef>;

export const CompositeModel = Type.Object(
  {
    id: Id,
    parts: Type.Array(Part),
    materials: Type.Optional(Type.Record(Type.String(), MaterialDef)),
    scale: Type.Optional(Type.Number()),
    note: Type.Optional(Type.String()),
  },
  Strict,
);
export type CompositeModel = Static<typeof CompositeModel>;

/* ---------------------------------------------------------------- entities */

export const Trigger = Type.Object(
  {
    on: lit(TRIGGERS),
    radius: Type.Optional(Type.Number()),
    mode: Type.Optional(lit(['2d', '3d'] as const)),
    /** For 3d rings: how far above/below the centre still counts. */
    height: Type.Optional(Type.Number()),
    once: Type.Optional(Type.Boolean()),
    when: Type.Optional(Cond),
    /** interact: the label on the gold action button / context card. */
    label: Type.Optional(TextRef),
    icon: Type.Optional(Type.String()),
    style: Type.Optional(lit(['button', 'card'] as const)),
    card: Type.Optional(Type.Object({ kicker: Type.Optional(TextRef), title: TextRef, sub: Type.Optional(TextRef), swatch: Type.Optional(Color) }, Strict)),
    /** Only fires while on the ground (not flying high in a balloon). */
    grounded: Type.Optional(Type.Boolean()),
    do: Type.Array(Action),
  },
  Strict,
);
export type Trigger = Static<typeof Trigger>;

export const Motion = Type.Object(
  {
    type: lit(MOTIONS),
    center: Type.Optional(Type.Union([Id, Vec3])),
    radius: Type.Optional(Type.Number()),
    period: Type.Optional(Type.Number()),
    phase: Type.Optional(Type.Number()),
    incline: Type.Optional(Type.Number()),
    points: Type.Optional(Type.Array(Vec2)),
    speed: Type.Optional(Type.Number()),
    axis: Type.Optional(lit(['x', 'y', 'z'] as const)),
    height: Type.Optional(Type.Number()),
    amp: Type.Optional(Type.Number()),
    from: Type.Optional(Vec3),
    to: Type.Optional(Vec3),
    a: Type.Optional(Type.Number()),
    b: Type.Optional(Type.Number()),
    e: Type.Optional(Type.Number()),
    rot: Type.Optional(Type.Number()),
    entity: Type.Optional(Id),
    radial: Type.Optional(Type.Number()),
    up: Type.Optional(Type.Number()),
    direction: Type.Optional(Type.Number()),
    lookAt: Type.Optional(Type.Union([Id, Vec3, Type.Literal('motion')])),
    tailAwayFrom: Type.Optional(Vec3),
  },
  Strict,
);
export type Motion = Static<typeof Motion>;

export const Solid = Type.Object(
  {
    type: lit(['box', 'pyramid', 'sphere'] as const),
    hx: Type.Optional(Type.Number()),
    hz: Type.Optional(Type.Number()),
    h: Type.Optional(Type.Number()),
    r: Type.Optional(Type.Number()),
    push: Type.Optional(Type.Number()),
    warn: Type.Optional(TextRef),
    yOffset: Type.Optional(Type.Number()),
  },
  Strict,
);
export type Solid = Static<typeof Solid>;

export const Entity = Type.Object(
  {
    id: Id,
    kind: lit(ENTITY_KINDS),
    at: Type.Optional(Point),
    yaw: Type.Optional(Type.Number()),
    scale: Type.Optional(Type.Number()),
    /** Snap y to the terrain (default true in terrain scenes); with a Vec3, y becomes an offset. */
    ground: Type.Optional(Type.Boolean()),
    model: Type.Optional(ModelRef),
    zone: Type.Optional(Id),
    poi: Type.Optional(Id),
    label: Type.Optional(
      Type.Object(
        {
          text: TextRef,
          style: Type.Optional(lit(['npc', 'ride', 'gold', 'small', 'monument', 'craft', 'body', 'plain'] as const)),
          max: Type.Optional(Type.Number()),
          min: Type.Optional(Type.Number()),
          fade: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
          when: Type.Optional(Cond),
          dot: Type.Optional(Color),
          check: Type.Optional(Cond),
          bang: Type.Optional(Cond),
          chip: Type.Optional(Type.Object({ text: TextKey, when: Cond }, Strict)),
        },
        Strict,
      ),
    ),
    solid: Type.Optional(Solid),
    motion: Type.Optional(Motion),
    triggers: Type.Optional(Type.Array(Trigger)),
    showWhen: Type.Optional(Cond),
    hideWhen: Type.Optional(Cond),
    /** Animation played when hideWhen first becomes true. */
    collectAnim: Type.Optional(lit(['rise', 'fade'] as const)),
    mapMarker: Type.Optional(
      Type.Object(
        {
          color: Color,
          shape: Type.Optional(lit(['dot', 'ring', 'square', 'diamond', 'triangle'] as const)),
          size: Type.Optional(Type.Number()),
          when: Type.Optional(Cond),
          edge: Type.Optional(Type.Boolean({ description: 'Show an arrow at the minimap edge when off-map' })),
        },
        Strict,
      ),
    ),
    mapShape: Type.Optional(Type.Object({ color: Color, hx: Type.Number(), hz: Type.Number(), pyramid: Type.Optional(Type.Boolean()) }, Strict)),
    npc: Type.Optional(Type.Object({ character: Id, faceOnTalk: Type.Optional(Type.Boolean()) }, Strict)),
    vehicle: Type.Optional(
      Type.Object(
        {
          preset: lit(['camel', 'carriage', 'balloon'] as const),
          name: TextKey,
          mountLine: Type.Optional(TextKey),
          rideLabel: Type.Optional(TextRef),
          home: Type.Optional(Type.Boolean()),
        },
        Strict,
      ),
    ),
    photo: Type.Optional(
      Type.Object(
        {
          name: TextKey,
          counter: Id,
          cam: Type.Optional(Vec3),
          look: Type.Optional(Vec3),
          radius: Type.Optional(Type.Number()),
          sky: Type.Optional(Type.Object({ minAltitude: Type.Number(), vehicle: Type.Optional(Type.String()) }, Strict)),
        },
        Strict,
      ),
    ),
    /** Space travel: autopilot stops this far from the entity centre. */
    standoff: Type.Optional(Type.Number()),
    /** Space: the ship is carried along with this entity when within `carry` × standoff. */
    carry: Type.Optional(Type.Number()),
    tap: Type.Optional(Type.Array(Action)),
    pick: Type.Optional(Type.Boolean()),
    lod: Type.Optional(Type.Number({ description: 'Hide beyond this camera distance' })),
    tierMin: Type.Optional(lit(['low', 'mid', 'high'] as const)),
  },
  Strict,
);
export type Entity = Static<typeof Entity>;

/* ---------------------------------------------------------------- terrain */

export const Mask = Type.Object(
  {
    coord: lit(['x', 'z', 'r'] as const),
    center: Type.Optional(Vec2),
    from: Type.Number(),
    to: Type.Number(),
    base: Type.Optional(Type.Number()),
    gain: Type.Optional(Type.Number()),
  },
  Strict,
);
export type Mask = Static<typeof Mask>;

export const HeightLayer = Type.Object(
  {
    type: lit(['fbm', 'smooth', 'gauss', 'bowl', 'craters', 'const'] as const),
    freq: Type.Optional(Type.Number()),
    offset: Type.Optional(Vec2),
    bias: Type.Optional(Type.Number()),
    amp: Type.Optional(Type.Number()),
    coord: Type.Optional(lit(['x', 'z', 'r'] as const)),
    center: Type.Optional(Vec2),
    from: Type.Optional(Type.Number()),
    to: Type.Optional(Type.Number()),
    at: Type.Optional(Vec2),
    width: Type.Optional(Type.Number()),
    k: Type.Optional(Type.Number()),
    craters: Type.Optional(Type.Array(Type.Object({ at: Vec2, r: Type.Number(), depth: Type.Number() }, Strict))),
    random: Type.Optional(Type.Object({ seed: Type.Number(), count: Type.Integer(), area: Type.Number(), avoid: Type.Optional(Type.Array(Type.Tuple([Type.Number(), Type.Number(), Type.Number()]))) }, Strict)),
    masks: Type.Optional(Type.Array(Mask)),
  },
  Strict,
);
export type HeightLayer = Static<typeof HeightLayer>;

export const ColorLayer = Type.Object(
  {
    type: lit(['fbm', 'smooth'] as const),
    color: Color,
    freq: Type.Optional(Type.Number()),
    offset: Type.Optional(Vec2),
    lo: Type.Optional(Type.Number()),
    gain: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    coord: Type.Optional(lit(['x', 'z', 'r'] as const)),
    center: Type.Optional(Vec2),
    from: Type.Optional(Type.Number()),
    to: Type.Optional(Type.Number()),
    amount: Type.Optional(Type.Number()),
    masks: Type.Optional(Type.Array(Mask)),
  },
  Strict,
);
export type ColorLayer = Static<typeof ColorLayer>;

export const Terrain = Type.Object(
  {
    type: lit(['layers', 'deck', 'none'] as const),
    size: Type.Optional(Type.Number()),
    segments: Type.Optional(Type.Integer()),
    center: Type.Optional(Vec2),
    layers: Type.Optional(Type.Array(HeightLayer)),
    colors: Type.Optional(Type.Object({ base: Color, layers: Type.Optional(Type.Array(ColorLayer)) }, Strict)),
    texture: Type.Optional(TextureRef),
    bump: Type.Optional(TextureRef),
    bumpScale: Type.Optional(Type.Number()),
    /** deck (gas giants): banded cloud floor that scrolls. */
    bands: Type.Optional(Type.Array(Color)),
    seed: Type.Optional(Type.Number()),
    scroll: Type.Optional(Type.Number()),
    puffs: Type.Optional(Color),
  },
  Strict,
);
export type Terrain = Static<typeof Terrain>;

/* ---------------------------------------------------------------- environment */

export const SkyColors = Type.Object(
  {
    top: Color,
    up: Type.Optional(Color),
    mid: Type.Optional(Color),
    hor: Color,
    bot: Color,
    fog: Type.Optional(Color),
    sunColor: Type.Optional(Color),
    sunIntensity: Type.Optional(Type.Number()),
    hemiSky: Type.Optional(Color),
    hemiGround: Type.Optional(Color),
    hemiIntensity: Type.Optional(Type.Number()),
    cloud: Type.Optional(Color),
    cloudOpacity: Type.Optional(Type.Number()),
    exposure: Type.Optional(Type.Number()),
    sunAmount: Type.Optional(Type.Number()),
  },
  Strict,
);
export type SkyColors = Static<typeof SkyColors>;

export const Environment = Type.Object(
  {
    sky: Type.Optional(
      Type.Object(
        {
          style: lit(['sunset-gradient', 'simple-gradient', 'space'] as const),
          day: SkyColors,
          night: Type.Optional(SkyColors),
          sunGlow: Type.Optional(Type.Number()),
          sunDisk: Type.Optional(Type.Number({ description: 'Sun disk size multiplier; 0 hides the disk' })),
          sunDiskColor: Type.Optional(Color),
        },
        Strict,
      ),
    ),
    background: Type.Optional(Color),
    sunDir: Type.Optional(Vec3),
    shadows: Type.Optional(Type.Object({ extent: Type.Number(), far: Type.Optional(Type.Number()), distance: Type.Optional(Type.Number()) }, Strict)),
    pointLight: Type.Optional(Type.Object({ color: Color, intensity: Type.Number(), at: Type.Optional(Vec3) }, Strict)),
    ambient: Type.Optional(Type.Object({ color: Color, intensity: Type.Number() }, Strict)),
    fog: Type.Optional(Type.Object({ near: Type.Number(), far: Type.Number(), altitudeScale: Type.Optional(Type.Number()) }, Strict)),
    stars: Type.Optional(Type.Object({ count: Type.Integer(), radius: Type.Optional(Type.Number()), size: Type.Optional(Type.Number()), nightOnly: Type.Optional(Type.Boolean()), band: Type.Optional(Type.Integer()), bright: Type.Optional(Type.Integer()) }, Strict)),
    clouds: Type.Optional(Type.Object({ count: Type.Integer(), seed: Type.Number() }, Strict)),
    dust: Type.Optional(Type.Object({ count: Type.Integer(), color: Color, size: Type.Optional(Type.Number()), box: Type.Optional(Type.Number()), drift: Type.Optional(Vec2) }, Strict)),
    winds: Type.Optional(Type.Object({ count: Type.Integer(), color: Color, speed: Type.Number() }, Strict)),
    /** Objects that live "at infinity" in a fixed direction from the camera (Earth from the Moon). */
    skyObjects: Type.Optional(
      Type.Array(
        Type.Object(
          {
            model: ModelRef,
            dir: Vec3,
            distance: Type.Number(),
            spin: Type.Optional(Type.Number()),
            offset: Type.Optional(Vec3),
            rot: Type.Optional(Vec3),
          },
          Strict,
        ),
      ),
    ),
    timeOfDay: Type.Optional(lit(['day', 'night'] as const)),
  },
  Strict,
);
export type Environment = Static<typeof Environment>;

export const Spawn = Type.Object(
  {
    at: Type.Optional(Point),
    yaw: Type.Optional(Type.Number()),
    /** Space: appear next to a moving entity, on the side facing `side`. */
    near: Type.Optional(Type.Object({ entity: Id, side: Type.Optional(lit(['sun', 'away', 'fixed'] as const)), dir: Type.Optional(Vec3), distance: Type.Optional(Type.Number()) }, Strict)),
    name: Type.Optional(TextKey),
    camera: Type.Optional(Type.Object({ dist: Type.Optional(Type.Number()), pitch: Type.Optional(Type.Number()), yaw: Type.Optional(Type.Number()) }, Strict)),
    random: Type.Optional(Type.Boolean({ description: 'Eligible for random start' })),
  },
  Strict,
);
export type Spawn = Static<typeof Spawn>;

export const PlayerConfig = Type.Object(
  {
    controller: lit(CONTROLLERS),
    avatar: Type.Optional(lit(['human', 'astronaut', 'ship', 'none'] as const)),
    gravity: Type.Optional(Type.Number()),
    jump: Type.Optional(Type.Object({ velocity: Type.Number(), feedback: Type.Optional(TextKey), earthGravity: Type.Optional(Type.Number()) }, Strict)),
    walk: Type.Optional(Type.Number()),
    run: Type.Optional(Type.Number()),
    eye: Type.Optional(Type.Number()),
    camera: Type.Optional(Type.Object({ dist: Type.Number(), min: Type.Number(), max: Type.Number(), minPitch: Type.Optional(Type.Number()), pitch: Type.Optional(Type.Number()) }, Strict)),
    bounds: Type.Optional(Type.Object({ center: Vec2, radius: Type.Number(), flyRadius: Type.Optional(Type.Number()), maxAltitude: Type.Optional(Type.Number()), minY: Type.Optional(Type.Number()), maxY: Type.Optional(Type.Number()), lowWarn: Type.Optional(TextKey) }, Strict)),
    tapToWalk: Type.Optional(Type.Boolean()),
    speed: Type.Optional(Type.Number()),
    boost: Type.Optional(Type.Number()),
  },
  Strict,
);
export type PlayerConfig = Static<typeof PlayerConfig>;

const Region = Type.Object({ xGt: Type.Optional(Type.Number()), xLt: Type.Optional(Type.Number()), zGt: Type.Optional(Type.Number()), zLt: Type.Optional(Type.Number()) }, Strict);

export const Scene = Type.Object(
  {
    id: Id,
    kind: lit(['terrain', 'space', 'deck', 'galaxy'] as const),
    title: Type.Optional(TextKey),
    environment: Environment,
    terrain: Type.Optional(Terrain),
    player: PlayerConfig,
    spawns: Type.Record(Type.String(), Spawn),
    defaultSpawn: Type.Optional(Type.String()),
    intro: Type.Optional(Type.Object({ center: Vec3, radius: Type.Number(), height: Type.Number(), speed: Type.Number(), phase: Type.Optional(Type.Number()) }, Strict)),
    enter: Type.Optional(
      Type.Object(
        {
          descent: Type.Optional(Type.Object({ entity: Id, height: Type.Number(), seconds: Type.Number() }, Strict)),
          once: Type.Optional(Type.Array(Action)),
          every: Type.Optional(Type.Array(Action)),
        },
        Strict,
      ),
    ),
    materials: Type.Optional(Type.Record(Type.String(), MaterialDef)),
    entities: Type.Array(Entity),
    areas: Type.Optional(
      Type.Object(
        {
          list: Type.Array(Type.Object({ id: Id, at: Vec2, r: Type.Number(), card: Type.Optional(Id), poi: Type.Optional(Id), name: Type.Optional(TextKey) }, Strict)),
          fallback: Type.Optional(Type.Array(Type.Object({ name: TextKey, any: Type.Optional(Type.Array(Region)) }, Strict))),
        },
        Strict,
      ),
    ),
    map: Type.Optional(
      Type.Object(
        {
          bounds: Type.Object({ x0: Type.Number(), x1: Type.Number(), z0: Type.Number(), z1: Type.Number() }, Strict),
          title: TextKey,
          note: Type.Optional(TextKey),
          miniRange: Type.Number(),
          miniRangeFlying: Type.Optional(Type.Number()),
          shapes: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  type: lit(['rect', 'line', 'circle'] as const),
                  color: Color,
                  x: Type.Optional(Type.Number()),
                  z: Type.Optional(Type.Number()),
                  hx: Type.Optional(Type.Number()),
                  hz: Type.Optional(Type.Number()),
                  from: Type.Optional(Vec2),
                  to: Type.Optional(Vec2),
                  width: Type.Optional(Type.Number()),
                  r: Type.Optional(Type.Number()),
                  xFrom: Type.Optional(Type.Number({ description: 'rect from this x to the right edge' })),
                },
                Strict,
              ),
            ),
          ),
          labels: Type.Optional(Type.Array(Type.Object({ text: TextKey, at: Vec2 }, Strict))),
          sample: Type.Optional(Type.Integer({ description: 'Terrain colour sampling resolution' })),
        },
        Strict,
      ),
    ),
    hud: Type.Optional(
      Type.Object(
        {
          hints: Type.Optional(Type.Record(Type.String(), Type.Object({ touch: TextKey, desk: TextKey }, Strict))),
          infoCard: Type.Optional(
            Type.Object(
              {
                kicker: TextRef,
                title: TextRef,
                rows: Type.Optional(Type.Array(Type.Object({ label: TextRef, value: TextRef }, Strict))),
                note: Type.Optional(TextRef),
                progress: Type.Optional(Type.Array(Type.Object({ counter: Id, of: Type.Integer(), label: TextRef, style: Type.Optional(lit(['dots', 'diamonds'] as const)) }, Strict))),
                buttons: Type.Optional(Type.Array(Type.Object({ label: TextRef, icon: Type.Optional(Type.String()), style: Type.Optional(lit(['gold', 'teal', 'plain'] as const)), do: Type.Array(Action), when: Type.Optional(Cond) }, Strict))),
              },
              Strict,
            ),
          ),
          travelBar: Type.Optional(Type.Array(Type.Object({ entity: Id, check: Type.Optional(Cond) }, Strict))),
          buttons: Type.Optional(Type.Array(Type.Object({ id: Id, label: TextRef, icon: Type.Optional(Type.String()), when: Type.Optional(Cond), hold: Type.Optional(lit(['up', 'down', 'boost', 'jump'] as const)), do: Type.Optional(Type.Array(Action)) }, Strict))),
          quest: Type.Optional(Type.Boolean()),
          map: Type.Optional(Type.Boolean()),
        },
        Strict,
      ),
    ),
  },
  Strict,
);
export type Scene = Static<typeof Scene>;

/* ---------------------------------------------------------------- learning content */

export const Media = Type.Object(
  {
    type: lit(['image', 'video', 'panorama', 'audio'] as const),
    src: Type.String(),
    title: TextKey,
    sourceUrl: Type.String(),
    author: Type.String(),
    licence: Type.String({ description: 'SPDX-like id: CC0-1.0, CC-BY-4.0, public-domain, NASA-media, own' }),
    licenceUrl: Type.String(),
    attribution: Type.String(),
    permit: Type.Optional(Type.String()),
    captured: Type.Optional(Type.String()),
    countries: Type.Optional(Type.Array(Type.String())),
  },
  Strict,
);
export type Media = Static<typeof Media>;

export const Card = Type.Object(
  {
    id: Id,
    who: Type.Optional(TextRef),
    glyph: Type.Optional(Type.String()),
    title: Type.Optional(TextKey),
    body: TextKey,
    media: Type.Optional(Media),
    objectives: Type.Optional(Type.Array(Id)),
    tags: Type.Optional(Type.Array(Type.String())),
    sources: Type.Optional(Type.Array(Type.String())),
    ttl: Type.Optional(Type.Number()),
    then: Type.Optional(Type.Array(Action)),
  },
  Strict,
);
export type Card = Static<typeof Card>;

export const Item = Type.Object(
  {
    id: Id,
    type: lit(ITEM_TYPES),
    prompt: TextKey,
    options: Type.Optional(Type.Array(Type.Object({ text: TextKey, correct: Type.Optional(Type.Boolean()), id: Type.Optional(Id) }, Strict))),
    answer: Type.Optional(Type.Number()),
    tolerance: Type.Optional(Type.Number()),
    unit: Type.Optional(TextKey),
    /** matching: pairs of [left, right] keys; ordering: options in correct order. */
    pairs: Type.Optional(Type.Array(Type.Tuple([TextKey, TextKey]))),
    hotspots: Type.Optional(Type.Array(Type.Object({ id: Id, at: Vec2, r: Type.Number(), correct: Type.Optional(Type.Boolean()), label: Type.Optional(TextKey) }, Strict))),
    shuffle: Type.Optional(Type.Boolean()),
    hint: TextKey,
    explanation: Type.Optional(TextKey),
    objectives: Type.Array(Id, { minItems: 1 }),
    tags: Type.Optional(Type.Array(Type.String())),
    who: Type.Optional(TextRef),
  },
  Strict,
);
export type Item = Static<typeof Item>;

export const DialogueLine = Type.Object(
  {
    speaker: Type.Optional(Id),
    who: Type.Optional(TextRef),
    glyph: Type.Optional(Type.String()),
    text: TextRef,
    vo: Type.Optional(Type.String()),
    do: Type.Optional(Type.Array(Action)),
    options: Type.Optional(Type.Array(Type.Object({ text: TextRef, prime: Type.Optional(Type.Boolean()), when: Type.Optional(Cond), do: Type.Optional(Type.Array(Action)) }, Strict))),
  },
  Strict,
);
export type DialogueLine = Static<typeof DialogueLine>;

export const Dialogue = Type.Object(
  {
    id: Id,
    lines: Type.Array(DialogueLine, { minItems: 1 }),
    locked: Type.Optional(Type.Boolean()),
    ttl: Type.Optional(Type.Number()),
    endLabel: Type.Optional(TextKey),
    anchor: Type.Optional(Id),
    onEnd: Type.Optional(Type.Array(Action)),
  },
  Strict,
);
export type Dialogue = Static<typeof Dialogue>;

export const Poi = Type.Object(
  {
    id: Id,
    scene: Id,
    at: Point,
    radius: Type.Number(),
    title: TextKey,
    icon: Type.Optional(Type.String()),
    card: Type.Optional(Id),
    objectives: Type.Array(Id),
    spawn: Type.Optional(Type.Object({ spawn: Type.Optional(Type.String()), at: Type.Optional(Point), yaw: Type.Optional(Type.Number()) }, Strict)),
    items: Type.Optional(Type.Array(Id)),
  },
  Strict,
);
export type Poi = Static<typeof Poi>;

export const QuestStep = Type.Object(
  {
    id: Id,
    label: TextKey,
    target: Type.Optional(Target),
    when: Type.Optional(Cond),
    done: Cond,
    buttons: Type.Optional(Type.Array(Type.Object({ label: TextRef, icon: Type.Optional(Type.String()), style: Type.Optional(lit(['gold', 'teal', 'plain'] as const)), do: Type.Array(Action), when: Type.Optional(Cond) }, Strict))),
  },
  Strict,
);
export type QuestStep = Static<typeof QuestStep>;

export const Quest = Type.Object(
  {
    id: Id,
    title: TextKey,
    kicker: Type.Optional(TextKey),
    icon: Type.Optional(Type.String()),
    mode: lit(['nearest', 'ordered'] as const),
    steps: Type.Array(QuestStep, { minItems: 1 }),
    done: Cond,
    goal: Type.Object({ next: TextKey, done: TextKey, busy: Type.Optional(Type.Object({ when: Cond, text: TextKey }, Strict)), noTarget: Type.Optional(TextKey) }, Strict),
    progress: Type.Optional(Type.Object({ counter: Id, of: Type.Integer(), style: lit(['scarab', 'dots', 'diamonds'] as const) }, Strict)),
    guideButton: Type.Optional(TextKey),
    onComplete: Type.Optional(Type.Array(Action)),
    objectives: Type.Optional(Type.Array(Id)),
    scenes: Type.Optional(Type.Array(Id, { description: 'Show the quest card only in these scenes' })),
  },
  Strict,
);
export type Quest = Static<typeof Quest>;

export const GlyphAlphabet = Type.Object(
  {
    id: Id,
    font: Type.String(),
    signs: Type.Record(Type.String(), Type.Integer()),
    sounds: Type.Record(Type.String(), Type.String()),
    latin: Type.Record(Type.String(), Type.Union([Type.String(), Type.Array(Type.String())])),
    digraphs: Type.Record(Type.String(), Type.String()),
    arabic: Type.Record(Type.String(), Type.String()),
    max: Type.Integer(),
    collapseRepeats: Type.Array(Type.String()),
    title: TextKey,
    note: TextKey,
    footer: TextKey,
    empty: TextKey,
    saveLabel: TextKey,
    saved: TextKey,
    counterFlag: Type.Optional(Id),
  },
  Strict,
);
export type GlyphAlphabet = Static<typeof GlyphAlphabet>;

/* ---------------------------------------------------------------- manifest */

export const CurriculumRef = Type.Object(
  {
    country: Type.String({ pattern: '^[A-Z]{2}$' }),
    grade: Type.String(),
    subject: Type.String(),
    unit: Type.Optional(Type.String()),
    lesson: Type.String(),
    bookPages: Type.Optional(Type.Array(Type.String())),
  },
  Strict,
);
export type CurriculumRef = Static<typeof CurriculumRef>;

export const Budget = Type.Object({ downloadMB: Type.Number(), drawCalls: Type.Integer(), textureMB: Type.Number(), triangles: Type.Optional(Type.Integer()) }, Strict);

export const CollectionEntry = Type.Object(
  {
    title: TextRef,
    sub: Type.Optional(TextRef),
    subDone: Type.Optional(TextRef),
    icon: Type.Optional(Type.String()),
    done: Cond,
    go: Type.Optional(Type.Array(Action)),
    goWhen: Type.Optional(Cond),
    goLabel: Type.Optional(TextKey),
    keepGo: Type.Optional(Type.Boolean({ description: 'Keep the go button after done (rides)' })),
  },
  Strict,
);

export const Manifest = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    id: Id,
    version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$' }),
    engine: Type.String({ description: 'Engine semver range, e.g. ^0.1' }),
    title: TextKey,
    altTitle: Type.Optional(TextKey),
    summary: TextKey,
    kicker: Type.Optional(TextKey),
    subjects: Type.Array(Type.String(), { minItems: 1 }),
    grades: Type.Array(Type.String(), { minItems: 1 }),
    durationMinutes: Type.Integer({ minimum: 1, maximum: 60 }),
    objectives: Type.Array(Type.Object({ id: Id, text: TextKey, curriculum: Type.Optional(Type.Array(CurriculumRef)) }, Strict), { minItems: 1 }),
    curriculum: Type.Array(CurriculumRef),
    locales: Type.Array(Type.String(), { minItems: 2 }),
    defaultLocale: Type.String(),
    overlays: Type.Optional(Type.Array(Type.Object({ locale: Type.String(), path: Type.String() }, Strict))),
    startScene: Id,
    startPoi: Id,
    scenes: Type.Array(Type.String(), { minItems: 1 }),
    zones: Type.Optional(Type.Array(Type.Object({ id: Id, scene: Id, center: Vec2, streamRadius: Type.Number(), model: Type.Optional(Type.String()) }, Strict))),
    pois: Type.Array(Type.String()),
    quests: Type.Array(Type.String()),
    items: Type.Array(Type.String()),
    cards: Type.Array(Type.String()),
    dialogues: Type.Array(Type.String()),
    models: Type.Optional(Type.Array(Type.String())),
    glyphs: Type.Optional(Type.Array(Type.String())),
    vehicles: Type.Optional(Type.Array(Type.Object({ preset: Type.String() }, Strict))),
    characters: Type.Record(Type.String(), Type.Object({ name: TextKey, glyph: TextKey, color: Type.Optional(Color) }, Strict)),
    counters: Type.Array(Type.Object({ id: Id, scope: lit(['save', 'visit'] as const), of: Type.Optional(Type.Integer()) }, Strict)),
    flags: Type.Optional(Type.Array(Type.Object({ id: Id, scope: Type.Optional(lit(['save', 'visit'] as const)) }, Strict))),
    stamps: Type.Array(Type.Object({ id: Id, title: TextKey, color: Color, style: Type.Optional(lit(['planet', 'galaxy', 'seal'] as const)) }, Strict)),
    certificate: Type.Optional(Type.Object({ when: Cond, title: TextKey, text: TextKey }, Strict)),
    titles: Type.Optional(Type.Array(Type.Object({ id: Id, text: TextKey }, Strict))),
    collections: Type.Optional(
      Type.Object(
        {
          activities: Type.Optional(Type.Object({ title: TextKey, button: TextKey, sub: TextKey, entries: Type.Array(CollectionEntry) }, Strict)),
          log: Type.Optional(
            Type.Object(
              {
                title: TextKey,
                button: TextKey,
                sub: TextRef,
                sections: Type.Array(Type.Object({ title: TextKey, progress: Type.Optional(Type.Object({ counter: Id, of: Type.Integer() }, Strict)), entries: Type.Array(CollectionEntry) }, Strict)),
              },
              Strict,
            ),
          ),
        },
        Strict,
      ),
    ),
    intro: Type.Object(
      {
        story: Type.Array(TextKey),
        features: Type.Optional(Type.Array(Type.Object({ icon: Type.String(), text: TextKey }, Strict))),
        askName: Type.Boolean(),
        nameLabel: Type.Optional(TextKey),
        namePlaceholder: Type.Optional(TextKey),
        defaultName: TextKey,
        palette: Type.Optional(Type.Object({ label: TextKey, colors: Type.Array(Color), names: Type.Array(TextKey) }, Strict)),
        start: TextKey,
        notes: Type.Optional(Type.Array(TextKey)),
        controls: Type.Optional(Type.Object({ touch: TextKey, desk: TextKey }, Strict)),
        onStart: Type.Optional(Type.Array(Action)),
        onResume: Type.Optional(Type.Array(Action)),
      },
      Strict,
    ),
    theme: Type.Object(
      {
        preset: lit(['lapis', 'space'] as const),
        band: lit(['khayamiya', 'diamonds'] as const),
        background: Type.Optional(Color),
      },
      Strict,
    ),
    hud: Type.Object(
      {
        quest: Type.Optional(Id),
        panels: Type.Array(lit(PANELS)),
        toggles: Type.Optional(Type.Array(Type.Object({ id: Id, on: TextKey, off: TextKey, icon: Type.Optional(Type.String()), when: Cond, state: Cond, do: Type.Array(Action) }, Strict))),
        album: Type.Optional(Type.Object({ max: Type.Integer(), defaultCaption: TextKey, note: TextKey, empty: TextKey }, Strict)),
        wave: Type.Optional(Type.Boolean()),
      },
      Strict,
    ),
    prePost: Type.Optional(Type.Object({ pre: Type.Array(Id), post: Type.Array(Id) }, Strict)),
    budgets: Type.Object({ low: Budget, mid: Type.Optional(Budget), high: Type.Optional(Budget) }, Strict),
    sensitivity: Type.Array(Type.String()),
    credits: Type.Array(Type.Object({ role: TextKey, name: Type.String() }, Strict)),
    reviewStatus: lit(REVIEW_STATES),
    teacher: Type.Optional(Type.Object({ lessonPlan: Type.String(), worksheet: Type.Optional(Type.String()), answerKey: Type.Optional(Type.String()) }, Strict)),
    tags: Type.Optional(Type.Array(Type.String())),
  },
  Strict,
);
export type Manifest = Static<typeof Manifest>;

export const LicenseEntry = Type.Object(
  {
    path: Type.String(),
    title: Type.String(),
    sourceUrl: Type.String(),
    author: Type.String(),
    licence: Type.String(),
    licenceUrl: Type.String(),
    attribution: Type.String(),
    permit: Type.Optional(Type.String()),
  },
  Strict,
);
export const Licenses = Type.Object({ assets: Type.Array(LicenseEntry) }, Strict);
export type Licenses = Static<typeof Licenses>;

export const Overlay = Type.Object(
  {
    locale: Type.String(),
    base: Type.String(),
    strings: Type.Optional(Type.String()),
    exclude: Type.Optional(Type.Object({ pois: Type.Optional(Type.Array(Id)), items: Type.Optional(Type.Array(Id)), entities: Type.Optional(Type.Array(Id)) }, Strict)),
    curriculum: Type.Optional(Type.Array(CurriculumRef)),
    numerals: Type.Optional(lit(['arab', 'latn'] as const)),
    characters: Type.Optional(Type.Record(Type.String(), Type.Object({ name: TextKey, glyph: TextKey }, Strict))),
  },
  Strict,
);
export type Overlay = Static<typeof Overlay>;

export const Locale = Type.Record(Type.String(), Type.String());

export const SCHEMAS: Record<string, TSchema> = {
  manifest: Manifest,
  scene: Scene,
  poi: Poi,
  quest: Quest,
  item: Item,
  card: Card,
  dialogue: Dialogue,
  model: CompositeModel,
  glyphs: GlyphAlphabet,
  licenses: Licenses,
  overlay: Overlay,
  locale: Locale,
};
