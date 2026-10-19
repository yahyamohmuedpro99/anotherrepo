// Port of prototypes/silent-sphinx.html → packs/giza-plateau (BRIEF §16).
// Run: node tools/port/giza.mjs   (then: pnpm pack:check)
// Every line of content comes from the founder's prototype; new assessment items only restate facts the
// prototype already shows (ADR-0012) and are tagged needs-fact-check.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAU, fbm, r2, rng, smooth, strings, writePack } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'packs/giza-plateau');
const { S, ar, en } = strings();
const FC = 'needs-fact-check';

/* ---------------------------------------------------------------- ground (x = east, z = south, 1 unit = 1 m) */
function groundH(x, z) {
  const east = smooth(150, 280, x);
  const dx = x + 120, dz = z - 400, r = Math.sqrt(dx * dx + dz * dz);
  const desert = smooth(1040, 2100, r) * (1 - smooth(400, 1040, x));
  let h = -east * 20;
  h += (fbm(x * 0.00225, z * 0.00225) - 0.5) * 6.4 * (1 - east * 0.85);
  h += desert * (fbm(x * 0.0011 + 11.3, z * 0.0011 - 4.1) * 92 - 20);
  h += 12 * Math.exp(-((x + 340) * (x + 340) + (z - 360) * (z - 360)) / 200000);
  h += 10 * Math.exp(-((x + 880) * (x + 880) + (z - 990) * (z - 990)) / 50000);
  return h;
}
const terrainLayers = [
  { type: 'smooth', coord: 'x', from: 150, to: 280, amp: -20 },
  { type: 'fbm', freq: 0.00225, bias: -0.5, amp: 6.4, masks: [{ coord: 'x', from: 150, to: 280, base: 1, gain: -0.85 }] },
  { type: 'fbm', freq: 0.0011, offset: [11.3, -4.1], bias: -20 / 92, amp: 92, masks: [{ coord: 'r', center: [-120, 400], from: 1040, to: 2100 }, { coord: 'x', from: 400, to: 1040, base: 1, gain: -1 }] },
  { type: 'gauss', at: [-340, 360], amp: 12, width: 200000 },
  { type: 'gauss', at: [-880, 990], amp: 10, width: 50000 },
];

/* ---------------------------------------------------------------- strings: pack, intro, HUD */
S('pack.title', 'أبو الهول سكت', 'The Silent Sphinx');
S('pack.alt', 'The Silent Sphinx', 'أبو الهول سكت');
S('pack.kicker', 'هضبة الجيزة · وقت المغرب', 'Giza Plateau · Sunset');
S('pack.summary', 'رحلة على هضبة الجيزة بالمقاس الحقيقي: لمّ الجعارين الأربعة، اعرف الأهرامات وأبو الهول، واركب جمل وكارتة ومنطاد.', 'A real-scale trip across the Giza Plateau: find the four scarabs, learn about the pyramids and the Sphinx, ride a camel, a carriage and a balloon.');
S('intro.story1', 'أبو الهول بقاله خمسة وأربعين قرن بيتفرّج على الشمس وهي بتطلع على النيل. والليلة دي، فجأة كده، سكت.', 'For forty-five centuries the Sphinx has watched the sun rise over the Nile. Tonight it went quiet.');
S('intro.story2', 'عم حسن، أقدم جمّال في الهضبة، بيقول إن فيه أربع جعارين زُرق هم اللي شايلين صوته، والهوا طيّرهم حوالين الأهرامات. لمّهم ورجّعهم لأبو الهول، وشوف هيحصل إيه.', 'Amm Hassan, the oldest camel guide on the plateau, says four blue scarabs keep its voice, and the wind scattered them across the pyramids. Find them, bring them back to the Sphinx, and see what happens.');
S('feat.camel', 'اركب جمل', 'Ride a camel');
S('feat.cart', 'لف بالكارتة', 'Drive a carriage');
S('feat.balloon', 'طير بالمنطاد', 'Fly a balloon');
S('feat.photo', 'صوّر واعمل ألبوم', 'Take photos');
S('feat.cartouche', 'اسمك بالهيروغليفي', 'Your name in hieroglyphs');
S('intro.name', 'اسمك', 'Your name');
S('intro.namePh', 'مثلاً: نور', 'e.g. Nour');
S('intro.robe', 'لون الجلابية', 'Galabeya color');
S('intro.start', 'يلا، ادخل الجيزة', 'Enter Giza');
S('intro.defaultName', 'مسافر', 'Traveler');
S('intro.scale', 'الهضبة هنا بالمقاس الحقيقي تقريباً: المتر في اللعبة متر في الحقيقة.', 'The plateau is built close to real scale: one metre in the game is one metre in real life.');
S('intro.ctlTouch', 'الدراع عشان تمشي · اسحب عشان تبص حواليك · دوس على أي حد عشان تكلّمه', 'Joystick to walk · drag to look · tap someone to talk');
S('intro.ctlDesk', 'WASD عشان تمشي · اسحب بالماوس عشان تبص · E عشان تتفاعل · دوس على أي حد عشان تكلّمه', 'WASD to walk · drag to look · E to interact · click someone to talk');
const ROBES = ['#2f63b0', '#c4533c', '#239a8c', '#6e4a9e', '#d39b2f', '#3c8a48', '#ece4d2'];
const ROBE_NAMES = [['لازوردي', 'Lapis'], ['عقيقي', 'Carnelian'], ['فيروزي', 'Faience'], ['بنفسجي', 'Amethyst'], ['زعفراني', 'Saffron'], ['أخضر بردي', 'Papyrus'], ['أبيض', 'White']];
const robeNameKeys = ROBE_NAMES.map(([a, e], i) => S(`robe.${i}`, a, e));
S('hint.touch', '<b>الدراع</b> عشان تمشي، وزُقّه للآخر عشان تجري · <b>اسحب</b> عشان تبص · <b>صباعين</b> للزووم · <b>دوس على الأرض</b> تروح هناك · <b>الزرار الدهبي</b> تحت بيتغيّر حسب اللي جنبك', '<b>Stick</b> to walk, push all the way to run · <b>Drag</b> to look · <b>Pinch</b> to zoom · <b>Tap</b> the ground to walk there · the <b>gold button</b> changes with what is near you');
S('hint.desk', '<b>WASD</b> عشان تمشي · <b>Shift</b> عشان تجري · <b>E</b> تركب أو تتكلّم · <b>P</b> تصوّر · <b>M</b> الخريطة · <b>اسحب</b> عشان تبص · <b>العجلة</b> للزووم', '<b>WASD</b> to walk · <b>Shift</b> to run · <b>E</b> ride or talk · <b>P</b> photo · <b>M</b> map · <b>Drag</b> to look · <b>Scroll</b> to zoom');
S('hint.rideT', '<b>الدراع</b> عشان تسوق، وزُقّه للآخر عشان تسرّع · <b>انزل</b> من الزرار الدهبي', '<b>Stick</b> to steer, push all the way to speed up · <b>Get off</b> with the gold button');
S('hint.rideD', '<b>WASD</b> عشان تسوق · <b>Shift</b> عشان تسرّع · <b>E</b> عشان تنزل', '<b>WASD</b> to steer · <b>Shift</b> to speed up · <b>E</b> to get off');
S('hint.balloonT', '<b>فوق</b> عشان تولّع النار وتطلع · <b>تحت</b> عشان تنزل · <b>الدراع</b> عشان تتحرك · عدّي من <b>الحلقات الدهبي</b>', '<b>Up</b> fires the burner to rise · <b>Down</b> to sink · <b>Stick</b> to drift · fly through the <b>golden rings</b>');
S('hint.balloonD', '<b>Space</b> عشان تطلع · <b>C</b> عشان تنزل · <b>WASD</b> عشان تتحرك · <b>Shift</b> أسرع · عدّي من <b>الحلقات الدهبي</b>', '<b>Space</b> to rise · <b>C</b> to sink · <b>WASD</b> to drift · <b>Shift</b> faster · fly through the <b>golden rings</b>');
S('arrival', 'وصلت {place}. عم حسن مستنيك عند أبو الهول.', 'You arrived at {place}. Amm Hassan waits at the Sphinx.');
S('map.title', 'هضبة الجيزة', 'Giza Plateau');
S('map.note', 'دوس في أي حتة على الخريطة عشان تروح هناك', 'Tap anywhere on the map to go there');
S('show.on', 'الصوت والضوء: شغّال', 'Light show: on');
S('show.off', 'الصوت والضوء: مطفي', 'Light show: off');
S('title.guardian', 'حارس الجيزة', 'Guardian of Giza');
S('sphinx.fact', 'أبو الهول منحوت من نفس الحجر الجيري بتاع الهضبة. طوله حوالي ٧٣ متر وارتفاعه حوالي ٢٠ متر.', 'The Great Sphinx was carved from the plateau’s own limestone. It is about 73 m long and 20 m high.');
S('stamp.giza', 'صوت أبو الهول', 'The Sphinx’s voice');
S('stamp.pilot', 'طيار المنطاد', 'Balloon pilot');
S('stamp.photographer', 'مصوّر الهضبة', 'Plateau photographer');
S('photo.spotDone', 'صورة مميزة {n} من {m}', 'Special photo {n} of {m}');
S('balloon.rings', 'الحلقات {n} من ٦', 'rings {n}/6');
S('album.caption', 'هضبة الجيزة', 'Giza Plateau');
S('credits.prototype', 'النموذج الأول والقصة', 'Prototype and story');
S('credits.port', 'تحويل النموذج للمنصة', 'Port to the platform');
S('area.desert', 'الصحراء الغربية', 'The Western Desert');
S('area.plateau', 'هضبة الجيزة', 'Giza Plateau');

/* ---------------------------------------------------------------- characters */
const chars = {
  hassan: { name: S('char.hassan', 'عم حسن', 'Amm Hassan'), glyph: S('char.hassan.g', 'ح', 'H') },
  abu: { name: S('char.abu', 'أبو علي', 'Abu Ali'), glyph: S('char.abu.g', 'ع', 'A') },
  sayed: { name: S('char.sayed', 'عم سيد', 'Amm Sayed'), glyph: S('char.sayed.g', 'س', 'S') },
  mona: { name: S('char.mona', 'كابتن منى', 'Captain Mona'), glyph: S('char.mona.g', 'م', 'M') },
  fathi: { name: S('char.fathi', 'عم فتحي العرقسوس', 'Amm Fathi, licorice'), glyph: S('char.fathi.g', 'ف', 'F') },
  tourist: { name: S('char.tourist', 'سايح', 'Tourist'), glyph: S('char.tourist.g', 'س', 'T') },
  sphinx: { name: S('char.sphinx', 'أبو الهول', 'The Sphinx'), glyph: S('char.sphinx.g', 'أ', 'S') },
  fact: { name: S('char.fact', 'معلومة', 'Did you know?'), glyph: S('char.fact.g', '!', '!') },
};

/* ---------------------------------------------------------------- objectives */
const objectives = [
  { id: 'obj.pyramids', text: S('obj.pyramids', 'يعرف أهرامات الجيزة التلاتة والملوك اللي بنوها: خوفو وخفرع ومنكاورع.', 'Identify the three Giza pyramids and the kings who built them: Khufu, Khafre and Menkaure.') },
  { id: 'obj.scale', text: S('obj.scale', 'يوصف حجم الهرم الأكبر وليه ارتفاعه اتغيّر مع الزمن.', 'Describe the size of the Great Pyramid and why its height changed over time.') },
  { id: 'obj.sphinx', text: S('obj.sphinx', 'يوصف أبو الهول: منحوت في صخر الهضبة وبيبص ناحية الشرق.', 'Describe the Great Sphinx: carved from the plateau’s rock and facing east.') },
  { id: 'obj.crafts', text: S('obj.crafts', 'يربط مواد وحِرف بمصر القديمة: البردي، والجرانيت من أسوان، ومركب خوفو.', 'Link materials and crafts to ancient Egypt: papyrus, granite from Aswan and Khufu’s boat.') },
];
const curriculum = [{ country: 'EG', grade: 'P4', subject: 'social-studies', lesson: 'TODO: map to unit/lesson/page (open question 4)' }];

/* ---------------------------------------------------------------- scarabs (quest) */
const SCARABS = [
  { id: 'khufu', x: 0, z: -134, where: ['الوش الشمالي لهرم خوفو', "Khufu's north face"],
    lore: ['الهرم الأكبر كان طوله حوالي ١٤٦ متر لما خلص، حوالي سنة ٢٥٦٠ قبل الميلاد. وفضل أطول حاجة بناها البني آدمين أكتر من ٣٨٠٠ سنة.', 'The Great Pyramid rose about 146 metres when it was finished, around 2560 BC. For more than 3,800 years nothing built by people stood taller.'] },
  { id: 'khafre', x: -192, z: 344, where: ['معبد خفرع', "Khafre's temple"],
    lore: ['هرم خفرع شكله أطول من هرم أبوه خوفو، بس ده عشان مبني على أرض أعلى. وقرب القمة لسه تقدر تشوف حجر الكسوة الأبيض الناعم اللي كان مغطّي التلات أهرامات.', "Khafre's pyramid looks taller than his father Khufu's because it stands on higher ground. Near its tip you can still see the smooth white casing stones that once covered all three pyramids."] },
  { id: 'menkaure', x: -592, z: 822, where: ['ملكات منكاورع', "Menkaure's queens"],
    lore: ['منكاورع بنى أصغر هرم في التلاتة الكبار، طوله الأصلي حوالي ٦٥ متر. والتلات أهرامات الصغيرين اللي جنبه بيسمّوهم أهرامات الملكات.', 'Menkaure built the smallest of the three great pyramids, originally about 65 metres high. The three little pyramids beside it are known as the Queens’ Pyramids.'] },
  { id: 'boat', x: 0, z: 146, where: ['حفرة مركب خوفو', "Khufu's boat pit"],
    lore: ['سنة ١٩٥٤ لقوا هنا حفرة مقفولة فيها مركب خوفو المعمولة من خشب الأرز، طولها حوالي ٤٣ متر ومفكوكة لأكتر من ألف حتة. وسنة ٢٠٢١ اتنقلت على بعضها للمتحف المصري الكبير.', "In 1954 a sealed pit here held Khufu's cedar boat, about 43 metres long, taken apart into more than a thousand pieces. In 2021 it was moved, whole, to the Grand Egyptian Museum."] },
];
S('scarab.who', 'جعران {n} من ٤: {where}', 'Scarab {n} of 4 · {where}');
S('scarab.allWho', 'الأربعة كاملين', 'All four scarabs');
S('scarab.all', 'كده لمّيتهم كلهم. رجّعهم لعم حسن عند أبو الهول.', 'That is all of them. Take them back to Amm Hassan at the Sphinx.');
S('scarab.ask', 'الجعران بيسألك', 'The scarab asks');

// items built only from the lore above (ADR-0012)
const ITEMS = {
  'item.khufu': { obj: ['obj.scale'], prompt: ['الهرم الأكبر كان طوله قد إيه تقريباً لما خلص؟', 'About how tall was the Great Pyramid when it was finished?'], opts: [['حوالي ١٤٦ متر', 'About 146 metres', true], ['حوالي ٤٦ متر', 'About 46 metres'], ['حوالي ٤٦٠ متر', 'About 460 metres']], hint: ['افتكر الجعران قال إيه: أكتر من ١٠٠ متر بكتير، وأقل من ٢٠٠.', 'Remember what the scarab said: well over 100 metres, but under 200.'] },
  'item.khafre': { obj: ['obj.pyramids'], prompt: ['ليه هرم خفرع شكله أطول من هرم خوفو؟', "Why does Khafre's pyramid look taller than Khufu's?"], opts: [['عشان مبني على أرض أعلى', 'It stands on higher ground', true], ['عشان أعرض منه', 'It is wider'], ['عشان اتبنى بعده بألف سنة', 'It was built a thousand years later']], hint: ['بص على الأرض تحت الهرمين.', 'Look at the ground under the two pyramids.'] },
  'item.menkaure': { obj: ['obj.pyramids'], prompt: ['مين بنى أصغر هرم في الأهرامات التلاتة الكبار؟', 'Who built the smallest of the three great pyramids?'], opts: [['منكاورع', 'Menkaure', true], ['خوفو', 'Khufu'], ['خفرع', 'Khafre']], hint: ['إنت واقف جنب الهرم ده دلوقتي.', 'You are standing next to that pyramid right now.'] },
  'item.boat': { obj: ['obj.crafts'], prompt: ['لقوا إيه في الحفرة المقفولة جنب الهرم الأكبر سنة ١٩٥٤؟', 'What was found in the sealed pit beside the Great Pyramid in 1954?'], opts: [['مركب خوفو من خشب الأرز', "Khufu's cedar-wood boat", true], ['تمثال دهب', 'A golden statue'], ['مكتبة بردي', 'A library of papyrus']], hint: ['الحفرة دي طولها حوالي ٤٣ متر… زي حاجة بتمشي في النيل.', 'The pit is about 43 metres long… like something that sails on the Nile.'] },
  'item.sphinx': { obj: ['obj.sphinx'], prompt: ['أبو الهول بيبص ناحية أنهي اتجاه؟', 'Which direction does the Sphinx face?'], opts: [['الشرق', 'East', true], ['الغرب', 'West'], ['الشمال', 'North']], hint: ['هو بيتفرّج على الشمس وهي بتطلع على النيل.', 'It watches the sun rise over the Nile.'] },
  'item.papyrus': { obj: ['obj.crafts'], prompt: ['المصريين القدام عملوا إيه من نبات البردي؟', 'What did ancient Egyptians make from the papyrus plant?'], opts: [['ورق', 'Paper', true], ['عيش', 'Bread'], ['طوب', 'Bricks']], hint: ['عم سيد بيكتب عليه الأسماء بالهيروغليفي.', 'Amm Sayed writes names on it in hieroglyphs.'] },
  'item.granite': { obj: ['obj.crafts'], prompt: ['الجرانيت الأحمر اللي في معبد الوادي بتاع خفرع جاي منين؟', "Where did the red granite of Khafre's Valley Temple come from?"], opts: [['أسوان', 'Aswan', true], ['إسكندرية', 'Alexandria'], ['سينا', 'Sinai']], hint: ['مكان في جنوب مصر، على بُعد حوالي ٨٠٠ كيلو.', 'A place in the south of Egypt, about 800 km away.'] },
};
const numericItem = { id: 'item.height', type: 'numeric', prompt: S('item.height.q', 'الهرم الأكبر كان ارتفاعه الأصلي كام متر؟ (اكتب رقم)', 'How tall was the Great Pyramid originally, in metres? (type a number)'), answer: 146.6, tolerance: 2, unit: S('unit.m', 'متر', 'm'), hint: S('item.height.h', 'رقم بين ١٤٠ و١٥٠.', 'A number between 140 and 150.'), objectives: ['obj.scale'], tags: [FC] };
const items = { 'item.height': numericItem };
for (const [id, it] of Object.entries(ITEMS)) {
  items[id] = {
    id,
    type: 'mcq',
    prompt: S(`${id}.q`, it.prompt[0], it.prompt[1]),
    options: it.opts.map(([a, e, c], i) => ({ text: S(`${id}.o${i}`, a, e), ...(c ? { correct: true } : {}), id: `${id}.o${i}` })),
    hint: S(`${id}.h`, it.hint[0], it.hint[1]),
    objectives: it.obj,
    tags: [FC],
  };
}
const scarabItem = { khufu: 'item.khufu', khafre: 'item.khafre', menkaure: 'item.menkaure', boat: 'item.boat' };

/* ---------------------------------------------------------------- dialogues */
const dialogues = {};
const line = (speaker, key, a, e, extra = {}) => ({ speaker, text: S(key, a, e), ...extra });
dialogues['hassan-intro'] = {
  id: 'hassan-intro', anchor: 'npc.hassan',
  lines: [
    line('hassan', 'hassan.intro.1', 'أهلاً يا حبيبي! أنا حسن. بقالي أربعين سنة بلف بالجمال حوالين الحجارة دي، والليلة دي أبو الهول سكت خالص.', "Ahlan ya habibi! I'm Hassan. Forty years I've walked camels around these stones, and tonight the Sphinx went quiet."),
    line('hassan', 'hassan.intro.2', 'جدي الله يرحمه كان بيقول إن فيه أربع جعارين زُرق هم اللي شايلين صوته. الهوا طيّرهم: واحد عند الوش الشمالي لهرم خوفو، وواحد في معبد خفرع، وواحد عند ملكات منكاورع الصغيرين، وواحد عند حفرة مركب خوفو.', "My grandfather said four blue scarabs keep its voice. The wind scattered them: one at Khufu's north face, one in Khafre's temple, one by Menkaure's little queens, and one at Khufu's boat pit."),
    line('hassan', 'hassan.intro.3', 'الهضبة كبيرة يا ابني، دي بالمقاس الحقيقي! لو تعبت من المشي، اركب جمل ولا كارتة، ولو عايز تشوفها كلها مرة واحدة، كابتن منى عندها منطاد ورا معبد الوادي.', 'The plateau is big, my son, this is real size! If your feet get tired, ride a camel or a carriage. And if you want to see it all at once, Captain Mona has a balloon behind the Valley Temple.'),
    line('hassan', 'hassan.intro.4', 'امشي ورا النور الأزرق اللي طالع في السما، ورجّعهم كلهم هنا. يلا قبل الشمس ما تغيب!', 'Follow the blue lights in the sky and bring all four back here. Yalla, before the sun sets!'),
  ],
};
S('hassan.partial', 'معاك {n} من ٤. {hint} أبو الهول مستنيك.', 'You have {n} of 4. {hint} The Sphinx is waiting.');
dialogues['hassan-partial'] = { id: 'hassan-partial', anchor: 'npc.hassan', lines: [{ speaker: 'hassan', text: { key: 'hassan.partial', params: { n: { counter: 'scarabs' }, hint: { guide: 'voice' } } } }] };
dialogues['hassan-done'] = { id: 'hassan-done', anchor: 'npc.hassan', lines: [line('hassan', 'hassan.done', 'شفت عرض الصوت والضوء؟ المرة الجاية هات صاحبك معاك، الهضبة أحلى بالصحبة.', 'Did you see the light show? Bring a friend next time. The plateau is better with company.')] };
// The finale: knowledge unlocks the Sphinx's voice (it asks which way it faces).
dialogues['finale-1'] = {
  id: 'finale-1', locked: true, anchor: 'npc.hassan',
  lines: [line('hassan', 'finale.1', 'يا سلام… الأربعة! ارفعهم ناحية أبو الهول.', 'Ya salaam... all four! Hold them up toward the Sphinx.', { do: [{ do: 'set.flag', flag: 'finale' }] })],
  onEnd: [{ do: 'ask.item', item: 'item.sphinx', onCorrect: [{ do: 'show.dialogue', dialogue: 'finale-2' }] }],
};
dialogues['finale-2'] = {
  id: 'finale-2', locked: true, endLabel: 'engine.finish',
  lines: [
    line('sphinx', 'finale.2', 'بقالي أربع تلاف وخمسمية سنة بتفرّج على الشمس وهي طالعة على النيل. ملوك جم بالدهب، ومسافرين جم بالأسئلة.', 'For four thousand five hundred years I have watched the sun rise over the Nile. Kings came with gold. Travelers came with questions.', { do: [{ do: 'set.timeOfDay', value: 'night' }] }),
    line('sphinx', 'finale.3', 'وإنت جيت بأربع جعارين صغيرين ورجلين تعبانين. وده كفاية. هتكلّم تاني.', 'You came with four small scarabs and very tired feet. That is enough. I will speak again.'),
    line('sphinx', 'finale.4', 'روح يا حارس الجيزة. الحجارة هتنوّر عشانك الليلة. هات صحابك يتفرّجوا.', 'Go, Guardian of Giza. The stones will light up for you tonight. Bring your friends to see them.'),
  ],
  onEnd: [
    { do: 'set.flag', flag: 'done' },
    { do: 'give.title', title: 'guardian' },
    { do: 'give.stamp', stamp: 'giza' },
    { do: 'control.delay', seconds: 0.7, then: [{ do: 'show.toast', text: 'sphinx.fact', ms: 8000 }] },
  ],
};
S('abu.1', 'أهلاً وسهلاً! تشرب شاي بالنعناع؟ أحلى شاي في نزلة السمان.', "Ahlan! Shai bel na'na'? The best mint tea in Nazlet el-Semman.");
S('abu.done', 'بيقولوا إنك صحّيت أبو الهول. الشاي ببلاش للحراس يا باشا.', 'They say you woke the Sphinx. Tea is free for guardians, ya basha.');
S('abu.all', 'معاك الأربعة! اجري على أبو الهول، عم حسن مستنيك.', 'You have all four scarabs! Hurry to the Sphinx, Amm Hassan is waiting.');
S('abu.hint', '{hint}', '{hint}');
S('opt.tea', 'اشرب شاي بالنعناع', 'Drink mint tea');
S('opt.noThanks', 'لا شكراً', 'No thanks');
S('tea.done', 'شربت شاي بالنعناع! هتجري أسرع لمدة دقيقة ونص.', 'You drank mint tea! You will run faster for a minute and a half.');
const abuFollow = [{ do: 'control.if', when: { not: { flag: 'done' } }, then: [{ do: 'control.delay', seconds: 0.35, then: [{ do: 'show.dialogue', dialogue: 'abu-follow' }] }] }];
const teaOptions = [
  { text: 'opt.tea', prime: true, do: [{ do: 'player.buff', runSpeed: 13, seconds: 90 }, { do: 'set.flag', flag: 'tea' }, { do: 'show.toast', text: 'tea.done', kind: 'gold', ms: 5000 }, ...abuFollow] },
  { text: 'opt.noThanks', do: abuFollow },
];
dialogues['abu'] = { id: 'abu', anchor: 'npc.abu', lines: [{ speaker: 'abu', text: 'abu.1', options: teaOptions }] };
dialogues['abu-done'] = { id: 'abu-done', anchor: 'npc.abu', lines: [{ speaker: 'abu', text: 'abu.done', options: teaOptions }] };
dialogues['abu-follow'] = { id: 'abu-follow', anchor: 'npc.abu', ttl: 14, lines: [{ speaker: 'abu', text: { key: 'abu.hint', params: { hint: { guide: 'voice' } } } }] };
dialogues['abu-all'] = { id: 'abu-all', anchor: 'npc.abu', ttl: 14, lines: [{ speaker: 'abu', text: 'abu.all' }] };
S('sayed.1', 'أهلاً! البردي ده نبات كان بيطلع على شط النيل، والمصريين القدام عملوا منه ورق من حوالي خمس تلاف سنة. تحب أكتبلك اسمك بالهيروغليفي في خرطوش زي الملوك؟', 'Ahlan! Papyrus is a plant that grew along the Nile, and ancient Egyptians made paper from it about five thousand years ago. Shall I write your name in hieroglyphs inside a cartouche, like a king?');
S('opt.cartouche', 'اكتب اسمي بالهيروغليفي', 'Write my name in hieroglyphs');
S('opt.later', 'بعدين', 'Later');
dialogues['sayed'] = { id: 'sayed', anchor: 'npc.sayed', lines: [{ speaker: 'sayed', text: 'sayed.1', options: [{ text: 'opt.cartouche', prime: true, do: [{ do: 'show.glyphs', alphabet: 'hieroglyphs' }] }, { text: 'opt.later' }] }] };
S('mona.1', 'أهلاً يا كابتن! في الحقيقة رحلات المنطاد في مصر بتطير في الأقصر وقت الشروق، بس النهارده عاملين رحلة مخصوص فوق الجيزة. «فوق» بتولّع النار وتطلّعك، و«تحت» بتنزّلك. وحاول تعدّي من الحلقات الدهبي الست.', 'Ahlan, captain! In real life Egypt’s balloon flights take off in Luxor at sunrise, but today we have a special flight over Giza. Up fires the burner, Down lets you sink. Try to fly through all six golden rings.');
S('opt.fly', 'يلا نطير', "Let's fly");
dialogues['mona'] = { id: 'mona', anchor: 'npc.mona', lines: [{ speaker: 'mona', text: 'mona.1', options: [{ text: 'opt.fly', prime: true, do: [{ do: 'vehicle.mount', entity: 'veh.balloon' }] }, { text: 'opt.later' }] }] };
dialogues['fathi'] = { id: 'fathi', anchor: 'npc.fathi', ttl: 16, lines: [line('fathi', 'fathi.1', 'عرقسوس شفا وخمير! البياعين بيخبّطوا الصاجات النحاس كده عشان الناس تسمعهم من بعيد وتعرف إنهم جايين.', 'Licorice, cool and fresh! Sellers clack these brass cymbals so people hear them coming from far away.')] };
const TOUR = [
  ['واو! الهرم ده أكبر بكتير من ما كنت متخيّل.', 'Wow! The pyramid is much bigger than I imagined.'],
  ['بيقولوا الهرم الأكبر فيه حوالي ٢٫٣ مليون حجر. مين عدّهم؟!', 'They say the Great Pyramid has about 2.3 million blocks. Who counted them?!'],
  ['حد يصوّرني صورة؟ الإضاءة دلوقتي تحفة.', 'Could someone take my photo? The light is perfect right now.'],
  ['أنا جاي من آخر الدنيا مخصوص عشان أشوف أبو الهول!', 'I came from the other side of the world just to see the Sphinx!'],
  ['الشمس هنا وقت المغرب ولا في الأحلام.', 'Sunset here is like a dream.'],
];
TOUR.forEach(([a, e], i) => (dialogues[`tourist-${i}`] = { id: `tourist-${i}`, ttl: 10, lines: [line('tourist', `tourist.${i}`, a, e)] }));
for (const sc of SCARABS) {
  const where = S(`scarab.${sc.id}.where`, sc.where[0], sc.where[1]);
  dialogues[`scarab-${sc.id}`] = {
    id: `scarab-${sc.id}`,
    locked: true,
    lines: [{ who: { key: 'scarab.ask', params: {} }, glyph: 'scarab', text: S(`scarab.${sc.id}.lore`, sc.lore[0], sc.lore[1]) }],
    onEnd: [{ do: 'ask.item', item: scarabItem[sc.id], onCorrect: [{ do: 'add.counter', counter: 'scarabs', value: sc.id }, { do: 'show.dialogue', dialogue: `scarab-${sc.id}-got` }] }],
  };
  dialogues[`scarab-${sc.id}-got`] = {
    id: `scarab-${sc.id}-got`,
    ttl: 20,
    lines: [{ who: { key: 'scarab.who', params: { n: { counter: 'scarabs' }, where: { text: where } } }, glyph: 'scarab', text: { key: 'scarab.got', params: { hint: { guide: 'voice' } } } }],
    onEnd: [{ do: 'control.if', when: { counter: 'scarabs', gte: 4 }, then: [{ do: 'show.dialogue', dialogue: 'scarab-all' }] }],
  };
}
S('scarab.got', 'الجعران نوّر في إيدك! {hint}', 'The scarab glows in your hand! {hint}');
dialogues['scarab-all'] = { id: 'scarab-all', ttl: 24, lines: [{ who: 'scarab.allWho', glyph: 'scarab', text: 'scarab.all' }] };

/* ---------------------------------------------------------------- areas and evidence cards */
const AREAS = [
  { id: 'khufu', en: 'Great Pyramid of Khufu', ar: 'الهرم الأكبر · خوفو', x: 0, z: 0, r: 200, f: ['الهرم الأكبر قاعدته حوالي ٢٣٠ متر من كل ناحية، وكان ارتفاعه ١٤٦٫٦ متر. النهارده حوالي ١٣٨ متر بس، عشان القمة وحجر الكسوة الأملس اتشالوا. والعمود اللي فوق متحط عشان يورّي الارتفاع الأصلي كان لحد فين.', 'The Great Pyramid is about 230 m along each side and was 146.6 m tall. Today it is about 138 m, because its tip and smooth casing stones were taken away. The pole on top shows how high the original tip reached.'], obj: ['obj.scale', 'obj.pyramids'] },
  { id: 'khafre', en: 'Pyramid of Khafre', ar: 'هرم خفرع', x: -328, z: 344, r: 190, f: ['هرم خفرع قاعدته حوالي ٢١٥ متر، وارتفاعه الأصلي كان ١٤٣٫٥ متر. زاويته أشد من خوفو شوية، عشان كده شكله مدبّب أكتر.', 'Khafre’s pyramid is about 215 m wide and was originally 143.5 m tall. Its sides are a little steeper than Khufu’s, so it looks sharper.'], obj: ['obj.pyramids'] },
  { id: 'menkaure', en: 'Pyramid of Menkaure', ar: 'هرم منكاورع', x: -590, z: 744, r: 110, f: ['شايف الشق الكبير في الوش الشمالي لهرم منكاورع؟ سنة ١١٩٦ واحد من الحكام حاول يهدّ الأهرامات. اشتغلوا شهور، وفي الآخر استسلموا وسابوا الشق ده بس.', 'See the big gash in the north face of Menkaure’s pyramid? In 1196 a ruler tried to tear the pyramids down. His workers dug for months, then gave up and left only this scar.'], obj: ['obj.pyramids'] },
  { id: 'queens-m', en: 'The Queens’ Pyramids', ar: 'أهرامات الملكات', x: -584, z: 864, r: 110 },
  { id: 'queens-k', en: 'The Queens’ Pyramids', ar: 'أهرامات الملكات', x: 176, z: 44, r: 60, f: ['الأهرامات الصغيرة دي اتبنت لملكات الملك خوفو. كانت أصغر بكتير، وأغلب حجرها الخارجي اتشال مع الزمن.', 'These small pyramids were built for King Khufu’s queens. Most of their outer stone was taken away over the centuries.'], obj: ['obj.pyramids'] },
  { id: 'boat', en: 'Khufu’s Boat Pit', ar: 'حفرة مركب خوفو', x: 0, z: 146, r: 28 },
  { id: 'west', en: 'Western Cemetery', ar: 'الجبانة الغربية', x: -224, z: -36, r: 120, f: ['المصاطب دي مقابر لكبار الموظفين والنبلا اللي عاشوا أيام بناة الأهرامات. كلمة «مصطبة» نفسها جاية من شكلها اللي شبه الدكّة.', 'These mastabas are tombs of officials and nobles from the age of the pyramid builders. "Mastaba" is the Arabic word for a bench, which is what they look like.'], obj: ['obj.pyramids'] },
  { id: 'sphinx', en: 'The Great Sphinx', ar: 'أبو الهول', x: 340, z: 432, r: 80, f: ['أبو الهول طوله حوالي ٧٣ متر وارتفاعه ٢٠ متر، ومنحوت في صخر الهضبة نفسها، وبيبص ناحية الشرق بالظبط. مناخيره مكسورة من قرون، وحتة من دقنه موجودة النهارده في المتحف البريطاني في لندن.', 'The Sphinx is about 73 m long and 20 m high, carved from the plateau’s own rock, and it faces due east. Its nose has been broken for centuries, and a piece of its beard is in the British Museum in London.'], obj: ['obj.sphinx'] },
  { id: 'valley', en: 'Valley Temple of Khafre', ar: 'معبد الوادي', x: 336, z: 500, r: 40, f: ['معبد الوادي بتاع خفرع جدرانه من الحجر الجيري ومكسية ببلوكات جرانيت أحمر جاية من أسوان، على بُعد حوالي ٨٠٠ كيلو.', 'Khafre’s Valley Temple has limestone walls cased in red granite blocks brought from Aswan, about 800 km away.'], obj: ['obj.crafts'] },
  { id: 'pad', en: 'Balloon field', ar: 'ساحة المنطاد', x: 440, z: 620, r: 40 },
  { id: 'nazlet', en: 'Nazlet el-Semman', ar: 'نزلة السمان', x: 676, z: 448, r: 270, f: ['نزلة السمان قرية على حافة الهضبة، وأهلها شغالين مع الخيل والجمال والسياحة من أجيال.', 'Nazlet el-Semman is a village at the edge of the plateau. Its families have worked with horses, camels and visitors for generations.'] },
  { id: 'pano', en: 'Panorama Point', ar: 'البانوراما', x: -860, z: 960, r: 96, f: ['من البانوراما تقدر تشوف التلات أهرامات ورا بعض في صورة واحدة. روح للعلامة الدهبي وصوّر!', 'From Panorama Point you can see all three pyramids lined up in one view. Find the golden marker and take a photo!'] },
];
const cards = {};
for (const a of AREAS) {
  S(`area.${a.id}`, a.ar, a.en);
  if (a.f) cards[`area-${a.id}`] = { id: `area-${a.id}`, who: 'char.fact', glyph: '!', body: S(`card.area.${a.id}`, a.f[0], a.f[1]), objectives: a.obj ?? [], tags: [FC], ttl: 24 };
}

/* ---------------------------------------------------------------- POIs (learning places, QR targets) */
const poiSpawn = (x, z) => ({ at: [x, z] });
const POIS = [
  { id: 'poi.khufu', area: 'khufu', at: [0, 0], r: 200, spawn: [146, -142], obj: ['obj.scale', 'obj.pyramids'], items: ['item.khufu', 'item.height'] },
  { id: 'poi.khafre', area: 'khafre', at: [-328, 344], r: 190, spawn: [-300, 494], obj: ['obj.pyramids'], items: ['item.khafre'] },
  { id: 'poi.menkaure', area: 'menkaure', at: [-590, 744], r: 110, spawn: [-492, 744], obj: ['obj.pyramids'], items: ['item.menkaure'] },
  { id: 'poi.boat', area: 'boat', at: [0, 146], r: 28, spawn: [30, 160], obj: ['obj.crafts'], items: ['item.boat'] },
  { id: 'poi.west', area: 'west', at: [-224, -36], r: 120, spawn: [-232, -176], obj: ['obj.pyramids'], items: [] },
  { id: 'poi.sphinx', area: 'sphinx', at: [340, 432], r: 80, spawn: [414, 396], obj: ['obj.sphinx'], items: ['item.sphinx'] },
  { id: 'poi.valley', area: 'valley', at: [336, 500], r: 40, spawn: [380, 520], obj: ['obj.crafts'], items: ['item.granite'] },
  { id: 'poi.nazlet', area: 'nazlet', at: [676, 448], r: 270, spawn: [488, 524], obj: ['obj.crafts'], items: ['item.papyrus'] },
  { id: 'poi.pano', area: 'pano', at: [-860, 960], r: 96, spawn: [-836, 972], obj: ['obj.pyramids'], items: [] },
];
const pois = {};
for (const p of POIS) {
  const card = cards[`area-${p.area}`] ? `area-${p.area}` : undefined;
  pois[p.id] = { id: p.id, scene: 'plateau', at: p.at, radius: p.r, title: `area.${p.area}`, ...(card ? { card } : {}), objectives: p.obj, spawn: poiSpawn(...p.spawn), items: p.items };
}

/* ---------------------------------------------------------------- the world */
const entities = [];
const E = (e) => (entities.push(e), e);
const materials = {
  sand: { color: '#cdb084', roughness: 1 },
  road: { color: '#5a534d', roughness: 0.95 },
  lime: { map: { gen: 'strata', seed: 5, repeat: [2, 1] }, roughness: 0.95 },
  post: { color: '#4a3b2c', roughness: 0.9 },
  house: { map: { gen: 'facade', seed: 23, repeat: [1, 1] }, emissiveMap: { gen: 'facade-windows', seed: 23, repeat: [1, 1] }, emissive: '#ffc978', roughness: 0.92, night: { intensity: 1.3 } },
  white: { color: '#ffffff', roughness: 0.6 },
  rock: { color: '#ffffff', roughness: 1, flatShading: true },
  'palm-trunk': { color: '#7a5c3e', roughness: 1, flatShading: true },
  'palm-crown': { color: '#4c7a33', roughness: 0.9, flatShading: true, doubleSide: true },
  gem: { map: { gen: 'tiles-triangles', seed: 91, repeat: [14, 2] }, roughness: 0.6, emissive: '#ffd9a0', night: { intensity: 0.7 } },
};

// roads and paths
E({ id: 'road', kind: 'prop', model: { gen: 'strip', material: 'road', params: { from: [472, -900], to: [472, 1700], width: 14, lift: 0.15, segments: 160 } } });
{
  const items = [];
  for (let z = -880; z < 1680; z += 14) items.push({ at: [472, r2(groundH(472, z + 3) + 0.2), z + 3] });
  E({ id: 'road-dashes', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'box', args: [0.3, 0.06, 6], material: { type: 'basic', color: '#d9cfb8', transparent: true, opacity: 0.6 }, shadow: false }, items } });
}
E({ id: 'path-1', kind: 'prop', model: { gen: 'strip', material: 'sand', params: { from: [472, -150], to: [130, -150], width: 7, lift: 0.1, segments: 40 } } });
E({ id: 'path-2', kind: 'prop', model: { gen: 'strip', material: 'sand', params: { from: [400, 448], to: [472, 448], width: 9, lift: 0.1, segments: 12 } } });

// pyramids
const solids = []; // for the rock scatter (same exclusion as the prototype)
const PYR = [
  { key: 'khufu', name: ['خوفو', 'Khufu'], x: 0, z: 0, half: 115.15, H: 146.6, hTop: 138.5, layers: 100, mast: true, show: true, seed: 3 },
  { key: 'khafre', name: ['خفرع', 'Khafre'], x: -328, z: 344, half: 107.65, H: 143.5, hTop: 136.4, layers: 100, casingFrom: 96, show: true, seed: 5 },
  { key: 'menkaure', name: ['منكاورع', 'Menkaure'], x: -590, z: 744, half: 52, H: 65.5, hTop: 61, layers: 46, granite: 7, gash: true, show: true, seed: 7 },
  { key: 'q1', x: 176, z: -12, half: 24.5, H: 30, hTop: 21, layers: 16, seed: 11 },
  { key: 'q2', x: 176, z: 44, half: 24.5, H: 30, hTop: 19, layers: 15, seed: 13 },
  { key: 'q3', x: 176, z: 100, half: 23, H: 29, hTop: 25, layers: 18, seed: 17 },
  { key: 'q4', x: -524, z: 864, half: 22, H: 28, hTop: 24, layers: 18, seed: 19 },
  { key: 'q5', x: -584, z: 864, half: 16, H: 21, hTop: 19, layers: 4, seed: 23, tile: 6 },
  { key: 'q6', x: -640, z: 864, half: 16, H: 21, hTop: 19, layers: 4, seed: 29, tile: 6 },
];
for (const p of PYR) {
  const { key, name, x, z, ...params } = p;
  const label = name ? { text: S(`mon.${key}`, name[0], name[1]), style: 'monument', min: 260, max: 2800, y: p.hTop + 12 } : undefined;
  E({ id: `pyr.${key}`, kind: 'prop', at: [x, z], model: { gen: 'pyramid', params }, ...(label ? { label } : {}), mapShape: { color: '#b38955', hx: p.half, hz: p.half, pyramid: true }, ...(name ? { poi: `poi.${key}` } : {}) });
  let y0 = groundH(x, z);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) y0 = Math.min(y0, groundH(x + a * p.half, z + b * p.half));
  solids.push({ x, z, hx: p.half, hz: p.half });
}

// the Great Sphinx: 73 m long, 20 m high, about 19 m wide, facing due east
const OFF = -36.5;
const sphinxParts = [];
const ext = (pts, depth, material, ground = true) => sphinxParts.push({ shape: 'extrude', points: pts, depth, bevel: [1.1, 1.0, 3], pivot: [OFF, 0, -depth / 2], material, ground });
ext([[0, 0], [0, 4.5], [0.5, 8.5, 5, 9], [14, 9.6], [24, 9.0, 32, 10.2], [39, 11, 44, 12.0], [46, 12.0], [46, 0], [0, 0]], 11, 'body');
ext([[40, 0], [40, 11.6], [44, 12.6], [50.5, 12.4], [52.4, 10], [53.6, 6, 52.8, 3], [52.5, 0], [40, 0]], 8.4, 'body');
for (const s of [-1, 1]) sphinxParts.push({ shape: 'sphere', args: [1, 16, 10], scale: [7.5, 4.4, 1.8], at: [OFF + 9, 3.8, s * 6.4], material: 'body' });
sphinxParts.push({ shape: 'extrude', points: [[-5, 12], [5, 12], [4.6, 14.5], [4.1, 18.6, 2.3, 19.7], [-2.3, 19.7], [-4.1, 18.6, -4.6, 14.5], [-5, 12]], depth: 6.4, bevel: [0.3, 0.25, 2], args: [8], geoRot: [0, Math.PI / 2, 0], pivot: [OFF + 44.8, 0, 0], material: 'head', ground: true });
const B = (w, hh, d, x, y, z, material, ground = true) => sphinxParts.push({ shape: 'box', args: [w, hh, d], at: [r2(OFF + x), y, z], material, ...(ground ? { ground: true } : {}) });
B(2.6, 5.6, 4.0, 52.4, 15.9, 0, 'face');
B(2.9, 0.8, 5.4, 52.3, 18.9, 0, 'head');
for (const s of [-1, 1]) {
  B(1.8, 6.2, 1.8, 51.7, 12.6, s * 3.25, 'head');
  B(1.0, 1.6, 0.5, 51.9, 16.3, s * 2.25, 'face', false);
}
for (const s of [-1, 1]) B(0.16, 0.4, 0.95, 53.72, 16.9, s * 0.95, 'eye', false);
B(0.5, 1.0, 0.95, 53.72, 15.3, 0, 'nose', false);
B(0.1, 0.12, 1.4, 53.72, 14.25, 0, 'mouth', false);
for (const s of [-1, 1]) {
  B(21, 2.8, 3.4, 62.5, 1.4, s * 4.3, 'body');
  B(6, 5.5, 3.6, 52.5, 2.75, s * 4.4, 'body', false);
  for (let k = -1; k <= 1; k++) B(1.2, 1.4, 1.0, 73.2, 0.7, r2(s * 4.3 + k * 1.1), 'body', false);
}
B(0.7, 3.6, 2.4, 56.2, 1.8, 0, 'granite');
B(30, 0.25, 14, 64, 0.12, 0, 'floor', false);
const models = {
  sphinx: {
    id: 'sphinx',
    note: 'Ported from silent-sphinx.html; replace with a photogrammetry glTF when one is licensed (BRIEF §14).',
    materials: {
      body: { map: { gen: 'strata', seed: 5, repeat: [0.1, 0.05] }, roughness: 0.95, emissive: '#c98a3a', night: { intensity: 0.3 } },
      head: { map: { gen: 'strata', seed: 5, repeat: [1, 0.5] }, color: '#efdcb8', roughness: 0.9, flatShading: true, emissive: '#c98a3a', night: { intensity: 0.3 } },
      face: { map: { gen: 'strata', seed: 5, repeat: [1, 0.5] }, color: '#f2e0bd', roughness: 0.85, emissive: '#c98a3a', night: { intensity: 0.3 } },
      eye: { color: '#2a2018', emissive: '#8ff6ff', glowWhen: { when: { any: [{ flag: 'done' }, { flag: 'finale' }] }, intensity: 0.6, nightBoost: 3 } },
      nose: { color: '#b89a72', roughness: 1 },
      mouth: { color: '#5d4630', roughness: 1 },
      granite: { map: { gen: 'granite', seed: 17, size: 128, repeat: [2, 2] }, roughness: 0.7 },
      floor: { color: '#c5a77d', roughness: 1 },
    },
    parts: sphinxParts,
  },
};
E({ id: 'sphinx', kind: 'prop', at: [328, -0.3, 432], model: { gen: 'composite', ref: 'sphinx' }, solid: { type: 'box', hx: 37, hz: 9.8, h: 20, yOffset: 0.3 }, label: { text: S('mon.sphinx', 'أبو الهول', 'Sphinx'), style: 'monument', min: 150, max: 1800, y: 26 }, mapShape: { color: '#8f6c45', hx: 36.5, hz: 9.5 }, poi: 'poi.sphinx' });
solids.push({ x: 328, z: 432, hx: 37, hz: 9.8 });

// temples, causeway, boat pit
const stoneBox = (id, w, hh, d, x, z, material, extra = {}) => {
  E({ id, kind: 'prop', at: [x, r2(hh / 2 - 0.4), z], model: { gen: 'part', part: { shape: 'box', args: [w, hh, d], material, ground: true } }, solid: { type: 'box', hx: w / 2, hz: d / 2, h: hh, yOffset: -hh / 2 }, ...extra });
  solids.push({ x, z, hx: w / 2, hz: d / 2 });
};
stoneBox('valley-temple', 44, 12, 44, 336, 500, { map: { gen: 'granite', seed: 17, size: 128, repeat: [6, 2] }, color: '#f4dccb', roughness: 0.75 }, { mapShape: { color: '#a07a6a', hx: 22, hz: 22 }, poi: 'poi.valley' });
stoneBox('khafre-temple-1', 40, 6, 4, -196, 320, 'lime');
stoneBox('khafre-temple-2', 40, 6, 4, -196, 368, 'lime');
stoneBox('khafre-temple-3', 4, 6, 44, -216, 344, 'lime');
{
  const A = { x: -216, z: 344 }, Bp = { x: 304, z: 478 }, N = 52, dx = Bp.x - A.x, dz = Bp.z - A.z, L = Math.hypot(dx, dz), seg = L / N, items = [];
  const ux = dx / L, uz = dz / L;
  for (let i = 0; i < N; i++) {
    const k = (i + 0.5) / N, x = A.x + dx * k, z = A.z + dz * k;
    const h0 = groundH(x - (ux * seg) / 2, z - (uz * seg) / 2), h1 = groundH(x + (ux * seg) / 2, z + (uz * seg) / 2);
    items.push({ at: [r2(x), r2((h0 + h1) / 2 + 0.25), r2(z)], rot: [0, +Math.atan2(-dz, dx).toFixed(4), +Math.atan2(h1 - h0, seg).toFixed(4)] });
  }
  E({ id: 'causeway', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'box', args: [r2(seg + 0.8), 1.4, 8.8], rotOrder: 'YZX', material: { color: '#c9a674', roughness: 1 } }, items } });
}
E({ id: 'boat-pit', kind: 'prop', at: [0, 0.05, 146], model: { gen: 'part', part: { shape: 'box', args: [44, 0.14, 6.4], material: { color: '#4f3e2c', roughness: 1 }, shadow: false } }, poi: 'poi.boat' });

// mastaba tombs
{
  const r = rng(41), items = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 7; j++) {
      if (r() < 0.15) continue;
      const x = -300 + i * 30 + (r() - 0.5) * 4, z = -144 + j * 32 + (r() - 0.5) * 4, w = 20 + r() * 4, d = 11 + r() * 3, hh = 4.8 + r() * 2.8;
      items.push({ at: [r2(x), -0.6, r2(z)], scale: [r2(w), r2(hh), r2(d)] });
      solids.push({ x, z, hx: w / 2, hz: d / 2 });
    }
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 5; j++) {
      if (r() < 0.2) continue;
      const x = 232 + i * 26 + (r() - 0.5) * 3, z = -70 + j * 36 + (r() - 0.5) * 3, w = 18 + r() * 3, d = 10 + r() * 3, hh = 4 + r() * 2.5;
      items.push({ at: [r2(x), -1.2, r2(z)], scale: [r2(w), r2(hh + 1), r2(d)] });
      solids.push({ x, z, hx: w / 2, hz: d / 2 });
    }
  E({ id: 'mastabas', kind: 'prop', model: { gen: 'instances', part: { shape: 'box', args: [1, 1, 1], pivot: [0, 0.5, 0], material: 'lime', ground: true }, items, params: { solid: true } }, mapShape: { color: '#bf9a68', hx: 1, hz: 1 } });
}
// Nazlet el-Semman
const HOUSE_COLS = ['#d8b98f', '#c98f62', '#b25f45', '#e2d3b5', '#a9bfc6', '#d7a57a', '#9c5a43', '#cfc0a2'];
{
  const r = rng(99), items = [], tanks = [];
  for (let gx = 508; gx <= 868; gx += 24)
    for (let gz = 208; gz <= 688; gz += 24) {
      if (Math.abs(gz - 448) < 16 || Math.abs(gx - 676) < 12) continue;
      if (gx < 548 && gz > 300 && gz < 404) continue;
      if (r() < 0.16) continue;
      const w = 13 + r() * 7, d = 13 + r() * 7, hh = 7.5 + Math.floor(r() * 4) * 3 + r() * 1.2, x = gx + (r() - 0.5) * 2, z = gz + (r() - 0.5) * 2, y0 = groundH(x, z) - 0.4;
      const col = HOUSE_COLS[Math.floor(r() * HOUSE_COLS.length)];
      const tank = r() < 0.45;
      items.push({ at: [r2(x), -0.4, r2(z)], scale: [r2(w), r2(hh + 0.4), r2(d)], color: col });
      solids.push({ x, z, hx: w / 2, hz: d / 2 });
      if (tank) tanks.push({ at: [r2(x + w * 0.25), r2(y0 + hh + 0.4), r2(z - d * 0.2)], color: '#3b3835' });
    }
  E({ id: 'houses', kind: 'prop', model: { gen: 'instances', part: { shape: 'box', args: [1, 1, 1, true], pivot: [0, 0.5, 0], material: 'house', ground: true }, items, params: { solid: true } }, mapShape: { color: '#a88f70', hx: 1, hz: 1 } });
  E({ id: 'water-tanks', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'cylinder', args: [0.7, 0.7, 1.3, 10], pivot: [0, 0.65, 0], material: 'white' }, items: tanks } });
}
// palms
{
  const r = rng(31), palms = [];
  for (let z = -520; z <= 1520; z += 22) palms.push({ x: 456 + (r() - 0.5) * 3, z: z + (r() - 0.5) * 6, h: 8 + r() * 4 });
  for (let z = -400; z <= 1400; z += 26) palms.push({ x: 490 + (r() - 0.5) * 2, z, h: 8 + r() * 4 });
  for (let i = 0; i < 40; i++) palms.push({ x: 392 + r() * 58, z: -300 + r() * 400, h: 7 + r() * 5 });
  E({ id: 'palm-trunks', kind: 'prop', model: { gen: 'instances', part: { shape: 'cylinder', args: [0.24, 0.38, 1, 6], pivot: [0, 0.5, 0], material: 'palm-trunk' }, items: palms.map((p) => ({ at: [r2(p.x), -0.2, r2(p.z)], scale: [1, r2(p.h), 1] })), params: { crowd: true } } });
  E({ id: 'palm-crowns', kind: 'prop', model: { gen: 'instances', part: { shape: 'cone', args: [3.2, 1.7, 7, 1, true], material: 'palm-crown' }, items: palms.map((p) => ({ at: [r2(p.x), r2(-0.2 + p.h - 0.3), r2(p.z)], rot: [0, r2(p.h), 0] })), params: { crowd: true } } });
  E({ id: 'palm-crowns-2', kind: 'prop', tierMin: 'mid', model: { gen: 'instances', part: { shape: 'cone', args: [3.2, 1.7, 7, 1, true], material: 'palm-crown' }, items: palms.map((p) => ({ at: [r2(p.x), r2(-0.2 + p.h + 0.3), r2(p.z)], rot: [0, r2(p.h + 0.45), 0], scale: [0.6, 0.8, 0.6] })) } });
}
// desert rocks (avoid every solid by 40 m, like the prototype)
{
  const r = rng(55), rocks = [];
  while (rocks.length < 260) {
    const a = r() * TAU, d = 260 + r() * 1760, x = -120 + Math.cos(a) * d, z = 400 + Math.sin(a) * d;
    if (x > 380) continue;
    if (solids.some((s) => Math.abs(x - s.x) < s.hx + 40 && Math.abs(z - s.z) < s.hz + 40)) continue;
    const s = 1 + r() * 5, ry = r() * TAU, sq = 0.4 + r() * 0.5, col = r() < 0.5 ? '#b08657' : '#9c7448';
    rocks.push({ at: [r2(x), r2(-0.25 * s), r2(z)], scale: [r2(s), r2(s * sq), r2(s * 1.2)], rot: [0, r2(ry), 0], color: col });
  }
  E({ id: 'rocks', kind: 'prop', model: { gen: 'instances', part: { shape: 'icosahedron', args: [1, 0], material: 'rock' }, items: rocks } });
}
// Cairo on the horizon
{
  const r = rng(77), b = [];
  for (let i = 0; i < 190; i++) {
    const x = 2000 + r() * 1500, z = -1800 + r() * 4000, w = 40 + r() * 60, d = 40 + r() * 60, hh = 30 + r() * 120, col = r() < 0.5 ? '#9b8d80' : '#8b8379';
    b.push({ at: [r2(x), -1, r2(z)], scale: [r2(w), r2(hh), r2(d)], color: col });
  }
  E({ id: 'cairo', kind: 'prop', model: { gen: 'instances', part: { shape: 'box', args: [1, 1, 1], pivot: [0, 0.5, 0], material: { color: '#ffffff', roughness: 1 }, shadow: false }, items: b } });
}
// Grand Egyptian Museum
const GEM = { x: -1350, z: -1700 };
models.gem = {
  id: 'gem',
  parts: [
    { shape: 'box', args: [620, 44, 16], at: [0, 22, 0], rot: [-0.18, 0, 0], material: 'gem' },
    { shape: 'extrude', points: [[-310, 0], [310, 0], [180, -260], [-180, -260], [-310, 0]], depth: 30, rot: [Math.PI / 2, 0, 0], at: [0, 30, 0], material: { color: '#cfc6b4', roughness: 0.9 } },
    { shape: 'box', args: [60, 60, 30], at: [0, 30, 8], material: 'gem' },
  ],
};
S('mon.gem', 'المتحف المصري الكبير', 'Grand Egyptian Museum');
E({ id: 'gem', kind: 'prop', at: [GEM.x, GEM.z], yaw: +Math.atan2(-GEM.x, -GEM.z).toFixed(4), model: { gen: 'composite', ref: 'gem' }, label: { text: 'mon.gem', style: 'monument', min: 300, max: 5200, y: 80, when: { vehicle: 'balloon' } } });
// street signs (always in Arabic, as on the real plateau)
const SIGNS = [
  ['cafe', 'قهوة أبو علي', 503, 384, -Math.PI / 2, 5, 2.6, '#1d5a43'],
  ['nazlet', 'نزلة السمان', 486, 440, -Math.PI / 2, 4.6, 2.6, '#1d5a43'],
  ['shop', 'بردي عم سيد', 503, 318, -Math.PI / 2, 4.8, 2.6, '#5a2f1d'],
  ['pano', 'البانوراما', -860, 947, 0, 4.4, 2.4, '#1d5a43'],
  ['balloon', 'رحلات المنطاد', 452, 604, Math.PI, 5, 2.6, '#2b3f7a'],
];
for (const [id, text, x, z, yaw, w, y, bg] of SIGNS) E({ id: `sign.${id}`, kind: 'prop', at: [x, z], yaw: r2(yaw), model: { gen: 'sign', params: { text: S(`sign.${id}`, text, text), w, y, bg } } });
// Abu Ali's ahwa
const CAFE = { x: 516, z: 372 }, cgy = groundH(CAFE.x, CAFE.z);
{
  const tables = [[-3, -1.6], [0.6, -1.8], [-2.4, 1.8], [1.2, 1.6]].map(([a, b]) => ({ x: CAFE.x + a, z: CAFE.z + b }));
  models.cafe = {
    id: 'cafe',
    parts: [
      { shape: 'box', args: [11, 0.25, 7], at: [0, 3.2, 0], material: { color: '#2f7a56', roughness: 0.9 } },
      ...[[-5.2, -3.2], [5.2, -3.2], [-5.2, 3.2], [5.2, 3.2]].map(([a, b]) => ({ shape: 'cylinder', args: [0.08, 0.08, 3.2, 6], at: [a, 1.6, b], material: 'post' })),
      { shape: 'box', args: [1.2, 3.2, 7], at: [5.6, 1.6, 0], material: { color: '#d9c3a0', roughness: 0.95 } },
    ],
  };
  E({ id: 'cafe', kind: 'prop', at: [CAFE.x, CAFE.z], model: { gen: 'composite', ref: 'cafe' } });
  const at = (k, y) => ({ at: [r2(k.x), r2(cgy + y), r2(k.z)] });
  E({ id: 'cafe-tables', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'cylinder', args: [0.5, 0.5, 0.06, 14], pivot: [0, 0.76, 0], material: { color: '#e9e4d8' } }, items: tables.map((k) => at(k, 0)) } });
  E({ id: 'cafe-legs', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'cylinder', args: [0.06, 0.08, 0.76, 6], pivot: [0, 0.38, 0], material: 'post' }, items: tables.map((k) => at(k, 0)) } });
  const chairs = [];
  tables.forEach((k, i) => {
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + i;
      chairs.push({ at: [r2(k.x + Math.cos(a) * 0.85), r2(cgy), r2(k.z + Math.sin(a) * 0.85)], color: j % 2 ? '#c8473b' : '#f1ece2' });
    }
  });
  E({ id: 'cafe-chairs', kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'box', args: [0.42, 0.46, 0.42], pivot: [0, 0.23, 0], material: { color: '#ffffff', roughness: 0.7 } }, items: chairs } });
  E({ id: 'cafe-cups', kind: 'prop', ground: false, tierMin: 'mid', model: { gen: 'instances', part: { shape: 'cylinder', args: [0.035, 0.03, 0.09, 8], pivot: [0, 0.835, 0], material: { color: '#e8f3ef', transparent: true, opacity: 0.8, roughness: 0.2 }, shadow: false }, items: tables.map((k) => ({ at: [r2(k.x + 0.12), r2(cgy), r2(k.z - 0.08)] })) } });
}
// Amm Sayed's papyrus shop
const SHOP = { x: 516, z: 330 };
stoneBox('shop-house', 8, 5, 10, SHOP.x + 7, SHOP.z, { color: '#d7a57a', roughness: 0.95 });
models.shop = {
  id: 'shop',
  parts: [
    ...[0, 1, 2].map((i) => ({ shape: 'plane', args: [1.4, 1.05], at: [2.9, 1.6, -2.4 + i * 2.4], rot: [0, -Math.PI / 2, 0], material: { map: { gen: 'papyrus-art', seed: 9 }, roughness: 0.9, doubleSide: true } })),
    ...[0, 1, 2].map((i) => ({ shape: 'cylinder', args: [0.04, 0.04, 1.3, 5], at: [2.95, 0.65, -2.4 + i * 2.4], material: 'post' })),
    { shape: 'box', args: [3, 0.15, 10], at: [1.8, 3.4, 0], rot: [0, 0, 0.15], material: { color: '#b5462f', roughness: 0.9 } },
  ],
};
E({ id: 'shop', kind: 'prop', at: [SHOP.x, SHOP.z], model: { gen: 'composite', ref: 'shop' } });
// balloon launch field
const PAD = { x: 440, z: 620 };
models.pad = {
  id: 'pad',
  parts: [
    { shape: 'ring', args: [10, 11, 48], geoRot: [-Math.PI / 2, 0, 0], at: [0, 0.12, 0], material: { type: 'basic', color: '#f2e2c0', transparent: true, opacity: 0.7, depthWrite: false } },
    { shape: 'cylinder', args: [0.06, 0.06, 6, 6], at: [14, 3, -8], material: 'post' },
    { shape: 'cone', args: [0.45, 2.2, 10, 1, true], geoRot: [0, 0, Math.PI / 2], at: [15.2, 5.6, -8], material: { color: '#e8663a', doubleSide: true } },
  ],
};
E({ id: 'pad', kind: 'prop', at: [PAD.x, PAD.z], model: { gen: 'composite', ref: 'pad' } });

/* ---------------------------------------------------------------- people */
const talk = (dialogue, name, small = false) => ({ on: 'interact', radius: small ? 3.5 : 5.5, label: { key: 'engine.talkTo', params: { name: { text: name } } }, icon: 'talk', do: [{ do: 'show.dialogue', dialogue }] });
const npcLabel = (name, small = false, extra = {}) => ({ text: name, style: small ? 'small' : 'npc', max: small ? 40 : 140, fade: small ? 20 : 50, ...extra });
const notDone = { not: { flag: 'done' } };
const hassanTalk = [
  { do: 'set.flag', flag: 'met-hassan' },
  {
    do: 'control.if',
    when: { all: [{ counter: 'scarabs', gte: 4 }, notDone] },
    then: [{ do: 'show.dialogue', dialogue: 'finale-1' }],
    else: [{ do: 'control.if', when: { flag: 'done' }, then: [{ do: 'show.dialogue', dialogue: 'hassan-done' }], else: [{ do: 'control.if', when: { counter: 'scarabs', lt: 1 }, then: [{ do: 'show.dialogue', dialogue: 'hassan-intro' }], else: [{ do: 'show.dialogue', dialogue: 'hassan-partial' }] }] }],
  },
];
E({
  id: 'npc.hassan', kind: 'npc', at: [388, 412], yaw: r2(-Math.PI / 2),
  model: { gen: 'human', params: { robe: '#e9e1cf', skin: '#7a4a2e', hat: 'turban', hatColor: '#f4efe4', sash: '#8a5a2b', mustache: true, staff: true } },
  npc: { character: 'hassan' },
  label: npcLabel(chars.hassan.name, false, { bang: { any: [{ all: [{ not: { flag: 'met-hassan' } }, notDone] }, { all: [{ counter: 'scarabs', gte: 4 }, notDone] }] } }),
  mapMarker: { color: '#e9b44c', shape: 'triangle', size: 3.6 },
  triggers: [
    { on: 'interact', radius: 5.5, label: { key: 'engine.talkTo', params: { name: { text: chars.hassan.name } } }, icon: 'talk', do: hassanTalk },
    { on: 'enter', radius: 9, when: { all: [{ not: { flag: 'met-hassan' } }, { vehicle: null }] }, do: hassanTalk },
  ],
});
E({ id: 'npc.abu', kind: 'npc', lod: 340, at: [CAFE.x + 4.2, CAFE.z], yaw: r2(-Math.PI / 2), model: { gen: 'human', params: { robe: '#6b4a33', skin: '#8a5636', hat: 'cap', hatColor: '#f1ece2', sash: '#2f7a56', mustache: true } }, npc: { character: 'abu' }, label: npcLabel(chars.abu.name),
  triggers: [{ on: 'interact', radius: 5.5, label: { key: 'engine.talkTo', params: { name: { text: chars.abu.name } } }, icon: 'tea', do: [{ do: 'control.if', when: { flag: 'done' }, then: [{ do: 'show.dialogue', dialogue: 'abu-done' }], else: [{ do: 'control.if', when: { counter: 'scarabs', gte: 4 }, then: [{ do: 'show.dialogue', dialogue: 'abu-all' }], else: [{ do: 'show.dialogue', dialogue: 'abu' }] }] }] }] });
E({ id: 'npc.sayed', kind: 'npc', lod: 340, at: [SHOP.x + 1.6, SHOP.z + 3.8], yaw: r2(-Math.PI / 2), model: { gen: 'human', params: { robe: '#2f4f7a', skin: '#94603e', hat: 'cap', hatColor: '#e9e1cf', sash: '#e9b44c' } }, npc: { character: 'sayed' }, label: npcLabel(chars.sayed.name), triggers: [talk('sayed', chars.sayed.name)] });
E({ id: 'npc.mona', kind: 'npc', lod: 340, at: [PAD.x - 13, PAD.z - 7], yaw: r2(Math.PI * 0.75), model: { gen: 'human', params: { robe: '#1f6f8b', skin: '#a66d45', hat: 'brim', hatColor: '#f2e2c0', sash: '#e8663a' } }, npc: { character: 'mona' }, label: npcLabel(chars.mona.name), triggers: [talk('mona', chars.mona.name)] });
E({ id: 'npc.fathi', kind: 'npc', lod: 340, at: [404, 470], yaw: 0, model: { gen: 'human', params: { robe: '#b8352a', skin: '#8a5636', hat: 'cap', hatColor: '#f4efe4', sash: '#2f2a26', mustache: true, jug: true } }, npc: { character: 'fathi' }, label: npcLabel(chars.fathi.name), motion: { type: 'path', points: [[404, 470], [462, 470], [462, 380], [420, 362], [400, 392]], speed: 1.3 }, triggers: [talk('fathi', chars.fathi.name)] });
{
  const SKINS = ['#8a5636', '#a66d45', '#6c4129', '#bf8760', '#94603e'];
  const r = rng(202), homes = [[30, -150], [-70, -150], [120, -150], [426, 404], [418, 476], [-214, 520], [-840, 984], [-880, 964], [-560, 976], [60, 140]], shirts = ['#ffffff', '#e45a4a', '#3aa36a', '#f4c542', '#7fb3e6', '#e98ab8', '#f2f0ea', '#9b7bd1'];
  homes.forEach(([x, z], i) => {
    const px = x + (r() - 0.5) * 8, pz = z + (r() - 0.5) * 8, face = r() * TAU;
    r(); // initial wait
    const speed = 1.0 + r() * 0.4, ln = Math.floor(r() * 5);
    E({
      id: `npc.tourist.${i}`, kind: 'npc', at: [r2(px), r2(pz)], yaw: r2(face), lod: 340,
      model: { gen: 'human', params: { robe: shirts[i % shirts.length], skin: SKINS[i % SKINS.length], hat: i % 3 === 0 ? 'brim' : i % 3 === 1 ? 'cap' : 'none', hatColor: i % 2 ? '#f2e2c0' : '#ffffff', sash: '#3b3835', camera: i % 2 === 0 } },
      npc: { character: 'tourist' }, label: npcLabel(chars.tourist.name, true), motion: { type: 'wander', radius: 14, speed: r2(speed) }, triggers: [talk(`tourist-${ln}`, chars.tourist.name, true)],
    });
  });
}

/* ---------------------------------------------------------------- rides */
const CAMELS = [
  { id: 'zaghloul', name: ['زغلول', 'Zaghloul'], line: ['زغلول بيمضغ على مهله وباصص لك. هو مش بيركّب حد ببلاش… بس النهارده هيعملها استثناء.', 'Zaghloul chews slowly and stares at you. He does not do free rides… but today he will make an exception.'], x: 150, z: -160, r: 0.6, col: '#b83a2e' },
  { id: 'fayrouz', name: ['فيروز', 'Fayrouz'], line: ['فيروز لابسة شراشيب أكتر من أي حد في الهضبة، وهي عارفة كده كويس.', 'Fayrouz is wearing more tassels than anyone on the plateau, and she knows it.'], x: -842, z: 938, r: 2.2, col: '#2c5aa8' },
  { id: 'bondok', name: ['بندق', 'Bondok'], line: ['بندق بيشمشم في جيوبك يدوّر على بلح. مفيش. زعل منك.', 'Bondok sniffs your pockets for dates. You have none. He is disappointed.'], x: -874, z: 946, r: 1.4, col: '#d39b2f' },
  { id: 'shams', name: ['شمس', 'Shams'], line: ['شمس بتبص على الهرم وكأنها بتعدّ الحجارة.', 'Shams stares at the pyramid as if she is counting the stones.'], x: 420, z: 366, r: Math.PI, col: '#239a8c' },
];
for (const c of CAMELS) {
  const name = S(`veh.${c.id}`, c.name[0], c.name[1]);
  E({ id: `veh.${c.id}`, kind: 'vehicle', at: [c.x, c.z], yaw: r2(c.r), lod: 480, model: { gen: 'camel', params: { blanket: c.col } }, vehicle: { preset: 'camel', name, mountLine: S(`veh.${c.id}.line`, c.line[0], c.line[1]) }, label: { text: name, style: 'ride', max: 90, fade: 40, y: 3.7 }, mapMarker: { color: '#7a4f2a', shape: 'square', size: 3 } });
}
const CARTS = [
  { id: 'antar', name: ['كارتة · عنتر', 'Carriage · Antar'], short: ['عنتر', 'Antar'], x: 440, z: 392, r: 0, canopy: '#2f7a56', body: '#e9e1cf', horse: '#3b2a20' },
  { id: 'sukkar', name: ['كارتة · سُكّر', 'Carriage · Sukkar'], short: ['سُكّر', 'Sukkar'], x: 178, z: -176, r: -0.6, canopy: '#c4533c', body: '#2f63b0', horse: '#e8dccb' },
  { id: 'barq', name: ['كارتة · برق', 'Carriage · Barq'], short: ['برق', 'Barq'], x: -818, z: 1008, r: 2.6, canopy: '#2f63b0', body: '#e9b44c', horse: '#8a5a33' },
];
S('ride.cart', 'اركب الكارتة ({name})', 'Drive the carriage ({name})');
for (const c of CARTS) {
  const name = S(`veh.${c.id}`, c.name[0], c.name[1]);
  const short = S(`veh.${c.id}.short`, c.short[0], c.short[1]);
  E({ id: `veh.${c.id}`, kind: 'vehicle', at: [c.x, c.z], yaw: r2(c.r), lod: 480, model: { gen: 'carriage', params: { canopy: c.canopy, body: c.body, horse: c.horse } }, vehicle: { preset: 'carriage', name, rideLabel: { key: 'ride.cart', params: { name: { text: short } } } }, label: { text: name, style: 'ride', max: 90, fade: 40, y: 3.3 }, mapMarker: { color: '#2f7a56', shape: 'square', size: 3 } });
}
E({ id: 'veh.balloon', kind: 'vehicle', at: [PAD.x, PAD.z], model: { gen: 'balloon' }, vehicle: { preset: 'balloon', name: S('veh.balloon', 'منطاد', 'Balloon'), home: true }, label: { text: 'veh.balloon', style: 'ride', max: 700, fade: 300, y: 31 }, mapMarker: { color: '#c4533c', shape: 'square', size: 4 } });

/* ---------------------------------------------------------------- scarabs, photo spots, rings, finale */
for (const sc of SCARABS) {
  E({
    id: `scarab.${sc.id}`, kind: 'pickup', at: [sc.x, sc.z], model: { gen: 'scarab' },
    hideWhen: { counter: 'scarabs', has: sc.id }, collectAnim: 'rise',
    mapMarker: { color: '#1f9c92', shape: 'dot', size: 4.4, edge: true, when: { not: { counter: 'scarabs', has: sc.id } } },
    triggers: [{ on: 'enter', radius: 4, grounded: true, once: false, when: { not: { counter: 'scarabs', has: sc.id } }, do: [{ do: 'show.dialogue', dialogue: `scarab-${sc.id}` }] }],
  });
}
const SPOTS = [
  { id: 'pano', x: -850, z: 958, name: ['البانوراما', 'Panorama Point'], cam: [-860, 6, 976], look: [-250, 62, 280] },
  { id: 'sphinx', x: 410, z: 452, name: ['وش أبو الهول', 'The Sphinx’s face'], cam: [420, 2.6, 470], look: [330, -6, 430] },
  { id: 'khufu', x: 70, z: -142, name: ['تحت الهرم الأكبر', 'Below the Great Pyramid'], cam: [80, 1.7, -154], look: [0, 118, 0] },
  { id: 'queens', x: -558, z: 960, name: ['منكاورع وملكاته', 'Menkaure and his queens'], cam: [-552, 3, 978], look: [-590, 24, 790] },
  { id: 'village', x: 498, z: 372, name: ['من قهوة أبو علي', 'From Abu Ali’s café'], cam: [498, 3.2, 374], look: [0, 55, 0] },
];
models['photo-marker'] = {
  id: 'photo-marker',
  parts: [
    { shape: 'ring', args: [2.2, 2.7, 40], geoRot: [-Math.PI / 2, 0, 0], at: [0, 0.15, 0], material: { type: 'basic', color: '#f2c25a', transparent: true, opacity: 0.85, depthWrite: false } },
    { shape: 'sprite', args: [1.6], at: [0, 2.6, 0], material: { color: '#f2c25a' } },
  ],
};
for (const s of SPOTS) {
  E({ id: `photo.${s.id}`, kind: 'photo-spot', at: [s.x, s.z], model: { gen: 'composite', ref: 'photo-marker' }, photo: { name: S(`photo.${s.id}`, s.name[0], s.name[1]), counter: 'spots', cam: s.cam, look: s.look, radius: 7 }, mapMarker: { color: '#f2c25a', shape: 'diamond', size: 3, when: { not: { counter: 'spots', has: `photo.${s.id}` } } } });
}
E({ id: 'photo.sky', kind: 'photo-spot', at: [PAD.x, PAD.z], photo: { name: S('photo.sky', 'من المنطاد', 'From the balloon'), counter: 'spots', sky: { minAltitude: 100, vehicle: 'balloon' } } });
const RINGS = [
  { x: 0, y: 178, z: 0, f: ['من فوق، قاعدة الهرم الأكبر مربعة تقريباً بالظبط، والفرق بين أطول وأقصر ضلع فيها بيتقاس بالسنتيمترات.', 'From above, the Great Pyramid’s base is almost a perfect square: its longest and shortest sides differ by only centimetres.'], obj: ['obj.scale'] },
  { x: -328, y: 190, z: 344, f: ['هرم خفرع زاويته حوالي ٥٣ درجة، وخوفو حوالي ٥٢. فرق صغير بس بيبان من فوق.', 'Khafre’s sides slope at about 53 degrees, Khufu’s at about 52. A small difference you can see from up here.'], obj: ['obj.pyramids'] },
  { x: -590, y: 110, z: 744, f: ['هرم منكاورع حجمه حوالي عُشر حجم الهرم الأكبر بس.', 'Menkaure’s pyramid has only about a tenth of the Great Pyramid’s volume.'], obj: ['obj.pyramids'] },
  { x: 350, y: 62, z: 432, f: ['أبو الهول بيبص ناحية الشرق بالظبط، ناحية شروق الشمس على النيل.', 'The Sphinx faces due east, toward the sunrise over the Nile.'], obj: ['obj.sphinx'] },
  { x: 690, y: 90, z: 452, f: ['من فوق نزلة السمان تقدر تشوف إزاي القاهرة كبرت لحد ما وصلت لرجل الهضبة.', 'From above Nazlet el-Semman you can see how Cairo has grown right up to the foot of the plateau.'] },
  { x: -560, y: 300, z: -640, f: ['بص ناحية الشمال الغربي: ده المتحف المصري الكبير، من أكبر متاحف العالم المخصصة لحضارة واحدة، وفيه كنوز توت عنخ آمون.', 'Look northwest: that is the Grand Egyptian Museum, one of the largest museums in the world devoted to a single civilisation, home to Tutankhamun’s treasures.'] },
];
S('ring.done', 'عدّيت الحلقة {n} من ٦!', 'Ring {n} of 6!');
S('ring.all', 'عدّيت الحلقات الست كلها! إنت طيار شاطر.', 'All six rings! You are a natural pilot.');
RINGS.forEach((R, i) => {
  cards[`ring-${i}`] = { id: `ring-${i}`, who: 'char.fact', glyph: 'ring', body: S(`card.ring.${i}`, R.f[0], R.f[1]), objectives: R.obj ?? [], tags: [FC], ttl: 20 };
  E({
    id: `ring.${i}`, kind: 'ring', at: [R.x, R.y, R.z], ground: false, model: { gen: 'ring', params: { radius: 16, tube: 0.9 } },
    hideWhen: { counter: 'rings', has: String(i) },
    mapMarker: { color: '#ffd25a', shape: 'ring', size: 4.5, when: { all: [{ vehicle: 'balloon' }, { not: { counter: 'rings', has: String(i) } }] } },
    triggers: [{ on: 'enter', mode: '3d', radius: 14.5, height: 4, when: { not: { counter: 'rings', has: String(i) } }, do: [
      { do: 'add.counter', counter: 'rings', value: String(i) },
      { do: 'control.if', when: { counter: 'rings', gte: 6 }, then: [{ do: 'show.toast', text: 'ring.all', kind: 'gold', ms: 4200 }, { do: 'give.stamp', stamp: 'pilot' }], else: [{ do: 'show.toast', text: { key: 'ring.done', params: { n: { counter: 'rings' } } }, kind: 'gold', ms: 4200 }] },
      { do: 'show.card', card: `ring-${i}` },
    ] }],
  });
});
E({ id: 'finale-point', kind: 'prop', at: [380, 428], triggers: [{ on: 'enter', radius: 28, grounded: true, once: false, when: { all: [{ counter: 'scarabs', gte: 4 }, notDone, { not: { flag: 'finale' } }] }, do: [{ do: 'show.dialogue', dialogue: 'finale-1' }] }] });
// night: sound & light show
E({ id: 'lasers', kind: 'effect', at: [392, 1, 432], model: { gen: 'beams', params: { aims: [[0, 150, 0], [-328, 160, 344], [-590, 72, 744], [0, 90, -60], [-328, 110, 300], [330, 22, 432]], colors: ['#3fe0d0', '#e9b44c', '#c4533c', '#7f9cff', '#3fe0d0', '#e9b44c'] } } });
// black kites and tour buses
models.kite = {
  id: 'kite',
  scale: 1.6,
  materials: { b: { color: '#3a2c22', roughness: 0.9, doubleSide: true } },
  parts: [
    { shape: 'box', args: [0.16, 0.12, 0.62], material: 'b' },
    { shape: 'triangles', points: [[0, 0, 0.25, 0, 0, -0.2, 0.95, 0, -0.05]], material: 'b', name: 'wl' },
    { shape: 'triangles', points: [[0, 0, 0.25, 0, 0, -0.2, 0.95, 0, -0.05]], scale: [-1, 1, 1], material: 'b', name: 'wr' },
  ],
};
{
  const r = rng(14);
  for (let i = 0; i < 8; i++) {
    const cx = -200 + r() * 500, cz = -100 + r() * 700, rad = 60 + r() * 140, hh = 70 + r() * 90, sp = 7 + r() * 5, ph = r() * TAU, dir = r() < 0.5 ? 1 : -1;
    E({ id: `kite.${i}`, kind: 'effect', at: [r2(cx), r2(hh), r2(cz)], ground: false, model: { gen: 'composite', ref: 'kite' }, motion: { type: 'circle', center: [r2(cx), 0, r2(cz)], radius: r2(rad), height: r2(hh), speed: r2(sp), phase: r2(ph), direction: dir }, tierMin: 'mid' });
  }
}
const STRIPES = ['#2f63b0', '#c4533c', '#239a8c', '#d39b2f'];
STRIPES.forEach((c, k) => {
  models[`bus-${k}`] = {
    id: `bus-${k}`,
    parts: [
      { shape: 'box', args: [2.5, 3.0, 12], at: [0, 1.9, 0], material: { color: '#f2f0ea', roughness: 0.5 } },
      { shape: 'box', args: [2.56, 0.95, 11.2], at: [0, 2.55, -0.2], material: { color: '#1d2c48', roughness: 0.2, metalness: 0.4 } },
      { shape: 'box', args: [2.56, 0.3, 12.02], at: [0, 1.35, 0], material: { color: c } },
      ...[[-1.15, 4], [1.15, 4], [-1.15, -4], [1.15, -4]].map(([x, z]) => ({ shape: 'cylinder', args: [0.5, 0.5, 0.35, 12], geoRot: [0, 0, Math.PI / 2], at: [x, 0.5, z], material: { color: '#1b1b1b', roughness: 0.9 } })),
    ],
  };
});
for (let i = 0; i < 5; i++) {
  const fwd = i % 2 === 0, x = fwd ? 476 : 468;
  const z0 = -900 + i * 560;
  E({ id: `bus.${i}`, kind: 'prop', at: [x, z0], lod: 1600, model: { gen: 'composite', ref: `bus-${i % 4}` }, motion: { type: 'line', from: fwd ? [x, 0, -900] : [x, 0, 1700], to: fwd ? [x, 0, 1700] : [x, 0, -900], speed: 10 + i, phase: r2(fwd ? (z0 + 900) / 2600 : (1700 - z0) / 2600), up: 0.05 } });
}

/* ---------------------------------------------------------------- spawns */
const SPAWNS = [
  ['khufu-foot', ['عند رجل الهرم الأكبر', 'the foot of the Great Pyramid'], 146, -142],
  ['west', ['الجبانة الغربية', 'the Western Cemetery'], -232, -176],
  ['khafre-south', ['الناحية الجنوبية لهرم خفرع', "Khafre's south side"], -300, 494],
  ['menkaure-east', ['الناحية الشرقية لهرم منكاورع', "Menkaure's east side"], -492, 744],
  ['sphinx', ['ساحة أبو الهول', 'the Sphinx terrace'], 414, 396],
  ['nazlet', ['أول نزلة السمان', 'the edge of Nazlet el-Semman'], 488, 524],
  ['pano', ['البانوراما', 'Panorama Point'], -836, 972],
  ['queens', ['أهرامات ملكات خوفو', "Khufu's Queens"], 226, 60],
];
const spawns = {};
for (const [id, nm, x, z] of SPAWNS) {
  // face Khufu from afar, Khafre from close by (prototype faceYaw)
  const k = Math.hypot(x, z) > 300 ? { x: 0, z: 0 } : { x: -328, z: 344 };
  const yaw = Math.atan2(-(k.x - x), -(k.z - z));
  spawns[id] = { at: [x, z], yaw: r2(yaw), name: S(`spawn.${id}`, nm[0], nm[1]), random: true };
}
for (const p of POIS) pois[p.id].spawn = { at: p.spawn, yaw: r2(Math.atan2(p.spawn[0] - p.at[0], p.spawn[1] - p.at[1])) };

/* ---------------------------------------------------------------- scene */
const scene = {
  id: 'plateau',
  kind: 'terrain',
  title: 'area.plateau',
  environment: {
    sky: {
      style: 'sunset-gradient',
      sunDiskColor: '#ffcf8a',
      day: { top: '#3d6cae', up: '#86a6cf', mid: '#e7a990', hor: '#f7b672', bot: '#e6b07f', fog: '#e6b07f', sunColor: '#ffc085', sunIntensity: 3.1, hemiSky: '#ffe3c2', hemiGround: '#8f6a44', hemiIntensity: 1.1, cloud: '#ffd9b6', cloudOpacity: 0.85, exposure: 1.08, sunAmount: 1 },
      night: { top: '#050b20', up: '#0d1636', mid: '#1f1d48', hor: '#33285a', bot: '#1d1a3a', fog: '#1d1a3a', sunColor: '#8ea6ff', sunIntensity: 0.2, hemiSky: '#5d6aa8', hemiGround: '#231d33', hemiIntensity: 0.45, cloud: '#38345e', cloudOpacity: 0.5, exposure: 1.25, sunAmount: 0 },
    },
    sunDir: [-0.78, 0.3, 0.55],
    shadows: { extent: 170, far: 1700, distance: 800 },
    fog: { near: 520, far: 3400, altitudeScale: 1 },
    stars: { count: 1800, radius: 5600, size: 1.7, nightOnly: true },
    clouds: { count: 12, seed: 61 },
    dust: { count: 260, color: '#ffeccc', size: 0.16, box: 50 },
  },
  terrain: {
    type: 'layers', size: 9200, segments: 320, center: [-120, 400], layers: terrainLayers,
    colors: {
      base: '#ddb57c',
      layers: [
        { type: 'fbm', color: '#c08d55', freq: 0.005, offset: [3, -2], lo: 0.35, gain: 1.6 },
        { type: 'fbm', color: '#a8794a', freq: 0.0175, offset: [-7, 4], lo: 0.62, gain: 2.2, max: 0.35 },
        { type: 'smooth', color: '#b9a07e', coord: 'x', from: 200, to: 560, amount: 0.75 },
        { type: 'smooth', color: '#e8c38b', coord: 'r', center: [-120, 400], from: 1000, to: 2000, amount: 0.6, masks: [{ coord: 'x', from: 200, to: 560, base: 1, gain: -1 }] },
      ],
    },
    texture: { gen: 'sand', seed: 7, repeat: [575, 575] },
    bump: { gen: 'ripple', repeat: [575, 575] },
    bumpScale: 1,
  },
  player: { controller: 'walk', avatar: 'human', walk: 5, run: 10, eye: 1.7, camera: { dist: 10, min: 3, max: 120, minPitch: 0.04, pitch: 0.3 }, bounds: { center: [-120, 400], radius: 1900, flyRadius: 2600, maxAltitude: 480 } },
  spawns,
  defaultSpawn: 'random',
  intro: { center: [-220, 48, 360], radius: 700, height: 170, speed: 0.03, phase: 0.55 },
  materials,
  entities,
  areas: {
    list: AREAS.map((a) => ({ id: a.id, at: [a.x, a.z], r: a.r, name: `area.${a.id}`, ...(cards[`area-${a.id}`] ? { card: `area-${a.id}` } : {}) })),
    fallback: [{ name: 'area.plateau', any: [{ xGt: 160 }, { zLt: 300, xGt: -420 }] }, { name: 'area.desert' }],
  },
  map: {
    bounds: { x0: -1000, x1: 920, z0: -340, z1: 1180 },
    title: 'map.title',
    note: 'map.note',
    miniRange: 380,
    miniRangeFlying: 700,
    sample: 160,
    shapes: [
      { type: 'line', color: '#6b625a', from: [472, -900], to: [472, 1700], width: 14 },
      { type: 'line', color: '#8a6c4a', from: [-216, 344], to: [304, 478], width: 8 },
      { type: 'circle', color: '#f2e2c0', x: PAD.x, z: PAD.z, r: 11 },
    ],
    labels: [
      ['mon.khufu', 0, -140], ['mon.khafre', -328, 216], ['mon.menkaure', -590, 672], ['mon.sphinx', 332, 400], ['area.nazlet', 680, 192], ['area.pano', -860, 916], ['area.west', -224, -180], ['veh.balloon', 440, 660],
    ].map(([text, x, z]) => ({ text, at: [x, z] })),
  },
  hud: {
    hints: { default: { touch: 'hint.touch', desk: 'hint.desk' }, ride: { touch: 'hint.rideT', desk: 'hint.rideD' }, balloon: { touch: 'hint.balloonT', desk: 'hint.balloonD' } },
  },
};

/* ---------------------------------------------------------------- quest and activities */
S('quest.title', 'أبو الهول سكت', 'The Silent Sphinx');
S('quest.next', 'الجاي: {where}، على بُعد {m} متر ناحية {dir}', 'Next: {where} · {m} m {dir}');
S('quest.free', 'لِف براحتك: اركب جمل أو كارتة، اطلع بالمنطاد، وصوّر. افتح «الأنشطة» تشوف فاضل إيه.', 'Free roam: ride a camel or a carriage, fly the balloon and take photos. Open Activities to see what is left.');
S('quest.finale', 'أبو الهول بيتكلّم…', 'The Sphinx is speaking…');
S('quest.return', 'ارجع لأبو الهول', 'Return to the Sphinx');
const quest = {
  id: 'voice',
  title: 'quest.title',
  mode: 'nearest',
  progress: { counter: 'scarabs', of: 4, style: 'scarab' },
  steps: [
    ...SCARABS.map((sc) => ({ id: `scarab-${sc.id}`, label: `scarab.${sc.id}.where`, target: `scarab.${sc.id}`, done: { counter: 'scarabs', has: sc.id } })),
    { id: 'return', label: 'quest.return', target: 'npc.hassan', when: { counter: 'scarabs', gte: 4 }, done: { flag: 'done' } },
  ],
  done: { flag: 'done' },
  goal: { next: 'quest.next', done: 'quest.free', busy: { when: { all: [{ flag: 'finale' }, notDone] }, text: 'quest.finale' } },
  objectives: ['obj.pyramids', 'obj.scale', 'obj.sphinx', 'obj.crafts'],
};
const goTo = (target, mode = 'fast') => [{ do: 'travel.to', target, mode }];
S('act.title', 'أنشطة الجيزة', 'Things to do in Giza');
S('act.button', 'الأنشطة', 'Activities');
S('act.sub', 'خلّصت {n} من {m} أنشطة', '{n} of {m} done');
S('act.story', 'رجّع صوت أبو الهول', "Restore the Sphinx's voice");
S('act.storyS', '{n} من ٤ جعارين', '{n} of 4 scarabs');
S('act.camel', 'اركب جمل', 'Ride a camel');
S('act.camelS', 'زغلول وفيروز وبندق وشمس مستنيينك', 'Zaghloul, Fayrouz, Bondok and Shams are waiting');
S('act.cart', 'لف بالكارتة', 'Drive a carriage');
S('act.cartS', 'الحنطور أسرع من الجمل بكتير', 'Much faster than a camel');
S('act.balloon', 'اطلع بالمنطاد', 'Fly the balloon');
S('act.balloonS', 'كابتن منى ورا معبد الوادي', 'Captain Mona, behind the Valley Temple');
S('act.rings', 'عدّي من الحلقات الدهبي', 'Fly through the golden rings');
S('act.ringsS', '{n} من ٦ حلقات فوق الهضبة', '{n} of 6 rings above the plateau');
S('act.photos', 'صوّر الأماكن الحلوة', 'Photograph the best views');
S('act.photosS', '{n} من ٦ علامات كاميرا', '{n} of 6 camera markers');
S('act.cartouche', 'اكتب اسمك بالهيروغليفي', 'Write your name in hieroglyphs');
S('act.cartoucheS', 'عند عم سيد بتاع البردي', 'At Amm Sayed’s papyrus shop');
S('act.tea', 'اشرب شاي بالنعناع', 'Drink mint tea');
S('act.teaS', 'عند قهوة أبو علي', 'At Abu Ali’s café');
const activities = {
  title: 'act.title', button: 'act.button', sub: 'act.sub',
  entries: [
    { title: 'act.story', sub: { key: 'act.storyS', params: { n: { counter: 'scarabs' } } }, icon: 'scarab', done: { flag: 'done' }, go: [{ do: 'travel.to', target: { nearest: 'quest-step', quest: 'voice' }, mode: 'fast' }] },
    { title: 'act.camel', sub: 'act.camelS', icon: 'camel', done: { counter: 'rides', has: 'camel' }, go: goTo('veh.shams'), keepGo: true },
    { title: 'act.cart', sub: 'act.cartS', icon: 'carriage', done: { counter: 'rides', has: 'carriage' }, go: goTo('veh.antar'), keepGo: true },
    { title: 'act.balloon', sub: 'act.balloonS', icon: 'balloon', done: { counter: 'rides', has: 'balloon' }, go: goTo('npc.mona'), keepGo: true },
    { title: 'act.rings', sub: { key: 'act.ringsS', params: { n: { counter: 'rings' } } }, icon: 'ring', done: { counter: 'rings', gte: 6 }, go: goTo('npc.mona') },
    { title: 'act.photos', sub: { key: 'act.photosS', params: { n: { counter: 'spots' } } }, icon: 'camera', done: { counter: 'spots', gte: 6 }, go: goTo('photo.pano') },
    { title: 'act.cartouche', sub: 'act.cartoucheS', icon: 'cartouche', done: { flag: 'cartouche' }, go: goTo('npc.sayed') },
    { title: 'act.tea', sub: 'act.teaS', icon: 'tea', done: { flag: 'tea' }, go: goTo('npc.abu') },
  ],
};

/* ---------------------------------------------------------------- hieroglyph alphabet (Gardiner signs, playful) */
const glyphs = {
  id: 'hieroglyphs',
  font: 'Noto Sans Egyptian Hieroglyphs',
  signs: { vulture: 0x1313f, foot: 0x130c0, bread: 0x133cf, cobra: 0x13193, wick: 0x1339b, placenta: 0x1340d, hand: 0x130a7, mouth: 0x1308b, bolt: 0x13283, cloth: 0x132f4, pool: 0x13219, arm: 0x1309d, jar: 0x133bc, viper: 0x13191, hill: 0x1320e, basket: 0x133a1, lion: 0x130ed, owl: 0x13153, water: 0x13216, shelter: 0x13254, quail: 0x13171, reed: 0x131cb, reeds: 0x131cc, stool: 0x132aa, rope: 0x1337f },
  sounds: { vulture: 'a', foot: 'b', bread: 't', cobra: 'j', wick: 'ḥ', placenta: 'kh', hand: 'd', mouth: 'r', bolt: 'z', cloth: 's', pool: 'sh', arm: 'ʿ', jar: 'g', viper: 'f', hill: 'q', basket: 'k', lion: 'l', owl: 'm', water: 'n', shelter: 'h', quail: 'w/u', reed: 'i', reeds: 'y', stool: 'p', rope: 'ch' },
  latin: { a: 'vulture', b: 'foot', c: 'basket', d: 'hand', e: 'reed', f: 'viper', g: 'jar', h: 'shelter', i: 'reed', j: 'cobra', k: 'basket', l: 'lion', m: 'owl', n: 'water', o: 'quail', p: 'stool', q: 'hill', r: 'mouth', s: 'cloth', t: 'bread', u: 'quail', v: 'viper', w: 'quail', x: ['basket', 'cloth'], y: 'reeds', z: 'bolt' },
  digraphs: { sh: 'pool', kh: 'placenta', ch: 'rope', th: 'bread', ou: 'quail', ee: 'reeds' },
  arabic: { 'ا': 'vulture', 'أ': 'vulture', 'إ': 'vulture', 'آ': 'vulture', 'ء': 'vulture', 'ب': 'foot', 'ت': 'bread', 'ث': 'bread', 'ج': 'cobra', 'ح': 'wick', 'خ': 'placenta', 'د': 'hand', 'ذ': 'hand', 'ر': 'mouth', 'ز': 'bolt', 'س': 'cloth', 'ش': 'pool', 'ص': 'cloth', 'ض': 'hand', 'ط': 'bread', 'ظ': 'bolt', 'ع': 'arm', 'غ': 'jar', 'ف': 'viper', 'ق': 'hill', 'ك': 'basket', 'ل': 'lion', 'م': 'owl', 'ن': 'water', 'ه': 'shelter', 'ة': 'bread', 'و': 'quail', 'ؤ': 'quail', 'ي': 'reeds', 'ى': 'reed', 'ئ': 'reed', 'پ': 'stool', 'ڤ': 'viper', 'گ': 'jar' },
  max: 10,
  collapseRepeats: ['a', 'ا', 'e', 'o'],
  title: S('cart.title', 'اسمك في خرطوش', 'Your name in a cartouche'),
  note: S('cart.note', 'الكتابة دي تقريبية وللتسلية: كل علامة بتمثّل صوت قريب من حرف في اسمك. الخرطوش هو الشكل البيضاوي اللي المصريين القدام كانوا بيكتبوا جواه أسماء الملوك.', 'This is a playful, approximate spelling: each sign stands for a sound close to a letter in your name. A cartouche is the oval ancient Egyptians drew around royal names.'),
  footer: S('cart.footer', 'هضبة الجيزة · بردي عم سيد', 'Giza Plateau · Amm Sayed’s papyrus'),
  empty: S('cart.empty', 'مقدرتش أكتب الاسم ده. جرّب اسم بالعربي أو الإنجليزي.', 'I could not write that name. Try a name in Arabic or English letters.'),
  saveLabel: S('cart.save', 'حطّه في الألبوم', 'Add to album'),
  saved: S('cart.saved', 'الخرطوش اتحط في الألبوم', 'Cartouche added to your album'),
  counterFlag: 'cartouche',
};

/* ---------------------------------------------------------------- manifest */
const manifest = {
  $schema: '../../packages/pack-schema/dist/json-schema/manifest.schema.json',
  id: 'giza-plateau',
  version: '1.0.0',
  engine: '^0.1',
  title: 'pack.title',
  altTitle: 'pack.alt',
  summary: 'pack.summary',
  kicker: 'pack.kicker',
  subjects: ['social-studies'],
  grades: ['EG-P4', 'EG-P5', 'EG-P6'],
  durationMinutes: 20,
  objectives,
  curriculum,
  locales: ['ar-EG', 'en'],
  defaultLocale: 'ar-EG',
  startScene: 'plateau',
  startPoi: 'poi.sphinx',
  scenes: ['scenes/plateau.json'],
  pois: Object.keys(pois).map((id) => `pois/${id.replace('poi.', '')}.json`),
  quests: ['quests/voice.json'],
  items: Object.keys(items).map((id) => `items/${id.replace('item.', '')}.json`),
  cards: Object.keys(cards).map((id) => `cards/${id}.json`),
  dialogues: Object.keys(dialogues).map((id) => `dialogue/${id}.json`),
  models: Object.keys(models).map((id) => `models/${id}.json`),
  glyphs: ['glyphs/hieroglyphs.json'],
  vehicles: [{ preset: 'camel' }, { preset: 'carriage' }, { preset: 'balloon' }],
  characters: Object.fromEntries(Object.entries(chars).map(([k, v]) => [k, { name: v.name, glyph: v.glyph }])),
  counters: [
    { id: 'scarabs', scope: 'save', of: 4 },
    { id: 'rings', scope: 'save', of: 6 },
    { id: 'spots', scope: 'save', of: 6 },
    { id: 'rides', scope: 'save', of: 3 },
  ],
  flags: [{ id: 'done' }, { id: 'finale' }, { id: 'met-hassan' }, { id: 'tea' }, { id: 'cartouche' }],
  stamps: [
    { id: 'giza', title: 'stamp.giza', color: '#e9b44c', style: 'seal' },
    { id: 'pilot', title: 'stamp.pilot', color: '#c4533c', style: 'seal' },
    { id: 'photographer', title: 'stamp.photographer', color: '#33b7a9', style: 'seal' },
  ],
  titles: [{ id: 'guardian', text: 'title.guardian' }],
  collections: { activities },
  intro: {
    story: ['intro.story1', 'intro.story2'],
    features: [{ icon: 'camel', text: 'feat.camel' }, { icon: 'carriage', text: 'feat.cart' }, { icon: 'balloon', text: 'feat.balloon' }, { icon: 'camera', text: 'feat.photo' }, { icon: 'cartouche', text: 'feat.cartouche' }],
    askName: true,
    nameLabel: 'intro.name',
    namePlaceholder: 'intro.namePh',
    defaultName: 'intro.defaultName',
    palette: { label: 'intro.robe', colors: ROBES, names: robeNameKeys },
    start: 'intro.start',
    notes: ['intro.scale'],
    controls: { touch: 'intro.ctlTouch', desk: 'intro.ctlDesk' },
  },
  theme: { preset: 'lapis', band: 'khayamiya' },
  hud: {
    quest: 'voice',
    panels: ['activities', 'passport', 'album', 'settings'],
    toggles: [{ id: 'show', on: 'show.on', off: 'show.off', icon: 'star', when: { flag: 'done' }, state: { timeOfDay: 'night' }, do: [{ do: 'set.timeOfDay', value: 'toggle' }] }],
    album: { max: 12, defaultCaption: 'album.caption', note: 'engine.albumNote', empty: 'engine.albumEmpty' },
    wave: true,
  },
  prePost: { pre: ['item.sphinx', 'item.height', 'item.papyrus', 'item.granite', 'item.menkaure'], post: ['item.sphinx', 'item.height', 'item.papyrus', 'item.granite', 'item.menkaure'] },
  budgets: { low: { downloadMB: 15, drawCalls: 150, textureMB: 48 }, mid: { downloadMB: 25, drawCalls: 300, textureMB: 128 }, high: { downloadMB: 40, drawCalls: 600, textureMB: 256 } },
  sensitivity: ['burial-practices'],
  credits: [{ role: 'credits.prototype', name: 'Yahya (Rihla founder)' }, { role: 'credits.port', name: 'Rihla engineering' }],
  reviewStatus: 'draft',
  teacher: { lessonPlan: 'teacher/lesson-plan.md', worksheet: 'teacher/worksheet.md', answerKey: 'teacher/answer-key.md' },
  tags: ['heritage', 'giza'],
};
// photographer stamp when all six photo tasks are done: the quest-free check runs on photo completion
quest.onComplete = [];
const photoQuest = { id: 'photos', title: 'act.photos', mode: 'nearest', steps: [{ id: 'all', label: 'act.photos', done: { counter: 'spots', gte: 6 } }], done: { counter: 'spots', gte: 6 }, goal: { next: 'act.photos', done: 'act.photos' }, onComplete: [{ do: 'give.stamp', stamp: 'photographer' }] };
manifest.quests.push('quests/photos.json');

/* ---------------------------------------------------------------- teacher kit */
const lessonPlan = `# أبو الهول سكت · The Silent Sphinx — خطة درس (٤٠ دقيقة)

> ${FC}: المحتوى منقول من نموذج المؤسس. لازم مراجعة مختص قبل النشر.

## الأهداف
${objectives.map((o) => `- ${ar[o.text]} / ${en[o.text]}`).join('\n')}

## قبل الرحلة (٥ دقايق)
- اسأل الفصل: إيه اللي تعرفوه عن أهرامات الجيزة؟ اكتبوا ٣ كلمات على السبورة.
- (اختياري) أسئلة قبل الرحلة: ٥ أسئلة جوه اللعبة لو فعّلتها في الواجب.

## أثناء الرحلة (٢٥ دقيقة)
- شارك كود الفصل. الطلبة يلمّوا الجعارين الأربعة ويجاوبوا على أسئلتهم.
- أدوار في المجموعة: ملاح (الخريطة)، مصوّر (علامات الكاميرا)، مسجّل (يكتب المعلومات)، مرشد (يتكلم مع الشخصيات).
- من شاشة الحصة: "جمّع الفصل" عند أبو الهول قبل النهاية.

## بعد الرحلة (١٠ دقايق)
- أسئلة للنقاش: ليه ارتفاع الهرم الأكبر اتغيّر؟ ليه أبو الهول بيبص ناحية الشرق؟
- (اختياري) أسئلة بعد الرحلة وقارن النتايج.

---

## Before (5 min) · During (25 min) · After (10 min)
Same structure in English: activate prior knowledge, play the mission with roles (navigator, photographer, recorder, guide), gather at the Sphinx, discuss: why did the Great Pyramid's height change? why does the Sphinx face east?
`;
const worksheet = `# ورقة عمل · Worksheet — The Silent Sphinx

1. ${ar['item.khufu.q']} ____________
   ${en['item.khufu.q']}
2. ${ar['item.khafre.q']} ____________
   ${en['item.khafre.q']}
3. ${ar['item.menkaure.q']} ____________
   ${en['item.menkaure.q']}
4. ${ar['item.boat.q']} ____________
   ${en['item.boat.q']}
5. ${ar['item.sphinx.q']} ____________
   ${en['item.sphinx.q']}
`;
const answerKey = `# Answer key

${Object.values(items).map((it) => `- **${it.id}**: ${it.type === 'numeric' ? `${it.answer} ± ${it.tolerance}` : `${ar[it.options.find((o) => o.correct).text]} / ${en[it.options.find((o) => o.correct).text]}`}`).join('\n')}
`;

/* ---------------------------------------------------------------- write */
const files = {
  'manifest.json': manifest,
  'scenes/plateau.json': scene,
  'quests/voice.json': quest,
  'quests/photos.json': photoQuest,
  'glyphs/hieroglyphs.json': glyphs,
  'LICENSES.json': { assets: [] },
  'teacher/lesson-plan.md': lessonPlan,
  'teacher/worksheet.md': worksheet,
  'teacher/answer-key.md': answerKey,
};
for (const p of Object.values(pois)) files[`pois/${p.id.replace('poi.', '')}.json`] = p;
for (const it of Object.values(items)) files[`items/${it.id.replace('item.', '')}.json`] = it;
for (const c of Object.values(cards)) files[`cards/${c.id}.json`] = c;
for (const d of Object.values(dialogues)) files[`dialogue/${d.id}.json`] = d;
for (const m of Object.values(models)) files[`models/${m.id}.json`] = m;
files['locales/ar-EG.json'] = ar;
files['locales/en.json'] = en;
writePack(OUT, files);
console.log(`giza-plateau: ${Object.keys(files).length} files, ${entities.length} entities, ${Object.keys(ar).length} strings`);
