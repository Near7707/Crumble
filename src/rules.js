// 게임 규칙 — 수치 계산은 전부 여기서 (AI는 글만 쓴다)
import { clamp, pick, chance, randi, shuffle, uid, dayKey } from './util.js';
import {
    G, S, save, book, staffById, rel, addRel, bossRel, remember, addJournal, addExp,
    WAGE, ING_PRICE, MAX_INBOX, menuInfo, MENU_POOL,
} from './state.js';
import { L, F, money } from './i18n.js';
import { rulesDayStart, rulesDayEnd, filterAutoPicks, ruleMul } from './houserules.js';
import { FIX_MAX, FIX_DAYS, FIX_SCALE, LEAK_CAP, FIX_CHOICES, PAIR_FIX, makeFixStory, fixChoiceLabel, fixTitle, fillNames } from './fixes.js';

// ---------- 성격 태그 (사건 고르기·장면 행동에만 씀) ----------
export const TAGS = {
    glutton: ['먹보', 'Glutton'], lazy: ['게으름', 'Lazy'], chatty: ['수다쟁이', 'Chatty'],
    clumsy: ['덜렁이', 'Clumsy'], diligent: ['성실', 'Diligent'], quiet: ['조용함', 'Quiet'],
    neat: ['깔끔쟁이', 'Neat freak'], kind: ['다정함', 'Kind'], prickly: ['까칠함', 'Prickly'],
    flatterer: ['아부쟁이', 'Flatterer'], rebel: ['반항적', 'Rebellious'], timid: ['소심함', 'Timid'],
    perfectionist: ['완벽주의', 'Perfectionist'], cheerful: ['명랑함', 'Cheerful'], greedy: ['돈 밝힘', 'Money-minded'],
};
export const tagLabel = t => (TAGS[t] ? L(...TAGS[t]) : t);
export const hasTag = (id, ...t) => (book(id)?.tags || []).some(x => t.includes(x));

export const WEATHER = {
    sun: { icon: '☀️', n: ['맑음', 'Sunny'], mult: 1 },
    cloud: { icon: '⛅', n: ['흐림', 'Cloudy'], mult: .95 },
    rain: { icon: '🌧', n: ['비', 'Rain'], mult: .7 },
    hot: { icon: '🔆', n: ['더움', 'Hot'], mult: 1.05 },
};
export const weatherLabel = w => `${WEATHER[w]?.icon || ''} ${L(...(WEATHER[w]?.n || WEATHER.sun.n))}`;

export function rollWeather() {
    const m = new Date().getMonth() + 1;
    const summer = m >= 6 && m <= 8, rainy = m === 7;
    const r = Math.random();
    if (r < (rainy ? .35 : .18)) return 'rain';
    if (r < (rainy ? .5 : .33)) return 'cloud';
    if (summer && r < .65) return 'hot';
    return 'sun';
}

export const repTier = rep => (rep < 35 ? 'low' : rep < 65 ? 'mid' : 'high');
export const workingStaff = g => g.staff.filter(s => !s.absent);

// ---------- 역할: 능력이 높은 쪽으로 ----------
export function assignRoles(g) {
    const list = workingStaff(g);
    list.forEach(s => (s.role = 'floor'));
    if (!list.length) return;
    if (list.length === 1) { list[0].role = 'all'; return; }
    const baker = [...list].sort((a, b) => b.bake - a.bake || a.serve - b.serve)[0];
    baker.role = 'bake';
    const rest = list.filter(s => s !== baker);
    const server = [...rest].sort((a, b) => b.serve - a.serve)[0];
    server.role = 'serve';
}
export const roleLabel = r => L(...({ bake: ['제빵', 'Baking'], serve: ['계산대', 'Counter'], floor: ['홀·청소', 'Floor'], all: ['혼자 다', 'Everything'] }[r] || ['', '']));

// ---------- 하루 시작 ----------
/** 다시 켰을 때: 지난 날들을 자동 운영으로 계산할 목록을 만든다 (최대 3일) */
/**
 * 창을 닫아 둔 시간(분) → 직원들끼리 영업한 날 (0.2.1: 실제 날짜·새벽 6시 리셋 대신 게임 안 시간)
 * 설정 "직원들끼리 하루 영업하는 시간"(기본 8시간)마다 하루, 최대 3일. 돌아오면 다음 날 아침.
 */
export function catchUp(minutes = 0) {
    const g = G(); if (!g) return null;
    if (g.phase === 'ending') return null;
    const per = Math.max(1, +S().autoDayHours || 8) * 60;
    const n = clamp(Math.floor(minutes / per), 0, 3);
    if (!n) return null;
    if (g.phase === 'close') finishClose(g);
    if (g.phase === 'ending') return null;
    // 아직 영업 안 한 날(문 열기 전)이면 그날부터 직원들끼리 영업
    if (g.phase !== 'done') g.day -= 1;
    const days = [];
    for (let i = 0; i < n; i++) days.push(autoDay(g));
    // 돌아온 날 아침
    g.day += 1;
    g.dayKey = dayKey();
    startDay(g);
    // 0.3.2 수습 대기: 돌아온 날부터 3일을 셈. 이미 셈이 끝난 건 직원이 알아서 (사장님 없음 덩어리에 남김)
    const ex = expireFixes(g);
    if (ex.length && days.length) (days[days.length - 1].hr ??= []).push(...ex);
    for (const f of g.fixes) f.from ??= g.day;
    save();
    return days.length ? days : null;
}

export function startDay(g) {
    g.phase = 'ready';
    g.weather = rollWeather();
    g.today = null;
    g.effects = g.effects.filter(e => e.until >= g.day);
    rulesDayStart(g);
    // 아침 회복 · 결근
    for (const s of g.staff) {
        s.fatigue = clamp((s.fatigue ?? 30) - 28, 0, 100);
        s.absent = !!s.restNext || (s.fatigue >= 85 && chance(.7));
        if (s.restNext) { s.restNext = false; s.mood = clamp((s.mood ?? 60) + 15, 0, 100); }
        if (s.absent) s.fatigue = clamp(s.fatigue - 30, 0, 100);
        s.mood = clamp((s.mood ?? 60) + (s.mood < 50 ? 6 : 0), 0, 100);
        if (g.money < 0) s.mood = clamp(s.mood - 8, 0, 100); // 월급 밀림
    }
    assignRoles(g);
}

/** 마감 화면에서 [마감하고 하루 끝] */
export function finishClose(g) {
    if (g.phase !== 'close') return;
    g.phase = g.today?.closed?.ended ? 'ending' : 'done';
    save();
}

/** 영업 결과 화면에서 [다음 날 시작] */
export function nextDayNow() {
    const g = G();
    if (g.phase !== 'done') return;
    g.day += 1;
    g.dayKey = dayKey();
    startDay(g);
    // 0.3.2 수습 대기를 3일 안 봤으면 직원이 알아서
    for (const it of expireFixes(g)) presentChunk(g).items.push(it);
    save();
}

export function canOpenToday(g) {
    return g.phase === 'ready' && workingStaff(g).length > 0;
}

// ---------- 아침 계산 ----------
export function priceFactor(g) {
    const ms = g.menu;
    return ms.reduce((s, m) => s + Math.pow(menuInfo(m.id).base / m.p, 1.3), 0) / ms.length;
}
export function guestMult(g) {
    let m = WEATHER[g.weather]?.mult ?? 1;
    for (const e of g.effects) if (e.mult) m *= e.mult;
    if (g.today?.crowd) m *= 1.35;
    return m;
}
export function expectedGuests(g) {
    const base = 6 + g.rep * .3;
    return Math.max(3, Math.round(base * guestMult(g) * priceFactor(g)));
}
export function avgPrice(g) { return g.menu.reduce((s, m) => s + m.p, 0) / g.menu.length; }

export function prepToday(g) {
    if (g.today?.prepared) return g.today;
    g.today = {
        prepared: true,
        crowd: chance(.18),
        buy: 0,
        lines: {},
        events: [],
        eventsReady: false,
        aiError: null,
    };
    const need = Math.round(expectedGuests(g) * .9);
    g.today.buy = clamp(Math.ceil((need - g.ing) / 5) * 5, 0, 40);
    return g.today;
}
export const ingCost = n => n * ING_PRICE;

// ---------- 사건 목록 ----------
// eff: rep, money, ing, mood, fatigue, relBoss, clean, ok(능력 사건을 잘 해냈나), skill
const K = (ko, en) => [ko, en];
export const EVENT_KINDS = {
    rude: {
        cat: 'guest', label: K('진상 손님', 'Difficult customer'), important: true, tiers: ['mid', 'high'],
        who: g => roleStaff(g, 'serve'),
        choices: [
            { label: K('정중히 사과하고 새로 만들어 주기', 'Apologize and remake it'), eff: { rep: 1, ing: -1, mood: -6, ok: true, skill: 'serve' } },
            { label: K('그냥 환불해 주기', 'Just refund it'), eff: { money: -4000, mood: -2 } },
            { label: K('직원에게 알아서 하라고 맡기기', 'Let the staff handle it'), eff: { rep: 2, mood: -3, relBoss: 2, ok: true, skill: 'serve', gamble: true, delegate: true } },
        ],
        fb: { s: K('손님이 크림이 적다며 목소리를 높여요.', 'A customer is loudly complaining there is too little cream.'), guest: K('"이거 사진이랑 다르잖아요?"', '"This looks nothing like the picture."'), staff: K('"…그게, 오늘 크림이 좀…"', '"Well… about the cream today…"') },
    },
    regular: {
        cat: 'guest', label: K('단골 손님', 'Regular customer'), tiers: ['mid', 'high'], auto: true,
        who: g => roleStaff(g, 'serve'),
        choices: [
            { label: K('작은 서비스 주기', 'Give a little treat'), eff: { rep: 2, ing: -1, ok: true, skill: 'serve' } },
            { label: K('직원과 수다 떨게 두기', 'Let them chat a while'), eff: { rep: 1, mood: 6 } },
            { label: K('평소처럼 대하기', 'Treat them as usual'), eff: { rep: 1 } },
        ],
        fb: { s: K('늘 오던 손님이 오늘도 들렀어요.', 'A familiar face drops by again.'), guest: K('"오늘도 그거 주세요~"', '"The usual, please~"'), staff: K('"아, 오셨어요!"', '"Oh, you\'re here!"') },
    },
    group: {
        cat: 'guest', label: K('단체 주문', 'Group order'), big: true, tiers: ['high'],
        who: g => roleStaff(g, 'bake'),
        choices: [
            { label: K('받는다', 'Accept it'), eff: { money: 42000, ing: -8, fatigue: 15, ok: true, skill: 'bake' } },
            { label: K('웃돈 받고 받는다', 'Accept with a markup'), eff: { money: 56000, ing: -8, fatigue: 15, rep: -1 } },
            { label: K('정중히 거절', 'Politely decline'), eff: { rep: -1 } },
        ],
        fb: { s: K('회사 행사용 디저트 스무 개 주문 전화가 왔어요.', 'An office calls to order twenty desserts for an event.'), guest: K('"오늘 저녁까지 될까요?"', '"Can you do it by tonight?"'), staff: K('"…스무 개요?"', '"…Twenty?"') },
    },
    reviewer: {
        cat: 'guest', label: K('음식 리뷰어', 'Food reviewer'), big: true, important: true, tiers: ['high'],
        who: g => roleStaff(g, 'bake'),
        choices: [
            { label: K('가장 자신 있는 메뉴를 정성껏', 'Serve your best, carefully'), eff: { rep: 6, ing: -2, ok: true, skill: 'bake', skillCheck: 6 } },
            { label: K('평소대로 내기', 'Serve as usual'), eff: { rep: 3, skillCheck: 5, skill: 'bake' } },
            { label: K('직원에게 맡기기', 'Leave it to the staff'), eff: { rep: 4, gamble: true, skill: 'bake', delegate: true } },
        ],
        fb: { s: K('노트에 뭔가 적는 손님… 리뷰어 같아요.', 'A customer taking notes… looks like a reviewer.'), guest: K('"추천 메뉴가 뭔가요?"', '"What do you recommend?"'), staff: K('"(긴장)"', '"(nervous)"') },
    },
    allergy: {
        cat: 'guest', label: K('알레르기 문의', 'Allergy question'), tiers: ['low', 'mid', 'high'],
        who: g => roleStaff(g, 'serve'),
        choices: [
            { label: K('재료를 하나하나 확인해 주기', 'Check every ingredient'), eff: { rep: 2, fatigue: 4, ok: true, skill: 'serve' } },
            { label: K('직원이 바로 대답하게 두기', 'Let the staff answer'), eff: { rep: 1, skillCheck: 5, skill: 'serve' } },
            { label: K('견과류 없는 메뉴 추천', 'Recommend a nut-free item'), eff: { rep: 1 } },
        ],
        fb: { s: K('손님이 견과류가 들어갔는지 물어봐요.', 'A customer asks whether anything has nuts.'), guest: K('"땅콩 들어가요?"', '"Is there peanut in this?"'), staff: K('"음… 아마 없을걸요?"', '"Umm… probably not?"') },
    },
    shoplifter: {
        cat: 'guest', label: K('좀도둑 손님', 'Shoplifter'), tiers: ['mid'],
        who: g => roleStaff(g, 'serve'),
        choices: [
            { label: K('쫓아가서 붙잡기', 'Chase them'), eff: { rep: 1, fatigue: 6, skillCheck: 6, skill: 'serve', ok: true } },
            { label: K('조용히 불러 세우기', 'Quietly stop them'), eff: { skillCheck: 4, skill: 'serve' } },
            { label: K('못 본 척', 'Pretend not to see'), eff: { money: -3500 } },
        ],
        fb: { s: K('누가 쿠키를 주머니에 슬쩍 넣었어요.', 'Someone slipped a cookie into their pocket.'), guest: K('"(슬금슬금)"', '"(sneaking out)"'), staff: K('"어? 방금…"', '"Huh? Did they just…"') },
    },
    priceSpike: {
        cat: 'shop', label: K('재료값 폭등', 'Ingredient price spike'), tiers: ['low', 'mid', 'high'],
        who: g => roleStaff(g, 'bake'),
        choices: [
            { label: K('비싸도 산다', 'Buy anyway'), eff: { money: -8000 } },
            { label: K('있는 재료로 버틴다', 'Make do with what we have'), eff: { ing: -3, rep: -1 } },
            { label: K('메뉴를 바꿔 본다', 'Switch up the menu'), eff: { rep: 0, mood: -3, ok: true, skill: 'bake' } },
        ],
        fb: { s: K('버터값이 갑자기 두 배가 됐대요.', 'Butter prices suddenly doubled.'), guest: K('', ''), staff: K('"사장님, 버터가…"', '"Boss, the butter…"') },
    },
    spoil: {
        cat: 'shop', label: K('냉장고 고장', 'Fridge broke'), tiers: ['low', 'mid', 'high'],
        who: g => roleStaff(g, 'bake'),
        choices: [
            { label: K('바로 수리 부르기', 'Call a repair right away'), eff: { money: -15000, ing: -1 } },
            { label: K('살릴 수 있는 것만 챙기기', 'Save what we can'), eff: { ing: -3, clean: -5 } },
            { label: K('그냥 버리고 계속', 'Toss it and carry on'), eff: { ing: -5 } },
        ],
        fb: { s: K('냉장고에서 이상한 소리가 나요.', 'The fridge is making a strange noise.'), guest: K('', ''), staff: K('"크림이 미지근해요…"', '"The cream is lukewarm…"') },
    },
    inspection: {
        cat: 'shop', label: K('위생 점검', 'Health inspection'), big: true, tiers: ['low', 'mid', 'high'], needLowClean: true,
        who: g => roleStaff(g, 'floor') || roleStaff(g, 'serve'),
        choices: [
            { label: K('솔직히 사과하기', 'Apologize honestly'), eff: { money: -20000, rep: -3 } },
            { label: K('지금 당장 다 같이 청소', 'Everyone cleans right now'), eff: { money: -10000, rep: -1, clean: 20, fatigue: 10 } },
            { label: K('직원에게 설명하게 두기', 'Let the staff explain'), eff: { money: -15000, rep: -2, gamble: true, delegate: true } },
        ],
        fb: { s: K('위생 점검 나왔습니다. 바닥이…', 'Health inspector here. About this floor…'), guest: K('"여기 얼룩은 언제부터죠?"', '"How long has this stain been here?"'), staff: K('"그, 그게…"', '"W-well…"') },
    },
    sneak: {
        cat: 'staff', label: K('몰래 케이크 먹기', 'Sneaking cake'), tiers: ['low', 'mid', 'high'], auto: true,
        who: g => tagStaff(g, ['glutton', 'lazy']),
        choices: [
            { label: K('따끔하게 혼내기', 'Scold them'), eff: { mood: -10, relBoss: -5 } },
            { label: K('못 본 척 넘어가기', 'Let it slide'), eff: { ing: -1, relBoss: 4, slide: true } },
            { label: K('하나 같이 먹기', 'Have one together'), eff: { ing: -2, mood: 10, relBoss: 8 } },
        ],
        fb: { s: K('진열대 뒤에서 오물오물 소리가…', 'Munching sounds behind the display…'), guest: K('', ''), staff: K('"마, 맛만 보는 거예요!"', '"J-just a taste!"') },
    },
    fight: {
        cat: 'staff', label: K('직원끼리 싸움', 'Staff quarrel'), important: true, tiers: ['low', 'mid', 'high'], auto: true, pair: 'bad',
        choices: [
            { label: K('둘 다 불러서 화해시키기', 'Get them to make up'), eff: { pairRel: 10, mood: -2 } },
            { label: K('한쪽 편 들기', 'Take one side'), eff: { pairRel: -6, relBoss: 4, relBoss2: -8 } },
            { label: K('모른 척', 'Stay out of it'), eff: { pairRel: -10, rep: -1, slide: true } },
        ],
        fb: { s: K('주방에서 언성이 높아졌어요.', 'Voices are rising in the kitchen.'), guest: K('', ''), staff: K('"그건 네가 잘못했잖아!"', '"That was your fault!"') },
    },
    friends: {
        cat: 'staff', label: K('친한 사이 사건', 'Close friends'), important: true, tiers: ['low', 'mid', 'high'], auto: true, pair: 'good',
        choices: [
            { label: K('사이좋다고 칭찬하기', 'Praise their teamwork'), eff: { mood: 6, relBoss: 3 } },
            { label: K('일할 땐 떨어져 있으라고 하기', 'Tell them to split up while working'), eff: { mood: -4, relBoss: -3, rep: 1 } },
            { label: K('그냥 둔다', 'Leave them be'), eff: { gamble: true, slide: true } },
        ],
        fb: { s: K('두 사람이 같이 붙어서 일하고 있어요.', 'The two are working side by side again.'), guest: K('', ''), staff: K('"이거 내가 할게~"', '"I\'ve got this one~"') },
    },
    late: {
        cat: 'staff', label: K('지각', 'Late'), tiers: ['low', 'mid', 'high'], auto: true, early: true,
        who: g => workingStaff(g).filter(s => (s.fatigue ?? 0) > 65 || hasTag(s.id, 'lazy')).map(s => s.id)[0],
        choices: [
            { label: K('괜찮다고 해 주기', 'Say it\'s fine'), eff: { relBoss: 5, mood: 5, slide: true } },
            { label: K('한마디 하기', 'Have a word'), eff: { relBoss: -6, mood: -5 } },
            { label: K('월급에서 깎기', 'Dock their pay'), eff: { money: 5000, relBoss: -14, mood: -10 } },
        ],
        fb: { s: K('문이 벌컥 열리고 숨을 헐떡이며 들어와요.', 'The door bursts open, someone gasping for air.'), guest: K('', ''), staff: K('"죄, 죄송해요! 버스가…"', '"S-sorry! The bus…"') },
    },
    franchise: {
        cat: 'out', label: K('옆집 프랜차이즈 오픈', 'Chain store next door'), tiers: ['high'], big: true,
        who: g => roleStaff(g, 'serve'),
        effect: { mult: .8, days: 3 },
        choices: [
            { label: K('할인 행사로 맞서기', 'Fight back with a sale'), eff: { money: -10000, rep: 2 } },
            { label: K('우리는 우리 길로', 'Stay our course'), eff: { rep: 0 } },
            { label: K('직원 의견 들어 보기', 'Ask the staff'), eff: { gamble: true, mood: 4, delegate: true } },
        ],
        fb: { s: K('길 건너에 큰 체인 카페가 문을 열었어요.', 'A big chain café just opened across the street.'), guest: K('', ''), staff: K('"저기 줄 엄청 길어요…"', '"Their line is huge…"') },
    },
    festival: {
        cat: 'out', label: K('동네 축제', 'Town festival'), tiers: ['low', 'mid', 'high'],
        who: g => roleStaff(g, 'serve'),
        effect: { mult: 1.3, days: 0 },
        choices: [
            { label: K('시식 나눠 주기', 'Hand out samples'), eff: { ing: -3, rep: 3, fatigue: 6 } },
            { label: K('가격 조금 올리기', 'Raise prices a little'), eff: { money: 12000, rep: -1 } },
            { label: K('평소대로', 'Business as usual'), eff: { rep: 1 } },
        ],
        fb: { s: K('밖이 북적북적, 동네 축제래요!', 'It\'s bustling outside — a town festival!'), guest: K('"여기도 뭐 팔아요?"', '"Do you sell anything here?"'), staff: K('"오늘 바쁘겠다…"', '"It\'s gonna be busy…"') },
    },
};

/** 원본 카드를 참고할 중요한 장면 */
export const isImportantKind = kind => !!EVENT_KINDS[kind]?.important;

function roleStaff(g, role) {
    const w = workingStaff(g);
    return (w.find(s => s.role === role) || w.find(s => s.role === 'all') || pick(w))?.id;
}
function tagStaff(g, tags) {
    const w = workingStaff(g).filter(s => hasTag(s.id, ...tags));
    return w.length ? pick(w).id : null;
}
function pairOf(g, kind) {
    const w = workingStaff(g);
    const pairs = [];
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) {
        const v = rel(w[i].id, w[j].id).v;
        if (kind === 'bad' ? v <= -30 : v >= 50) pairs.push([w[i].id, w[j].id]);
    }
    return pairs.length ? pick(pairs) : null;
}

/** 평판 낮음에서도 가끔 나오는 손님 사건 */
const LOW_GUEST = ['rude', 'regular', 'shoplifter'];

/** 오늘 나올 사건 고르기 (수치 조건 + 성격 태그) */
export function pickEvents(g, mode = 'direct', count = null) {
    const tier = repTier(g.rep);
    const w = workingStaff(g);
    if (!w.length) return [];
    const n = count ?? (mode === 'direct' ? (g.today?.crowd ? 4 : randi(3, 4)) : randi(1, 2));
    const pool = [];
    const recent = new Set((g.recentEv || []).filter(r => r.day >= g.day - 2).map(r => r.kind));
    for (const [id, k] of Object.entries(EVENT_KINDS)) {
        if (mode === 'auto' && !k.auto) continue;
        if (mode === 'direct' && k.big === undefined && false) continue;
        // 평판 낮을 때도 손님 사건이 조금은 섞이게 (확률 반)
        const lowGuest = tier === 'low' && LOW_GUEST.includes(id);
        if (!k.tiers.includes(tier) && !(k.cat === 'staff') && !lowGuest) continue;
        if (k.needLowClean && g.clean >= 30) continue;
        if (id === 'franchise' && g.effects.some(e => e.kind === 'franchise')) continue;
        let staffIds = null;
        if (k.pair) { const p = pairOf(g, k.pair); if (!p) continue; staffIds = p; }
        else { const s = k.who?.(g); if (!s) continue; staffIds = [s]; }
        let weight = 1;
        if (k.cat === 'staff') weight = 1.3;
        if (id === 'inspection') weight = 3;
        if (id === 'festival' || id === 'franchise') weight = .35;
        if (id === 'priceSpike' || id === 'spoil') weight = .5;
        if (k.big) weight *= .8;
        if (lowGuest && !k.tiers.includes(tier)) weight *= .5;
        // 최근 이틀 안에 나온 사건은 덜 나오게 (막지는 않음)
        if (recent.has(id)) weight *= .2;
        // 0.3.0 대책이 걸린 직원의 몰래 먹기는 덜 나오게
        if (id === 'sneak') weight *= ruleMul(g, staffIds[0], 'sneak');
        // 감싸줌 → 나중에 터짐
        if (k.pair === 'bad' && g.pending.some(p => staffIds.includes(p.a))) weight *= 2;
        pool.push({ kind: id, staffIds, weight });
    }
    const out = [];
    const used = new Set();
    while (out.length < n && pool.length) {
        const total = pool.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total, i = 0;
        for (; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) break; }
        const p = pool.splice(Math.min(i, pool.length - 1), 1)[0];
        if (used.has(p.kind)) continue;
        used.add(p.kind);
        out.push({ id: uid('ev'), kind: p.kind, staffIds: p.staffIds });
    }
    // 시간 나누기
    const slots = shuffle([.14, .32, .5, .66, .82]).slice(0, out.length).sort();
    out.forEach((e, i) => (e.at = EVENT_KINDS[e.kind].early ? .06 : slots[i]));
    out.sort((a, b) => a.at - b.at);
    // 그날 고른 사건 기억 (밀린 일처럼 여러 개 뽑아 일부만 쓰는 경우는 빼고)
    if (mode === 'auto' || count == null) noteRecentEvents(g, out);
    return out;
}

/** 최근 나온 사건 기록 (이틀 지난 건 지움) */
function noteRecentEvents(g, evs) {
    const keep = (g.recentEv || []).filter(r => r.day >= g.day - 2);
    for (const e of evs) keep.push({ kind: e.kind, day: g.day });
    g.recentEv = keep.slice(-30);
}

/** AI가 못 쓸 때 쓰는 기본 사건 글 */
export function fallbackEventText(ev) {
    const k = EVENT_KINDS[ev.kind];
    return {
        title: L(...k.label),
        situation: L(...k.fb.s),
        guest: L(...k.fb.guest),
        staff: L(...k.fb.staff),
        choices: k.choices.map(c => ({ label: L(...c.label), line: '', interfere: false })),
    };
}

// AI 효과값 범위
const RANGE = { rep: [-12, 12], money: [-60000, 70000], ing: [-10, 3], mood: [-25, 25], fatigue: [-10, 25], relBoss: [-20, 20], clean: [-15, 25] };
export function clampEff(eff = {}) {
    const out = {};
    for (const [k, [a, b]] of Object.entries(RANGE)) if (eff[k] !== undefined && Number.isFinite(+eff[k])) out[k] = clamp(Math.round(+eff[k]), a, b);
    return out;
}

/** 사장님 선택 → 결과 적용. 반환: {line, interfere, delta, ok} */
/** 원래부터 "직원에게 맡기기" 뜻인 선택지 번호 (없으면 -1) — 이 사건에선 [맡기기] 버튼이 이걸 고름 */
/** 직원 본인에 대한 사건이라 [맡기기]가 어울리지 않는지 */
export const canDelegate = ev => EVENT_KINDS[ev.kind]?.cat !== 'staff';
export const delegateIndex = ev => (EVENT_KINDS[ev.kind]?.choices || []).findIndex(c => c.eff?.delegate);

/** 직원에게 맡겼을 때 (또는 사장님이 오래 안 봤을 때) 직원이 성격대로 고르는 선택지 */
export function staffPick(g, ev) {
    const k = EVENT_KINDS[ev.kind]; if (!k) return 0;
    const d = delegateIndex(ev);
    if (d >= 0) return d;
    // 직원 본인 일(지각·몰래 먹기·싸움 등)은 사장님이 안 봤으면 그냥 넘어간 걸로
    if (k.cat === 'staff') { const sl = k.choices.findIndex(c => c.eff?.slide); return sl >= 0 ? sl : 0; }
    const id = ev.staffIds[0];
    const has = (...t) => hasTag(id, ...t);
    let best = 0, top = -Infinity;
    k.choices.forEach((c, i) => {
        const e = c.eff || {};
        let v = Math.random() * 1.2; // 성격이 딱히 안 정하면 그날 기분
        if (has('greedy')) v += (e.money || 0) / 4000 + Math.min(0, e.ing || 0) * .3;
        if (has('kind', 'cheerful', 'flatterer')) v += (e.rep || 0) * .3 + (e.mood || 0) * .05 + (e.relBoss || 0) * .05 + (e.pairRel || 0) * .05;
        if (has('chatty')) v += (e.mood || 0) * .06;
        if (has('diligent', 'perfectionist', 'neat')) v += (e.ok ? 1 : 0) + (e.skill ? .4 : 0) + (e.clean || 0) * .03;
        if (has('lazy')) v -= (e.skill ? .8 : 0) + (e.fatigue || 0) * .05 + (e.clean ? .5 : 0);
        if (has('glutton')) v += Math.min(0, e.ing || 0) * -.4;
        if (has('timid', 'quiet')) v -= Math.abs(e.rep || 0) * .15 + Math.abs(e.relBoss || 0) * .03;
        if (has('rebel', 'prickly')) v += Math.random() * .8 - (e.relBoss || 0) * .04;
        if (v > top) { top = v; best = i; }
    });
    return best;
}

/** by: false = 사장님이 고름 / 'delegate' = 맡김 / 'auto' = 안 봐서 직원이 알아서 */
export function resolveEvent(g, ev, ci, biz, by = false) {
    const byStaff = !!by;
    const k = EVENT_KINDS[ev.kind];
    const base = k.choices[ci]?.eff || {};
    let ai = ev.text?.choices?.[ci] || {};
    const tx = ai;
    // 직원이 스스로 고른 거면 "사장님 말을 안 들음"(interfere) 조정은 쓰지 않음
    if (byStaff) ai = { line: ai.line };
    const main = staffById(ev.staffIds[0]);
    let eff = { ...base };
    // AI가 성격이 끼어들었다고 하면 그 범위 안에서 조정
    if (ai.effects) Object.assign(eff, clampEff({ ...pickNums(base), ...ai.effects }));
    let ok = !!base.ok;
    if (base.skillCheck && main) {
        const lv = main[base.skill || 'serve'];
        const pass = lv + randi(-2, 2) >= base.skillCheck;
        ok = pass;
        if (!pass) { eff.rep = (eff.rep || 0) - (ev.kind === 'reviewer' ? 9 : 3); if (ev.kind === 'shoplifter') eff.money = (eff.money || 0) - 3500; if (ev.kind === 'allergy') eff.rep -= 3; }
        else if (ev.kind === 'reviewer') eff.rep = (eff.rep || 0) + 3;
    }
    if (base.gamble && main) {
        const good = chance(.35 + bossRel(main.id) / 300 + (main.serve + main.bake) / 40);
        eff.rep = (eff.rep || 0) + (good ? 2 : -2);
        ok = good;
    }
    // 단체 주문: 재료가 모자라면 반만
    if (ev.kind === 'group' && eff.ing && g.ing + eff.ing < 0) {
        eff.money = Math.round((eff.money || 0) * Math.max(0, g.ing) / -eff.ing);
        eff.rep = (eff.rep || 0) - 2;
        eff.ing = -g.ing;
    }
    const delta = applyEff(g, eff, ev, biz);
    if (ok && main && base.skill) {
        biz && (biz.exp[main.id] = (biz.exp[main.id] || 0));
        addExp(main, base.skill, 3);
        if (biz) (biz.expLog ??= []).push({ id: main.id, skill: base.skill, n: 3 });
    }
    if (k.effect) {
        if (k.effect.days) g.effects.push({ kind: ev.kind, mult: k.effect.mult, until: g.day + k.effect.days });
        else if (biz) biz.mult *= k.effect.mult;
    }
    const line = ai.line || '';
    // 결과 한 줄 (아침 AI가 미리 써 둔 것: 잘 됐을 때 / 잘 안 됐을 때)
    const uncertain = !!(base.skillCheck || base.gamble);
    const result = (uncertain && !ok ? tx.resultBad : tx.result) || '';
    ev.done = { ci, line, interfere: !!ai.interfere, delta, ok, result, by: by || 'boss' };
    for (const id of ev.staffIds) remember(id, `${ev.text?.title || L(...k.label)} — ${ev.text?.choices?.[ci]?.label || L(...k.choices[ci].label)}`);
    if (biz) biz.log.push({ kind: ev.kind, staffIds: ev.staffIds, title: ev.text?.title || L(...k.label), choice: ev.text?.choices?.[ci]?.label || L(...k.choices[ci].label), line, result, by: by || 'boss', delta });
    // 감싸주기 → 며칠 뒤 터짐
    if (ev.kind === 'friends' && ci === 2 && !ok && ev.staffIds.length === 2) {
        g.pending.push({ a: ev.staffIds[0], b: ev.staffIds[1], day: g.day });
        addRel(ev.staffIds[0], ev.staffIds[1], 0, L('실수를 감싸 줬는데 아직 들키지 않음', 'Covered up a mistake — not found out yet'));
    }
    return { line, interfere: !!ai.interfere, delta, ok, uncertain, result, ci };
}

/** 직원이 고른 이유 한 줄 (성격 태그로) */
export function pickReason(ev, ci, by) {
    const k = EVENT_KINDS[ev.kind]; const eff = k?.choices[ci]?.eff || {};
    if (by === 'auto' && k?.cat === 'staff') return L('사장님이 안 봐서 그냥 넘어갔어요.', 'You didn\'t look, so it just slid by.');
    const id = ev.staffIds[0];
    const R = [
        [['rebel', 'prickly'], ['제 성격대로 제멋대로 정했어요.', 'They did it their own way, as usual.']],
        [['greedy'], ['돈 되는 쪽부터 따졌어요.', 'They went for whatever pays.']],
        [['lazy'], ['손이 덜 가는 쪽을 골랐어요.', 'They picked the least effort.']],
        [['glutton'], ['먹을 게 걸린 쪽으로 마음이 갔어요.', 'Their stomach had a say.']],
        [['diligent', 'perfectionist', 'neat'], ['대충 넘기지 않고 제대로 하려고 했어요.', 'They tried to do it properly.']],
        [['kind', 'cheerful'], ['상대 기분부터 챙겼어요.', 'They looked after people\'s feelings first.']],
        [['flatterer'], ['사장님이 좋아할 쪽을 골랐어요.', 'They picked what the boss would like.']],
        [['timid', 'quiet'], ['일이 커지지 않는 쪽을 골랐어요.', 'They kept it from getting bigger.']],
        [['chatty'], ['말로 잘 풀어 보려고 했어요.', 'They tried to talk their way through.']],
        [['clumsy'], ['일단 해 보자며 덤볐어요.', 'They just dove in.']],
    ];
    const tags = book(id)?.tags || [];
    // 고른 선택지와 잘 맞는 태그를 먼저
    const fits = t => ({ greedy: (eff.money || 0) > 0, lazy: !eff.skill && !eff.fatigue, diligent: !!eff.ok, perfectionist: !!eff.ok, neat: !!eff.ok || (eff.clean || 0) > 0, kind: (eff.rep || 0) > 0 || (eff.mood || 0) > 0, cheerful: (eff.mood || 0) > 0, glutton: (eff.ing || 0) < 0, timid: Math.abs(eff.rep || 0) <= 1 })[t];
    const order = [...tags.filter(t => fits(t)), ...tags];
    for (const t of order) { const r = R.find(([ts]) => ts.includes(t)); if (r) return L(...r[1]); }
    return L('그날 기분대로 정했어요.', 'They went with their mood that day.');
}

/** 결과 창 숫자 칩: [{t, good}] */
export function deltaChips(d, ev, exp) {
    const out = [];
    const nm = book(ev?.staffIds?.[0])?.name || '';
    const sg = v => (v > 0 ? '+' : '−') + Math.abs(v);
    if (d.rep) out.push({ t: L('평판 ', 'Rep ') + sg(d.rep), good: d.rep > 0 });
    if (d.money) out.push({ t: L('돈 ', 'Money ') + (d.money > 0 ? '+' : '−') + money(Math.abs(d.money)), good: d.money > 0 });
    if (d.ing) out.push({ t: L('재료 ', 'Stock ') + sg(d.ing), good: d.ing > 0 });
    if (d.clean) out.push({ t: L('청결 ', 'Clean ') + sg(d.clean), good: d.clean > 0 });
    if (d.mood) out.push({ t: `${nm} ${L('기분', 'mood')} ${d.mood > 0 ? '↑' : '↓'}`, good: d.mood > 0 });
    if (d.fatigue) out.push({ t: `${ev?.kind === 'group' || ev?.kind === 'inspection' ? L('다들', 'Everyone\'s') : nm} ${L('피로', 'fatigue')} ${d.fatigue > 0 ? '↑' : '↓'}`, good: d.fatigue < 0 });
    if (d.relBoss) out.push({ t: `${nm} ↔ ${L('사장', 'boss')} ${d.relBoss > 0 ? '↑' : '↓'}`, good: d.relBoss > 0 });
    if (d.pairRel) out.push({ t: `${L('둘 사이', 'Their bond')} ${d.pairRel > 0 ? '↑' : '↓'}`, good: d.pairRel > 0 });
    if (exp) out.push({ t: `${exp.skill === 'bake' ? L('제빵', 'Baking') : L('접객', 'Service')} ${L('경험', 'EXP')} +${exp.n}`, good: true });
    return out;
}
const pickNums = o => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number'));

export function applyEff(g, eff, ev, biz) {
    const d = {};
    const main = ev ? staffById(ev.staffIds[0]) : null;
    const add = (k, v) => { if (v) d[k] = (d[k] || 0) + v; };
    if (eff.rep) { g.rep = clamp(g.rep + eff.rep, 0, 100); add('rep', eff.rep); }
    if (eff.money) { g.money += eff.money; add('money', eff.money); if (biz) biz.eventMoney += eff.money; }
    if (eff.ing) { const before = g.ing; g.ing = Math.max(0, g.ing + eff.ing); add('ing', g.ing - before); }
    if (eff.clean) { g.clean = clamp(g.clean + eff.clean, 0, 100); add('clean', eff.clean); }
    if (main) {
        if (eff.mood) { main.mood = clamp((main.mood ?? 60) + eff.mood, 0, 100); add('mood', eff.mood); }
        if (eff.fatigue) { for (const s of (ev.kind === 'group' || ev.kind === 'inspection' ? workingStaff(g) : [main])) s.fatigue = clamp((s.fatigue ?? 30) + eff.fatigue, 0, 100); add('fatigue', eff.fatigue); }
        if (eff.relBoss) { addRel('boss', main.id, eff.relBoss); add('relBoss', eff.relBoss); }
    }
    if (ev?.staffIds?.length === 2) {
        if (eff.pairRel) { addRel(ev.staffIds[0], ev.staffIds[1], eff.pairRel); add('pairRel', eff.pairRel); }
        if (eff.relBoss2) addRel('boss', ev.staffIds[1], eff.relBoss2);
    }
    return d;
}

export function deltaText(d) {
    const parts = [];
    const sg = v => (v > 0 ? '+' : '−') + Math.abs(v);
    if (d.rep) parts.push(L('평판 ', 'Rep ') + sg(d.rep));
    if (d.money) parts.push(L('돈 ', 'Money ') + (d.money > 0 ? '+' : '−') + money(Math.abs(d.money), L(false, true)));
    if (d.ing) parts.push(L('재료 ', 'Stock ') + sg(d.ing));
    if (d.clean) parts.push(L('청결 ', 'Clean ') + sg(d.clean));
    if (d.mood) parts.push(L('기분 ', 'Mood ') + (d.mood > 0 ? '↑' : '↓'));
    if (d.relBoss) parts.push(L('사장 친밀도 ', 'Bond ') + (d.relBoss > 0 ? '↑' : '↓'));
    if (d.pairRel) parts.push(L('둘 사이 ', 'Their bond ') + (d.pairRel > 0 ? '↑' : '↓'));
    return parts.join(' · ');
}

// ---------- 영업 기록 ----------
export function newBiz(g) {
    return {
        money0: g.money, rep0: g.rep, clean0: g.clean, ing0: g.ing,
        served: 0, revenue: 0, soldout: 0, left: 0, burnt: 0, eaten: 0, baked: 0, eventMoney: 0,
        mult: 1, exp: {}, expLog: [], log: [], helpedOnce: false, t: 0, finished: false,
        sold: {},
    };
}
export function sellOne(g, biz) {
    const m = pick(g.menu);
    biz.served++; biz.revenue += m.p; g.money += m.p;
    biz.sold[m.id] = (biz.sold[m.id] || 0) + 1;
    const pf = menuInfo(m.id).base / m.p;
    g.rep = clamp(g.rep + (pf >= .95 ? .35 : .15), 0, 100);
    return m;
}

// ---------- 마감 ----------
export function closeDay(g, biz) {
    const w = workingStaff(g);
    const wages = Math.round(g.staff.length * WAGE * g.wageRate);
    g.money -= wages;
    let interest = 0;
    if (g.loan > 0) { interest = Math.round(g.loan * .05); g.money -= interest; }
    // 0.3.0 대책: 비용·매일 효과·아직 안 드러난 결과
    const hrItems = rulesDayEnd(g, biz);
    // 진열대 남은 것·재료 상함
    const spoiled = Math.floor(g.ing * .4);
    g.ing -= spoiled;
    // 직원 상태
    const busy = biz.served / Math.max(1, w.length);
    for (const s of w) {
        s.fatigue = clamp((s.fatigue ?? 30) + 12 + busy * .9, 0, 100);
        s.mood = clamp((s.mood ?? 60) + (s.fatigue > 75 ? -8 : 2) + (biz.revenue > 60000 ? 3 : 0), 0, 100);
        const skill = s.role === 'bake' ? 'bake' : s.role === 'serve' ? 'serve' : (s.bake > s.serve ? 'bake' : 'serve');
        addExp(s, skill, 1);
        biz.expLog.push({ id: s.id, skill, n: 1 });
    }
    // 같이 일한 사이: 기분 나쁘면 조금 멀어짐, 좋으면 조금 가까워짐
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) {
        const m = ((w[i].mood ?? 60) + (w[j].mood ?? 60)) / 2;
        addRel(w[i].id, w[j].id, m < 40 ? -3 : m > 70 ? 2 : 0);
    }
    // 빚
    let ended = false;
    if (g.money < 0) { g.debtDays += 1; if (g.debtDays >= 3) ended = true; }
    else g.debtDays = 0;
    // 밤도둑: 마지막에 나가는 직원
    const last = w.length ? (w.find(s => hasTag(s.id, 'clumsy', 'lazy')) || pick(w)) : null;
    if (last && hasTag(last.id, 'clumsy', 'lazy') && chance(.22)) {
        g.notices.push({ kind: 'thief', staffId: last.id, money: Math.min(15000, Math.max(0, Math.round(g.money * .15))), ing: Math.min(3, g.ing) });
    }
    // 기록
    const net = g.money - biz.money0 - (g.today?.spentIng || 0);
    g.stats.directDays += 1;
    g.stats.maxRep = Math.max(g.stats.maxRep, Math.round(g.rep));
    if (!g.stats.bestDay || biz.revenue > g.stats.bestDay.revenue) g.stats.bestDay = { day: g.day, revenue: biz.revenue, served: biz.served, weather: g.weather };
    const summary = { wages, interest, spoiled, net, served: biz.served, revenue: biz.revenue, ruleCost: biz.ruleCost || 0 };
    biz.summary = summary;
    addJournal({
        day: g.day, mode: 'direct', weather: g.weather,
        events: biz.log.map(l => ({ staffId: l.staffIds[0], title: l.title, text: l.result || l.line || l.choice })),
        delta: { money: net, rep: Math.round(g.rep - biz.rep0), exp: biz.expLog.reduce((s, e) => s + e.n, 0) },
        diaries: {},
    });
    // 가게 로그: 이날 "사장님 있음" 덩어리
    const avg = avgPrice(g);
    const leak = Math.round(((biz.eaten || 0) + (biz.freebie || 0) + (biz.left || 0)) * avg + (biz.burnt || 0) * ING_PRICE);
    const ch = presentChunk(g);
    ch.stats = { guests: biz.served, sales: biz.revenue, leak };
    ch.items.push(...(biz.news || []).filter(n => !String(n.key).startsWith('ev')).slice(-14)
        .map(n => ({ t: n.t, k: n.k, text: n.text, chip: n.chip || '', good: !!n.good, sid: n.sid || null, boss: !!n.boss, follow: !!n.follow, cc: n.cc || '' })));
    ch.items.push(...hrItems.map(x => ({ t: L('마감', 'Close'), k: x.k, text: x.text, chip: x.chip, good: !!x.good, sid: x.sid || null, boss: !!x.boss, cc: x.cc || '' })));
    for (const l of biz.log) if (l.delta?.rep >= 5 || l.delta?.rep <= -5 || ['reviewer', 'group', 'fight', 'inspection'].includes(l.kind)) g.stats.memorable.push({ day: g.day, title: l.title, text: l.result || l.line || l.choice });
    if (g.stats.memorable.length > 30) g.stats.memorable.splice(0, g.stats.memorable.length - 30);
    makeInbox(g);
    g.phase = 'close';
    g.today.closed = { ended, summary, discarded: biz.shelfLeft || 0 };
    save();
    return { ended, summary };
}

// ---------- 내일 걱정 ----------
export function worries(g) {
    const out = [];
    if (g.ing < 6) out.push({ col: '#F7B6C6', t: L(`재료 ${g.ing}개 남음 → 아침에 꼭 사야 해요`, `Only ${g.ing} stock left → buy more in the morning`) });
    if (g.clean < 35) out.push({ col: '#E8B97A', t: L('가게가 지저분해요 → 위생 점검이 올 수도', 'The shop is messy → an inspection may come') });
    if (g.money < 0) out.push({ col: '#F28CA6', t: L(`빚 ${g.debtDays}일째 → 3일 쌓이면 폐업`, `In debt, day ${g.debtDays} → 3 days means closing down`) });
    for (const s of g.staff) if ((s.fatigue ?? 0) >= 75) out.push({ col: '#F8CDBB', t: L(`${book(s.id)?.name} 피로가 높아요 → 내일 결근할 수도`, `${book(s.id)?.name} is exhausted → may skip tomorrow`) });
    for (const s of g.staff) if (bossRel(s.id) <= -40) out.push({ col: '#D7C4E8', t: L(`${book(s.id)?.name}가 사장님께 불만이 많아요`, `${book(s.id)?.name} is unhappy with you`) });
    return out.slice(0, 4);
}

// ---------- 결재함 ----------
export function makeInbox(g) {
    const add = it => { if (g.inbox.length < MAX_INBOX && !g.inbox.some(x => x.kind === it.kind && x.staffId === it.staffId)) g.inbox.push({ id: uid('ib'), day: g.day, ...it }); };
    if (g.money < 0 && !g.loan) add({ kind: 'loan' });
    if (g.loan > 0 && g.money >= g.loan + 20000) add({ kind: 'repay' });
    if (g.money < 0 && g.wageRate === 1 && g.staff.length) add({ kind: 'wagecut' });
    for (const s of g.staff) {
        if (bossRel(s.id) <= -60 && (s.mood ?? 60) < 35) add({ kind: 'quit', staffId: s.id });
        else if (bossRel(s.id) <= -30 && chance(.35)) add({ kind: 'complaint', staffId: s.id });
    }
    const idea = g.staff.find(s => s.bake >= 7 && chance(.3));
    const unowned = MENU_POOL.filter(m => !g.menu.some(x => x.id === m.id));
    if (idea && unowned.length && g.menu.length < 4) add({ kind: 'menu', staffId: idea.id, menuId: pick(unowned).id });
}

export function inboxInfo(it) {
    const nm = it.staffId ? book(it.staffId)?.name : '';
    switch (it.kind) {
        case 'loan': return { tag: 'money', title: L('급전 대출', 'Emergency loan'), desc: L('50,000원을 빌려요. 다 갚을 때까지 매일 이자 5%가 나가요.', `Borrow ${money(50000)}. 5% interest every day until repaid.`), a: L('빌린다', 'Borrow'), b: L('안 빌린다', 'No thanks') };
        case 'repay': return { tag: 'money', title: L('대출 갚기', 'Repay the loan'), desc: L(`빌린 돈 ${g_loan()}을 한 번에 갚아요.`, `Pay back the ${money(G()?.loan || 0)} loan in full.`), a: L('갚는다', 'Repay'), b: L('나중에', 'Later') };
        case 'wagecut': return { tag: 'money', title: L('월급 깎기', 'Cut wages'), desc: L('모두의 월급을 30% 줄여요. 직원들 마음이 크게 멀어져요.', 'Cut everyone\'s pay by 30%. Staff will resent it.'), a: L('깎는다', 'Cut'), b: L('그대로', 'Keep as is') };
        case 'quit': return { tag: 'complaint', title: L(`${nm}: 그만두겠대요`, `${nm} wants to quit`), desc: L('붙잡으려면 보너스 20,000원이 들어요.', `Keeping them costs a ${money(20000)} bonus.`), a: L('보너스 주고 붙잡기', 'Pay bonus, keep them'), b: L('보내 주기', 'Let them go') };
        case 'complaint': return { tag: 'complaint', title: L(`${nm}의 불만`, `${nm}'s complaint`), desc: L('하루 쉬게 해 주면 기분이 나아질 거예요.', 'A day off would lift their mood.'), a: L('내일 쉬게 해 주기', 'Give them tomorrow off'), b: L('무시하기', 'Ignore it') };
        case 'menu': { const m = menuInfo(it.menuId); return { tag: 'idea', title: L(`신메뉴 제안: ${m.n[0]}`, `New menu idea: ${m.n[1]}`), desc: L(`개발비 15,000원. 메뉴에 ${m.n[0]}이 늘어요.`, `${money(15000)} to develop. Adds ${m.n[1]} to the menu.`), a: L('해 보자', 'Let\'s try it'), b: L('다음에', 'Not now') }; }
        default: return { tag: 'idea', title: it.kind, desc: '', a: 'OK', b: L('아니요', 'No') };
    }
}
const g_loan = () => (G()?.loan || 0).toLocaleString();

export function decideInbox(id, yes) {
    const g = G();
    const it = g.inbox.find(x => x.id === id); if (!it) return null;
    let note = '';
    const s = it.staffId ? staffById(it.staffId) : null;
    switch (it.kind) {
        case 'loan': if (yes) { g.loan += 50000; g.money += 50000; note = L('5만 원을 빌렸어요', `Borrowed ${money(50000)}`); } break;
        case 'repay': if (yes) { g.money -= g.loan; note = L('대출을 다 갚았어요', 'Loan repaid'); g.loan = 0; } break;
        case 'wagecut': if (yes) { g.wageRate = .7; for (const x of g.staff) addRel('boss', x.id, -25, L('월급이 깎임', 'Had their pay cut')); note = L('월급을 깎았어요', 'Wages cut'); } break;
        case 'quit':
            if (!s) break;
            if (yes) { g.money -= 20000; addRel('boss', s.id, 20, L('그만두려다 붙잡힘', 'Was talked out of quitting')); s.mood = 60; note = L('붙잡았어요', 'They stayed'); }
            else { fireStaff(s.id, true); note = L('떠났어요', 'They left'); }
            break;
        case 'complaint':
            if (!s) break;
            if (yes) { s.restNext = true; addRel('boss', s.id, 8); note = L('내일 쉬게 했어요', 'Day off tomorrow'); }
            else { addRel('boss', s.id, -8, L('불만을 무시당함', 'Complaint was ignored')); }
            break;
        case 'menu':
            if (yes) { g.money -= 15000; g.menu.push({ id: it.menuId, p: menuInfo(it.menuId).base }); if (s) { addRel('boss', s.id, 6); remember(s.id, L('신메뉴가 채택됨', 'Menu idea accepted')); } note = L('메뉴가 늘었어요', 'Menu added'); }
            else if (s) addRel('boss', s.id, -3);
            break;
    }
    g.inbox = g.inbox.filter(x => x !== it);
    g.inboxHistory.unshift({ day: g.day, kind: it.kind, staffId: it.staffId, title: inboxInfo(it).title, yes });
    if (g.inboxHistory.length > 40) g.inboxHistory.length = 40;
    save();
    return note;
}

export function fireStaff(id, quit = false) {
    const g = G();
    const s = staffById(id); if (!s) return;
    g.staff = g.staff.filter(x => x !== s);
    g.inbox = g.inbox.filter(x => x.staffId !== id);
    remember(id, quit ? L('가게를 그만둠', 'Quit the shop') : L('해고됨', 'Was let go'));
    (g.leftStaff ??= []).push({ id, day: g.day, quit });
    const nm = book(id)?.name || '';
    logBoss(g, quit ? L(`${nm} 님이 가게를 그만뒀어요`, `${nm} quit the shop`) : L(`사장님이 ${nm} 님을 내보냈어요`, `You let ${nm} go`));
    assignRoles(g);
    save();
}

// ---------- 자동 운영 (사장님 없음) ----------
export function autoDay(g) {
    g.day += 1;
    const fixGone = expireFixes(g); // 돌아온 뒤 3일 넘게 안 본 수습 대기
    g.pendingFollow = []; // 어제 못 터진 "이어지는 일"은 사장님 없는 날엔 그냥 지나감
    rulesDayStart(g);
    g.weather = rollWeather();
    g.effects = g.effects.filter(e => e.until >= g.day);
    const w = g.staff.filter(s => !s.restNext);
    g.staff.forEach(s => { s.restNext = false; });
    const guests = Math.round(expectedGuests(g) * .55);
    const sell = Math.min(guests, g.ing + 6);
    const avg = avgPrice(g);
    // 작게: 벌이·손해 작게
    const revenue = g.staff.length ? Math.round(sell * avg * .5) : 0;
    const cost = Math.round(g.staff.length * WAGE * g.wageRate * .4);
    const before = g.money;
    // 자리 비웠을 때 망하는 건 막기: 0 밑으로 안 내려가고, 이미 빚이 있으면 더 늘지 않음
    g.money = before < 0 ? before + Math.max(0, revenue - cost) : Math.max(0, before + revenue - cost);
    g.ing = Math.max(0, g.ing - Math.min(g.ing, Math.round(sell * .4)));
    g.rep = clamp(g.rep + (sell >= guests ? .6 : -.6), 0, 100);
    g.clean = clamp(g.clean - 4 + w.filter(s => hasTag(s.id, 'neat', 'diligent')).length * 3, 0, 100);
    for (const s of g.staff) {
        addExp(s, s.bake >= s.serve ? 'bake' : 'serve', 1);
        s.fatigue = clamp((s.fatigue ?? 30) * .7 + 10, 0, 100);
        s.mood = clamp((s.mood ?? 60) + (60 - (s.mood ?? 60)) * .3, 0, 100);
    }
    const picks = filterAutoPicks(g, pickEvents(g, 'auto'));
    // 밤도둑 (피해 작게)
    const careless = g.staff.find(s => hasTag(s.id, 'clumsy', 'lazy'));
    if (careless && chance(.1)) picks.push({ id: uid('ev'), kind: 'nightThief', staffIds: [careless.id] });
    // 0.3.2 큰 일은 결과를 정하지 않고 "수습 대기"로 (하루 1개, 최대 3개)
    const fix = makeFix(g, picks);
    applyAutoPicks(g, picks, Math.round(revenue * LEAK_CAP));
    const hr = [...fixGone, ...(fix ? [{ t: '', k: 'bad', text: `🧯 ${L('수습 대기', 'Waiting on you')} · ${fixTitle(fix)} — ${fix.story.now}`, sid: fix.staffIds[0] }] : []), ...rulesDayEnd(g, null, true)];
    g.stats.autoDays += 1;
    return { day: g.day, weather: g.weather, money: g.money - before, rep: 0, picks, guests: sell, sales: revenue, leak: autoLeak(picks, avg), hr, fix: fix?.id || null };
}

/** 자리 비운 동안 새는 돈: 사건으로 잃은 돈 + 몰래 먹은 디저트 */
function autoLeak(picks, avg) {
    let v = 0;
    for (const p of picks) {
        if (p.delta?.money < 0) v -= p.delta.money;
        if (p.kind === 'sneak') v += avg;
    }
    return Math.round(v);
}

/** 사장님 없을 때 일어난 일들 적용 (자동 운영 규칙: 작게, 0 밑으로 안 떨어짐) */
function applyAutoPicks(g, picks, cap = Infinity) {
    // 0.3.2 새는 돈 상한: 직원들끼리 영업한 날 사건으로 잃는 돈은 cap(그날 매출의 30%)까지
    let left = cap;
    for (const p of picks) {
        if (p.kind === 'nightThief') { const loss = Math.max(0, Math.min(5000, Math.max(0, g.money), left)); left -= loss; g.money -= loss; p.delta = { money: -loss }; continue; }
        const k = EVENT_KINDS[p.kind];
        const ci = randi(0, k.choices.length - 1);
        const eff = Object.fromEntries(Object.entries(k.choices[ci].eff).filter(([, v]) => typeof v === 'number').map(([a, v]) => [a, Math.round(v * .4)]));
        if (eff.money) eff.money = Math.max(eff.money, -Math.max(0, Math.min(3000, Math.max(0, g.money), left)));
        if (eff.money < 0) left += eff.money;
        if (!eff.money) delete eff.money;
        p.delta = applyEff(g, eff, p, null);
        if (p.kind === 'sneak') g.ing = Math.max(0, g.ing - 1);
    }
}

// ---------- 같은 날 잠깐 비웠을 때 (창을 닫아 둔 시간) ----------
/** 비운 시간(분) → 생길 일 개수. 설정 "일지 쌓이는 시간"보다 짧으면 0 */
export function shortAwayCount(minutes) {
    const th = +S().awayMinutes || 0;
    if (!th || minutes < th) return 0;
    return minutes >= 300 ? 3 : minutes >= 120 ? 2 : 1;
}
/** 문 열기 전(ready) / 마감 후(done)에 잠깐 비웠을 때 작은 일 몇 개 */
export function shortAway(g, minutes) {
    if (!['ready', 'done'].includes(g.phase)) return null;
    const n = shortAwayCount(minutes);
    if (!n || !workingStaff(g).length) return null;
    const before = g.money;
    const picks = pickEvents(g, 'auto', n);
    const when = g.phase === 'done' ? 'after' : 'before';
    if (when === 'after') {
        const careless = workingStaff(g).find(s => hasTag(s.id, 'clumsy', 'lazy'));
        if (careless && chance(.1)) picks.push({ id: uid('ev'), kind: 'nightThief', staffIds: [careless.id] });
    }
    if (!picks.length) return null;
    applyAutoPicks(g, picks);
    save();
    return { day: g.day, weather: g.weather, money: g.money - before, rep: 0, picks, short: true, minutes: Math.round(minutes), when, leak: autoLeak(picks, avgPrice(g)) };
}

/** 자동 운영 일지 저장 (AI 글이 오면 채움) */
export function storeAway(days, texts, prev = null) {
    const g = G();
    const dayList = days.map(d => d.day);
    const short = !!days[0]?.short;
    const fbText = p => (p.kind === 'nightThief' ? L('문단속을 깜빡한 밤, 누가 다녀갔어요.', 'Someone forgot to lock up, and someone came by.') : EVENT_KINDS[p.kind]?.fb ? L(...EVENT_KINDS[p.kind].fb.s) : '');
    let events = (texts?.length ? texts : days.flatMap(d => d.picks.map(p => ({ day: d.day, staffId: p.staffIds?.[0], title: kindTitle(p.kind), text: fbText(p) })))).slice(0, 5);
    // AI가 날짜를 엉뚱하게 적었으면 순서대로 나눠 붙임
    events = events.map((e, i) => (dayList.includes(e.day) ? e : { ...e, day: dayList[Math.min(dayList.length - 1, Math.floor(i * dayList.length / events.length))] }));
    // 잠깐 비운 거면, 아직 안 본 지난 "사장님 없을 때"와 합쳐서 보여줌
    const keep = short && prev && !prev.seen ? (prev.events || []) : [];
    g.away = { days: [...new Set([...dayList, ...(keep.length ? prev.days || [] : [])])], events: [...events, ...keep].slice(0, 6), seen: false, at: Date.now() };
    for (const d of days) {
        addJournal({ day: d.day, mode: 'auto', short: d.short ? d.minutes : 0, weather: d.weather, events: events.filter(e => e.day === d.day), delta: { money: d.money, rep: 0, exp: d.short ? 0 : g.staff.length } });
    }
    for (const e of events) if (e.staffId) remember(e.staffId, e.title + (e.text ? ' — ' + e.text : ''));
    // 가게 로그: "사장님 없음" 덩어리 (이번에 생긴 일만)
    const sum = k => days.reduce((a, d) => a + (d[k] || 0), 0);
    addLogChunk(g, {
        kind: 'away', days: dayList, short: short ? days[0].minutes || 0 : 0,
        stats: short ? { leak: sum('leak') } : { guests: sum('guests'), sales: sum('sales'), leak: sum('leak') },
        items: [...events.map(e => ({ t: e.time || '', k: 'work', text: e.title + (e.text ? ' — ' + e.text : ''), sid: e.staffId || null })),
            ...days.flatMap(d => (d.hr || []).map(x => ({ t: '', k: x.k, text: x.text, chip: x.chip, good: !!x.good, sid: x.sid || null, boss: !!x.boss, cc: x.cc || '' })))],
    });
    save();
}


// ---------- 0.3.2 수습 대기 (사장님이 돌아와야 결과가 정해지는 일) ----------
/** 지금 수습 대기 (그만둔 직원 일은 지움) */
export function fixesOf(g) {
    g.fixes = (g.fixes || []).filter(f => f.staffIds.every(id => staffById(id)));
    return g.fixes;
}
/** 직원들끼리 영업한 날: 큰 일 하나를 수습 대기로 (하루 1개, 최대 3개) */
function makeFix(g, picks) {
    if (fixesOf(g).length >= FIX_MAX) return null;
    const w = workingStaff(g);
    if (!w.length) return null;
    let kind = null, ids = null;
    // 그날 생긴 싸움·친한 사이 사건은 결과를 정하지 않고 넘김
    // 이미 기다리는 일과 같은 일(같은 두 사람의 싸움, 냉장고 고장 두 번 등)은 또 만들지 않음
    const samePair = (a, b) => g.fixes.some(f => f.staffIds.length === 2 && f.staffIds.includes(a) && f.staffIds.includes(b));
    const busy = k => g.fixes.some(f => f.kind === k);
    const i = picks.findIndex(p => (p.kind === 'fight' || p.kind === 'friends') && !samePair(...p.staffIds));
    if (i >= 0) { const p = picks.splice(i, 1)[0]; kind = p.kind; ids = p.staffIds; }
    else if (chance(.4)) {
        const opts = [];
        // 사장님 없으면 난장판: 사이가 조금만 나빠도 싸움
        const bad = [];
        for (let a = 0; a < w.length; a++) for (let b = a + 1; b < w.length; b++) if (rel(w[a].id, w[b].id).v <= -10) bad.push([w[a].id, w[b].id]);
        const free = bad.filter(([a, b]) => !samePair(a, b));
        if (free.length) opts.push(['fight', pick(free), 1]);
        const sv = roleStaff(g, 'serve'); if (sv && !busy('rude')) opts.push(['rude', [sv], .8]);
        const bk = roleStaff(g, 'bake'); if (bk && !busy('spoil')) opts.push(['spoil', [bk], .5]);
        if (!opts.length) return null;
        let r = Math.random() * opts.reduce((t, o) => t + o[2], 0);
        const o = opts.find(x => (r -= x[2]) <= 0) || opts[0];
        [kind, ids] = o;
    }
    if (!kind) return null;
    const other = PAIR_FIX(kind) ? null : (w.find(s => s.id !== ids[0])?.id || null);
    // 최근에 쓴 기본 이야기는 피함
    g.fixRecent ??= {};
    const st = makeFixStory(kind, ids, other, g.fixRecent[kind] || []);
    g.fixRecent[kind] = [st.vi, ...(g.fixRecent[kind] || [])].slice(0, 3);
    const f = { id: uid('fx'), kind, staffIds: st.staffIds, with: st.with, day: g.day, from: null, story: st.story };
    g.fixes.push(f);
    noteRecentEvents(g, [{ kind }]);
    return f;
}
/** 돌아온 뒤 3일 넘게 안 본 수습 대기 → 직원이 알아서 (효과 작게). 가게 로그 줄 목록을 돌려줌 */
export function expireFixes(g) {
    const out = [];
    for (const f of [...fixesOf(g)]) {
        if (f.from == null || g.day < f.from + FIX_DAYS) continue;
        const r = resolveFix(g, f.id, fixPick(g, f), 'auto');
        if (r) out.push(r.item);
    }
    return out;
}
/** 남은 날 (1 = 오늘까지) */
export const fixLeft = (g, f) => (f.from == null ? FIX_DAYS : Math.max(1, f.from + FIX_DAYS - g.day));
/** 맡기기 / 안 봐서 알아서 할 때 직원이 고르는 선택지 */
export function fixPick(g, f) {
    const ch = FIX_CHOICES[f.kind];
    const d = ch.findIndex(c => c.eff.delegate);
    if (d >= 0) return d;
    if (PAIR_FIX(f.kind)) { const sl = ch.findIndex(c => c.eff.slide); return sl >= 0 ? sl : 0; }
    return staffPick(g, { kind: f.kind, staffIds: f.staffIds }); // 냉장고: 선택지가 원래 사건과 같음
}
export const fixCanDelegate = f => !PAIR_FIX(f.kind);
/**
 * 수습하기. by: false = 사장님이 고름 / 'delegate' = 맡김 / 'auto' = 3일 안 봐서 직원이 알아서
 * 반환: { f, ci, ids, delta, ok, result, label, exp, item }
 */
export function resolveFix(g, id, ci, by = false) {
    const i = (g.fixes || []).findIndex(x => x.id === id); if (i < 0) return null;
    const f = g.fixes[i];
    const ch = FIX_CHOICES[f.kind]?.[ci]; if (!ch) return null;
    const ids = ch.side === 1 ? [f.staffIds[1], f.staffIds[0]] : [...f.staffIds];
    const base = ch.eff;
    const scale = by === 'auto' ? .4 : FIX_SCALE;
    const eff = {};
    for (const [k, v] of Object.entries(base)) if (typeof v === 'number' && v) eff[k] = Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * scale));
    if (eff.money < 0 && by === 'auto') eff.money = -Math.min(-eff.money, 3000, Math.max(0, g.money)) || undefined;
    if (eff.money === undefined) delete eff.money;
    const main = staffById(ids[0]);
    let ok = !!base.ok;
    if (base.gamble && main) {
        ok = chance(.35 + bossRel(main.id) / 300 + (main.serve + main.bake) / 40);
        eff.rep = (eff.rep || 0) + (ok ? 1 : -1);
        if (!eff.rep) delete eff.rep;
    }
    const ev = { kind: f.kind, staffIds: ids };
    const delta = applyEff(g, eff, ev, null);
    let exp = null;
    if (ok && main && base.skill && by !== 'auto') { addExp(main, base.skill, 2); exp = { id: main.id, skill: base.skill, n: 2 }; }
    const r = f.story?.res?.[ci] || {};
    const result = (base.gamble && !ok && r.bad) ? r.bad : (r.t || '');
    const label = fixChoiceLabel(f, ci);
    const title = fixTitle(f);
    for (const sid of f.staffIds) remember(sid, `${title} — ${label}${result ? ' — ' + result : ''}`);
    if (PAIR_FIX(f.kind) && f.staffIds.length === 2 && r.memo) addRel(f.staffIds[0], f.staffIds[1], 0, r.memo);
    // 감싸 준 일 → 며칠 뒤 터짐 (원래 규칙 그대로)
    if (f.kind === 'friends' && base.gamble && !ok) g.pending.push({ a: f.staffIds[0], b: f.staffIds[1], day: g.day });
    g.fixes.splice(i, 1);
    const c0 = deltaChips(delta, ev, exp)[0];
    const nm = book(f.staffIds[0])?.name || '';
    const slid = by === 'auto' && base.slide;
    const text = slid
        ? F(L('사장님이 안 봐서 그냥 넘어갔어요 · {t}', 'You didn\'t look, so it slid by · {t}'), { t: title })
        : by === 'auto' ? F(L('사장님이 안 봐서 {n} 알아서 했어요 · {t}', 'You didn\'t look, so {n} handled it · {t}'), { n: fillNames('{a이}', { a: nm }), t: title }) + (base.delegate ? '' : ` — ${label}`)
            : by === 'delegate' ? F(L('수습함 · {t} — {n}에게 맡김 ({c})', 'Sorted out · {t} — left it to {n} ({c})'), { t: title, n: nm, c: label })
                : F(L('수습함 · {t} — {c}', 'Sorted out · {t} — {c}'), { t: title, c: label });
    const item = { t: '', k: by === 'auto' ? 'work' : 'boss', text, chip: c0?.t || '', good: !!c0?.good, sid: ids[0], boss: by !== 'auto', cc: c0 ? (c0.good ? 'up' : 'dn') : '' };
    if (by !== 'auto') presentChunk(g).items.push(item);
    return { f, ci, ids, delta, ok, uncertain: !!base.gamble, result, label, exp, item, by };
}

// ---------- 가게 로그 (사장님 있을 때·없을 때를 시간 덩어리로) ----------
const LOG_MAX = 12;
export function addLogChunk(g, chunk) {
    if (!g.shopLog) g.shopLog = [];
    const c = { id: uid('lg'), at: Date.now(), items: [], ...chunk };
    g.shopLog.unshift(c);
    if (g.shopLog.length > LOG_MAX) g.shopLog.length = LOG_MAX;
    return c;
}
/** 오늘 "사장님 있음" 덩어리 (없으면 만듦). 마감하면 손님·매출이 채워짐 */
export function presentChunk(g) {
    const top = g.shopLog?.[0];
    if (top && top.kind === 'present' && top.day === g.day) return top;
    return addLogChunk(g, { kind: 'present', day: g.day, stats: null });
}
/** 사장님이 한 일 (고용·해고, 나중에 대책 등) */
export function logBoss(g, text, chip = '') {
    presentChunk(g).items.push({ t: '', k: 'boss', text, chip, boss: true });
}
export function kindTitle(kind) {
    if (kind === 'nightThief') return L('밤도둑', 'Night burglar');
    return EVENT_KINDS[kind] ? L(...EVENT_KINDS[kind].label) : kind;
}

/** 아침 알림(밤도둑) 적용 */
export function applyNotices(g) {
    const out = [];
    for (const n of g.notices) {
        if (n.kind === 'thief') {
            g.money -= n.money; g.ing = Math.max(0, g.ing - n.ing);
            out.push({ ...n, text: L(`밤사이 도둑이 들었어요! 돈 ${n.money.toLocaleString()}원, 재료 ${n.ing}개를 잃었어요. (${book(n.staffId)?.name}가 문단속을 깜빡했대요)`, `A burglar broke in overnight! Lost ${money(n.money)} and ${n.ing} stock. (${book(n.staffId)?.name} forgot to lock up)`) });
            remember(n.staffId, L('문단속을 깜빡해서 도둑이 듦', 'Forgot to lock up — burglary'));
            addRel('boss', n.staffId, -3);
        }
    }
    g.notices = [];
    return out;
}

/** 관계 덕분에 막는 실수 (하루 1번) */
export function friendSaves(g, biz, staffId) {
    if (biz.helpedOnce) return null;
    const friend = workingStaff(g).find(s => s.id !== staffId && rel(s.id, staffId).v >= 50);
    if (!friend || !chance(.6)) return null;
    biz.helpedOnce = true;
    return friend.id;
}

export function staffSummary(id) {
    const s = staffById(id), b = book(id);
    return { s, b, name: b?.name || '?' };
}
