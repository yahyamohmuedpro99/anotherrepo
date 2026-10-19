// Port of prototypes/horus-voyage.html → packs/solar-system (BRIEF §16).
// Run: node tools/port/solar.mjs   (then: pnpm pack:check)
// Every line of content comes from the founder's prototype. The one new assessment item (item.gravity)
// restates a number the prototype already shows on the orbit card (ADR-0012); all facts are tagged
// needs-fact-check until a subject expert signs them off (content/FACTCHECK.md).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAU, fbm, r2, r3, rng, smooth, strings, writePack } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'packs/solar-system');
const { S, ar, en } = strings();
const FC = 'needs-fact-check';
const PI = Math.PI;

/* ---------------------------------------------------------------- pack, intro, HUD strings */
S('pack.title', 'رحلة حورس', 'Horus Voyage');
S('pack.alt', 'Horus Voyage', 'رحلة حورس');
S('pack.kicker', 'مهمة استكشاف المجموعة الشمسية', 'Solar system exploration mission');
S('pack.summary', 'طير بسفينة الفضاء «حورس» للشمس والقمر والكواكب التمانية، انزل عليهم واستكشفهم، وفي الآخر اطلع برّه وشوف مجرة درب التبانة.', 'Fly the spaceship Horus to the Sun, the Moon and all eight planets, land and explore each one, then fly out to see the Milky Way.');
S('intro.story1', 'إنت أحدث رائد فضاء على سفينة الفضاء المصرية «حورس». مهمتك تزور الشمس والقمر والكواكب التمانية، تنزل عليهم وتستكشفهم، وفي الآخر تطلع برّه خالص وتشوف مجرتنا كلها.', 'You are the newest astronaut aboard the Egyptian spaceship Horus. Visit the Sun, the Moon and all eight planets, land and explore each one, then fly out far enough to see our whole galaxy.');
S('intro.story2', 'في كل محطة هتلاقي ٣ اكتشافات وأماكن مميزة وسؤال واحد. جاوب صح وخد ختم في جواز سفرك الفضائي. وفي الطريق فيه مركبات فضاء ومذنّب وكويكبات دهبي مستنيينك. الدكتورة نور معاك على الراديو من مركز التحكم في القاهرة.', 'Every stop has 3 discoveries, special places and one question. Answer it to earn a stamp in your space passport. Along the way, spacecraft, a comet and golden asteroids are waiting. Dr. Nour is with you on the radio from Mission Control in Cairo.');
S('intro.name', 'اسم رائد الفضاء', 'Astronaut name');
S('intro.namePh', 'مثلاً: سلمى', 'e.g. Salma');
S('intro.start', 'انطلق', 'Launch');
S('intro.defaultName', 'رائد فضاء', 'Astronaut');
S('intro.scale', 'المسافات والأحجام هنا مش بالمقياس الحقيقي، عشان الرحلة تبقى أسهل.', 'Distances and sizes here are not to real scale, so the trip stays short.');
S('intro.ctlTouch', 'الدراع عشان تطير وتمشي · اسحب عشان تبص حواليك · دوس على أي كوكب عشان تروحله', 'Joystick to fly and walk · drag to look · tap a planet to go there');
S('intro.ctlDesk', 'WASD عشان تطير وتمشي · اسحب بالماوس عشان تبص · دوس على أي كوكب عشان تروحله', 'WASD to fly and walk · drag to look · click a planet to go there');
S('feat.fly', 'طير بين الكواكب', 'Fly between planets');
S('feat.land', 'انزل على الكواكب', 'Land on worlds');
S('feat.jump', 'جرّب الجاذبية', 'Feel the gravity');
S('feat.galaxy', 'شوف المجرة', 'See the galaxy');
S('engine.shipName', 'حورس', 'حورس');

S('hint.spaceT', '<b>الدراع</b> عشان تطير ناحية ما بتبص · <b>اسحب</b> عشان تلف الكاميرا · <b>صباعين</b> للزووم · <b>دوس على كوكب</b> أو اختاره من الشريط', '<b>Stick</b> to fly where you look · <b>Drag</b> to turn the camera · <b>Pinch</b> to zoom · <b>Tap a planet</b> or pick one from the bar');
S('hint.spaceD', '<b>WASD</b> عشان تطير ناحية ما بتبص · <b>Q/E</b> لتحت وفوق · <b>Shift</b> للسرعة · <b>اسحب</b> عشان تلف الكاميرا · <b>دوس على كوكب</b> عشان تروحله', '<b>WASD</b> to fly where you look · <b>Q/E</b> down and up · <b>Shift</b> to boost · <b>Drag</b> to turn the camera · <b>Click a planet</b> to go there');
S('hint.rockT', '<b>الدراع</b> عشان تمشي · <b>نط</b> وشوف الجاذبية بتعمل إيه · <b>دوس على الأرض</b> تروح هناك · امشي للأنوار الزرقا والدهبي', '<b>Stick</b> to walk · <b>Jump</b> to feel the gravity · <b>Tap the ground</b> to walk there · walk into the blue and gold lights');
S('hint.rockD', '<b>WASD</b> عشان تمشي · <b>Space</b> عشان تنط · <b>Shift</b> عشان تجري · <b>دوس على الأرض</b> تروح هناك · امشي للأنوار الزرقا والدهبي', '<b>WASD</b> to walk · <b>Space</b> to jump · <b>Shift</b> to run · <b>Click the ground</b> to walk there · walk into the blue and gold lights');
S('hint.gasT', '<b>الدراع</b> عشان تطير · <b>فوق وتحت</b> للارتفاع · <b>دوس على نور</b> عشان تروحله', '<b>Stick</b> to fly · <b>Up and Down</b> for height · <b>Tap a light</b> to fly to it');
S('hint.gasD', '<b>WASD</b> عشان تطير · <b>Space</b> لفوق و<b>C</b> لتحت · <b>دوس على نور</b> عشان تروحله', '<b>WASD</b> to fly · <b>Space</b> up and <b>C</b> down · <b>Click a light</b> to fly to it');
S('hint.galT', '<b>اسحب</b> عشان تلف المجرة · <b>صباعين</b> للزووم · <b>دوس على الأسماء</b> عشان تتعلّم', '<b>Drag</b> to turn the galaxy · <b>Pinch</b> to zoom · <b>Tap the names</b> to learn');
S('hint.galD', '<b>اسحب</b> عشان تلف المجرة · <b>العجلة</b> للزووم · <b>دوس على الأسماء</b> عشان تتعلّم', '<b>Drag</b> to turn the galaxy · <b>Scroll</b> to zoom · <b>Click the names</b> to learn');

S('mission.kicker', 'المهمة', 'Mission');
S('mission.title', 'مهمة حورس', 'The Horus mission');
S('mission.next', 'الوجهة الجاية: {where}', 'Next stop: {where}');
S('mission.done', 'خلّصت كل المحطات! افتح جواز السفر وشوف شهادتك.', 'Every stop visited! Open your passport to see your certificate.');
S('mission.flyThere', 'طير هناك', 'Fly there');
S('mission.warpLand', 'انزل طاير', 'Warp & land');
S('mission.openGal', 'اطلع من المجرة', 'Fly out of the galaxy');
S('quest.flying', 'الطيار الآلي شغّال… رايح {name}', 'Autopilot on… heading to {name}');
S('orbit.of', 'إنت في مدار', 'In orbit around');
S('orbit.land', 'انزل', 'Land');
S('orbit.landGas', 'انزل في السحاب', 'Dive into clouds');
S('orbit.observe', 'راقب', 'Observe');
S('orbit.weight', 'اللي وزنه ٦٠ كيلو على الأرض هيحس إنه {w} كيلو هنا', 'Someone who weighs 60 kg on Earth would feel like {w} kg here');
S('orbit.gasTeaser', 'عملاق غازي: مفيش أرض تقف عليها، هتطير جوه السحاب.', 'Gas giant: no ground to stand on, so you fly in the clouds.');
S('orbit.sunTeaser', 'نجم من غاز مولّع. مستحيل ننزل، بس نقدر نراقبه.', 'A star of burning gas. No landing, but we can observe it.');
S('space.galaxyBtn', 'المجرة', 'Galaxy');
S('space.boost', 'سرعة', 'Boost');
S('space.sunHot', 'حاسب! حرارة الشمس عالية جداً، رجّعتك لورا.', 'Careful! The Sun is far too hot. I pulled you back.');
S('surf.surfaceOf', 'سطح', 'Surface of');
S('surf.cloudsOf', 'سحاب', 'Clouds of');
S('surf.gravity', 'الجاذبية', 'Gravity');
S('surf.temp', 'الحرارة', 'Temperature');
S('surf.day', 'اليوم', 'Day');
S('surf.year', 'السنة', 'Year');
S('surf.gval', '{g} × جاذبية الأرض', '{g}× Earth');
S('surf.discoveries', 'اكتشافات', 'Discoveries');
S('surf.places', 'أماكن', 'Places');
S('surf.guide', 'ودّيني', 'Guide me');
S('surf.nextStop', 'المحطة الجاية', 'Next stop');
S('surf.takeoff', 'اطلع', 'Take off');
S('surf.jump', 'نط', 'Jump');
S('surf.up', 'فوق', 'Up');
S('surf.down', 'تحت', 'Down');
S('surf.jumped', 'نطّيت {h} متر هنا · نفس النطة على الأرض: {e} متر', 'You jumped {h} m here · the same jump on Earth: {e} m');
S('surf.discovery', 'اكتشاف {n} من ٣', 'Discovery {n} of 3');
S('surf.landmark', 'مكان مميز · {n}', 'Special place · {n}');
S('surf.egypt', 'نزلت في الجيزة، مصر. أهلاً بيك في البلد!', 'You landed in Giza, Egypt. Welcome home!');
S('surf.tooDeep', 'الضغط عالي جداً تحت كده! ارجع لفوق.', 'The pressure is too high down there! Go back up.');
S('quiz.title', 'سؤال المهمة', 'Mission question');
S('quiz.btn', 'يلا السؤال', 'Show question');
S('quiz.hint', 'لأ، مش دي. فكّر تاني في الاكتشافات اللي شفتها.', 'Not that one. Think back to what you discovered.');
S('r.quizReady', 'لمّيت الاكتشافات التلاتة! جاوب على سؤال المهمة عشان تاخد الختم.', 'You found all three discoveries! Answer the mission question to earn the stamp.');
S('r.already', 'ختم {n} معاك من قبل كده.', 'You already have the {n} stamp.');
S('r.afterQuiz', 'برافو! عاوز تعمل إيه دلوقتي؟ المحطة الجاية: {n}.', 'Well done! What next? The next stop is {n}.');
S('r.afterAll', 'كده خلّصت كل الأختام! افتح جواز السفر وشوف شهادتك.', 'That is every stamp! Open your passport to see your certificate.');
S('r.warpTo', 'انزل طاير على {n}', 'Warp & land on {n}');
S('r.flyTo', 'طير لـ {n}', 'Fly to {n}');
S('r.stay', 'خليني أكمّل استكشاف هنا', 'Keep exploring here');
S('r.toSpace', 'اطلع للفضاء', 'Back to space');
S('r.openGal', 'اطلع من المجرة', 'Fly out of the galaxy');
S('r.landingAt', 'بننزل على {n}…', 'Landing on {n}…');
S('r.welcome', 'أهلاً يا {n}! معاك الدكتورة نور من مركز التحكم في القاهرة. إحنا دلوقتي في مدار الأرض. ابدأ بالنزول على الأرض، وبعدين اختار أي محطة والطيار الآلي هيوديك، أو دوس «انزل طاير» تنزل على طول.', 'Welcome, {n}! Dr. Nour here, from Mission Control in Cairo. We are in orbit around Earth. Start by landing on Earth, then pick any stop and the autopilot will take you, or press Warp & land to go straight there.');
S('r.comet', 'مذنّب جاي ناحيتنا! الحق قرّب منه قبل ما يبعد. هتلاقيه في السجل.', 'A comet is coming our way! Get close before it leaves. You will find it in the log.');
S('char.nour', 'د. نور · مركز التحكم', 'Dr. Nour · Mission Control');
S('char.nour.g', 'ن', 'N');
S('char.quiz.g', '؟', '?');
S('char.find', 'اكتشاف', 'Discovery');
S('char.find.g', '✦', '✦');
S('craft.got', '✓ {n}', '✓ {n}');
S('ast.name', 'كويكب دهبي', 'Golden asteroid');
S('ast.scanned', 'مسحت كويكب {n} من ٥', 'Asteroid {n} of 5 scanned');
S('ast.fact', 'أغلب الكويكبات بتلف بين المريخ والمشتري. أكبر حاجة في الحزام ده اسمها «سيريس»، وهي كوكب قزم.', 'Most asteroids orbit between Mars and Jupiter. The biggest object in the belt, Ceres, is a dwarf planet.');
S('log.title', 'سجل الرحلة', 'Voyage log');
S('log.button', 'السجل', 'Log');
S('log.sub', 'لمّيت {n} حاجة في الرحلة', '{n} things collected on the voyage');
S('log.craft', 'مركبات فضاء', 'Spacecraft');
S('log.ast', 'كويكبات دهبي', 'Golden asteroids');
S('log.land', 'أماكن على الكواكب', 'Places on worlds');
S('log.gal', 'أماكن في المجرة', 'Places in the galaxy');
S('log.fly', 'طير', 'Fly');
S('log.astLine', '{n} من ٥ اتمسحوا', '{n} of 5 scanned');
S('gal.kicker', 'برّه المجموعة الشمسية', 'Beyond the solar system');
S('gal.title', 'مجرة درب التبانة', 'The Milky Way');
S('gal.sub', 'اكتشفت {n} من ٤ أماكن · دوس على الأسماء', '{n} of 4 places discovered · tap the names');
S('gal.back', 'ارجع للمجموعة الشمسية', 'Back to the solar system');
S('gal.intro', 'إحنا دلوقتي برّه المجموعة الشمسية خالص، بنبص على مجرتنا «درب التبانة» من بعيد. المسافات هنا بالسنين الضوئية: السنة الضوئية هي المسافة اللي النور بيقطعها في سنة، حوالي ٩٫٥ تريليون كيلو.', 'We are now far outside the solar system, looking back at our galaxy, the Milky Way. Distances here are in light-years: a light-year is how far light travels in a year, about 9.5 trillion km.');
S('gal.quizReady', 'اكتشفت الأماكن الأربعة في المجرة! جاوب على السؤال عشان تاخد ختم درب التبانة.', 'You found all four places in the galaxy! Answer the question to earn the Milky Way stamp.');
S('cert.title', 'شهادة رائد فضاء', 'Astronaut certificate');
S('cert.text', 'الشهادة دي لـ {name}، اللي زار الشمس والقمر والكواكب التمانية، وطلع برّه وشاف مجرة درب التبانة، على متن «حورس».', 'This certifies that {name} visited the Sun, the Moon and all eight planets, then flew out to see the Milky Way, aboard Horus.');
S('credits.prototype', 'النموذج الأصلي', 'Original prototype');
S('credits.port', 'نقل المحتوى للمنصة', 'Platform port');

/* ---------------------------------------------------------------- what you learn (prototype INFO, LMK, CRAFT_INFO, GAL) */
const ORDER = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const MISSION = ['earth', 'moon', 'mars', 'venus', 'mercury', 'sun', 'jupiter', 'saturn', 'uranus', 'neptune', 'galaxy'];
const NAMES = {
  sun: ['الشمس', 'the Sun', 'The Sun'], mercury: ['عطارد', 'Mercury'], venus: ['الزهرة', 'Venus'], earth: ['الأرض', 'Earth'], moon: ['القمر', 'the Moon', 'The Moon'],
  mars: ['المريخ', 'Mars'], jupiter: ['المشتري', 'Jupiter'], saturn: ['زحل', 'Saturn'], uranus: ['أورانوس', 'Uranus'], neptune: ['نبتون', 'Neptune'], galaxy: ['درب التبانة', 'the Milky Way', 'The Milky Way'],
};
for (const [k, [a, e, cap]] of Object.entries(NAMES)) {
  S(`name.${k}`, a, e); // in a sentence
  S(`body.${k}`, a, cap ?? e); // as a title
}
const INFO = {
  sun: {
    facts: [['الشمس لوحدها فيها حوالي ٩٩٫٨٪ من كل الكتلة اللي في المجموعة الشمسية. كل الكواكب مع بعض حاجة صغيرة جنبها.', 'The Sun alone holds about 99.8% of all the mass in the solar system. All the planets together are tiny next to it.'],
      ['نور الشمس بياخد حوالي ٨ دقايق و٢٠ ثانية عشان يوصل للأرض. يعني الشمس اللي بتشوفها شكلها من ٨ دقايق فاتوا.', 'Sunlight takes about 8 minutes and 20 seconds to reach Earth, so the Sun you see is how it looked 8 minutes ago.'],
      ['سطح الشمس حرارته حوالي ٥٥٠٠ درجة، وعرضها يساوي حوالي ١٠٩ كرة أرضية جنب بعض.', 'The Sun’s surface is about 5,500 °C, and about 109 Earths could line up across it.']],
    quiz: { q: ['نور الشمس بياخد قد إيه عشان يوصل للأرض؟', 'How long does sunlight take to reach Earth?'], o: [['حوالي ٨ دقايق', 'About 8 minutes'], ['حوالي ٨ ساعات', 'About 8 hours'], ['في نفس اللحظة', 'Instantly']] },
    radio: ['دي الشمس، النجم بتاعنا. ماتقربش أكتر من كده! دوس «راقب» والأجهزة هتقيس لك.', 'That’s the Sun, our star. Don’t get any closer! Press Observe and the instruments will take readings.'],
  },
  mercury: {
    stats: { temp: ['٤٣٠ بالنهار و١٨٠ تحت الصفر بالليل', '430 °C by day, −180 °C at night'], day: ['١٧٦ يوم أرضي', '176 Earth days'], year: ['٨٨ يوم', '88 days'] },
    facts: [['عطارد أقرب كوكب للشمس وأصغر كوكب في المجموعة الشمسية كلها. من هنا الشمس شكلها أكبر حوالي ٣ مرات من اللي بنشوفه من الأرض.', 'Mercury is the closest planet to the Sun and the smallest planet of all. From here the Sun looks about three times bigger than it does from Earth.'],
      ['مفيش هوا تقريباً يمسك الحرارة، فبالنهار الحرارة بتوصل ٤٣٠ درجة، وبالليل بتنزل لـ ١٨٠ تحت الصفر.', 'There is almost no air to hold heat, so days reach 430 °C and nights drop to −180 °C.'],
      ['السنة على عطارد ٨٨ يوم بس، لكن من شروق الشمس للشروق اللي بعده بياخد ١٧٦ يوم أرضي. يعني اليوم أطول من السنة!', 'A year on Mercury is only 88 Earth days, but one sunrise to the next takes 176 Earth days. The day is longer than the year!']],
    quiz: { q: ['ليه عطارد بيبقى ساقع جداً بالليل مع إنه أقرب كوكب للشمس؟', 'Why does Mercury get so cold at night even though it is closest to the Sun?'], o: [['عشان مفيش هوا يمسك الحرارة', 'There is no air to hold the heat'], ['عشان هو بعيد عن الشمس', 'It is far from the Sun'], ['عشان متغطي بالتلج', 'It is covered in ice']] },
    radio: ['عطارد! السما سودة هنا حتى بالنهار، عشان مفيش هوا. انزل وشوف الشمس قد إيه كبيرة.', 'Mercury! The sky is black even in daytime because there is no air. Land and see how big the Sun looks.'],
  },
  venus: {
    stats: { temp: ['٤٦٥ درجة', '465 °C'], day: ['١١٧ يوم أرضي', '117 Earth days'], year: ['٢٢٥ يوم', '225 days'] },
    facts: [['الزهرة أسخن كوكب، حوالي ٤٦٥ درجة، أسخن من عطارد كمان. الجو بتاعها تقيل وكله ثاني أكسيد كربون، فبيحبس الحرارة. ده اسمه الاحتباس الحراري.', 'Venus is the hottest planet, about 465 °C, even hotter than Mercury. Its thick carbon dioxide air traps the heat. This is called the greenhouse effect.'],
      ['الضغط على سطح الزهرة حوالي ٩٠ مرة قد ضغط الأرض، زي ما تكون تحت المية بحوالي ٩٠٠ متر.', 'The air pressure on Venus is about 90 times Earth’s, like being about 900 metres under the sea.'],
      ['الزهرة بتلف حوالين نفسها بالعكس وبالراحة جداً: اللفة الواحدة بتاخد ٢٤٣ يوم، أطول من سنتها اللي هي ٢٢٥ يوم. والشمس هناك بتطلع من الغرب.', 'Venus spins backwards and very slowly: one spin takes 243 Earth days, longer than its 225-day year. The Sun rises in the west there.']],
    quiz: { q: ['ليه الزهرة أسخن من عطارد مع إنها أبعد عن الشمس؟', 'Why is Venus hotter than Mercury even though it is farther from the Sun?'], o: [['الجو التقيل بتاعها بيحبس الحرارة', 'Its thick air traps the heat'], ['عشان هي أقرب للشمس', 'It is closer to the Sun'], ['عشان فيها براكين بتنفجر طول الوقت', 'Volcanoes erupt there all the time']] },
    radio: ['الزهرة. بدلتك متصممة للحر ده، بس ماتطوّلش. السحاب هنا فيه حمض كبريتيك!', 'Venus. Your suit is built for this heat, but don’t stay too long. The clouds here contain sulfuric acid!'],
  },
  earth: {
    stats: { temp: ['١٥ درجة في المتوسط', '15 °C on average'], day: ['٢٤ ساعة', '24 hours'], year: ['٣٦٥ يوم', '365 days'] },
    facts: [['الأرض هي الكوكب الوحيد اللي نعرف إن عليه حياة.', 'Earth is the only planet we know of that has life.'],
      ['حوالي ٧١٪ من سطح الأرض متغطي بالمية، وعشان كده شكلها أزرق من الفضاء.', 'About 71% of Earth’s surface is covered by water, which is why it looks blue from space.'],
      ['الهوا بتاع الأرض (أغلبه نيتروجين وأكسجين) والمجال المغناطيسي بيحمونا من الإشعاع الضار اللي جاي من الشمس.', 'Earth’s air, mostly nitrogen and oxygen, and its magnetic field protect life from harmful radiation from the Sun.']],
    quiz: { q: ['قد إيه من سطح الأرض متغطي بالمية؟', 'How much of Earth’s surface is covered by water?'], o: [['حوالي ٧١٪', 'About 71%'], ['حوالي ٣٠٪', 'About 30%'], ['حوالي ٥٠٪', 'About 50%']] },
    radio: ['أهلاً بيك في البيت! هتنزل في الجيزة جنب الأهرامات. خد نفس من هوا حقيقي.', 'Welcome home! You will land in Giza, next to the pyramids. Take a breath of real air.'],
  },
  moon: {
    stats: { temp: ['١٢٠ بالنهار و١٧٠ تحت الصفر بالليل', '120 °C by day, −170 °C at night'], day: ['٢٩٫٥ يوم أرضي', '29.5 Earth days'], year: ['بيلف حوالين الأرض في ٢٧ يوم', 'Orbits Earth in 27 days'] },
    facts: [['سنة ١٩٦٩ مركبة أبولو ١١ نزلت على القمر، ونيل أرمسترونج بقى أول إنسان يمشي عليه. ولحد سنة ١٩٧٢ مشي على القمر ١٢ رائد فضاء.', 'In 1969 Apollo 11 landed on the Moon and Neil Armstrong became the first person to walk on it. By 1972, 12 astronauts had walked on the Moon.'],
      ['مفيش هوا ولا ريح على القمر، فآثار رجلين رواد الفضاء ممكن تفضل موجودة ملايين السنين.', 'There is no air or wind on the Moon, so astronauts’ footprints can last for millions of years.'],
      ['القمر دايماً بيورّي الأرض نفس الوش، عشان بيلف حوالين نفسه مرة واحدة في نفس الوقت اللي بيلف فيه حوالين الأرض.', 'The Moon always shows Earth the same face, because it spins once in the same time it takes to orbit Earth.']],
    quiz: { q: ['كام رائد فضاء مشي على القمر في رحلات أبولو؟', 'How many astronauts walked on the Moon during the Apollo missions?'], o: [['١٢', '12'], ['٢', '2'], ['٣٠', '30']] },
    radio: ['القمر! الجاذبية هنا سُدس جاذبية الأرض. جرّب تنط وشوف هتطير قد إيه.', 'The Moon! Gravity here is one sixth of Earth’s. Try jumping and see how high you go.'],
  },
  mars: {
    stats: { temp: ['٦٠ تحت الصفر في المتوسط', '−60 °C on average'], day: ['٢٤ ساعة و٤٠ دقيقة', '24 h 40 min'], year: ['٦٨٧ يوم', '687 days'] },
    facts: [['المريخ لونه أحمر عشان التراب والصخور بتاعته مليانة أكسيد حديد، يعني صدأ.', 'Mars is red because its dust and rocks are full of iron oxide, which is rust.'],
      ['على المريخ أكبر بركان في المجموعة الشمسية، «أوليمبوس مونس»، ارتفاعه حوالي ٢٢ كيلو، يعني حوالي مرتين ونص قد جبل إيفرست.', 'Mars has the biggest volcano in the solar system, Olympus Mons, about 22 km high, roughly two and a half times Mount Everest.'],
      ['اليوم على المريخ أطول من يوم الأرض بشوية: حوالي ٢٤ ساعة و٤٠ دقيقة.', 'A day on Mars is just a bit longer than Earth’s, about 24 hours and 40 minutes.']],
    quiz: { q: ['ليه المريخ لونه أحمر؟', 'Why is Mars red?'], o: [['عشان فيه صدأ في التراب بتاعه', 'There is rust in its dust'], ['عشان حرارته عالية جداً', 'It is extremely hot'], ['عشان متغطي بنباتات حمرا', 'It is covered in red plants']] },
    radio: ['المريخ، الكوكب الأحمر. الروبوتات سبقتنا لهنا، دوّر على واحد!', 'Mars, the red planet. Robots got here before us. Look for one!'],
  },
  jupiter: {
    stats: { temp: ['١١٠ تحت الصفر فوق السحاب', '−110 °C at the cloud tops'], day: ['حوالي ١٠ ساعات', 'About 10 hours'], year: ['حوالي ١٢ سنة', 'About 12 years'] },
    facts: [['المشتري أكبر كوكب في المجموعة الشمسية. ممكن تحط جواه أكتر من ١٣٠٠ كرة أرضية.', 'Jupiter is the biggest planet in the solar system. More than 1,300 Earths could fit inside it.'],
      ['المشتري عملاق غازي، أغلبه هيدروجين وهيليوم، ومفيهوش سطح صلب تقف عليه.', 'Jupiter is a gas giant, mostly hydrogen and helium, with no solid surface to stand on.'],
      ['البقعة الحمرا الكبيرة عاصفة أكبر من الأرض كلها، والعلماء بيتفرّجوا عليها من أكتر من ١٥٠ سنة.', 'The Great Red Spot is a storm bigger than Earth, and scientists have watched it for more than 150 years.']],
    quiz: { q: ['ليه مينفعش تقف على المشتري؟', 'Why can’t you stand on Jupiter?'], o: [['عشان مفيهوش سطح صلب', 'It has no solid surface'], ['عشان هو صغير جداً', 'It is too small'], ['عشان متغطي بالمية', 'It is covered in water']] },
    radio: ['المشتري، ملك الكواكب. مفيش أرض هنا، هتطير بالشنطة النفاثة جوه السحاب. بص لفوق هتشوف أقماره!', 'Jupiter, king of the planets. There is no ground, so you will fly with your jetpack in the clouds. Look up to see its moons!'],
  },
  saturn: {
    stats: { temp: ['١٤٠ تحت الصفر', '−140 °C'], day: ['حوالي ١٠٫٧ ساعة', 'About 10.7 hours'], year: ['حوالي ٢٩ سنة', 'About 29 years'] },
    facts: [['حلقات زحل معمولة من مليارات الحتت من التلج والصخر، فيهم اللي قد حبة الرمل وفيهم اللي قد بيت.', 'Saturn’s rings are made of billions of pieces of ice and rock, some as small as sand grains and some as big as houses.'],
      ['زحل أخف من المية! لو لقينا بانيو كبير كفاية، زحل هيعوم فيه.', 'Saturn is less dense than water. In a big enough bathtub, it would float!'],
      ['أكبر قمر لزحل اسمه «تيتان»، وعليه جو تقيل وبحيرات من الميثان السايل.', 'Saturn’s largest moon, Titan, has thick air and lakes of liquid methane.']],
    quiz: { q: ['حلقات زحل معمولة من إيه؟', 'What are Saturn’s rings made of?'], o: [['حتت تلج وصخر', 'Pieces of ice and rock'], ['دهب', 'Gold'], ['دخان', 'Smoke']] },
    radio: ['زحل! بص لفوق وإنت جوه السحاب، هتشوف الحلقات مالية السما.', 'Saturn! Look up from inside the clouds and you will see the rings across the sky.'],
  },
  uranus: {
    stats: { temp: ['١٩٥ تحت الصفر', '−195 °C'], day: ['حوالي ١٧ ساعة', 'About 17 hours'], year: ['٨٤ سنة', '84 years'] },
    facts: [['أورانوس بيلف وهو نايم على جنبه، مايل حوالي ٩٨ درجة، زي كورة بتتدحرج.', 'Uranus spins lying on its side, tilted about 98 degrees, like a rolling ball.'],
      ['أورانوس عملاق جليدي، ولونه الأزرق المخضر جاي من غاز الميثان.', 'Uranus is an ice giant, and its blue-green colour comes from methane gas.'],
      ['أورانوس عنده أبرد جو في كل الكواكب، وصل لحوالي ٢٢٤ درجة تحت الصفر. والسنة هناك ٨٤ سنة أرضية.', 'Uranus has the coldest air of any planet, down to about −224 °C. A year there lasts 84 Earth years.']],
    quiz: { q: ['إيه الغريب في طريقة لف أورانوس؟', 'What is strange about how Uranus spins?'], o: [['بيلف وهو نايم على جنبه', 'It spins on its side'], ['مابيلفش خالص', 'It does not spin at all'], ['بيلف كل ٥ دقايق', 'It spins every 5 minutes']] },
    radio: ['أورانوس، العملاق الجليدي. الدنيا هنا ساقعة بطريقة متتخيلهاش.', 'Uranus, the ice giant. It is colder here than you can imagine.'],
  },
  neptune: {
    stats: { temp: ['٢٠٠ تحت الصفر', '−200 °C'], day: ['حوالي ١٦ ساعة', 'About 16 hours'], year: ['١٦٥ سنة', '165 years'] },
    facts: [['نبتون فيه أسرع رياح في المجموعة الشمسية، أكتر من ٢٠٠٠ كيلو في الساعة.', 'Neptune has the fastest winds in the solar system, more than 2,000 km/h.'],
      ['نبتون اتكشف بالحساب! سنة ١٨٤٦ العلما حسبوا مكانه من حركة أورانوس قبل ما حد يشوفه بالتلسكوب.', 'Neptune was found with maths! In 1846 scientists worked out where it was from the way Uranus moved, before anyone saw it.'],
      ['السنة على نبتون ١٦٥ سنة أرضية. من ساعة ما اتكشف، كمّل أول لفة حوالين الشمس سنة ٢٠١١ بس.', 'A year on Neptune lasts 165 Earth years. It finished its first full orbit since its discovery only in 2011.']],
    quiz: { q: ['نبتون اتكشف إزاي؟', 'How was Neptune discovered?'], o: [['العلما حسبوا مكانه بالرياضيات الأول', 'Scientists predicted it with maths first'], ['قدماء المصريين شافوه', 'Ancient Egyptians saw it'], ['مسبار فضائي لقاه', 'A space probe found it']] },
    radio: ['نبتون، آخر كوكب. امسك نفسك، الرياح هنا أسرع من أي حاجة شفتها!', 'Neptune, the last planet. Hold on, the winds here are faster than anything you have seen!'],
  },
  galaxy: {
    quiz: { q: ['الشمس بتاخد قد إيه عشان تلف لفة واحدة حوالين نص المجرة؟', 'How long does the Sun take to go once around the centre of the galaxy?'], o: [['حوالي ٢٣٠ مليون سنة', 'About 230 million years'], ['سنة واحدة', 'One year'], ['حوالي ١٠٠ سنة', 'About 100 years']] },
  },
};
const LMK = {
  mercury: [{ p: [33, 40], piece: 'crater', name: ['حوض كالوريس', 'Caloris Basin'], fact: ['الحفرة دي شبه «حوض كالوريس»، واحدة من أكبر الحفر في المجموعة الشمسية، عرضه حوالي ١٥٥٠ كيلو! عمله نيزك ضخم خبط في عطارد من مليارات السنين.', 'This crater looks like the Caloris Basin, one of the largest impact craters in the solar system, about 1,550 km wide. A huge space rock made it billions of years ago.'] },
    { p: [-60, 70], piece: 'ice', name: ['تلج في الضلمة', 'Ice in the dark'], fact: ['جوه حفر عند أقطاب عطارد الشمس مابتوصلهاش أبداً، والعلماء لقوا فيها تلج مية! أقرب كوكب للشمس فيه تلج.', 'Inside craters near Mercury’s poles where sunlight never reaches, scientists found water ice. The planet closest to the Sun has ice!'] }],
  venus: [{ p: [-50, 55], piece: 'lava', name: ['حقل حمم', 'Lava field'], fact: ['الزهرة فيها براكين أكتر من أي كوكب تاني في المجموعة الشمسية، ومن أشهرها «ماعت مونس» وارتفاعه حوالي ٨ كيلو.', 'Venus has more volcanoes than any other planet in the solar system. One of the best known, Maat Mons, is about 8 km high.'] },
    { p: [17, -6], piece: 'venera', name: ['مركبة فينيرا ١٣', 'Venera 13'], fact: ['ده شبه مركبة «فينيرا ١٣» السوفيتية. سنة ١٩٨٢ نزلت هنا وفضلت شغّالة ١٢٧ دقيقة بس قبل ما الحر والضغط يبوّظوها.', 'This looks like the Soviet Venera 13 lander. In 1982 it landed here and kept working for only 127 minutes before the heat and pressure destroyed it.'] }],
  earth: [{ p: [-140, -170], piece: 'pyrview', name: ['الهرم الأكبر', 'The Great Pyramid'], fact: ['الهرم الأكبر هو الوحيد اللي لسه واقف من عجايب الدنيا السبع القديمة.', 'The Great Pyramid is the only one of the Seven Wonders of the Ancient World still standing.'] },
    { p: [193, 30], piece: 'nile', name: ['نهر النيل', 'The Nile'], fact: ['النيل من أطول أنهار العالم، طوله حوالي ٦٦٥٠ كيلو، ومن غيره مكانتش الحضارة المصرية القديمة هتقوم.', 'The Nile is one of the longest rivers in the world, about 6,650 km long. Without it, ancient Egyptian civilisation could not have grown.'] }],
  moon: [{ p: [18, -6], piece: 'apollo', name: ['موقع أبولو', 'Apollo site'], fact: ['ده شبه مركبة الهبوط بتاعة أبولو والعلم اللي رواد الفضاء حطّوه. في الحقيقة، العلم لونه بهت من شمس القمر القوية.', 'This looks like an Apollo landing craft and the flag the astronauts planted. In reality, the strong sunlight has faded the flag’s colours.'] },
    { p: [-60, -80], piece: 'earthrise', name: ['شروق الأرض', 'Earthrise'], fact: ['من على القمر، الأرض شكلها أعرض بحوالي ٤ مرات من القمر لما بنشوفه من الأرض. وصورة «شروق الأرض» المشهورة اتصورت من مدار القمر سنة ١٩٦٨.', 'From the Moon, Earth looks about four times wider than the Moon looks from Earth. The famous Earthrise photo was taken from lunar orbit in 1968.'] }],
  mars: [{ p: [17, -9], piece: 'rover', name: ['روبوت برسيفيرانس', 'Perseverance rover'], fact: ['ده روبوت شبه «برسيفيرانس»، اللي بيستكشف المريخ من سنة ٢٠٢١. بيحفر في الصخور ويدوّر على علامات حياة صغيرة كانت ممكن تعيش هنا من زمان.', 'This robot looks like Perseverance, exploring Mars since 2021. It drills into rocks looking for signs of tiny life that may have lived here long ago.'] },
    { p: [-70, 60], piece: 'dustdevil', name: ['دوّامة تراب', 'Dust devil'], fact: ['على المريخ فيه دوّامات تراب بتلف زي الإعصار الصغير، وفي منها بيوصل ارتفاعه لكذا كيلو.', 'Mars has dust devils, spinning columns of dust like small tornadoes. Some grow several kilometres tall.'] }],
  jupiter: [{ p: [60, 14, -40], piece: 'io', name: ['رصد القمر آيو', 'Watching Io'], fact: ['«آيو» واحد من أقمار المشتري، وهو أكتر مكان فيه براكين نشطة في المجموعة الشمسية كلها.', 'Io, one of Jupiter’s moons, is the most volcanically active place in the solar system.'] },
    { p: [-55, 10, 50], piece: 'ganymede', name: ['رصد جانيميد', 'Watching Ganymede'], fact: ['«جانيميد» أكبر قمر في المجموعة الشمسية، وأكبر من كوكب عطارد نفسه.', 'Ganymede is the largest moon in the solar system, bigger than the planet Mercury.'] }],
  saturn: [{ p: [50, 12, 50], piece: 'icechunks', name: ['حتت من الحلقات', 'Ring fragments'], fact: ['حلقات زحل بتمتد لحد حوالي ٢٨٠ ألف كيلو من الكوكب، لكن سُمكها في الحلقات الرئيسية حوالي ١٠ متر بس!', 'Saturn’s rings stretch up to about 280,000 km from the planet, but the main rings are typically only about 10 metres thick!'] },
    { p: [-70, 10, -60], piece: 'hexagon', name: ['السداسي', 'The hexagon'], fact: ['عند القطب الشمالي لزحل فيه عاصفة عملاقة شكلها سداسي، أعرض من الأرض نفسها.', 'At Saturn’s north pole there is a giant six-sided storm, wider than Earth itself.'] }],
  uranus: [{ p: [55, 12, -35], piece: 'urings', name: ['حلقات أورانوس', 'Uranus’s rings'], fact: ['أورانوس عنده ١٣ حلقة معروفة، وعشان هو نايم على جنبه، حلقاته شكلها واقف.', 'Uranus has 13 known rings, and because the planet lies on its side, its rings look like they stand upright.'] },
    { p: [-60, 14, 45], piece: 'voyager2', name: ['فوياجر ٢', 'Voyager 2'], fact: ['«فوياجر ٢» هو المسبار الوحيد اللي زار أورانوس، سنة ١٩٨٦، وزار نبتون بعدها سنة ١٩٨٩.', 'Voyager 2 is the only spacecraft to have visited Uranus, in 1986. It went on to visit Neptune in 1989.'] }],
  neptune: [{ p: [60, 8, 60], piece: 'darkspot', name: ['البقعة المظلمة الكبيرة', 'Great Dark Spot'], fact: ['سنة ١٩٨٩ «فوياجر ٢» صوّر هنا عاصفة عملاقة اسمها البقعة المظلمة الكبيرة، وبعدين اختفت!', 'In 1989 Voyager 2 photographed a giant storm here called the Great Dark Spot. Later it disappeared!'] },
    { p: [-55, 12, -50], piece: 'triton', name: ['رصد تريتون', 'Watching Triton'], fact: ['«تريتون» أكبر قمر لنبتون، وبيلف عكس اتجاه لف الكوكب، وعليه نافورات بتطلّع غاز.', 'Triton, Neptune’s largest moon, orbits backwards and has geysers that shoot out gas.'] }],
};
const CRAFT_INFO = {
  iss: { name: ['محطة الفضاء الدولية', 'International Space Station'], fact: ['محطة الفضاء الدولية بتلف حوالين الأرض كل حوالي ٩٠ دقيقة، على ارتفاع حوالي ٤٠٠ كيلو، وفيها رواد فضاء عايشين من سنة ٢٠٠٠ من غير انقطاع.', 'The International Space Station circles Earth about every 90 minutes, about 400 km up, and astronauts have lived aboard without a break since 2000.'] },
  jwst: { name: ['تلسكوب جيمس ويب', 'James Webb Space Telescope'], fact: ['تلسكوب «جيمس ويب» اتطلق في ديسمبر ٢٠٢١. مرايته الدهبي عرضها ٦٫٥ متر، وهو بعيد عن الأرض حوالي ١٫٥ مليون كيلو.', 'The James Webb Space Telescope launched in December 2021. Its gold mirror is 6.5 metres wide, and it sits about 1.5 million km from Earth.'] },
  voyager: { name: ['فوياجر ١', 'Voyager 1'], fact: ['«فوياجر ١» اتطلق سنة ١٩٧٧، وهو أبعد حاجة بناها الإنسان. سنة ٢٠١٢ خرج من الفقاعة اللي الشمس عاملاها حوالينا ودخل الفضاء بين النجوم.', 'Voyager 1 launched in 1977 and is the farthest human-made object. In 2012 it left the bubble the Sun blows around us and entered interstellar space.'] },
  comet: { name: ['مذنّب', 'A comet'], fact: ['المذنبات كور من تلج وتراب. لما بتقرب من الشمس التلج بيتبخّر ويعمل ديل طويل دايماً بيبص بعيد عن الشمس.', 'Comets are balls of ice and dust. Near the Sun the ice turns to gas and makes a long tail that always points away from the Sun.'] },
};
const CRAFTS = Object.keys(CRAFT_INFO);
const GAL = {
  center: { name: ['نص المجرة', 'Galactic centre'], fact: ['في نص المجرة فيه ثقب أسود عملاق اسمه «القوس أ*»، كتلته حوالي ٤ مليون مرة قد الشمس.', 'At the centre of the galaxy sits a giant black hole called Sagittarius A*, about 4 million times the mass of the Sun.'] },
  sun: { name: ['إنت هنا', 'You are here'], fact: ['إنت هنا! الشمس في ذراع صغير اسمه «ذراع الجبّار»، على بُعد حوالي ٢٦ ألف سنة ضوئية من نص المجرة، وبتاخد حوالي ٢٣٠ مليون سنة عشان تلف لفة واحدة حواليه.', 'You are here! The Sun sits in a small arm called the Orion Arm, about 26,000 light-years from the centre. It takes about 230 million years to go once around it.'] },
  edge: { name: ['حافة المجرة', 'Edge of the galaxy'], fact: ['مجرة درب التبانة عرضها حوالي ١٠٠ ألف سنة ضوئية، وفيها ما بين ١٠٠ و٤٠٠ مليار نجم.', 'The Milky Way is about 100,000 light-years across and holds between 100 and 400 billion stars.'] },
  andromeda: { name: ['مجرة أندروميدا', 'Andromeda galaxy'], fact: ['«أندروميدا» أقرب مجرة كبيرة لينا، على بُعد حوالي ٢٫٥ مليون سنة ضوئية. النور اللي بنشوفه منها طلع من قبل ما الإنسان الحديث يظهر بكتير.', 'Andromeda is the nearest large galaxy, about 2.5 million light-years away. The light we see from it left long before modern humans existed.'] },
};

/* register content strings */
for (const [k, v] of Object.entries(INFO)) {
  (v.facts ?? []).forEach(([a, e], i) => S(`fact.${k}.${i}`, a, e));
  if (v.radio) S(`radio.${k}`, v.radio[0], v.radio[1]);
  for (const [s, [a, e]] of Object.entries(v.stats ?? {})) S(`stat.${k}.${s}`, a, e);
  S(`quiz.${k}.q`, v.quiz.q[0], v.quiz.q[1]);
  v.quiz.o.forEach(([a, e], i) => S(`quiz.${k}.o${i}`, a, e));
  if (v.facts) S(`card.${k}`, v.facts.map((f) => f[0]).join('\n\n'), v.facts.map((f) => f[1]).join('\n\n'));
}
for (const [k, list] of Object.entries(LMK))
  list.forEach((L, i) => {
    S(`lm.${k}.${i}`, L.name[0], L.name[1]);
    S(`lm.${k}.${i}.fact`, L.fact[0], L.fact[1]);
  });
for (const [k, c] of Object.entries(CRAFT_INFO)) {
  S(`craft.${k}`, c.name[0], c.name[1]);
  S(`craft.${k}.fact`, c.fact[0], c.fact[1]);
}
for (const [k, g] of Object.entries(GAL)) {
  S(`gal.${k}`, g.name[0], g.name[1]);
  S(`gal.${k}.fact`, g.fact[0], g.fact[1]);
}
S('card.galaxy', ar['gal.intro'] + '\n\n' + ar['gal.sun.fact'], en['gal.intro'] + '\n\n' + en['gal.sun.fact']);

/* ---------------------------------------------------------------- shared condition helpers */
const stamp = (k) => ({ stamp: k });
const ALL_PLANETS = { all: ORDER.map(stamp) };
const ALL_STAMPS = { all: MISSION.map(stamp) };
/** "k is the next stop" (the first mission stop without a stamp). */
const nextIs = (k) => ({ all: [...MISSION.slice(0, MISSION.indexOf(k)).map(stamp), { not: stamp(k) }] });
const say = (dialogue) => ({ do: 'show.dialogue', dialogue });
const sceneOf = (k) => (k === 'sun' ? 'space' : k === 'galaxy' ? 'galaxy' : `world-${k}`);

/* ---------------------------------------------------------------- space: bodies as data (prototype DEF) */
const DEF = {
  sun: { r: 30, dist: 0, period: 1, col: '#ffb347', kind: 'star' },
  mercury: { r: 2.2, dist: 88, period: 80, col: '#a39c94', kind: 'rock', g: 0.38, a0: 0.5, spin: 0.2 },
  venus: { r: 3.6, dist: 128, period: 120, col: '#e3c08a', kind: 'rock', g: 0.91, a0: 2.1, spin: -0.05 },
  earth: { r: 3.8, dist: 172, period: 165, col: '#3f7fd0', kind: 'rock', g: 1, a0: 4.0, spin: 0.5 },
  moon: { r: 1.1, dist: 34, period: 40, col: '#b9b6ae', kind: 'rock', g: 0.166, parent: 'earth', a0: 0, spin: 0 },
  mars: { r: 2.7, dist: 222, period: 220, col: '#c1532c', kind: 'rock', g: 0.38, a0: 5.4, spin: 0.45 },
  jupiter: { r: 14, dist: 335, period: 480, col: '#d8a878', kind: 'gas', g: 2.53, a0: 1.2, spin: 0.9 },
  saturn: { r: 12, dist: 450, period: 640, col: '#e3cf9a', kind: 'gas', g: 1.07, a0: 3.0, spin: 0.8, rings: true, tilt: 0.47 },
  uranus: { r: 7, dist: 550, period: 820, col: '#9fdde3', kind: 'gas', g: 0.89, a0: 4.6, spin: 0.5, tilt: 1.71 },
  neptune: { r: 6.8, dist: 640, period: 1000, col: '#3b62d6', kind: 'gas', g: 1.14, a0: 0.2, spin: 0.55 },
};
const standoff = (k) => (k === 'sun' ? DEF.sun.r * 2.3 : DEF[k].r * 2.6 + 7);

const models = {};
const M = (id, parts, materials) => (models[id] = { id, parts, ...(materials ? { materials } : {}) });
M('iss', [
  { shape: 'box', args: [3, 0.12, 0.12], material: 'white' },
  ...[-1.2, -0.7, 0.7, 1.2].flatMap((sx) => [-1, 1].map((sz) => ({ shape: 'box', args: [0.42, 0.02, 1.4], at: [sx, 0, sz * 0.8], material: 'panel' }))),
  { shape: 'cylinder', args: [0.14, 0.14, 1.2, 10], geoRot: [PI / 2, 0, 0], material: 'white' },
  { shape: 'cylinder', args: [0.12, 0.12, 0.8, 10], geoRot: [0, 0, PI / 2], at: [0, 0, 0.5], material: 'white' },
], {
  white: { color: '#e8eaee', roughness: 0.5, metalness: 0.4 },
  panel: { color: '#24356e', roughness: 0.3, metalness: 0.6, emissive: '#0a1430', emissiveIntensity: 0.5 },
});
models.iss.scale = 0.9;
M('jwst', [
  ...[0, 1, 2].map((i) => ({ shape: 'plane', args: [r2(4.2 - i * 0.4), r2(2.4 - i * 0.25)], geoRot: [-PI / 2, 0, 0], at: [0, r2(-0.6 + i * 0.12), 0], rot: [0, PI / 4, 0], material: 'shield' })),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 6) * TAU, r = i === 0 ? 0 : 0.42;
    return { shape: 'cylinder', args: [0.24, 0.24, 0.06, 6], geoRot: [PI / 2, 0, 0], at: [r3(Math.cos(a) * r), r3(0.6 + Math.sin(a) * r), 0.2], material: 'gold' };
  }),
  { shape: 'cylinder', args: [0.02, 0.02, 1.2, 6], geoRot: [PI / 2, 0, 0], at: [0, 0.6, 0.8], material: 'white' },
], {
  shield: { color: '#c9a6d8', roughness: 0.4, metalness: 0.6, doubleSide: true },
  gold: { color: '#e2b04a', roughness: 0.25, metalness: 0.9, emissive: '#3a2808', emissiveIntensity: 0.4 },
  white: { color: '#e8eaee', roughness: 0.5, metalness: 0.4 },
});
M('voyager', [
  { shape: 'sphere', args: [1.1, 20, 10, 0, TAU, 0, 0.6], rot: [PI / 2, 0, 0], material: 'white' },
  { shape: 'cylinder', args: [0.4, 0.4, 0.3, 10], at: [0, 0, -0.5], rot: [PI / 2, 0, 0], material: 'gold' },
  { shape: 'cylinder', args: [0.03, 0.03, 4, 6], geoRot: [0, 0, PI / 2], at: [1.8, 0, -0.5], material: 'white' },
], { white: { color: '#e8eaee', roughness: 0.5, metalness: 0.4, doubleSide: true }, gold: { color: '#e2b04a', roughness: 0.25, metalness: 0.9, emissive: '#3a2808', emissiveIntensity: 0.4 } });
M('comet', [
  { shape: 'icosahedron', args: [1.4, 1], material: 'nucleus', name: 'nucleus' },
  { shape: 'sprite', args: [14], material: { type: 'additive', color: '#bff6ff', opacity: 0.85 }, name: 'coma' },
  { shape: 'cone', args: [5, 70, 16, 1, true], pivot: [0, -35, 0], material: 'tail', name: 'tail' },
], {
  nucleus: { color: '#5a5550', roughness: 1, flatShading: true },
  tail: { type: 'additive', color: '#9fe8ff', alphaFade: true, transparent: true, opacity: 0.5, depthWrite: false, doubleSide: true },
});
M('golden-asteroid', [
  { shape: 'icosahedron', args: [2, 0], scale: [1, 0.75, 1.1], material: 'gold' },
  { shape: 'sprite', args: [12], material: { type: 'additive', color: '#ffd27a', opacity: 0.6 } },
], { gold: { color: '#e9b44c', emissive: '#8a5a10', emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.7, flatShading: true } });

const spaceEntities = [];
const SE = (e) => (spaceEntities.push(e), e);
for (const k of ORDER) {
  const d = DEF[k];
  const params = k === 'sun'
    ? { radius: d.r, style: 'sun', star: true, glow: [['#ffcf6b', 150, 0.85], ['#ff8a2a', 340, 0.35]], segments: 48 }
    : {
      radius: d.r, style: k, textureSize: ['earth', 'jupiter', 'saturn'].includes(k) ? 384 : 256, spin: d.spin,
      ...(k === 'earth' ? { clouds: true, atmosphere: { color: '#5ea8ff', scale: 3.1, opacity: 0.35 } } : {}),
      ...(d.rings ? { rings: { inner: 1.3, outer: 2.3, tilt: d.tilt } } : d.tilt ? { tilt: d.tilt } : {}),
    };
  const so = r2(standoff(k));
  const landActions = [{ do: 'go.scene', scene: `world-${k}`, spawn: 'lander', transition: 'fade', toast: { key: 'r.landingAt', params: { n: { text: `name.${k}` } } } }];
  const triggers = [
    {
      on: 'interact', radius: r2(so * 1.8), style: 'card', when: { autopilot: false },
      label: k === 'sun' ? 'orbit.observe' : d.kind === 'gas' ? 'orbit.landGas' : 'orbit.land',
      card: { kicker: 'orbit.of', title: `body.${k}`, sub: k === 'sun' ? 'orbit.sunTeaser' : d.kind === 'gas' ? 'orbit.gasTeaser' : { key: 'orbit.weight', params: { w: { literal: Math.round(60 * d.g) } } }, swatch: d.col },
      do: k === 'sun' ? [{ do: 'control.if', when: stamp('sun'), then: [say('sun-facts-done')], else: [say('sun-facts')] }] : landActions,
    },
  ];
  if (k !== 'earth') triggers.push({ on: 'enter', radius: r2(so * 1.3), when: { all: [{ autopilot: false }, { not: { flag: `radio-${k}` } }] }, do: [{ do: 'set.flag', flag: `radio-${k}` }, say(`radio-${k}`)] });
  SE({
    id: k,
    kind: 'body',
    at: [0, 0, 0],
    ground: false,
    model: { gen: 'body', params },
    ...(k === 'sun' ? {} : { motion: d.parent ? { type: 'orbit', center: d.parent, radius: d.dist, period: d.period, phase: d.a0, amp: 1.2, lookAt: 'motion' } : { type: 'orbit', center: [0, 0, 0], radius: d.dist, period: d.period, phase: d.a0 } }),
    label: { text: `body.${k}`, style: k === 'moon' ? 'small' : 'body', dot: d.col, max: k === 'moon' ? 120 : 4000, check: stamp(k) },
    solid: { type: 'sphere', r: r2(k === 'sun' ? d.r * 1.5 : d.r + 1.6), push: k === 'sun' ? 2.2 : 1, ...(k === 'sun' ? { warn: 'space.sunHot' } : {}) },
    standoff: so,
    carry: 3,
    poi: `poi.${k}`,
    triggers,
  });
  if (!d.parent && d.dist > 0) SE({ id: `orbit-${k}`, kind: 'prop', at: [0, 0, 0], ground: false, model: { gen: 'orbit-line', params: { radius: d.dist, color: '#4a5f96', opacity: 0.35 } } });
}
SE({ id: 'belt', kind: 'prop', at: [0, 0, 0], ground: false, model: { gen: 'belt', params: { count: 700, rMin: 262, width: 36, seed: 71, color: '#8d8172' } }, motion: { type: 'spin', axis: 'y', speed: 0.004 } });
[0.3, 1.55, 2.8, 4.1, 5.35].forEach((a, i) => {
  // the prototype's golden asteroids ride on the slowly turning belt
  SE({
    id: `ast-${i}`, kind: 'pickup', at: [r2(Math.cos(a) * 278), 1, r2(Math.sin(a) * 278)], ground: false,
    model: { gen: 'composite', ref: 'golden-asteroid' },
    motion: { type: 'orbit', center: [0, 1, 0], radius: 278, period: r2(TAU / 0.004), phase: a, direction: -1 },
    label: { text: 'ast.name', style: 'gold', max: 160, when: { not: { counter: 'ast', has: String(i) } } },
    standoff: 6,
    triggers: [{ on: 'enter', radius: 7, when: { not: { counter: 'ast', has: String(i) } }, do: [
      { do: 'add.counter', counter: 'ast', value: String(i) },
      { do: 'add.counter', counter: 'found', value: `ast:${i}` },
      { do: 'show.toast', text: { key: 'ast.scanned', params: { n: { counter: 'ast' } } }, kind: 'gold', ms: 3000 },
      { do: 'control.if', when: { any: [{ counter: 'ast', gte: 5 }, { counter: 'ast', lt: 2 }] }, then: [say('ast-fact')] },
    ] }],
  });
});
const craftDefs = {
  iss: { motion: { type: 'orbit', center: 'earth', radius: 7.5, period: 14, amp: 2, lookAt: 'motion' }, standoff: 4, near: 3.5, max: 70, at: [0, 0, 0] },
  jwst: { motion: { type: 'anchor', entity: 'earth', radial: 48, up: 4, lookAt: [0, 0, 0] }, standoff: 6, near: 6, max: 500, at: [0, 0, 0] },
  voyager: { motion: { type: 'bob', amp: 0, lookAt: [0, 0, 0] }, standoff: 7, near: 7, max: 500, at: [-760, 40, -260] },
  comet: { motion: { type: 'ellipse', a: 380, b: 205, e: 0.84, rot: 0.7, period: 260, amp: 12, tailAwayFrom: [0, 0, 0] }, standoff: 8, near: 9, max: 900, at: [0, 0, 0] },
};
for (const k of CRAFTS) {
  const c = craftDefs[k];
  const got = { counter: 'craft', has: k };
  const triggers = [{ on: 'enter', radius: c.near + 2, when: { not: got }, do: [
    { do: 'add.counter', counter: 'craft', value: k },
    { do: 'add.counter', counter: 'found', value: `craft:${k}` },
    { do: 'show.toast', text: { key: 'craft.got', params: { n: { text: `craft.${k}` } } }, kind: 'gold', ms: 3000 },
    say(`craft-${k}`),
  ] }];
  if (k === 'comet') triggers.push({ on: 'enter', radius: 260, when: { not: got }, do: [say('comet-alert')] });
  SE({ id: k, kind: 'craft', at: c.at, ground: false, model: { gen: 'composite', ref: k }, motion: c.motion, label: { text: `craft.${k}`, style: 'craft', max: c.max, y: k === 'comet' ? 5 : 3, check: got }, standoff: c.standoff, triggers });
}

const spaceSpawns = {
  start: { near: { entity: 'earth', side: 'sun' }, camera: { dist: 16, pitch: 0.18 } },
  'near-sun': { near: { entity: 'sun', dir: [1, 0.2, 0.4] }, camera: { dist: 26, pitch: 0.2 } },
};
for (const k of ORDER.slice(1)) spaceSpawns[`near-${k}`] = { near: { entity: k, side: 'sun', ...(k === 'moon' ? { dir: [0.3, 0.25, 1] } : {}) }, camera: { dist: Math.max(14, r2(DEF[k].r * 2.2)), pitch: 0.2 } };

/* mission quest: ordered stops; buttons are "Warp & land" (index 0) and "Fly there" (index 1, space only) */
const missionSteps = MISSION.map((k) => {
  const buttons = k === 'galaxy'
    ? [{ label: 'mission.openGal', icon: 'galaxy', style: 'teal', do: [{ do: 'go.scene', scene: 'galaxy', transition: 'zoom-out' }] }]
    : [
      k === 'sun'
        ? { label: 'mission.warpLand', icon: 'bolt', style: 'teal', do: [{ do: 'go.scene', scene: 'space', spawn: 'near-sun', transition: 'warp' }] }
        : { label: 'mission.warpLand', icon: 'bolt', style: 'teal', do: [{ do: 'go.scene', scene: `world-${k}`, spawn: 'lander', transition: 'warp', toast: { key: 'r.landingAt', params: { n: { text: `name.${k}` } } } }] },
      { label: 'mission.flyThere', icon: 'compass', style: 'gold', when: { scene: 'space' }, do: [{ do: 'travel.to', target: k, mode: 'auto' }] },
    ];
  return { id: k, label: `name.${k}`, ...(k === 'galaxy' ? {} : { target: k }), done: stamp(k), buttons };
});
const quest = {
  id: 'mission',
  title: 'mission.title',
  kicker: 'mission.kicker',
  icon: 'rocket',
  mode: 'ordered',
  steps: missionSteps,
  done: ALL_STAMPS,
  goal: { next: 'mission.next', noTarget: 'mission.next', done: 'mission.done' },
  progress: { counter: 'stamps', of: 11, style: 'dots' },
  objectives: ['obj.sun', 'obj.worlds', 'obj.types', 'obj.gravity', 'obj.galaxy'],
  scenes: ['space'],
};

const spaceScene = {
  id: 'space',
  kind: 'space',
  title: 'pack.title',
  environment: {
    background: '#02030a',
    pointLight: { color: '#fff1dc', intensity: 3.3, at: [0, 0, 0] },
    ambient: { color: '#3a4466', intensity: 0.35 },
    stars: { count: 4200, radius: 6000, size: 1.4, bright: 500, band: 5000 },
    dust: { count: 420, color: '#a8bcff', size: 0.5, box: 160, drift: [0, 0] },
  },
  player: { controller: 'spacecraft', avatar: 'ship', speed: 45, boost: 150, camera: { dist: 16, min: 8, max: 140, minPitch: -1.3, pitch: 0.18 }, bounds: { center: [0, 0], radius: 1500 } },
  spawns: spaceSpawns,
  defaultSpawn: 'start',
  intro: { center: [0, 0, 0], radius: 420, height: 150, speed: 0.03, phase: 0.97 },
  entities: spaceEntities,
  hud: {
    hints: { default: { touch: 'hint.spaceT', desk: 'hint.spaceD' } },
    travelBar: ORDER.map((k) => ({ entity: k, check: stamp(k) })),
    buttons: [
      { id: 'galaxy', label: 'space.galaxyBtn', icon: 'galaxy', do: [{ do: 'go.scene', scene: 'galaxy', transition: 'zoom-out' }] },
      { id: 'boost', label: 'space.boost', icon: 'bolt', hold: 'boost' },
    ],
    quest: true,
  },
};

/* ---------------------------------------------------------------- surfaces (prototype SURF) */
const SURF = {
  mercury: { type: 'rock', ground: ['#938d86', '#5f5a55'], amp: 5, craters: 40, sky: ['#000000', '#06070c', '#000000'], stars: true, sun: 2.6, sunCol: '#fffaf0', light: 3.6, hemi: ['#8890a0', '#2a2622', 0.35], fog: ['#000000', 600, 1300], seed: 3, sunDir: [-0.5, 0.55, 0.3] },
  venus: { type: 'rock', ground: ['#7d5a34', '#4e3720'], amp: 4, craters: 2, sky: ['#b9772d', '#e6a65a', '#9c6a35'], stars: false, sun: 0, sunCol: '#ffd59a', light: 1.4, lightCol: '#ffb36b', hemi: ['#e7a457', '#5a3a1c', 1.0], fog: ['#cf914e', 14, 190], seed: 5, sunDir: [-0.2, 0.9, 0.2] },
  earth: { type: 'rock', ground: ['#ddb57c', '#c39258'], amp: 2.2, craters: 0, sky: ['#3d7dd0', '#d4e6f2', '#e7d2a8'], stars: false, sun: 1, sunCol: '#fff3d6', light: 3.0, hemi: ['#cfe3ff', '#8a6a46', 1.1], fog: ['#d7e6f2', 260, 1400], seed: 7, site: 'egypt', sunDir: [-0.6, 0.5, 0.35] },
  moon: { type: 'rock', ground: ['#b0ada7', '#76736e'], amp: 4, craters: 45, sky: ['#000000', '#030408', '#000000'], stars: true, sun: 1, sunCol: '#ffffff', light: 3.4, hemi: ['#8f96a8', '#2b2b2b', 0.3], fog: ['#000000', 600, 1300], seed: 11, earthInSky: true, sunDir: [-0.65, 0.42, 0.35] },
  mars: { type: 'rock', ground: ['#b8613a', '#7f3f24'], amp: 9, craters: 8, sky: ['#b98a66', '#e2b289', '#c88c62'], stars: false, sun: 0.66, sunCol: '#fff1dc', light: 2.5, hemi: ['#e8b08a', '#5a2c1a', 0.8], fog: ['#d9a27c', 160, 950], seed: 13, sunDir: [-0.55, 0.45, 0.4] },
  jupiter: { type: 'gas', bands: ['#e9d4b0', '#c99a6a', '#f3e6cc', '#a8704a', '#e0bf93'], sky: ['#5c6f9c', '#ead2a8', '#c9a479'], fog: ['#dcc19a', 40, 600], sun: 0.19, sunCol: '#fff2dc', light: 1.8, hemi: ['#f4e3c8', '#8a6a4a', 1.0], seed: 17, sunDir: [-0.5, 0.5, 0.3] },
  saturn: { type: 'gas', bands: ['#f1e2bc', '#d8bf8a', '#efe2c2', '#c9ab72', '#e8d6a8'], sky: ['#6c84ae', '#f1e3bd', '#d3bd8c'], fog: ['#e6d4ab', 40, 600], sun: 0.1, sunCol: '#fff2dc', light: 1.6, hemi: ['#fff1d0', '#8f7a54', 1.0], seed: 19, rings: true, sunDir: [-0.5, 0.5, 0.3] },
  uranus: { type: 'gas', bands: ['#bfeef0', '#a6e1e6', '#c9f2f2', '#9ad7dd', '#b5e9ec'], sky: ['#4d9bb0', '#c8f1f2', '#9fd8dd'], fog: ['#b5e5e8', 40, 600], sun: 0.05, sunCol: '#ffffff', light: 1.3, hemi: ['#d9fbff', '#4d8a92', 1.0], seed: 23, urings: true, sunDir: [-0.5, 0.5, 0.3] },
  neptune: { type: 'gas', bands: ['#3f66d8', '#2f50b8', '#5a80e6', '#2443a0', '#4a70dc'], sky: ['#13307e', '#5f86de', '#2c4fae'], fog: ['#3e64c8', 40, 600], sun: 0.03, sunCol: '#ffffff', light: 1.2, hemi: ['#a9c0ff', '#1c2c6a', 1.0], seed: 29, winds: true, sunDir: [-0.5, 0.5, 0.3] },
};

/** The prototype's terrH, to place things on the ground exactly where the engine's layers put it. */
function cratersFor(SP, key) {
  const r = rng(SP.seed * 97), cr = [];
  for (let i = 0; i < (SP.craters || 0); i++) {
    let x, z;
    do {
      x = (r() - 0.5) * 560;
      z = (r() - 0.5) * 560;
    } while (Math.hypot(x, z) < 22 || Math.hypot(x - 33, z - 40) < 50 || Math.hypot(x + 60, z - 70) < 25);
    const rad = 4 + Math.pow(r(), 2) * 30;
    cr.push({ x, z, r: rad, d: rad * 0.18, lim: rad * 1.9 * (rad * 1.9) });
  }
  const fixed = [];
  for (const L of LMK[key] ?? []) {
    if (L.piece === 'crater') fixed.push({ x: L.p[0] + 38, z: L.p[1], r: 36, d: 7 });
    if (L.piece === 'ice') fixed.push({ x: L.p[0], z: L.p[1], r: 13, d: 4 });
    if (L.piece === 'earthrise') fixed.push({ x: L.p[0] - 30, z: L.p[1] - 12, r: 26, d: 5 });
  }
  return { random: cr, fixed: fixed.map((c) => ({ ...c, lim: c.r * 2 * (c.r * 2) })) };
}
function terrHFor(SP, key) {
  const { random, fixed } = cratersFor(SP, key);
  const all = [...random, ...fixed];
  return (x, z) => {
    if (SP.type !== 'rock') return 0;
    const r = Math.hypot(x, z), flat = 0.2 + 0.8 * smooth(8, 55, r);
    let h = (fbm(x * 0.012 + SP.seed, z * 0.012 - SP.seed) - 0.5) * 2 * SP.amp * flat + (fbm(x * 0.05, z * 0.05) - 0.5) * SP.amp * 0.22 * flat;
    for (const c of all) {
      const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
      if (d2 > c.lim) continue;
      const d = Math.sqrt(d2) / c.r;
      h += d < 1 ? -c.d * (1 - d * d) : c.d * 0.35 * Math.exp(-((d - 1) / 0.28) * ((d - 1) / 0.28));
    }
    const over = Math.max(0, r - 240);
    h -= (over * over) / 1500;
    if (SP.site === 'egypt') h -= smooth(140, 220, x) * 3.5;
    return h;
  };
}

const MATS = {
  white: { color: '#e8eaee', roughness: 0.5, metalness: 0.4 },
  grey: { color: '#b9bcc1', roughness: 0.6, metalness: 0.3 },
  dark: { color: '#3b3d42', roughness: 0.7 },
  foil: { color: '#d4a63c', roughness: 0.35, metalness: 0.8 },
  goldp: { color: '#e2b04a', roughness: 0.3, metalness: 0.8 },
  roverw: { color: '#e8e6e0', roughness: 0.6, metalness: 0.2 },
  track: { color: '#6e3420', roughness: 1 },
  venm: { color: '#9a9488', roughness: 0.5, metalness: 0.6 },
  vend: { color: '#4a4640', roughness: 0.8 },
  basalt: { color: '#3a2a20', roughness: 1, flatShading: true },
  wood: { color: '#7a4f2c', roughness: 0.9 },
  sail: { color: '#f4eee2', roughness: 0.9, doubleSide: true },
  lava: { color: '#ff6a1a', emissive: '#ff4a00', emissiveIntensity: 2, roughness: 0.6, pulse: { min: 1, max: 2.2, speed: 2.2 } },
  ice: { color: '#dff4ff', emissive: '#4a7aa8', emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2 },
  'ice-chunk': { color: '#eef6ff', roughness: 0.3, metalness: 0.1, flatShading: true },
  'palm-trunk': { color: '#7a5c3e', roughness: 1, flatShading: true },
  'palm-crown': { color: '#4c7a33', roughness: 0.9, flatShading: true, doubleSide: true },
};
M('venera', [
  { shape: 'torus', args: [1.4, 0.18, 8, 24], rot: [PI / 2, 0, 0], at: [0, 0.25, 0], material: 'vend' },
  { shape: 'sphere', args: [1, 20, 14], at: [0, 1.3, 0], scale: [1, 1.1, 1], material: 'venm' },
  { shape: 'cylinder', args: [0.5, 0.9, 0.6, 16], at: [0, 2.4, 0], material: 'venm' },
  { shape: 'cylinder', args: [0.06, 0.06, 1.2, 6], at: [0, 3.2, 0], material: 'vend' },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * TAU;
    return { shape: 'box', args: [0.4, 0.05, 0.9], at: [r3(Math.cos(a) * 1.9), 0.15, r3(Math.sin(a) * 1.9)], rot: [0, r3(-a + PI / 2), 0], material: 'vend' };
  }),
]);
M('apollo-lander', [
  { shape: 'cylinder', args: [1.6, 1.6, 1.3, 8], at: [0, 1.5, 0], material: 'foil' },
  { shape: 'box', args: [2, 1.6, 1.8], at: [0, 2.9, 0], rot: [0, 0.4, 0], material: 'grey' },
  { shape: 'box', args: [0.5, 0.4, 0.05], at: [0.3, 3.1, 0.93], rot: [0, 0.4, 0], material: 'dark' },
  ...[0, 1, 2, 3].flatMap((i) => {
    const a = (i * PI) / 2 + PI / 4;
    return [
      { shape: 'cylinder', args: [0.06, 0.06, 2.2, 6], at: [r3(Math.cos(a) * 1.9), 0.9, r3(Math.sin(a) * 1.9)], rot: [r3(-Math.sin(a) * 0.5), 0, r3(Math.cos(a) * 0.5)], material: 'grey' },
      { shape: 'cylinder', args: [0.35, 0.35, 0.08, 12], at: [r3(Math.cos(a) * 2.4), 0.05, r3(Math.sin(a) * 2.4)], material: 'grey' },
    ];
  }),
]);
M('flag-usa', [
  { shape: 'cylinder', args: [0.04, 0.04, 2.6, 6], at: [0, 1.3, 0], material: 'grey' },
  { shape: 'plane', args: [1.4, 0.88], at: [0.72, 2.1, 0], material: { map: { gen: 'flag-usa' }, doubleSide: true, roughness: 0.9 } },
  { shape: 'cylinder', args: [0.03, 0.03, 1.45, 6], geoRot: [0, 0, PI / 2], at: [0.72, 2.55, 0], material: 'grey' },
]);
M('rover', [
  { shape: 'box', args: [2.4, 0.7, 1.8], at: [0, 1.15, 0], material: 'roverw' },
  { shape: 'box', args: [2.6, 0.12, 2], at: [0, 1.55, 0], material: 'goldp' },
  ...[-1, 0, 1].flatMap((sx) => [-1, 1].map((sz) => ({ shape: 'cylinder', args: [0.38, 0.38, 0.32, 14], geoRot: [PI / 2, 0, 0], at: [r2(sx * 1.05), 0.38, r2(sz * 1.15)], material: 'dark' }))),
  { shape: 'cylinder', args: [0.07, 0.07, 1.6, 8], at: [0.8, 2.35, 0.5], material: 'roverw' },
  { shape: 'box', args: [0.55, 0.32, 0.4], at: [0.8, 3.2, 0.5], material: 'roverw' },
  { shape: 'box', args: [0.1, 0.14, 0.3], at: [1.1, 3.2, 0.5], material: 'dark' },
  { shape: 'box', args: [1.4, 0.1, 0.1], at: [1.7, 1.2, -0.5], rot: [0, 0, -0.4], material: 'roverw' },
]);
M('voyager2', [
  { shape: 'sphere', args: [1.8, 20, 10, 0, TAU, 0, 0.6], rot: [PI / 2, 0, 0], material: { color: '#e8eaee', roughness: 0.5, metalness: 0.4, doubleSide: true } },
  { shape: 'cylinder', args: [0.6, 0.6, 0.5, 10], geoRot: [PI / 2, 0, 0], at: [0, 0, -0.8], material: 'goldp' },
  { shape: 'cylinder', args: [0.05, 0.05, 6, 6], geoRot: [0, 0, PI / 2], at: [2.8, 0, -0.8], material: 'white' },
]);
M('felucca', [
  { shape: 'cylinder', args: [0.9, 0.5, 6, 10, 1, false, 0, PI], geoRot: [PI, 0, PI / 2], material: 'wood' },
  { shape: 'cylinder', args: [0.06, 0.06, 7, 6], at: [0, 3.4, 0], material: 'wood' },
  { shape: 'triangles', points: [[0, 0.6, 0, 0, 7, 0, 3.6, 0.9, 0]], material: 'sail' },
]);
M('lava-cone', [{ shape: 'cone', args: [18, 12, 16, 1, true], material: 'basalt' }]);


function surfaceScene(k) {
  const SP = SURF[k], d = DEF[k], rock = SP.type === 'rock', H = terrHFor(SP, k);
  const ents = [];
  // entity ids are unique pack-wide, so every surface prefixes its own
  const E = (e) => (ents.push({ ...e, id: `${k}.${e.id}` }), e);
  const { fixed } = cratersFor(SP, k);
  const layers = rock
    ? [
      { type: 'fbm', freq: 0.012, offset: [SP.seed, -SP.seed], bias: -0.5, amp: 2 * SP.amp, masks: [{ coord: 'r', from: 8, to: 55, base: 0.2, gain: 0.8 }] },
      { type: 'fbm', freq: 0.05, bias: -0.5, amp: r3(SP.amp * 0.22), masks: [{ coord: 'r', from: 8, to: 55, base: 0.2, gain: 0.8 }] },
      ...(SP.craters ? [{ type: 'craters', random: { seed: SP.seed * 97, count: SP.craters, area: 560, avoid: [[0, 0, 22], [33, 40, 50], [-60, 70, 25]] } }] : []),
      ...(fixed.length ? [{ type: 'craters', craters: fixed.map((c) => ({ at: [c.x, c.z], r: c.r, depth: c.d })) }] : []),
      { type: 'bowl', from: 240, k: 1500 },
      ...(SP.site === 'egypt' ? [{ type: 'smooth', coord: 'x', from: 140, to: 220, amp: -3.5 }] : []),
    ]
    : [];
  const terrain = rock
    ? {
      type: 'layers', size: 1400, segments: 180, layers,
      colors: {
        base: SP.ground[0],
        layers: [
          { type: 'fbm', color: SP.ground[1], freq: 0.02, offset: [SP.seed * 3, 0], lo: 0.3, gain: 1.8, max: 1 },
          ...(SP.site === 'egypt' ? [{ type: 'smooth', color: '#5f8f3a', coord: 'x', from: 185, to: 205, masks: [{ coord: 'x', from: 222, to: 232, base: 1, gain: -1 }] }] : []),
        ],
      },
      texture: { gen: 'regolith', repeat: [120, 120] },
    }
    : { type: 'deck', bands: SP.bands, seed: SP.seed, scroll: SP.winds ? 0.02 : 0.004, puffs: SP.sky[1] };
  const skyObjects = [];
  if (SP.earthInSky) skyObjects.push({ model: { gen: 'body', params: { radius: 70, style: 'earth', fog: false, textureSize: 256 } }, dir: [0.35, 0.32, -0.88], distance: 1500, spin: 0.02 });
  if (SP.rings) skyObjects.push({ model: { gen: 'part', part: { shape: 'ring', args: [900, 1600, 128], material: { type: 'basic', map: { gen: 'rings' }, transparent: true, doubleSide: true, depthWrite: false, fog: false, color: '#fff4dc' } } }, dir: [0, 0, -1], distance: 1800, offset: [0, -120, -1800], rot: [-1.25, 0, 0] });
  if (SP.urings) skyObjects.push({ model: { gen: 'part', part: { shape: 'ring', args: [700, 760, 96], material: { type: 'basic', color: '#dff7ff', transparent: true, opacity: 0.35, doubleSide: true, depthWrite: false, fog: false } } }, dir: [0, 0, -1], distance: 1500, offset: [300, 400, -1500], rot: [0.1, 0.4, 0] });
  const skyMoon = { io: [[0.5, 0.35, -0.8], 120], ganymede: [[-0.65, 0.25, -0.7], 90], triton: [[-0.55, 0.3, -0.78], 70] };
  for (const L of LMK[k] ?? []) if (skyMoon[L.piece]) skyObjects.push({ model: { gen: 'body', params: { radius: skyMoon[L.piece][1], style: L.piece, fog: false, textureSize: 256, segments: 40 } }, dir: skyMoon[L.piece][0], distance: 1600, spin: 0.01 });

  // lander (descends on arrival) and its footprint
  E({ id: 'lander', kind: 'prop', at: rock ? [-5, 3.1, -4] : [-5, 6, -4], ground: rock, scale: 0.9, model: { gen: 'ship', params: { name: 'engine.shipName', upright: true } }, ...(rock ? { solid: { type: 'box', hx: 3.5, hz: 3.5, h: 8, yOffset: -3.1 } } : { motion: { type: 'bob', amp: 0.3, speed: 1.2 } }) });
  if (rock) {
    const rr = rng(SP.seed * 5), items = [];
    for (let i = 0; i < 160; i++) {
      const a = rr() * TAU, dd = 10 + rr() * 220, x = Math.cos(a) * dd, z = Math.sin(a) * dd, s = 0.3 + Math.pow(rr(), 2) * 2.4, rot = rr() * TAU;
      items.push({ at: [r2(x), r2(-s * 0.25), r2(z)], scale: [r2(s), r2(s * 0.6), r2(s * 1.2)], rot: [0, r2(rot), 0] });
    }
    E({ id: 'rocks', kind: 'prop', model: { gen: 'instances', part: { shape: 'icosahedron', args: [1, 0], material: { color: SP.ground[1], roughness: 1, flatShading: true } }, items } });
  }
  // three discoveries (visit counter: they come back on the next landing, as in the prototype)
  const br = rng(SP.seed * 13), base = br() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = base + (i * TAU) / 3 + (br() - 0.5) * 0.6, dd = 24 + br() * 26, x = r2(Math.cos(a) * dd), z = r2(Math.sin(a) * dd);
    const y = rock ? 1.3 : r2(5 + br() * 14);
    const has = { counter: 'finds', has: String(i) };
    E({
      id: `find-${i}`, kind: 'pickup', at: [x, y, z], ground: rock, model: { gen: 'beacon', params: { gold: false } }, pick: true, hideWhen: has,
      triggers: [{ on: 'enter', radius: rock ? 3 : 4, ...(rock ? {} : { mode: '3d' }), when: { not: has }, do: [
        { do: 'add.counter', counter: 'finds', value: String(i) },
        { do: 'control.if', when: { counter: 'finds', gte: 3 }, then: [{ do: 'control.if', when: stamp(k), then: [say(`find-${k}-${i}-had`)], else: [say(`find-${k}-${i}-quiz`)] }], else: [say(`find-${k}-${i}`)] },
      ] }],
    });
  }
  // two special places (save counter, with gold labels that stay)
  (LMK[k] ?? []).forEach((L, i) => {
    const x = L.p[0], z = L.p.length === 3 ? L.p[2] : L.p[1], y = L.p.length === 3 ? L.p[1] : 1.6;
    const key = `${k}:${i}`, has = { counter: 'lm', has: key };
    E({
      id: `place-${i}`, kind: 'pickup', at: [x, y, z], ground: rock, model: { gen: 'beacon', params: { gold: true } }, pick: true, hideWhen: has,
      triggers: [{ on: 'enter', radius: rock ? 4.5 : 6, ...(rock ? {} : { mode: '3d' }), when: { not: has }, do: [
        { do: 'add.counter', counter: 'lm', value: key },
        { do: 'add.counter', counter: `lm-${k}`, value: String(i) },
        { do: 'add.counter', counter: 'found', value: `lm:${key}` },
        say(`place-${k}-${i}`),
      ] }],
    });
    E({ id: `place-label-${i}`, kind: 'label', at: [x, y, z], ground: rock, label: { text: `lm.${k}.${i}`, style: 'gold', max: 420, y: 2.6, check: has }, tap: [{ do: 'travel.to', target: `${k}.place-${i}`, mode: 'walk' }] });
    pieces(L.piece, x, rock ? H(x, z) + 1.6 : y, z, E, H, rock);
  });
  if (SP.site === 'egypt') egypt(E, H);

  const nextHere = nextIs(k);
  const isGas = !rock;
  return {
    id: `world-${k}`,
    kind: rock ? 'terrain' : 'deck',
    title: `body.${k}`,
    environment: {
      sky: {
        style: 'simple-gradient',
        day: {
          top: SP.sky[0], hor: SP.sky[1], bot: SP.sky[2], fog: SP.fog[0], sunColor: SP.lightCol ?? SP.sunCol, sunIntensity: SP.light,
          hemiSky: SP.hemi[0], hemiGround: SP.hemi[1], hemiIntensity: SP.hemi[2], exposure: 1.1,
        },
        sunDisk: SP.sun,
        sunDiskColor: SP.sunCol,
      },
      sunDir: SP.sunDir,
      fog: { near: SP.fog[1], far: SP.fog[2] },
      shadows: { extent: 60, far: 500, distance: 200 },
      ...(SP.stars ? { stars: { count: 1600, radius: 3600, size: 1.5 } } : {}),
      ...(SP.winds ? { winds: { count: 260, color: '#dfe8ff', speed: 90 } } : {}),
      ...(skyObjects.length ? { skyObjects } : {}),
    },
    terrain,
    player: rock
      ? { controller: 'walk', avatar: 'astronaut', gravity: d.g, jump: { velocity: 4.4, feedback: 'surf.jumped', earthGravity: 9.81 }, walk: 4.8, run: 9, eye: 1.6, camera: { dist: 9, min: 4, max: 40, minPitch: 0.02, pitch: 0.3 }, bounds: { center: [0, 0], radius: 230 }, tapToWalk: true }
      : { controller: 'jetpack', avatar: 'astronaut', walk: 10, run: 20, eye: 1.6, camera: { dist: 11, min: 4, max: 40, minPitch: 0.02, pitch: 0.3 }, bounds: { center: [0, 0], radius: 500, minY: 1.2, maxY: 60, lowWarn: 'surf.tooDeep' }, tapToWalk: false },
    spawns: { lander: { at: rock ? [2.5, 1.5] : [2.5, 6, 1.5], yaw: r3(PI * 0.75), camera: { dist: rock ? 9 : 11, pitch: 0.3, yaw: r3(PI * 0.75) } } },
    defaultSpawn: 'lander',
    enter: {
      descent: { entity: `${k}.lander`, height: 55, seconds: 2.6 },
      once: [{ do: 'control.if', when: { not: { flag: `radio-${k}` } }, then: [{ do: 'set.flag', flag: `radio-${k}` }, { do: 'control.delay', seconds: 2.9, then: [say(`radio-${k}`)] }] }],
      ...(SP.site === 'egypt' ? { every: [{ do: 'control.delay', seconds: 2.6, then: [{ do: 'show.toast', text: 'surf.egypt', kind: 'gold', ms: 4500 }] }] } : {}),
    },
    materials: MATS,
    entities: ents,
    hud: {
      hints: { default: rock ? { touch: 'hint.rockT', desk: 'hint.rockD' } : { touch: 'hint.gasT', desk: 'hint.gasD' } },
      infoCard: {
        kicker: rock ? 'surf.surfaceOf' : 'surf.cloudsOf',
        title: `body.${k}`,
        rows: [
          { label: 'surf.gravity', value: { key: 'surf.gval', params: { g: { literal: d.g } } } },
          { label: 'surf.temp', value: `stat.${k}.temp` },
          { label: 'surf.day', value: `stat.${k}.day` },
          { label: 'surf.year', value: `stat.${k}.year` },
        ],
        note: { key: 'orbit.weight', params: { w: { literal: Math.round(60 * d.g) } } },
        progress: [
          { counter: 'finds', of: 3, label: 'surf.discoveries', style: 'dots' },
          { counter: `lm-${k}`, of: 2, label: 'surf.places', style: 'diamonds' },
        ],
        buttons: [
          { label: 'surf.guide', icon: 'compass', style: 'gold', when: { not: { all: [{ counter: 'finds', gte: 3 }, { counter: `lm-${k}`, gte: 2 }] } }, do: [{ do: 'travel.to', target: { nearest: 'pickup' }, mode: 'walk' }] },
          { label: 'surf.nextStop', icon: 'bolt', style: 'teal', when: { all: [{ not: ALL_STAMPS }, { not: nextHere }] }, do: [{ do: 'quest.go', quest: 'mission', button: 0 }] },
        ],
      },
      buttons: [
        ...(isGas
          ? [{ id: 'down', label: 'surf.down', icon: 'down', hold: 'down' }, { id: 'up', label: 'surf.up', icon: 'up', hold: 'up' }]
          : [{ id: 'jump', label: 'surf.jump', icon: 'up', hold: 'jump' }]),
        { id: 'takeoff', label: 'surf.takeoff', icon: 'rocket', do: [{ do: 'go.scene', scene: 'space', spawn: `near-${k}`, transition: 'fade' }] },
      ],
    },
  };
}

/** The props that make each special place (prototype buildPiece). */
function pieces(kind, x, y, z, E, H, rock) {
  const id = `piece-${kind}`;
  if (kind === 'ice') {
    E({ id: `${id}-disk`, kind: 'prop', at: [x, 0.12, z], ground: true, model: { gen: 'part', part: { shape: 'circle', args: [7, 24], geoRot: [-PI / 2, 0, 0], material: 'ice', shadow: false } } });
    E({ id: `${id}-sparkle`, kind: 'effect', at: [x, 0, z], ground: true, model: { gen: 'particles', params: { mode: 'sparkle', count: 80, color: '#ffffff', size: 0.5, radius: 6.5, height: 0.4 } } });
  }
  if (kind === 'lava') {
    const r = rng(8), items = [];
    for (let i = 0; i < 14; i++) {
      const ang = r() * TAU, dd = r() * 16, len = 4 + r() * 10, w = 0.6 + r() * 0.8, px = x + Math.cos(ang) * dd, pz = z + Math.sin(ang) * dd, rot = r() * TAU;
      items.push({ at: [r2(px), 0.08, r2(pz)], scale: [r2(len), 1, r2(w)], rot: [0, r2(rot), 0] });
    }
    E({ id: `${id}-flows`, kind: 'prop', model: { gen: 'instances', part: { shape: 'plane', args: [1, 1], geoRot: [-PI / 2, 0, 0], material: 'lava', shadow: false }, items } });
    E({ id: `${id}-glow`, kind: 'effect', at: [x, 2, z], ground: true, model: { gen: 'light', params: { color: '#ff6a1a', intensity: 3, distance: 40, decay: 1.5, pulse: { min: 1.5, max: 3.5, speed: 2.2 } } } });
    E({ id: `${id}-cone`, kind: 'prop', at: [x - 26, 5, z + 10], ground: true, model: { gen: 'composite', ref: 'lava-cone' } });
  }
  if (kind === 'venera') E({ id, kind: 'prop', at: [x - 5, z - 4], ground: true, model: { gen: 'composite', ref: 'venera' }, solid: { type: 'box', hx: 1.6, hz: 1.6, h: 3 } });
  if (kind === 'apollo') {
    const ax = x - 4, az = z - 6;
    E({ id, kind: 'prop', at: [ax, az], ground: true, model: { gen: 'composite', ref: 'apollo-lander' }, solid: { type: 'box', hx: 2.4, hz: 2.4, h: 4 } });
    E({ id: `${id}-flag`, kind: 'prop', at: [ax + 5, az + 4], ground: true, model: { gen: 'composite', ref: 'flag-usa' } });
    const items = [];
    for (let i = 0; i < 40; i++) {
      const k = i / 40, px = ax - 2 - k * 14 + (i % 2 ? 0.2 : -0.2), pz = az + 2 + Math.sin(k * 4) * 3;
      items.push({ at: [r2(px), 0.02, r2(pz)], rot: [0, 0.3, 0] });
    }
    E({ id: `${id}-steps`, kind: 'prop', model: { gen: 'instances', part: { shape: 'box', args: [0.16, 0.02, 0.3], material: 'dark', shadow: false }, items } });
  }
  if (kind === 'rover') {
    const rx = x - 4, rz = z - 4;
    E({ id, kind: 'prop', at: [rx, rz], ground: true, yaw: 0.8, model: { gen: 'composite', ref: 'rover' }, solid: { type: 'box', hx: 1.8, hz: 1.8, h: 3.4 } });
    const items = [];
    for (let i = 0; i < 60; i++) {
      const k = i / 60, side = i % 2 ? 1 : -1, px = rx - 1.5 - k * 24 + side * 0.6 * Math.sin(0.8), pz = rz + k * 10 + side * 0.6 * Math.cos(0.8);
      items.push({ at: [r2(px), 0.02, r2(pz)], rot: [0, 0.8, 0] });
    }
    E({ id: `${id}-tracks`, kind: 'prop', model: { gen: 'instances', part: { shape: 'box', args: [0.35, 0.02, 0.5], material: 'track', shadow: false }, items } });
  }
  if (kind === 'dustdevil') E({ id, kind: 'effect', at: [x, z], ground: true, model: { gen: 'particles', params: { mode: 'vortex', count: 420, color: '#d99a6c', size: 1.6, opacity: 0.55, height: 40, additive: false } } });
  if (kind === 'icechunks') {
    const r = rng(9), items = [];
    for (let i = 0; i < 46; i++) items.push({ at: [r2(x + (r() - 0.5) * 40), r2(y + (r() - 0.5) * 16), r2(z + (r() - 0.5) * 40)], scale: r2(0.3 + Math.pow(r(), 2) * 2.6), rot: [r2(r() * TAU), r2(i), 0] });
    E({ id, kind: 'prop', ground: false, model: { gen: 'instances', part: { shape: 'icosahedron', args: [1, 0], material: 'ice-chunk' }, items } });
  }
  if (kind === 'hexagon') {
    E({ id: `${id}-disk`, kind: 'prop', at: [x, 0.4, z], ground: false, model: { gen: 'part', part: { shape: 'circle', args: [55, 6], geoRot: [-PI / 2, 0, 0], material: { type: 'basic', color: '#c9a86a', transparent: true, opacity: 0.35, depthWrite: false }, shadow: false } }, motion: { type: 'spin', axis: 'y', speed: 0.05 } });
    E({ id: `${id}-edge`, kind: 'prop', at: [x, 0.6, z], ground: false, model: { gen: 'part', part: { shape: 'ring', args: [54.2, 55.8, 6], geoRot: [-PI / 2, 0, 0], material: { type: 'basic', color: '#fff2c8', transparent: true, opacity: 0.9, depthWrite: false }, shadow: false } }, motion: { type: 'spin', axis: 'y', speed: 0.05 } });
  }
  if (kind === 'voyager2') E({ id, kind: 'prop', at: [x + 4, y + 2, z], ground: false, model: { gen: 'composite', ref: 'voyager2' }, motion: { type: 'bob', amp: 0.5, speed: 0.8 } });
  if (kind === 'darkspot') E({ id, kind: 'prop', at: [x, 0.5, z], ground: false, model: { gen: 'part', part: { shape: 'circle', args: [48, 48], geoRot: [-PI / 2, 0, 0], material: { type: 'basic', map: { gen: 'radial-spot' }, transparent: true, depthWrite: false }, shadow: false } }, motion: { type: 'spin', axis: 'y', speed: -0.3 } });
  void H;
  void rock;
}

/** Giza seen from the landing site: pyramids, the Nile with palms and a felucca. */
function egypt(E, H) {
  [[-260, -420, 115, 139], [-460, -180, 108, 136], [-560, 40, 52, 62]].forEach(([x, z, half, h], i) =>
    E({ id: `pyramid-${i}`, kind: 'prop', at: [x, -2, z], ground: true, model: { gen: 'pyramid-simple', params: { half, height: h } } }));
  E({ id: 'nile', kind: 'prop', ground: true, model: { gen: 'water', params: { from: [214, -700], to: [214, 700], width: 24, lift: 0.35, segments: 140 } } });
  const r = rng(5), palms = [];
  for (let i = 0; i < 60; i++) {
    const side = r() < 0.5 ? -1 : 1;
    palms.push([214 + side * (16 + r() * 14), (r() - 0.5) * 600, 6 + r() * 4]);
  }
  E({ id: 'palm-trunks', kind: 'prop', model: { gen: 'instances', part: { shape: 'cylinder', args: [0.22, 0.34, 1, 6], pivot: [0, 0.5, 0], material: 'palm-trunk' }, items: palms.map((p) => ({ at: [r2(p[0]), -0.2, r2(p[1])], scale: [1, r2(p[2]), 1] })) } });
  E({ id: 'palm-crowns', kind: 'prop', model: { gen: 'instances', part: { shape: 'cone', args: [2.8, 1.5, 7, 1, true], material: 'palm-crown' }, items: palms.map((p) => ({ at: [r2(p[0]), r2(-0.5 + p[2]), r2(p[1])], rot: [0, r2(p[2]), 0] })) } });
  E({ id: 'felucca', kind: 'prop', at: [214, 0.45, 40], ground: true, yaw: PI / 2, model: { gen: 'composite', ref: 'felucca' }, motion: { type: 'line', from: [214, 0, -80], to: [214, 0, 160], period: r2(TAU / 0.05), up: 0.45, amp: 0.05 } });
  void H;
}

/* ---------------------------------------------------------------- galaxy */
const sunTh = Math.log(26 / 5) / 0.28 + PI / 4 + 0.2;
const sunPos = [Math.cos(sunTh) * 26, Math.sin(sunTh) * 26];
const y0 = Math.atan2(sunPos[0], sunPos[1]) + 0.4;
const andro = [-Math.sin(y0 + 0.35) * 1500, -300, -Math.cos(y0 + 0.35) * 1500];
const edgeA = sunTh + 2.4;
const spots = { center: [0, 3, 0], sun: [sunPos[0], 2.5, sunPos[1]], edge: [Math.cos(edgeA) * 52, 2, Math.sin(edgeA) * 52], andromeda: [andro[0], andro[1] + 110, andro[2]] };
const galEntities = [{ id: 'milky-way', kind: 'prop', at: [0, 0, 0], ground: false, model: { gen: 'galaxy', params: { count: 46000, sunAt: sunPos.map(r3), sunTheta: r3(sunTh), andromeda: andro.map(r2) } } }];
for (const k of Object.keys(GAL)) {
  const has = { counter: 'gal', has: k };
  galEntities.push({
    id: `gal-${k}`, kind: 'label', at: spots[k].map(r2), ground: false,
    label: { text: `gal.${k}`, style: 'gold', max: 9000, y: 0, check: has },
    tap: [{ do: 'control.if', when: { all: [{ not: has }, { counter: 'gal', gte: 3 }, { not: stamp('galaxy') }] },
      then: [{ do: 'add.counter', counter: 'gal', value: k }, { do: 'add.counter', counter: 'found', value: `gal:${k}` }, say(`gal-${k}-quiz`)],
      else: [{ do: 'add.counter', counter: 'gal', value: k }, { do: 'add.counter', counter: 'found', value: `gal:${k}` }, say(`gal-${k}`)] }],
  });
}
const galaxyScene = {
  id: 'galaxy',
  kind: 'galaxy',
  title: 'gal.title',
  environment: { background: '#010108' },
  player: { controller: 'orbit', avatar: 'none', camera: { dist: 110, min: 18, max: 700, pitch: 0.55 } },
  spawns: { view: { at: [0, 0, 0], camera: { yaw: r3(y0), pitch: 0.55 } } },
  defaultSpawn: 'view',
  enter: { once: [{ do: 'control.delay', seconds: 1.2, then: [say('gal-intro')] }] },
  entities: galEntities,
  hud: {
    hints: { default: { touch: 'hint.galT', desk: 'hint.galD' } },
    infoCard: { kicker: 'gal.kicker', title: 'gal.title', note: { key: 'gal.sub', params: { n: { counter: 'gal' } } }, buttons: [{ label: 'gal.back', icon: 'sun', style: 'gold', do: [{ do: 'go.scene', scene: 'space', spawn: 'start', transition: 'fade' }] }] },
  },
};

/* ---------------------------------------------------------------- dialogues */
const dialogues = {};
const D = (id, lines, extra = {}) => (dialogues[id] = { id, lines, ...extra });
const nour = (text, more = {}) => ({ speaker: 'nour', text, ...more });
D('welcome', [nour({ key: 'r.welcome', params: { n: { player: 'name' } } })], { ttl: 25 });
for (const k of ORDER) D(`radio-${k}`, [nour(`radio.${k}`)], { ttl: 16 });
const onCorrect = (k) => [
  { do: 'give.stamp', stamp: k },
  { do: 'add.counter', counter: 'stamps', value: k },
  { do: 'control.if', when: ALL_STAMPS, then: [say('after-all')], else: [say(`after-${sceneOf(k)}`)] },
];
const quizEnd = (k) => ({ endLabel: 'quiz.btn', onEnd: [{ do: 'ask.item', item: `item.${k}`, onCorrect: onCorrect(k) }] });
D('sun-facts', INFO.sun.facts.map((_, i) => nour(`fact.sun.${i}`)), quizEnd('sun'));
D('sun-facts-done', INFO.sun.facts.map((_, i) => nour(`fact.sun.${i}`)));
for (const k of ORDER.slice(1)) {
  for (let i = 0; i < 3; i++) {
    const line = { who: { key: 'surf.discovery', params: { n: { counter: 'finds' } } }, glyph: '✦', text: `fact.${k}.${i}` };
    D(`find-${k}-${i}`, [line], { ttl: 30 });
    D(`find-${k}-${i}-quiz`, [line, nour('r.quizReady')], quizEnd(k));
    D(`find-${k}-${i}-had`, [line, nour({ key: 'r.already', params: { n: { text: `name.${k}` } } })], { ttl: 30 });
  }
  (LMK[k] ?? []).forEach((_, i) => D(`place-${k}-${i}`, [{ who: { key: 'surf.landmark', params: { n: { text: `lm.${k}.${i}` } } }, glyph: '◆', text: `lm.${k}.${i}.fact` }], { ttl: 30 }));
}
for (const k of CRAFTS) D(`craft-${k}`, [nour(`craft.${k}.fact`)], { ttl: 22 });
D('ast-fact', [nour('ast.fact')], { ttl: 18 });
D('comet-alert', [nour('r.comet')], { ttl: 12 });
D('gal-intro', [nour('gal.intro')], { ttl: 24 });
for (const k of Object.keys(GAL)) {
  const line = { who: `gal.${k}`, glyph: '✦', text: `gal.${k}.fact` };
  D(`gal-${k}`, [line], { ttl: 30 });
  D(`gal-${k}-quiz`, [line, nour('gal.quizReady')], quizEnd('galaxy'));
}
const nextParam = { n: { next: 'mission' } };
const afterOptions = (ctx) => [
  { text: { key: 'r.warpTo', params: nextParam }, prime: true, when: { not: ALL_PLANETS }, do: [{ do: 'quest.go', quest: 'mission', button: 0 }] },
  { text: 'r.openGal', prime: true, when: { all: [ALL_PLANETS, { not: stamp('galaxy') }] }, do: [{ do: 'quest.go', quest: 'mission', button: 0 }] },
  ...(ctx === 'space' ? [{ text: { key: 'r.flyTo', params: nextParam }, when: { not: ALL_PLANETS }, do: [{ do: 'quest.go', quest: 'mission', button: 1 }] }] : []),
  ...(ctx.startsWith('world-') ? [{ text: 'r.toSpace', do: [{ do: 'go.scene', scene: 'space', spawn: `near-${ctx.slice(6)}`, transition: 'fade' }] }] : []),
  { text: 'r.stay', do: [] },
];
for (const ctx of ['space', 'galaxy', ...ORDER.slice(1).map((k) => `world-${k}`)]) D(`after-${ctx}`, [nour({ key: 'r.afterQuiz', params: nextParam }, { options: afterOptions(ctx) })]);
D('after-all', [nour('r.afterAll')], { onEnd: [{ do: 'open.panel', panel: 'passport' }] });

/* ---------------------------------------------------------------- items, objectives, cards, POIs */
const objectives = [
  { id: 'obj.sun', text: S('obj.sun', 'يوصف الشمس إنها النجم بتاعنا، ونورها بياخد قد إيه عشان يوصل للأرض.', 'Describe the Sun as our star and how long its light takes to reach Earth.') },
  { id: 'obj.worlds', text: S('obj.worlds', 'يذكر حاجة مميزة في كل كوكب وفي القمر.', 'Name a key feature of each planet and of the Moon.') },
  { id: 'obj.types', text: S('obj.types', 'يفرّق بين الكواكب الصخرية والعمالقة الغازية والجليدية.', 'Tell rocky planets apart from gas and ice giants.') },
  { id: 'obj.gravity', text: S('obj.gravity', 'يقارن الجاذبية على عوالم مختلفة من خلال الوزن والنط.', 'Compare gravity on different worlds through weight and jumping.') },
  { id: 'obj.galaxy', text: S('obj.galaxy', 'يحدد مكان المجموعة الشمسية في مجرة درب التبانة.', 'Place the solar system within the Milky Way.') },
];
const curriculum = [{ country: 'EG', grade: 'P4', subject: 'science', lesson: 'TODO: map to unit/lesson/page (open question 4)' }];
const objOf = (k) => (k === 'sun' ? ['obj.sun'] : k === 'galaxy' ? ['obj.galaxy'] : k === 'jupiter' || k === 'uranus' ? ['obj.worlds', 'obj.types'] : ['obj.worlds']);
const items = {};
for (const k of MISSION) {
  items[`item.${k}`] = {
    id: `item.${k}`, type: 'mcq', prompt: `quiz.${k}.q`,
    options: INFO[k].quiz.o.map((_, i) => ({ id: `item.${k}.o${i}`, text: `quiz.${k}.o${i}`, ...(i === 0 ? { correct: true } : {}) })),
    shuffle: true, hint: 'quiz.hint', objectives: objOf(k), who: 'quiz.title', tags: [FC],
  };
}
S('item.gravity.q', 'على القمر الجاذبية حوالي سُدس جاذبية الأرض. اللي وزنه ٦٠ كيلو على الأرض هيحس إن وزنه كام كيلو على القمر؟', 'Gravity on the Moon is about one sixth of Earth’s. Someone who weighs 60 kg on Earth would feel like how many kg on the Moon?');
S('item.gravity.h', 'اقسم ٦٠ على ٦.', 'Divide 60 by 6.');
S('item.kg', 'كيلو', 'kg');
items['item.gravity'] = { id: 'item.gravity', type: 'numeric', prompt: 'item.gravity.q', answer: 10, tolerance: 1, unit: 'item.kg', hint: 'item.gravity.h', objectives: ['obj.gravity'], who: 'quiz.title', tags: [FC] };

const cards = {};
const pois = {};
for (const k of MISSION) {
  cards[`stop-${k}`] = { id: `stop-${k}`, who: `body.${k}`, glyph: k === 'galaxy' ? '✦' : '◉', title: `body.${k}`, body: `card.${k}`, objectives: objOf(k), tags: [FC] };
  const scene = sceneOf(k);
  pois[`poi.${k}`] = {
    id: `poi.${k}`, scene, at: [0, 0], radius: k === 'sun' || k === 'galaxy' ? 400 : 300, title: `body.${k}`, card: `stop-${k}`, objectives: objOf(k),
    spawn: { spawn: k === 'sun' ? 'near-sun' : k === 'galaxy' ? 'view' : 'lander' },
    items: k === 'moon' ? [`item.${k}`, 'item.gravity'] : [`item.${k}`],
  };
}

/* ---------------------------------------------------------------- log collection */
const log = {
  title: 'log.title', button: 'log.button', sub: { key: 'log.sub', params: { n: { counter: 'found' } } },
  sections: [
    { title: 'log.craft', progress: { counter: 'craft', of: 4 }, entries: CRAFTS.map((k) => ({ title: `craft.${k}`, subDone: `craft.${k}.fact`, icon: 'telescope', done: { counter: 'craft', has: k }, go: [{ do: 'travel.to', target: k, mode: 'auto' }], goWhen: { scene: 'space' }, goLabel: 'log.fly' })) },
    {
      title: 'log.ast', progress: { counter: 'ast', of: 5 },
      entries: [{
        title: { key: 'log.astLine', params: { n: { counter: 'ast' } } }, subDone: 'ast.fact', icon: 'star', done: { counter: 'ast', gte: 5 }, goWhen: { scene: 'space' }, goLabel: 'log.fly',
        go: [[0, 1, 2, 3, 4].reduceRight((rest, i) => ({ do: 'control.if', when: { not: { counter: 'ast', has: String(i) } }, then: [{ do: 'travel.to', target: `ast-${i}`, mode: 'auto' }], ...(rest ? { else: [rest] } : {}) }), null)],
      }],
    },
    { title: 'log.land', progress: { counter: 'lm', of: 18 }, entries: Object.entries(LMK).flatMap(([k, list]) => list.map((_, i) => ({ title: `lm.${k}.${i}`, sub: `body.${k}`, icon: 'star', done: { counter: 'lm', has: `${k}:${i}` } }))) },
    { title: 'log.gal', progress: { counter: 'gal', of: 4 }, entries: Object.keys(GAL).map((k) => ({ title: `gal.${k}`, icon: 'galaxy', done: { counter: 'gal', has: k } })) },
  ],
};

/* ---------------------------------------------------------------- manifest */
const surfaceKeys = ORDER.slice(1);
const manifest = {
  $schema: '../../packages/pack-schema/dist/json-schema/manifest.schema.json',
  id: 'solar-system',
  version: '1.0.0',
  engine: '^0.1',
  title: 'pack.title',
  altTitle: 'pack.alt',
  summary: 'pack.summary',
  kicker: 'pack.kicker',
  subjects: ['science'],
  grades: ['EG-P4', 'EG-P5', 'EG-P6'],
  durationMinutes: 30,
  objectives,
  curriculum,
  locales: ['ar-EG', 'en'],
  defaultLocale: 'ar-EG',
  startScene: 'space',
  startPoi: 'poi.sun',
  scenes: ['scenes/space.json', ...surfaceKeys.map((k) => `scenes/world-${k}.json`), 'scenes/galaxy.json'],
  pois: Object.keys(pois).map((id) => `pois/${id.replace('poi.', '')}.json`),
  quests: ['quests/mission.json'],
  items: Object.keys(items).map((id) => `items/${id.replace('item.', '')}.json`),
  cards: Object.keys(cards).map((id) => `cards/${id}.json`),
  dialogues: Object.keys(dialogues).map((id) => `dialogue/${id}.json`),
  models: Object.keys(models).map((id) => `models/${id}.json`),
  characters: {
    nour: { name: 'char.nour', glyph: 'char.nour.g', color: '#33b7a9' },
    quiz: { name: 'quiz.title', glyph: 'char.quiz.g' },
    find: { name: 'char.find', glyph: 'char.find.g' },
  },
  counters: [
    { id: 'stamps', scope: 'save', of: 11 },
    { id: 'finds', scope: 'visit', of: 3 },
    { id: 'lm', scope: 'save', of: 18 },
    ...surfaceKeys.map((k) => ({ id: `lm-${k}`, scope: 'save', of: 2 })),
    { id: 'craft', scope: 'save', of: 4 },
    { id: 'ast', scope: 'save', of: 5 },
    { id: 'gal', scope: 'save', of: 4 },
    { id: 'found', scope: 'save' },
  ],
  flags: ORDER.map((k) => ({ id: `radio-${k}` })),
  stamps: MISSION.map((k) => ({ id: k, title: `body.${k}`, color: k === 'galaxy' ? '#9a8cff' : DEF[k].col, style: k === 'galaxy' ? 'galaxy' : 'planet' })),
  certificate: { when: ALL_STAMPS, title: 'cert.title', text: 'cert.text' },
  collections: { log },
  intro: {
    story: ['intro.story1', 'intro.story2'],
    features: [{ icon: 'rocket', text: 'feat.fly' }, { icon: 'down', text: 'feat.land' }, { icon: 'up', text: 'feat.jump' }, { icon: 'galaxy', text: 'feat.galaxy' }],
    askName: true,
    nameLabel: 'intro.name',
    namePlaceholder: 'intro.namePh',
    defaultName: 'intro.defaultName',
    start: 'intro.start',
    notes: ['intro.scale'],
    controls: { touch: 'intro.ctlTouch', desk: 'intro.ctlDesk' },
    onStart: [{ do: 'control.delay', seconds: 0.9, then: [say('welcome')] }],
    onResume: [],
  },
  theme: { preset: 'space', band: 'diamonds', background: '#02030a' },
  hud: { quest: 'mission', panels: ['passport', 'log', 'settings'] },
  prePost: { pre: ['item.sun', 'item.mars', 'item.jupiter', 'item.gravity', 'item.galaxy'], post: ['item.sun', 'item.mars', 'item.jupiter', 'item.gravity', 'item.galaxy'] },
  budgets: { low: { downloadMB: 15, drawCalls: 150, textureMB: 48 }, mid: { downloadMB: 25, drawCalls: 300, textureMB: 128 }, high: { downloadMB: 40, drawCalls: 600, textureMB: 256 } },
  sensitivity: [],
  credits: [{ role: 'credits.prototype', name: 'Yahya (Rihla founder)' }, { role: 'credits.port', name: 'Rihla engineering' }],
  reviewStatus: 'draft',
  teacher: { lessonPlan: 'teacher/lesson-plan.md', worksheet: 'teacher/worksheet.md', answerKey: 'teacher/answer-key.md' },
  tags: ['space', 'science'],
};

/* ---------------------------------------------------------------- teacher kit */
const lessonPlan = `# رحلة حورس · Horus Voyage — خطة درس (٤٥ دقيقة)

> ${FC}: المحتوى منقول من نموذج المؤسس. لازم مراجعة مختص قبل النشر.

## الأهداف
${objectives.map((o) => `- ${ar[o.text]} / ${en[o.text]}`).join('\n')}

## قبل الرحلة (٥ دقايق)
- اسأل الفصل: رتّبوا الكواكب من الأقرب للشمس للأبعد. اكتبوا الترتيب على السبورة.
- (اختياري) أسئلة قبل الرحلة: ٥ أسئلة جوه اللعبة لو فعّلتها في الواجب.

## أثناء الرحلة (٣٠ دقيقة)
- شارك كود الفصل. كل مجموعة تبدأ بالأرض والقمر، وبعدين تكمّل المهمة بالترتيب.
- أدوار في المجموعة: طيّار (السفينة)، عالِم (يقرا الاكتشافات بصوت عالي)، مسجّل (يكتب الجاذبية والحرارة)، ملاح (شريط الكواكب).
- على القمر والمريخ: كل طالب ينط ويسجّل "نطّيت كام متر" ويقارنها بالأرض.

## بعد الرحلة (١٠ دقايق)
- أسئلة للنقاش: ليه الزهرة أسخن من عطارد؟ ليه مينفعش نقف على المشتري؟ ليه بنقيس المسافات في المجرة بالسنين الضوئية؟
- (اختياري) أسئلة بعد الرحلة وقارن النتايج.

---

## Before (5 min) · During (30 min) · After (10 min)
Same structure in English: order the planets from memory, fly the mission in groups (pilot, scientist, recorder, navigator), record jump heights on the Moon and Mars and compare with Earth, then discuss: why is Venus hotter than Mercury? why can't we stand on Jupiter? why are galaxy distances measured in light-years?
`;
const worksheet = `# ورقة عمل · Worksheet — Horus Voyage

| ${'المحطة / Stop'} | ${'الجاذبية / Gravity'} | ${'الحرارة / Temperature'} | ${'معلومة / One fact'} |
|---|---|---|---|
${ORDER.slice(1).map((k) => `| ${ar[`body.${k}`]} / ${en[`body.${k}`]} | | | |`).join('\n')}

${MISSION.map((k, i) => `${i + 1}. ${ar[`quiz.${k}.q`]} ____________\n   ${en[`quiz.${k}.q`]}`).join('\n')}
${MISSION.length + 1}. ${ar['item.gravity.q']} ____________
   ${en['item.gravity.q']}
`;
const answerKey = `# Answer key

${Object.values(items).map((it) => `- **${it.id}**: ${it.type === 'numeric' ? `${it.answer} ± ${it.tolerance}` : `${ar[it.options.find((o) => o.correct).text]} / ${en[it.options.find((o) => o.correct).text]}`}`).join('\n')}
`;

/* ---------------------------------------------------------------- write */
const files = {
  'manifest.json': manifest,
  'scenes/space.json': spaceScene,
  'scenes/galaxy.json': galaxyScene,
  'quests/mission.json': quest,
  'LICENSES.json': { assets: [] },
  'teacher/lesson-plan.md': lessonPlan,
  'teacher/worksheet.md': worksheet,
  'teacher/answer-key.md': answerKey,
};
for (const k of surfaceKeys) files[`scenes/world-${k}.json`] = surfaceScene(k);
for (const p of Object.values(pois)) files[`pois/${p.id.replace('poi.', '')}.json`] = p;
for (const it of Object.values(items)) files[`items/${it.id.replace('item.', '')}.json`] = it;
for (const c of Object.values(cards)) files[`cards/${c.id}.json`] = c;
for (const d of Object.values(dialogues)) files[`dialogue/${d.id}.json`] = d;
for (const m of Object.values(models)) files[`models/${m.id}.json`] = m;
files['locales/ar-EG.json'] = ar;
files['locales/en.json'] = en;
writePack(OUT, files);
console.log(`solar-system: ${Object.keys(files).length} files, ${Object.keys(dialogues).length} dialogues, ${Object.keys(ar).length} strings`);
