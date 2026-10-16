// 建置期腳本：對教育部《臺灣台語常用詞辭典》開放資料擷取例句、查證造句機的詞，產生 data/sentences.js
// 用法：node tools/build-data.js [dict-twblg.json 路徑]
// 辭典檔預設讀隔壁專案 project_claude_TG_game 的 data/raw/（只讀，無改伊）
const fs = require('fs');
const path = require('path');

const DICT = process.argv[2] ||
  path.join(__dirname, '..', '..', 'project_claude_TG_game', 'data', 'raw', 'dict-twblg.json');
const OUT = path.join(__dirname, '..', 'data', 'sentences.js');
const dict = JSON.parse(fs.readFileSync(DICT, 'utf8'));

/* ---------- 辭典索引：漢字 → 讀音（"a/b" 拆開） ---------- */
const N = s => s.normalize('NFC');
const index = new Map();
for (const e of dict) for (const h of e.heteronyms || []) {
  if (!h.trs) continue;
  const list = index.get(e.title) || [];
  for (const r of h.trs.split('/')) list.push(N(r.trim()));
  index.set(e.title, list);
}
const problems = [];
function verify(han, lo, where) {
  const got = index.get(han);
  if (!got) { problems.push(`${where}: 辭典無「${han}」`); return; }
  if (!got.includes(N(lo))) problems.push(`${where}: 「${han}」辭典讀音是 ${got.join(' / ')}，毋是 ${lo}`);
}

/* ---------- 1. 例句擷取 ---------- */
// 粗俗、身體私處、暴力相關的字毋提來做基本教材
const BLOCK = /[潲屌姦膣卵屎尿屁死殺刣罵𧮙幹]/;
const PUNCT_HAN = /[。，？！、；：「」『』（）…—─\s]/g;
const ex = [];
for (const e of dict) for (const h of e.heteronyms || []) for (const df of h.definitions || [])
  for (const x of df.example || []) {
    const m = x.match(/^￹(.*?)￺(.*?)￻(.*)$/);
    if (m) ex.push({ head: e.title, han: N(m[1].trim()), lo: N(m[2].trim()), hua: m[3].trim() });
  }

function tokenize(x) {
  const han = x.han, lo = x.lo;
  if (!/^[^\x00-\x7F]+[。？！]$/.test(han)) return null;        // 漢字句、尾有句號；有羅馬字/數字的毋要
  if (/──|—/.test(han) || BLOCK.test(han)) return null;            // 歇後語、粗俗字
  const end = han.slice(-1);
  const loEnd = lo.slice(-1);
  if (!/[.?!？！。]/.test(loEnd)) return null;
  const body = lo.slice(0, -1);
  if (/[^A-Za-zÀ-ɏ̀-ͯḀ-ỿⁿ\s\-,]/.test(body.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return null;
  const words = body.split(/[\s,]+/).filter(Boolean);
  const chars = [...han.replace(PUNCT_HAN, '')];
  const tiles = [];
  let k = 0;
  for (const w of words) {
    const n = w.split(/-+/).filter(Boolean).length;
    if (!n) return null;
    tiles.push([chars.slice(k, k + n).join(''), w]);
    k += n;
  }
  if (k !== chars.length) return null;
  // 第一个字母改細寫，免得大寫透露啥物排頭前
  tiles[0][1] = tiles[0][1][0].toLowerCase() + tiles[0][1].slice(1);
  const hasComma = /[，,]/.test(han);
  return { t: tiles, e: end === '？' ? '?' : end === '！' ? '!' : '.', c: hasComma ? 1 : 0, z: x.hua, w: x.head };
}

const seen = new Set();
const sents = [];
for (const x of ex) {
  if (seen.has(x.han)) continue;
  const s = tokenize(x);
  if (!s) continue;
  if (s.t.length < 3 || s.t.length > 10) continue;
  seen.add(x.han);
  sents.push(s);
}

// 難度：詞的出現次數（全部例句內底）+ 詞卡數。這是程式規則，毋是官方分級。
const freq = new Map();
for (const s of sents) for (const [, l] of s.t) { const k = l.toLowerCase(); freq.set(k, (freq.get(k) || 0) + 1); }
for (const s of sents) {
  const minF = Math.min(...s.t.map(([, l]) => freq.get(l.toLowerCase())));
  const n = s.t.length;
  s.lv = (n <= 5 && minF >= 6 && !s.c) ? 1 : (n <= 7 && minF >= 2) ? 2 : 3;
}
// 高級干焦留 8 張詞卡以內，傷長的句排起來無趣味
for (let i = sents.length - 1; i >= 0; i--) if (sents[i].lv === 3 && sents[i].t.length > 8) sents.splice(i, 1);
sents.sort((a, b) => a.lv - b.lv || a.t.length - b.t.length);

/* ---------- 2. 學堂：語法課 ---------- */
// 說明文字是整理的教學筆記（AI 撰寫），例句全部對辭典揣出來
const has = (s, han, lo) => s.t.some(([h, l]) => h === han && l.toLowerCase().replace(/[.,?!]/g, '') === lo);
const endsWith = (s, han) => s.t.some(([h]) => h.endsWith(han));
const LESSONS = [
  { id: 'lang', title: '人稱', words: [['我', 'guá', '我'], ['你', 'lí', '你'], ['伊', 'i', '他／她'], ['阮', 'guán', '我們（無包括聽話的人）'], ['咱', 'lán', '咱們（包括聽話的人）'], ['恁', 'lín', '你們'], ['𪜶', 'in', '他們']],
    note: '台語的「我們」有兩種：「阮 guán」無包括聽話的人，「咱 lán」有包括。「𪜶 in」是「他們」，嘛會當講「in 兜」（in tau，他們家）。',
    match: s => has(s, '阮', 'guán') || has(s, '咱', 'lán') || has(s, '𪜶', 'in') || has(s, '恁', 'lín') },
  { id: 'si', title: '是／毋是', words: [['是', 'sī', '是'], ['毋是', 'm̄ sī', '不是']],
    note: '「A 是 B」佮華語仝款。否定加「毋 m̄」：「毋是」。台語的「毋」是主觀的「不」，客觀的「沒有」用「無」。',
    match: s => has(s, '是', 'sī') },
  { id: 'u', title: '有／無', words: [['有', 'ū', '有'], ['無', 'bô', '沒有']],
    note: '「有」除了「擁有」，閣會當囥佇動詞頭前表示「有做」：「我有食」＝我吃了／我有吃。否定講「無」：「我無食」。',
    match: s => has(s, '有', 'ū') || has(s, '無', 'bô') },
  { id: 'beh', title: '欲（beh）', words: [['欲', 'beh', '要、想要、將要']],
    note: '「欲」囥佇動詞頭前，表示想欲做、抑是就欲發生：「我欲去」＝我要去；「欲落雨矣」＝快下雨了。',
    match: s => has(s, '欲', 'beh') },
  { id: 'teh', title: '咧（teh）', words: [['咧', 'teh', '正在']],
    note: '「咧 teh」囥佇動詞頭前，表示當咧做：「伊咧食飯」＝他正在吃飯。',
    match: s => has(s, '咧', 'teh') },
  { id: 'ah', title: '句尾「矣」', words: [['矣', '--ah', '了']],
    note: '「矣」讀輕聲 --ah，囥佇句尾表示代誌已經發生抑是狀況改變：「伊來矣」＝他來了。羅馬字寫做「--ah」，兩撇表示輕聲。',
    match: s => endsWith(s, '矣') },
  { id: 'e', title: '會／袂', words: [['會', 'ē', '會'], ['袂', 'bē', '不會']],
    note: '「會」表示有能力、抑是會發生；否定是「袂 bē」：「伊袂來」＝他不會來。「會使」＝可以，「袂使」＝不可以。',
    match: s => has(s, '會', 'ē') || has(s, '袂', 'bē') },
  { id: 'kam', title: '敢（kám）問句', words: [['敢', 'kám', '是否、難道']],
    note: '台語問「是毋是」，上捷用的方法是句頭（抑是動詞前）加「敢 kám」：「你敢有閒？」＝你有空嗎？',
    match: s => has(s, '敢', 'kám') },
  { id: 'ka', title: '共（kā）', words: [['共', 'kā', '把、跟、對、幫']],
    note: '「共」用途真濟：「共門關起來」＝把門關起來；「共伊講」＝跟他說；「我共你提」＝我幫你拿。',
    match: s => has(s, '共', 'kā') },
  { id: 'hoo', title: '予（hōo）', words: [['予', 'hōo', '給、被、讓']],
    note: '「予」會使講「給」（送予你）、「被」（予人罵）、「讓」（予我看）。看頭前後壁來分。',
    match: s => has(s, '予', 'hōo') },
  { id: 'ti', title: '佇（tī）', words: [['佇', 'tī', '在']],
    note: '「佇」是「在」：「我佇厝」＝我在家；「佇學校讀冊」＝在學校讀書。',
    match: s => has(s, '佇', 'tī') },
  { id: 'kah', title: '甲（kah）', words: [['甲', 'kah', '得、到']],
    note: '「甲」接佇動詞、形容詞後壁，講程度抑是結果：「寒甲皮皮掣」＝冷得發抖；「做甲暗」＝做到晚上。',
    match: s => has(s, '甲', 'kah') },
  { id: 'khah', title: '較（khah）', words: [['較', 'khah', '比較、更']],
    note: '「較」是比較：「這間較大」＝這間比較大。比兩項：「A 比 B 較…」。',
    match: s => has(s, '較', 'khah') },
  { id: 'mng', title: '問代誌', words: [['啥物', 'siánn-mih', '什麼'], ['佗位', 'tó-uī', '哪裡'], ['按怎', 'án-tsuánn', '怎麼'], ['偌濟', 'guā-tsē', '多少']],
    note: '問句尾毋免加「嗎」：「你欲食啥物？」「你欲去佗位？」「這愛按怎做？」「這偌濟錢？」',
    match: s => s.t.some(([h]) => ['啥物', '佗位', '按怎', '偌濟', '啥'].includes(h)) },
  { id: 'long', title: '攏（lóng）', words: [['攏', 'lóng', '都、全部']],
    note: '「攏」是「都、全部」，囥佇動詞頭前：「阮攏欲去」＝我們都要去；「伊攏無講」＝他都沒說。',
    match: s => has(s, '攏', 'lóng') },
  { id: 'ma', title: '嘛（mā）', words: [['嘛', 'mā', '也']],
    note: '「嘛」是「也」：「我嘛欲去」＝我也要去。否定：「我嘛無愛」＝我也不要。',
    match: s => has(s, '嘛', 'mā') },
  { id: 'koh', title: '閣（koh）', words: [['閣', 'koh', '又、再、還']],
    note: '「閣」是「又、再、還」：「伊閣來矣」＝他又來了；「閣食一碗」＝再吃一碗；「閣咧睏」＝還在睡。',
    match: s => has(s, '閣', 'koh') },
  { id: 'to', title: '就（tō）', words: [['就', 'tō', '就']],
    note: '「就」佮華語差不多：「伊隨就來」＝他馬上就來；「按呢就好」＝這樣就好。',
    match: s => has(s, '就', 'tō') },
  { id: 'tsiah', title: '才（tsiah）', words: [['才', 'tsiah', '才']],
    note: '「才」讀 tsiah：「伊這馬才來」＝他現在才來；「食飽才去」＝吃飽再去。',
    match: s => has(s, '才', 'tsiah') },
  { id: 'bue', title: '猶未／未', words: [['猶未', 'iáu-buē', '還沒'], ['未', 'buē', '沒（問句尾）']],
    note: '「猶未」是「還沒」：「伊猶未來」＝他還沒來。句尾的「未」是問「已經…了沒」：「你食飽未？」＝你吃飽了沒？羅馬字寫輕聲「--buē」。',
    match: s => s.t.some(([h, l]) => h === '猶未' || (h.endsWith('未') && /--bu[eē]/.test(l))) },
  { id: 'mai', title: '莫／毋通', words: [['莫', 'mài', '不要'], ['毋通', 'm̄-thang', '不可以、千萬別']],
    note: '叫人莫做啥物：「莫去」＝別去；較嚴重、較認真用「毋通」：「毋通烏白講」＝不可以亂說。',
    match: s => has(s, '莫', 'mài') || has(s, '毋通', 'm̄-thang') },
  { id: 'kap', title: '佮（kah）', words: [['佮', 'kah', '和、跟']],
    note: '「佮」是「和、跟」：「我佮伊」＝我和他；「佮朋友出去」＝跟朋友出去。辭典例句寫 kah，嘛有人讀 kap。注意：佮「甲」仝音，毋過意思無仝。',
    match: s => has(s, '佮', 'kah') },
  { id: 'e5', title: '的（ê）', words: [['的', 'ê', '的']],
    note: '「的」讀 ê：「我的冊」＝我的書；「紅色的」＝紅色的。',
    match: s => has(s, '的', 'ê') },
  { id: 'liong', title: '量詞', words: [['个', 'ê', '個'], ['隻', 'tsiah', '隻（動物）'], ['枝', 'ki', '枝（筆、細長物）'], ['本', 'pún', '本（冊）'], ['粒', 'lia̍p', '顆（圓的物件）'], ['尾', 'bué', '條（魚）'], ['間', 'king', '間（厝）']],
    note: '台語算物件愛用量詞，有寡佮華語無仝：一尾魚（一條魚）、一粒柑仔（一顆橘子）、一枝筆、一隻狗、一間厝。講數量的「一」讀 tsi̍t。',
    blankSame: 1,
    match: s => ['隻:tsiah', '枝:ki', '本:pún', '粒:lia̍p', '尾:bué', '間:king'].some(x => { const [h, l] = x.split(':'); return has(s, h, l) }) },
  { id: 'thoo', title: '程度：真、誠、傷', words: [['真', 'tsin', '很'], ['誠', 'tsiânn', '很、非常'], ['足', 'tsiok', '很（口語）'], ['傷', 'siunn', '太']],
    note: '講「很」會使用「真」「誠」「足」：「真好食」「誠媠」。「傷」是「太」：「傷貴矣」＝太貴了。',
    match: s => has(s, '真', 'tsin') || has(s, '誠', 'tsiânn') || has(s, '傷', 'siunn') },
];
// 填空用的「挖空詞」：每課的單一詞卡（「矣」黏佇別的詞後壁，無法度挖）
const BLANK = { lang: ['阮:guán', '咱:lán', '𪜶:in', '恁:lín'], si: ['是:sī'], u: ['有:ū', '無:bô'], beh: ['欲:beh'], teh: ['咧:teh'],
  e: ['會:ē', '袂:bē'], kam: ['敢:kám'], ka: ['共:kā'], hoo: ['予:hōo'], ti: ['佇:tī'], kah: ['甲:kah'], khah: ['較:khah'],
  mng: ['啥物:siánn-mih', '佗位:tó-uī', '按怎:án-tsuánn', '偌濟:guā-tsē', '啥:siánn'], long: ['攏:lóng'], ma: ['嘛:mā'], koh: ['閣:koh'],
  to: ['就:tō'], tsiah: ['才:tsiah'], bue: ['猶未:iáu-buē'], mai: ['莫:mài', '毋通:m̄-thang'], kap: ['佮:kah'], e5: ['的:ê'],
  liong: ['隻:tsiah', '枝:ki', '本:pún', '粒:lia̍p', '尾:bué', '間:king'], thoo: ['真:tsin', '誠:tsiânn', '傷:siunn'] };
for (const L of LESSONS) for (const [h, l] of L.words) verify(h, l, `學堂「${L.title}」`);
for (const k in BLANK) for (const x of BLANK[k]) { const [h, l] = x.split(':'); verify(h, l, `填空「${k}」`) }
const gram = LESSONS.map(L => {
  let pool = sents.filter(s => s.lv <= 2 && L.match(s));
  if (pool.length < 15) pool = pool.concat(sents.filter(s => s.lv === 3 && s.t.length <= 6 && L.match(s)));
  pool = pool.slice(0, 40);
  const ids = pool.map(s => sents.indexOf(s));
  if (ids.length < 10) problems.push(`學堂「${L.title}」例句傷少：${ids.length}`);
  const { match, ...rest } = L;
  return { ...rest, kind: 'gram', blank: (BLANK[L.id] || []).map(x => x.split(':')), s: ids };
});

/* ---------- 詞彙課（詞卡＋選擇題） ---------- */
const VOCAB = [
  { id: 'greet', title: '相借問', note: '見面、感謝、會失禮、相辭——上捷用的幾句。（「你好」「免客氣」「食飽未」辭典無收做詞條，所以無提來用）', words: [
    ['歡迎', 'huan-gîng', '歡迎'], ['多謝', 'to-siā', '謝謝'], ['感謝', 'kám-siā', '感謝'], ['勞力', 'lóo-la̍t', '謝謝（麻煩你了）'],
    ['歹勢', 'pháinn-sè', '不好意思'], ['失禮', 'sit-lé', '對不起'], ['無要緊', 'bô iàu-kín', '沒關係'], ['借問', 'tsioh-mn̄g', '請問'],
    ['請坐', 'tshiánn-tsē', '請坐'], ['拜託', 'pài-thok', '拜託'], ['恭喜', 'kiong-hí', '恭喜'], ['早', 'tsá', '早安'],
    ['再會', 'tsài-huē', '再見'], ['慢行', 'bān-kiânn', '慢走'], ['平安', 'pîng-an', '平安'], ['食飽', 'tsia̍h-pá', '吃飽']] },
  { id: 'num', title: '數字', note: '講數量用「一 tsi̍t、兩 nn̄g、三 sann」：一个、兩个。算號碼的時「一」讀 it、「二」讀 jī，像「一二三」it jī sann。', words: [
    ['一', 'tsi̍t', '一（數量）'], ['一', 'it', '一（號碼）'], ['二', 'jī', '二（號碼）'], ['兩', 'nn̄g', '兩（數量）'], ['三', 'sann', '三'], ['四', 'sì', '四'],
    ['五', 'gōo', '五'], ['六', 'la̍k', '六'], ['七', 'tshit', '七'], ['八', 'peh', '八'], ['九', 'káu', '九'], ['十', 'tsa̍p', '十'],
    ['百', 'pah', '百'], ['千', 'tshing', '千']] },
  { id: 'ke', title: '家人', note: '「阿」囥頭前是親切的叫法。台語「後生」是兒子、「查某囝」是女兒、「翁」是丈夫、「某」是妻子。', words: [
    ['阿爸', 'a-pah', '爸爸'], ['阿母', 'a-bú', '媽媽'], ['阿公', 'a-kong', '爺爺'], ['阿媽', 'a-má', '奶奶'], ['阿兄', 'a-hiann', '哥哥'],
    ['阿姊', 'a-tsí', '姊姊'], ['小弟', 'sió-tī', '弟弟'], ['小妹', 'sió-muē', '妹妹'], ['後生', 'hāu-senn', '兒子'], ['查某囝', 'tsa-bóo-kiánn', '女兒'],
    ['翁', 'ang', '丈夫'], ['某', 'bóo', '妻子'], ['阿伯', 'a-peh', '伯父'], ['阿姨', 'a-î', '阿姨'], ['爸母', 'pē-bú', '父母']] },
  { id: 'si5', title: '時間', note: '時間詞囥佇主語頭前抑後壁攏會使：「我明仔載欲去」「明仔載我欲去」。', words: [
    ['今仔日', 'kin-á-ji̍t', '今天'], ['明仔載', 'bîn-á-tsài', '明天'], ['昨昏', 'tsa-hng', '昨天'], ['透早', 'thàu-tsá', '一大早'],
    ['早起', 'tsá-khí', '早上'], ['中晝', 'tiong-tàu', '中午'], ['下晡', 'ē-poo', '下午'], ['暗時', 'àm-sî', '晚上'], ['半暝', 'puànn-mê', '半夜'],
    ['這馬', 'tsit-má', '現在'], ['拄才', 'tú-tsiah', '剛才'], ['今年', 'kin-nî', '今年'], ['舊年', 'kū-nî', '去年'], ['明年', 'mê-nî', '明年'], ['禮拜', 'lé-pài', '星期']] },
  { id: 'tsiah5', title: '食物', note: '台語「糜」是稀飯、「果子」是水果、「王梨」是鳳梨、「雞卵」是雞蛋。', words: [
    ['飯', 'pn̄g', '飯'], ['糜', 'muê', '稀飯'], ['麵', 'mī', '麵'], ['番薯', 'han-tsî', '地瓜'], ['雞卵', 'ke-nn̄g', '雞蛋'], ['豬肉', 'ti-bah', '豬肉'],
    ['魚', 'hî', '魚'], ['青菜', 'tshenn-tshài', '蔬菜'], ['果子', 'kué-tsí', '水果'], ['王梨', 'ông-lâi', '鳳梨'], ['柑仔', 'kam-á', '橘子'],
    ['西瓜', 'si-kue', '西瓜'], ['茶', 'tê', '茶'], ['水', 'tsuí', '水'], ['冰', 'ping', '冰']] },
  { id: 'tong', title: '動物', note: '「鳥鼠」毋是鳥，是老鼠！「鳥仔」才是鳥。', words: [
    ['狗', 'káu', '狗'], ['貓', 'niau', '貓'], ['鳥仔', 'tsiáu-á', '鳥'], ['鳥鼠', 'niáu-tshí', '老鼠'], ['牛', 'gû', '牛'], ['馬', 'bé', '馬'],
    ['豬', 'ti', '豬'], ['雞', 'ke', '雞'], ['鴨', 'ah', '鴨'], ['羊', 'iûnn', '羊'], ['虎', 'hóo', '老虎'], ['猴', 'kâu', '猴子']] },
  { id: 'sin', title: '身軀', note: '台語「喙」是嘴、「跤」是腳、「目睭」是眼睛、「頭殼」是頭。', words: [
    ['頭殼', 'thâu-khak', '頭'], ['頭毛', 'thâu-mn̂g', '頭髮'], ['目睭', 'ba̍k-tsiu', '眼睛'], ['耳仔', 'hīnn-á', '耳朵'], ['鼻仔', 'phīnn-á', '鼻子'],
    ['喙', 'tshuì', '嘴'], ['喙齒', 'tshuì-khí', '牙齒'], ['喙脣', 'tshuì-tûn', '嘴唇'], ['手', 'tshiú', '手'], ['跤', 'kha', '腳'],
    ['腹肚', 'pak-tóo', '肚子'], ['胸坎', 'hing-khám', '胸部'], ['肩胛頭', 'king-kah-thâu', '肩膀']] },
  { id: 'hing', title: '色水佮形容', note: '形容詞會使疊做伙加強：「紅紅」「媠媠」。「青」是綠色、「烏」是黑色、「䆀」是醜、「懸」是高。', words: [
    ['紅', 'âng', '紅'], ['白', 'pe̍h', '白'], ['烏', 'oo', '黑'], ['青', 'tshenn', '綠'], ['黃', 'n̂g', '黃'], ['大', 'tuā', '大'], ['細', 'sè', '小'],
    ['好', 'hó', '好'], ['歹', 'pháinn', '壞'], ['媠', 'suí', '漂亮'], ['䆀', 'bái', '醜'], ['懸', 'kuân', '高'], ['低', 'kē', '低、矮'],
    ['長', 'tn̂g', '長'], ['短', 'té', '短'], ['熱', 'jua̍h', '熱'], ['寒', 'kuânn', '冷'], ['濟', 'tsē', '多'], ['少', 'tsió', '少'], ['歡喜', 'huann-hí', '高興']] },
];
const voc = VOCAB.map(L => {
  for (const [h, l] of L.words) verify(h, l, `詞彙課「${L.title}」`);
  const keys = new Set(L.words.map(([h, l]) => h + ':' + l));
  const ids = [];
  for (let i = 0; i < sents.length && ids.length < 6; i++)
    if (sents[i].lv <= 2 && sents[i].t.some(([h, l]) => keys.has(h + ':' + l.toLowerCase().replace(/[.,?!]/g, '')))) ids.push(i);
  return { ...L, kind: 'vocab', s: ids };
});
// 課的順序：詞彙課插佇語法課中間
const ORDER = ['greet', 'lang', 'num', 'si', 'u', 'ke', 'beh', 'teh', 'si5', 'ah', 'e', 'tsiah5', 'kam', 'ka', 'hoo', 'tong', 'ti', 'kah',
  'khah', 'sin', 'mng', 'long', 'ma', 'koh', 'hing', 'to', 'tsiah', 'bue', 'mai', 'kap', 'e5', 'liong', 'thoo'];
const all = [...gram, ...voc];
if (new Set(ORDER).size !== all.length || ORDER.some(id => !all.find(L => L.id === id))) problems.push('ORDER 佮課無對齊');
const lessonOut = ORDER.map(id => all.find(L => L.id === id));

/* ---------- 3. 造句機詞庫（每个詞攏對辭典查證；組合規則是 AI 整理） ---------- */
const MAKER = {
  S: [['我', 'guá', '我'], ['你', 'lí', '你'], ['伊', 'i', '他'], ['阮', 'guán', '我們'], ['咱', 'lán', '咱們'], ['𪜶', 'in', '他們'],
      ['阿爸', 'a-pah', '爸爸'], ['阿母', 'a-bú', '媽媽'], ['阿公', 'a-kong', '爺爺'], ['阿媽', 'a-má', '奶奶'], ['阿兄', 'a-hiann', '哥哥'],
      ['小妹', 'sió-muē', '妹妹'], ['朋友', 'pîng-iú', '朋友'], ['囡仔', 'gín-á', '小孩'], ['老師', 'lāu-su', '老師']],
  T: [['今仔日', 'kin-á-ji̍t', '今天', 'now'], ['明仔載', 'bîn-á-tsài', '明天', 'fut'], ['昨昏', 'tsa-hng', '昨天', 'past'],
      ['拄才', 'tú-tsiah', '剛才', 'past'], ['逐工', 'ta̍k-kang', '每天', 'hab'], ['這馬', 'tsit-má', '現在', 'now'],
      ['透早', 'thàu-tsá', '一大早', 'any'], ['下晡', 'ē-poo', '下午', 'any'], ['暗時', 'àm-sî', '晚上', 'any']],
  A: [['欲', 'beh', '要'], ['咧', 'teh', '正在'], ['有', 'ū', '有'], ['無', 'bô', '沒'], ['毋', 'm̄', '不'],
      ['會', 'ē', '會'], ['袂', 'bē', '不會'], ['愛', 'ài', '愛'], ['捌', 'bat', '曾經']],
  V: [[['食', 'tsia̍h'], ['飯', 'pn̄g'], '吃飯'], [['啉', 'lim'], ['茶', 'tê'], '喝茶'], [['看', 'khuànn'], ['冊', 'tsheh'], '看書'],
      [['買', 'bé'], ['菜', 'tshài'], '買菜'], [['洗衫', 'sé-sann'], null, '洗衣服'], [['寫', 'siá'], ['批', 'phue'], '寫信'],
      [['去', 'khì'], ['學校', 'ha̍k-hāu'], '去學校'], [['去', 'khì'], ['市場', 'tshī-tiûnn'], '去市場'], [['看', 'khuànn'], ['電視', 'tiān-sī'], '看電視'],
      [['拍球', 'phah-kiû'], null, '打球'], [['泅水', 'siû-tsuí'], null, '游泳'], [['跳舞', 'thiàu-bú'], null, '跳舞'],
      [['行路', 'kiânn-lōo'], null, '走路'], [['歇睏', 'hioh-khùn'], null, '休息'], [['讀冊', 'tha̍k-tsheh'], null, '讀書'],
      [['食', 'tsia̍h'], ['麵', 'mī'], '吃麵'], [['啉', 'lim'], ['咖啡', 'ka-pi'], '喝咖啡'], [['開車', 'khui-tshia'], null, '開車'],
      [['轉去', 'tńg--khì'], null, '回去'], [['睏', 'khùn'], null, '睡覺'], [['看', 'khuànn'], ['電影', 'tiān-iánn'], '看電影'],
      [['去', 'khì'], ['夜市', 'iā-tshī'], '去夜市'], [['去', 'khì'], ['公園', 'kong-hn̂g'], '去公園'], [['食', 'tsia̍h'], ['果子', 'kué-tsí'], '吃水果'],
      [['唱', 'tshiùnn'], ['歌', 'kua'], '唱歌'], [['聽', 'thiann'], ['歌', 'kua'], '聽歌'], [['煮', 'tsú'], ['飯', 'pn̄g'], '煮飯'],
      [['寫字', 'siá-jī'], null, '寫字'], [['洗身軀', 'sé-sin-khu'], null, '洗澡'], [['掃塗跤', 'sàu thôo-kha'], null, '掃地'],
      [['運動', 'ūn-tōng'], null, '運動'], [['拍拚', 'phah-piànn'], null, '努力'], [['食暗', 'tsia̍h-àm'], null, '吃晚餐'],
      [['食', 'tsia̍h'], ['番薯', 'han-tsî'], '吃地瓜'], [['啉水', 'lim tsuí'], null, '喝水'], [['坐', 'tsē'], ['車', 'tshia'], '坐車'],
      [['去', 'khì'], ['病院', 'pēnn-īnn'], '去醫院'], [['食', 'tsia̍h'], ['雞卵', 'ke-nn̄g'], '吃雞蛋']],
  E: [['矣', '--ah', '了']],
};
// 動作句加的動作
MAKER.V.push(
  [['煮食', 'tsú-tsia̍h'], null, '做飯'], [['上課', 'siōng-khò'], null, '上課'], [['做工', 'tsò-kang'], null, '工作'],
  [['敲電話', 'khà tiān-uē'], null, '打電話'], [['畫', 'uē'], ['圖', 'tôo'], '畫圖'], [['揣', 'tshuē'], ['朋友', 'pîng-iú'], '找朋友'],
  [['等', 'tán'], ['車', 'tshia'], '等車'], [['走', 'tsáu'], null, '跑步'], [['講話', 'kóng-uē'], null, '說話'],
  [['笑', 'tshiò'], null, '笑'], [['吼', 'háu'], null, '哭'], [['買', 'bé'], ['衫', 'sann'], '買衣服'], [['買', 'bé'], ['鞋', 'ê'], '買鞋子']);
// 動作的分類，予「地點」規則用：go＝本身有方向；out＝愛佇外口；bed＝通常佇厝內
const VTAG = { go: ['去學校', '去市場', '去夜市', '去公園', '去醫院', '回去'], out: ['游泳', '開車', '坐車', '打球', '等車', '跑步'], bed: ['睡覺', '洗澡'] };
for (const v of MAKER.V) v[3] = Object.keys(VTAG).find(k => VTAG[k].includes(v[2])) || '';
MAKER.ADV = [['嘛', 'mā', '也'], ['攏', 'lóng', '都'], ['閣', 'koh', '又'], ['猶閣', 'iáu-koh', '還']];
MAKER.LOC = [ // [漢字, 羅馬字, 華語, in＝厝內／out＝外口]，「佇」另外加
  ['厝', 'tshù', '家', 'in'], ['房間', 'pâng-king', '房間', 'in'], ['灶跤', 'tsàu-kha', '廚房', 'in'], ['學校', 'ha̍k-hāu', '學校', 'out'],
  ['公園', 'kong-hn̂g', '公園', 'out'], ['夜市', 'iā-tshī', '夜市', 'out'], ['外口', 'guā-kháu', '外面', 'out'], ['圖書館', 'tôo-su-kuán', '圖書館', 'out']];
MAKER.W = { ti: ['佇', 'tī'], kam: ['敢', 'kám'], pi: ['比', 'pí'], khah: ['較', 'khah'], kah: ['佮', 'kah'], penn: ['平', 'pênn'] };
// 形容句、比較句的主語：[[詞…], 華語, 類別] p＝人 a＝動物 f＝食物 w＝日子／天氣 l＝所在
MAKER.NS = [
  [[['我', 'guá']], '我', 'p'], [[['你', 'lí']], '你', 'p'], [[['伊', 'i']], '他', 'p'], [[['阿公', 'a-kong']], '爺爺', 'p'],
  [[['小妹', 'sió-muē']], '妹妹', 'p'], [[['老師', 'lāu-su']], '老師', 'p'],
  [[['這', 'tsit'], ['隻', 'tsiah'], ['貓', 'niau']], '這隻貓', 'a'], [[['這', 'tsit'], ['隻', 'tsiah'], ['狗', 'káu']], '這隻狗', 'a'],
  [[['這', 'tsit'], ['碗', 'uánn'], ['麵', 'mī']], '這碗麵', 'f'], [[['這', 'tsit'], ['粒', 'lia̍p'], ['西瓜', 'si-kue']], '這顆西瓜', 'f'],
  [[['咖啡', 'ka-pi']], '咖啡', 'f'], [[['天氣', 'thinn-khì']], '天氣', 'w'], [[['今仔日', 'kin-á-ji̍t']], '今天', 'w'],
  [[['昨昏', 'tsa-hng']], '昨天', 'w'], [[['夜市', 'iā-tshī']], '夜市', 'l'], [[['這', 'tsit'], ['間', 'king'], ['厝', 'tshù']], '這間房子', 'l'],
  [[['學校', 'ha̍k-hāu']], '學校', 'l']];
MAKER.DEG = [['真', 'tsin', '很'], ['誠', 'tsiânn', '非常'], ['足', 'tsiok', '超'], ['有夠', 'ū-kàu', '實在很'], ['傷', 'siunn', '太'], ['較', 'khah', '比較'], ['無', 'bô', '不']];
MAKER.ADJ = [ // [漢字, 羅馬字, 華語, 會使配的類別]
  ['媠', 'suí', '漂亮', 'pal'], ['古錐', 'kóo-tsui', '可愛', 'pa'], ['聰明', 'tshong-bîng', '聰明', 'pa'], ['忝', 'thiám', '累', 'pa'],
  ['歡喜', 'huann-hí', '高興', 'p'], ['懸', 'kuân', '高', 'p'], ['肥', 'puî', '胖', 'pa'], ['瘦', 'sán', '瘦', 'pa'], ['乖', 'kuai', '乖', 'pa'],
  ['健康', 'kiān-khong', '健康', 'pa'], ['好', 'hó', '好', 'pw'], ['大', 'tuā', '大', 'afl'], ['細', 'sè', '小', 'afl'],
  ['芳', 'phang', '香', 'f'], ['甜', 'tinn', '甜', 'f'], ['鹹', 'kiâm', '鹹', 'f'], ['酸', 'sng', '酸', 'f'], ['燒', 'sio', '燙', 'f'],
  ['冷', 'líng', '涼', 'f'], ['貴', 'kuì', '貴', 'fl'], ['俗', 'sio̍k', '便宜', 'fl'], ['熱', 'jua̍h', '熱', 'wl'], ['寒', 'kuânn', '冷', 'wl'],
  ['鬧熱', 'lāu-jia̍t', '熱鬧', 'l'], ['清氣', 'tshing-khì', '乾淨', 'l'], ['遠', 'hn̄g', '遠', 'l'], ['近', 'kīn', '近', 'l']];
for (const k of ['S', 'T', 'A', 'E', 'ADV', 'LOC', 'DEG', 'ADJ']) for (const [h, l] of MAKER[k]) verify(h, l, `造句機 ${k}`);
for (const [v, o] of MAKER.V) { verify(v[0], v[1], '造句機 V'); if (o) verify(o[0], o[1], '造句機 O'); }
for (const k in MAKER.W) verify(...MAKER.W[k], '造句機 W');
for (const [ps] of MAKER.NS) for (const [h, l] of ps) verify(h, l, '造句機 NS');

/* ---------- 輸出 ---------- */
if (problems.length) { console.error('查證有問題：\n' + problems.join('\n')); process.exit(1); }
const data = { built: new Date().toISOString().slice(0, 10), sents, lessons: lessonOut, maker: MAKER };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '// 自動產生，毋通手改。來源：教育部《臺灣台語常用詞辭典》開放資料（g0v/moedict-data-twblg）\n' +
  '// 產生方式：node tools/build-data.js\nwindow.TG_DATA=' + JSON.stringify(data) + ';\n');
const lvCount = [1, 2, 3].map(v => sents.filter(s => s.lv === v).length);
console.log(`例句 ${sents.length}（初級 ${lvCount[0]}／中級 ${lvCount[1]}／高級 ${lvCount[2]}）`);
for (const L of lessonOut) console.log(`  ${L.title}（${L.kind}）: ${L.words.length} 詞、${L.s.length} 句${L.blank ? '、填空 ' + L.blank.length : ''}`);
console.log('輸出', OUT, (fs.statSync(OUT).size / 1024 | 0) + 'KB');
