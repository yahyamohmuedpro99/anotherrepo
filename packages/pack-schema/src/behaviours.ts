/**
 * The closed lists of everything a pack can declare. A pack that needs something not listed here asks for an
 * engine PR that adds a generic behaviour (with tests) — never a pack-level script.
 */

export const ACTIONS = [
  'show.toast',
  'show.dialogue',
  'show.card',
  'ask.item',
  'give.stamp',
  'give.title',
  'set.flag',
  'add.counter',
  'start.quest',
  'complete.quest',
  'quest.go',
  'set.timeOfDay',
  'go.scene',
  'travel.to',
  'vehicle.mount',
  'vehicle.dismount',
  'player.buff',
  'show.glyphs',
  'open.panel',
  'camera.flyTo',
  'photo.take',
  'play.vo',
  'play.sfx',
  'control.if',
  'control.delay',
  'hud.hint',
] as const;
export type ActionName = (typeof ACTIONS)[number];

export const TRIGGERS = ['enter', 'interact', 'tap'] as const;

export const ENTITY_KINDS = ['prop', 'npc', 'vehicle', 'pickup', 'photo-spot', 'ring', 'body', 'craft', 'label', 'effect'] as const;

export const MOTIONS = ['orbit', 'path', 'wander', 'spin', 'circle', 'bob', 'line', 'ellipse', 'anchor'] as const;

export const CONTROLLERS = ['walk', 'spacecraft', 'jetpack', 'orbit'] as const;

export const ITEM_TYPES = ['mcq', 'numeric', 'ordering', 'matching', 'hotspot'] as const;

export const PANELS = ['passport', 'activities', 'album', 'map', 'log', 'settings'] as const;

export const REVIEW_STATES = ['draft', 'in-review', 'changes-requested', 'approved', 'published'] as const;

/** Procedural model generators the engine provides. `gltf` loads a file; `composite` uses a pack model. */
export const MODEL_GENS = [
  'gltf',
  'composite',
  'part',
  'instances',
  'pyramid',
  'pyramid-simple',
  'strip',
  'sign',
  'human',
  'camel',
  'carriage',
  'balloon',
  'ship',
  'astronaut',
  'body',
  'orbit-line',
  'belt',
  'galaxy',
  'beacon',
  'scarab',
  'ring',
  'beams',
  'halo',
  'particles',
  'water',
  'light',
] as const;
export type ModelGen = (typeof MODEL_GENS)[number];

/** Procedural texture generators. Real textures (KTX2) replace them through `gltf` models. */
export const TEXTURE_GENS = [
  'sand',
  'ripple',
  'stone',
  'casing',
  'granite',
  'strata',
  'facade',
  'facade-windows',
  'tiles-triangles',
  'papyrus-art',
  'wicker',
  'balloon-panels',
  'regolith',
  'planet',
  'rings',
  'flag-stripes',
  'flag-usa',
  'radial-spot',
  'clouds',
  'halo',
] as const;

export const LEARNING_VERBS = [
  'launched',
  'entered-zone',
  'visited-poi',
  'viewed-card',
  'answered',
  'hint-used',
  'completed-quest',
  'took-photo',
  'earned-stamp',
  'completed',
  'abandoned',
] as const;
export type LearningVerb = (typeof LEARNING_VERBS)[number];
