// 저장 구조
// - settings.staffBook : 직원 설명서 (원래 어떤 사람인가) — 카드별, 가게가 바뀌어도 유지
// - settings.game      : 지금 가게 (돈·수치·직원 상태·관계·사건 기록 = 가게 기억)
// - settings.pastShops : 폐업한 가게들
// 원본 캐릭터 카드와 채팅은 읽기만 한다.

import { ctx, SETTINGS_KEY, uid, dayKey, clamp } from './util.js';

export const SAVE_VERSION = 1;

export const STAFF_COLORS = [
    { tag: '#F9D3DC', shirt: '#F7B6C6' },
    { tag: '#FBE7AE', shirt: '#F6D57A' },
    { tag: '#F8CDBB', shirt: '#E8B97A' },
    { tag: '#D6E9C6', shirt: '#AFCF95' },
];

export const MAX_STAFF = 4;
export const MAX_INBOX = 3;
export const WAGE = 12000;
export const ING_PRICE = 900;
export const START_MONEY = 60000;

export const menuInfo = id => MENU_POOL.find(m => m.id === id) || MENU_POOL[0];

export const MENU_POOL = [
    { id: 'tart', n: ['딸기 타르트', 'Strawberry Tart'], base: 5500, col: '#F7B6C6' },
    { id: 'cookie', n: ['버터 쿠키', 'Butter Cookie'], base: 2500, col: '#FBE29A' },
    { id: 'pudding', n: ['크림 푸딩', 'Cream Pudding'], base: 3800, col: '#E8B97A' },
    { id: 'choux', n: ['슈크림', 'Cream Puff'], base: 3200, col: '#F3D9B8' },
    { id: 'macaron', n: ['마카롱', 'Macaron'], base: 2800, col: '#D7C4E8' },
    { id: 'crumble', n: ['사과 크럼블', 'Apple Crumble'], base: 4800, col: '#E8A07A' },
    { id: 'roll', n: ['롤케이크', 'Roll Cake'], base: 4500, col: '#FFF1C9' },
    { id: 'bingsu', n: ['우유 빙수', 'Milk Bingsu'], base: 6500, col: '#DDEFF5' },
];

/** 가게 크기 단계 (넓히기 기능은 3단계에서 — 지금은 크기만 바꿀 수 있는 구조) */
export const SIZES = ['11x9', '13x10', '15x12'];

const DEFAULT_SETTINGS = {
    version: SAVE_VERSION,
    lang: 'auto', // auto | ko | en
    cardRef: 'all', // all | important | none
    businessMinutes: 4,
    autoDayHours: 8, // 창을 닫고 이만큼(시간) 지날 때마다 직원들끼리 하루 영업 (최대 3일)
    rememberZoom: false,
    staffTags: true, // 0.2.0 영업 장면 직원 머리 위 글 이름표
    vpDebug: false, // 0.2.11 문제 찾기용 화면 위치 기록 (아이폰 키보드)
    responseLength: 1600,
    profileId: '', // '' = 지금 연결 그대로
    bossName: '', // '' = 페르소나 이름
    bossNameAsked: false, // 처음 열 때 사장 이름을 물어봤는지
    winSize: 'auto', // auto | s | m | l
    awayMinutes: 30, // 창을 닫고 이만큼 지나면 "사장님 없을 때" 일지가 쌓임 (0 = 끔)
    backlogMinutes: 60, // 영업 중 창을 닫고 이만큼 지나면 밀린 일이 쌓임 (0 = 끔)
    staffBook: {},
    game: null,
    pastShops: [],
};

export function S() {
    const c = ctx();
    if (!c.extensionSettings[SETTINGS_KEY]) c.extensionSettings[SETTINGS_KEY] = structuredClone(DEFAULT_SETTINGS);
    const s = c.extensionSettings[SETTINGS_KEY];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (s[k] === undefined) s[k] = structuredClone(v);
    return s;
}
export const G = () => S().game;

let saveTimer = null;
export function save(now = false) {
    const c = ctx();
    clearTimeout(saveTimer);
    if (now && typeof c.saveSettings === 'function') { c.saveSettings(); return; }
    if (typeof c.saveSettingsDebounced === 'function') c.saveSettingsDebounced();
}

export function newGame(carryRelations = null) {
    const today = dayKey();
    const g = {
        id: uid('shop'),
        name: '', // 가게 이름 (사장님이 정함)
        nameAsked: false,
        openedOn: today,
        day: 1,
        dayKey: today,
        phase: 'ready', // ready | morning | open | close | done
        money: START_MONEY,
        rep: 40,
        ing: 8,
        clean: 70,
        size: SIZES[0],
        menu: MENU_POOL.slice(0, 3).map(m => ({ id: m.id, p: m.base })),
        weather: 'sun',
        staff: [],
        rel: {},
        memory: {},
        journal: [],
        away: null, // { days, events:[], seen:false }
        inbox: [],
        inboxHistory: [],
        debtDays: 0,
        loan: 0,
        wageRate: 1,
        effects: [], // 며칠 이어지는 효과 {kind, until}
        pending: [], // 나중에 터질 일 {a,b,day,text}
        shopLog: [], // 가게 로그 덩어리 {kind:'present'|'away', items:[]}
        recentEv: [], // 최근 나온 사건 {kind,day} — 같은 사건이 계속 나오지 않게
        notices: [], // 다음 날 아침 알림 (밤도둑 등)
        stats: { bestDay: null, maxRep: 40, directDays: 0, autoDays: 0, memorable: [] },
        today: null,
        zoom: {},
    };
    if (carryRelations) g.rel = carryRelations;
    return g;
}

export function ensureGame() {
    const s = S();
    if (!s.game) { s.game = newGame(); save(); }
    migrate(s.game);
    return s.game;
}

function migrate(g) {
    g.effects ??= []; g.pending ??= []; g.notices ??= []; g.inbox ??= []; g.inboxHistory ??= [];
    g.memory ??= {}; g.rel ??= {}; g.journal ??= []; g.zoom ??= {};
    g.stats ??= { bestDay: null, maxRep: g.rep, directDays: 0, autoDays: 0, memorable: [] };
    g.stats.memorable ??= [];
}

// ---------- 직원 ----------
/** 가게 이름 (예전 저장의 기본값 'Crumble'은 이름 없음으로 봄) */
export const shopName = g => { const n = String(g?.name || '').trim(); return n && n !== 'Crumble' ? n : ''; };
export const staffById = id => G()?.staff.find(s => s.id === id);
export const book = id => S().staffBook[id];
export const staffName = id => book(id)?.name || staffById(id)?.name || '직원';

export function nextColor() {
    const used = new Set(G().staff.map(s => s.color));
    for (let i = 0; i < STAFF_COLORS.length; i++) if (!used.has(i)) return i;
    return G().staff.length % STAFF_COLORS.length;
}
export const colorOf = s => STAFF_COLORS[(s?.color ?? 0) % STAFF_COLORS.length];

// ---------- 관계 (가게 기억) ----------
const relKey = (a, b) => (a === 'boss' || b === 'boss') ? 'boss|' + (a === 'boss' ? b : a) : [a, b].sort().join('|');
export function rel(a, b) {
    const g = G(); const k = relKey(a, b);
    if (!g.rel[k]) g.rel[k] = { v: 0, memo: '' };
    return g.rel[k];
}
export function addRel(a, b, d, memo) {
    const r = rel(a, b);
    r.v = clamp(Math.round(r.v + d), -100, 100);
    if (memo) r.memo = String(memo).slice(0, 80);
    return r;
}
export const bossRel = id => rel('boss', id).v;
// 하트 칸 수: 0이면 빈 하트, 0~100은 20마다 하나 / 0 밑은 금 간 파란 하트가 같은 방식으로
export const hearts = v => clamp(Math.round(Math.abs(v || 0) / 20), 0, 5);

export function remember(staffId, text) {
    const g = G();
    (g.memory[staffId] ??= []).unshift({ day: g.day, text: String(text).slice(0, 160) });
    if (g.memory[staffId].length > 60) g.memory[staffId].length = 60;
}

export function addJournal(entry) {
    const g = G();
    g.journal.unshift(entry);
    if (g.journal.length > 90) g.journal.length = 90;
}

export function skillNeed(lv) { return lv * 2; }
/** 경험치 더하기 — 레벨이 오르면 true */
export function addExp(s, skill, n) {
    s.exp ??= { bake: 0, serve: 0 };
    let up = false;
    s.exp[skill] += n;
    while (s[skill] < 10 && s.exp[skill] >= skillNeed(s[skill])) {
        s.exp[skill] -= skillNeed(s[skill]);
        s[skill]++;
        up = true;
    }
    if (s[skill] >= 10) s.exp[skill] = 0;
    return up;
}
