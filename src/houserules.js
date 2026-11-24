// 0.3.0 가게 대책 — 며칠 가는 지시. 성격대로 받아들여서 생각대로 안 될 수도 있음 (18장 ⑫ B, 태그 규칙 버전)
// 숫자·결과 고르기는 전부 규칙. 화면엔 "비틀림"이라는 말 대신 상황별 이름표만.
import { L, money } from './i18n.js';
import { G, book, staffById, addRel, remember } from './state.js';
import { hasTag, applyEff, logBoss, avgPrice } from './rules.js';
import { pickReaction, ACC } from './orders.js';
import { uid } from './util.js';

const K = (ko, en) => [ko, en];
export const MAX_RULES = 3;

/** 대책을 걸 수 있는 사고 (0.2.4 "!" 사고 4종) */
export const HR_ACC = {
    sneak: { icon: '🍰', title: ACC.sneak.title },
    freebie: { icon: '🎁', title: ACC.freebie.title },
    chat: { icon: '💬', title: ACC.chat.title },
    doze: { icon: '💤', title: ACC.doze.title },
};

/**
 * 대책 표 (한 줄씩). days: null = 바꿀 때까지 / cost: 하루 비용 / mul: 그 사고가 나올 확률 배수
 * daily: 대책이 걸린 날마다 그 직원에게 (마감 때) / slow: 일하는 시간 배수
 * out: 걸어 보면 나오는 결과 글 (half 반쪽 효과 / back 역효과 / unexp 예상 밖 전개 / lucky 뜻밖의 행운)
 * lean: 결과 쪽 기울기 (태그 → 가중치)
 */
export const HR = {
    basket: {
        acc: 'sneak', icon: '🧺', n: K('간식 바구니', 'Snack basket'), days: 3, cost: 2000, mul: .3,
        exp: K('간식이 금방 바닥날 수 있어요', 'The basket might run dry fast'),
        boss: K('간식은 바구니에서만 먹어. 진열대는 손대지 말고.', 'Snacks come from the basket. Leave the display alone.'),
        out: {
            half: K('간식을 먹고도 진열대 디저트를 한 입씩 맛봤어요', 'Ate the snacks — and still nibbled the display'),
            back: K('간식 바구니가 하루 만에 비었어요. 다시 진열대에 손을 댔어요', 'Emptied the basket in a day, then went back to the display'),
            unexp: [K('간식 먹으러 자꾸 자리를 비워서 한 판을 태웠어요', 'Kept slipping off for snacks and burnt a batch'), { ing: -1 }],
            lucky: [K('간식을 손님에게 맛보기로 나눠 줬더니 디저트가 더 팔렸어요', 'Shared the snacks as tasters, and more desserts sold'), { sales: 1, rep: 1 }],
        },
        lean: { glutton: { back: 20 } },
    },
    samples: {
        acc: 'sneak', icon: '🍪', n: K('시식 담당 시키기', 'Put them on samples'), days: 2, cost: 0, mul: .4, daily: { ing: -1 },
        exp: K('재료를 더 쓸 수 있어요. 맛보기로 더 팔릴 수도 있어요', 'Might use more stock — or sell more from tastings'),
        boss: K('먹고 싶으면 손님 시식용으로 잘라서 나눠 줘.', 'If you want a bite, cut it up as samples for the guests.'),
        out: {
            half: K('시식용을 자르면서 큰 조각은 자기가 먹었어요', 'Cut samples — and kept the big pieces'),
            back: K('시식용을 다 자기가 먹고 하루 만에 그만뒀어요', 'Ate all the samples and gave up after a day'),
            unexp: [K('시식을 너무 많이 잘라서 진열대가 일찍 비었어요', 'Cut so many samples the display ran out early'), { ing: -2 }],
            lucky: [K('시식을 맛본 손님들이 한 상자씩 사 갔어요', 'Guests who tried the samples bought whole boxes'), { sales: 2 }],
        },
        lean: { kind: { lucky: 12 }, cheerful: { lucky: 12 }, glutton: { half: 10 } },
    },
    bakeOnly: {
        acc: 'sneak', icon: '🚫', n: K('진열에서 빼고 굽기만', 'Baking only, off the display'), days: null, cost: 0, mul: .15, slow: 1.15,
        exp: K('진열대가 늦게 찰 수 있어요', 'The display might fill up slower'),
        boss: K('진열은 다른 사람이 할게. 굽기만 해.', 'Someone else will stock the display. You just bake.'),
        out: {
            half: K('굽다가 오븐 앞에서 갓 구운 걸 맛봤어요', 'Tasted fresh batches right at the oven'),
            back: K('진열대 앞을 서성이다 결국 또 손을 댔어요', 'Hovered by the display and dug in again'),
            unexp: [K('굽기만 하니 심심하다며 시무룩해졌어요', 'Got bored of only baking and sulked'), { mood: -5 }],
            lucky: [K('굽기에만 집중했더니 디저트가 더 맛있어졌대요', 'Focused on baking, and the desserts got better'), { rep: 2 }],
        },
        lean: { diligent: { ok: 10 }, perfectionist: { lucky: 10 } },
    },
    budget: {
        acc: 'freebie', icon: '🎁', n: K('서비스 하루 2개', '2 freebies a day'), days: 3, cost: 0, mul: .35,
        exp: K('2개를 넘기면 다시 막 줄 수 있어요', 'Past two, they might start giving freely again'),
        boss: K('서비스는 하루 2개까지만.', 'Two freebies a day, tops.'),
        out: {
            half: K('2개를 다 쓰고도 "이건 반 개"라며 더 줬어요', 'Used up both, then gave "half ones" too'),
            back: K('아침에 2개를 다 쓰고 오후엔 다시 막 줬어요', 'Used both by morning, then gave freely all afternoon'),
            unexp: [K('덤을 아끼느라 손님에게 괜히 미안해했어요', 'Held back the freebies and felt bad all day'), { mood: -4 }],
            lucky: [K('딱 2개만 주니 받은 손님이 특별하다며 소문을 냈어요', 'Only two a day felt special — the lucky guests spread the word'), { rep: 2 }],
        },
        lean: { kind: { half: 10 }, flatterer: { back: 10 } },
    },
    regulars: {
        acc: 'freebie', icon: '💝', n: K('단골에게만', 'Regulars only'), days: 3, cost: 0, mul: .5,
        exp: K('새 손님 평판이 덜 오를 수 있어요', 'New guests might be less impressed'),
        boss: K('덤은 단골에게만 줘.', 'Freebies go to regulars only.'),
        out: {
            half: K('처음 온 손님에게 "단골 되실 분"이라며 줬어요', 'Gave one to a first-timer as a "future regular"'),
            back: K('오는 손님마다 단골이라며 덤을 줬어요', 'Decided every guest was a regular'),
            unexp: [K('단골만 챙긴다고 새 손님이 서운해했어요', 'A new guest felt left out'), { rep: -1 }],
            lucky: [K('단골들이 친구를 데려와 같이 샀어요', 'The regulars brought friends to buy with them'), { sales: 2 }],
        },
        lean: { cheerful: { back: 8 }, chatty: { lucky: 8 } },
    },
    offCounter: {
        acc: 'freebie', icon: '🧾', n: K('계산대에서 빼기', 'Off the counter'), days: null, cost: 0, mul: .1, slow: 1.15,
        exp: K('계산이 느려질 수 있어요', 'Checkout might slow down'),
        boss: K('당분간 계산대 말고 다른 일 해 줘.', 'Do something other than the counter for a while.'),
        out: {
            half: K('지나가다 손님 봉투에 쿠키를 몰래 넣었어요', 'Slipped cookies into guests\' bags on the way past'),
            back: K('계산대 옆을 맴돌며 계속 덤을 줬어요', 'Hung around the counter and kept handing out freebies'),
            unexp: [K('계산대를 떠나니 시무룩해서 일이 느려졌어요', 'Sulked about leaving the counter and slowed down'), { mood: -5 }],
            lucky: [K('홀에서 손님을 살뜰히 챙겨서 평판이 올랐어요', 'Looked after guests on the floor and won them over'), { rep: 2 }],
        },
        lean: { kind: { lucky: 10 } },
    },
    floor: {
        acc: 'chat', icon: '🪑', n: K('홀 담당으로', 'Move to the floor'), days: null, cost: 0, mul: .2,
        exp: K('홀에서 또 수다를 떨 수 있어요', 'They might just chat on the floor instead'),
        boss: K('손님이랑 얘기하고 싶으면 홀에서 해.', 'If you want to chat with guests, do it on the floor.'),
        out: {
            half: K('홀에서 수다 떨다가 손님을 계산대까지 따라갔어요', 'Chatted on the floor and followed guests to the counter'),
            back: K('홀이 심심하다며 계산대로 돌아와 수다를 떨었어요', 'Got bored on the floor and came back to chat at the counter'),
            unexp: [K('홀에서 수다를 떠느라 테이블 정리가 밀렸어요', 'Chatted so much the tables piled up'), { clean: -4 }],
            lucky: [K('홀에서 손님들과 친해져서 단골이 생겼어요', 'Made friends on the floor and won some regulars'), { sales: 2, rep: 1 }],
        },
        lean: { chatty: { unexp: 10, lucky: 5 } },
    },
    quietOnly: {
        acc: 'chat', icon: '🤫', n: K('한가할 때만', 'Only when it\'s quiet'), days: 3, cost: 0, mul: .5, busyIgnore: true,
        exp: K('바쁜 날엔 안 지킬 수 있어요', 'They might ignore it on busy days'),
        boss: K('수다는 한가할 때만 떨어.', 'Chat only when it\'s quiet.'),
        out: {
            half: K('"지금 한가해요"라며 수다를 이어 갔어요', 'Kept insisting "it\'s quiet right now"'),
            back: K('바쁜 줄도 모르고 하루 만에 다시 수다를 떨었어요', 'Forgot all about it in a day and chatted through the rush'),
            unexp: [K('참았던 수다를 마감 뒤 동료에게 쏟아냈어요', 'Saved up all the chatter and unloaded it on coworkers after closing'), { mood: -3 }],
            lucky: [K('한가할 때 나눈 수다로 손님이 다시 와서 잔뜩 샀어요', 'A quiet-time chat brought a guest back to buy a pile'), { sales: 3 }],
        },
        lean: { chatty: { half: 10 } },
    },
    pair: {
        acc: 'chat', icon: '👯', n: K('계산대에 짝 붙이기', 'Pair them at the counter'), days: 2, cost: 0, mul: .3, pairTired: 5,
        exp: K('같이 서는 직원이 피곤해질 수 있어요', 'Their partner might get worn out'),
        boss: K('당분간 계산대에 짝이랑 같이 서.', 'You\'ll share the counter with someone for a bit.'),
        out: {
            half: K('짝이랑 둘이 수다를 떨었어요', 'Ended up chatting with their partner'),
            back: K('짝을 데리고 테이블로 수다 떨러 갔어요', 'Took their partner along to chat at the tables'),
            unexp: [K('짝이 지쳐서 오후 내내 힘들어했어요', 'Their partner was worn out all afternoon'), { mood: -2 }],
            lucky: [K('둘이 손발이 맞아서 줄이 금방 줄었어요', 'The two clicked and the line flew by'), { sales: 2 }],
        },
        lean: { chatty: { half: 10, unexp: 5 } },
    },
    breaks: {
        acc: 'doze', icon: '☕', n: K('쉬는 시간', 'Set breaks'), days: 3, cost: 0, mul: .3, slow: 1.1, daily: { fatigue: -8 },
        exp: K('일하는 시간이 줄 수 있어요', 'They might get less done'),
        boss: K('졸리면 정해진 시간에 쉬어.', 'If you\'re sleepy, take your break at the set time.'),
        out: {
            half: K('쉬는 시간에 자고, 일할 때도 조금 졸았어요', 'Slept on break — and dozed a bit on shift too'),
            back: K('쉬는 시간이 끝나도 안 일어나서 하루 만에 흐지부지됐어요', 'Didn\'t get up after the break, and it fell apart in a day'),
            unexp: [K('쉬는 시간마다 간식을 먹어서 재료가 줄었어요', 'Snacked every break, and the stock went down'), { ing: -1 }],
            lucky: [K('푹 쉬고 나니 오후 내내 날아다녔어요', 'Well rested, they flew through the afternoon'), { rep: 1, mood: 5 }],
        },
        lean: { lazy: { half: 10 }, glutton: { unexp: 10 } },
    },
    fine: {
        acc: 'doze', icon: '💸', n: K('졸면 벌금', 'Fine for dozing'), days: 2, cost: 0, mul: .3, daily: { relBoss: -2 },
        exp: K('사장님과 사이가 나빠질 수 있어요', 'Things with you might cool off'),
        boss: K('또 졸면 벌금이야.', 'Doze again and it\'s a fine.'),
        out: {
            half: K('벌금이 무서워서 서서 졸았어요', 'Scared of the fine, so they dozed standing up'),
            back: K('"벌금 내면 되잖아요"라며 대놓고 졸았어요', '"I\'ll just pay it," they said, and dozed openly'),
            unexp: [K('안 졸려고 커피를 들이붓다 컵을 엎었어요', 'Chugged coffee to stay awake and knocked a cup over'), { clean: -4 }],
            lucky: [K('벌금 대신 일을 더 하겠다며 청소까지 해 놨어요', 'Offered to work it off instead and cleaned the whole place'), { clean: 5 }],
        },
        lean: { rebel: { back: 15 }, prickly: { back: 10 }, timid: { ok: 10 } },
    },
    stickers: {
        acc: 'doze', icon: '⭐', n: K('칭찬 스티커', 'Praise stickers'), days: 4, cost: 0, mul: .25,
        exp: K('잘 먹히다 갑자기 시들 수 있어요', 'Might work great, then suddenly lose its charm'),
        boss: K('안 졸고 일하면 칭찬 스티커 줄게.', 'Stay awake and you get a praise sticker.'),
        out: {
            half: K('스티커를 받고 나면 바로 졸았어요', 'Dozed off right after earning each sticker'),
            back: K('스티커가 시시하다며 하루 만에 다시 졸았어요', 'Decided stickers were lame and dozed again after a day'),
            unexp: [K('스티커를 더 받으려고 사장님만 졸졸 따라다녔어요', 'Followed you around fishing for more stickers'), { clean: -3 }],
            lucky: [K('스티커 모으는 재미에 빠져서 다른 직원까지 따라 했어요', 'Got hooked on stickers, and the others joined in'), { rep: 1, mood: 4 }],
        },
        lean: { cheerful: { lucky: 10 }, flatterer: { unexp: 10 }, rebel: { back: 10 } },
    },
    // 공통: 경고하기 (1일, 자리 안 차지, 사장 친밀도 −)
    warn: {
        acc: '*', icon: '⚠️', n: K('경고하기', 'Give a warning'), days: 1, cost: 0, mul: .5, noSlot: true, setEff: { relBoss: -4 },
        exp: K('사이가 조금 나빠질 수 있어요', 'Things might cool a little'),
        boss: K('한 번만 더 그러면 정말 안 돼.', 'One more time and that\'s it.'),
    },
};
/** 사고별 대책 (경고는 맨 끝) */
export const rulesOf = acc => [...Object.keys(HR).filter(id => HR[id].acc === acc), 'warn'];

/** 결과 이름표 (화면엔 이 말만) */
export const OUT = {
    ok: { label: K('잘 먹혀요', 'Working'), cls: 'ok', text: K('아직은 잘 지켜요', 'Sticking to it so far') },
    half: { label: K('반쪽 효과', 'Half worked'), cls: 'half' },
    back: { label: K('역효과', 'Backfired'), cls: 'back' },
    unexp: { label: K('예상 밖 전개', 'Unexpected turn'), cls: 'unexp' },
    lucky: { label: K('뜻밖의 행운', 'Lucky break'), cls: 'lucky' },
};

// ---------- 읽기 ----------
const alive = (g, r) => !!staffById(r.sid) && g.staff.some(s => s.id === r.sid);
export const isActive = (r, day) => !r.ended && r.from <= day && (r.until == null || r.until >= day);
export const activeRules = (g, day = g.day) => (g.rules || []).filter(r => alive(g, r) && isActive(r, day));
/** 대책 자리를 차지하는 것 (끝난 것·경고 빼고) */
export const slotRules = g => (g.rules || []).filter(r => alive(g, r) && !r.ended && !HR[r.id]?.noSlot);
export const slotsUsed = g => slotRules(g).length;
export const ruleFor = (g, sid, acc) => (g.rules || []).find(r => r.sid === sid && r.acc === acc && !r.ended && r.id !== 'warn');
export const warnFor = (g, sid) => (g.rules || []).find(r => r.sid === sid && r.id === 'warn' && !r.ended);
export const ruleName = r => L(...(HR[r.id]?.n || K('', '')));

/** 오늘 그 직원·사고가 나올 확률 배수 (대책 + 경고) */
export function ruleMul(g, sid, acc, { busy = false, day = g.day } = {}) {
    let m = 1;
    for (const r of activeRules(g, day)) {
        if (r.sid !== sid || r.acc !== acc) continue;
        const d = HR[r.id];
        let v = d.mul;
        if (d.busyIgnore && busy) v = Math.max(v, .9);
        if (r.out === 'half') v = Math.max(v, .65);
        if (r.out === 'back') v = Math.max(v, .6);
        if (fading(r, day)) v = (v + 1) / 2;
        m *= v;
    }
    return m;
}
/** 일하는 시간 배수 */
export function ruleSlow(g, sid) {
    return activeRules(g).filter(r => r.sid === sid).reduce((a, r) => a * (HR[r.id].slow || 1), 1);
}
/** 며칠짜리 대책의 마지막 날 */
export const fading = (r, day = G().day) => r.until != null && HR[r.id].days >= 2 && r.until === day && r.out !== 'back';
export const daysLeft = (r, day = G().day) => (r.until == null ? null : Math.max(0, r.until - Math.max(day, r.from) + 1));

/** 이 직원에게 대책을 걸 만한 사고: 성격 태그 + 최근 3일 안에 실제로 한 것 */
export function proneAccs(g, sid) {
    const s = staffById(sid) || {};
    const seen = g.accSeen?.[sid] || {};
    const recent = k => seen[k] != null && seen[k] >= g.day - 3;
    const out = [];
    if (hasTag(sid, 'glutton', 'lazy') || recent('sneak')) out.push('sneak');
    if (hasTag(sid, 'kind', 'flatterer', 'chatty') || recent('freebie')) out.push('freebie');
    if (hasTag(sid, 'chatty') || recent('chat')) out.push('chat');
    if (hasTag(sid, 'lazy') || (s.fatigue ?? 30) > 70 || recent('doze')) out.push('doze');
    return out;
}
/** 성격 사고가 일어났을 때 (영업 중) — 대책 칸·칩에 씀 */
export function noteAcc(g, biz, sid, kind) {
    ((g.accSeen ??= {})[sid] ??= {})[kind] = g.day;
    const c = ((biz.accTimes ??= {})[sid] ??= {});
    c[kind] = (c[kind] || 0) + 1;
    return c[kind];
}

// ---------- 걸기 ----------
function pickOutcome(sid, id) {
    const w = { ok: 35, half: 25, back: 15, unexp: 15, lucky: 10 };
    const T = (tags, d) => { if (hasTag(sid, ...tags)) for (const [k, v] of Object.entries(d)) w[k] += v; };
    T(['diligent', 'perfectionist'], { ok: 20 });
    T(['rebel', 'prickly'], { half: 10, back: 10 });
    T(['lazy'], { half: 10 });
    T(['cheerful', 'chatty'], { unexp: 5, lucky: 5 });
    T(['clumsy'], { unexp: 8 });
    for (const [tag, d] of Object.entries(HR[id].lean || {})) T([tag], d);
    const tot = Object.values(w).reduce((a, v) => a + Math.max(0, v), 0);
    let r = Math.random() * tot;
    for (const [k, v] of Object.entries(w)) { r -= Math.max(0, v); if (r <= 0) return k; }
    return 'ok';
}

/**
 * 대책 걸기. 같은 직원·같은 사고에 걸린 대책은 바꿔 끼움.
 * 반응(0.2.4 반응 4종 그대로): 따름 = 바로 / 미룸 = 하루 늦게 / 안 들음 = 반쪽부터 + 사이 ↓ / 엉뚱 = 예상 밖 전개나 행운 쪽
 * 반환: { rule, react, cost }
 */
export function setRule(g, sid, acc, id) {
    const d = HR[id];
    const after = g.phase === 'done' || g.phase === 'close' || g.phase === 'ending';
    // 반응: 대책은 "부드러운 지시"도 "혼내기"도 아님. 경고는 혼내기 쪽
    const react = pickReaction(sid, acc, 0, { soft: false, scold: id === 'warn' });
    let from = g.day + (after ? 1 : 0);
    if (react === 'delay') from += 1;
    let out = id === 'warn' ? 'ok' : pickOutcome(sid, id);
    if (react === 'refuse' && out === 'ok') out = 'half';
    if (react === 'twist' && id !== 'warn') out = /lucky/.test(out) || Math.random() < .5 ? 'lucky' : 'unexp';
    // 같은 사고 대책(경고는 경고끼리) 바꿔 끼우기
    g.rules = (g.rules || []).filter(r => !(r.sid === sid && (id === 'warn' ? r.id === 'warn' : r.acc === acc && r.id !== 'warn')));
    const rule = { rid: uid('hr'), id, sid, acc, setDay: g.day, from, until: d.days == null ? null : from + d.days - 1, out, react, shown: false, ack: false, ended: false };
    g.rules.push(rule);
    if (d.setEff) addRel('boss', sid, d.setEff.relBoss || 0);
    if (react === 'refuse') addRel('boss', sid, -3);
    const nm = book(sid)?.name || '';
    const slot = d.noSlot ? '' : ` · ${L('대책', 'House rules')} ${slotsUsed(g)}/${MAX_RULES}`;
    logBoss(g, L(`사장님이 ${nm}에게 대책을 걸었어요: ${L(...d.n)}${d.days ? ` ${d.days}일` : ''}${slot}`, `You set a house rule for ${nm}: ${L(...d.n)}${d.days ? ` · ${d.days} day${d.days > 1 ? 's' : ''}` : ''}${slot}`), L(...reactLabel(react)));
    remember(sid, L(`사장님이 대책을 걸었어요: ${L(...d.n)}`, `Boss set a house rule: ${L(...d.n)}`));
    return { rule, react };
}
const RL = { obey: K('따랐어요', 'Did as told'), delay: K('미뤘어요', 'Stalled'), refuse: K('안 들었어요', 'Ignored you'), twist: K('엉뚱하게 알아들음', 'Took it their own way') };
export const reactLabel = r => RL[r] || RL.obey;
/** 걸 때 반응 → 언제부터 */
export function startText(g, rule) {
    const d = HR[rule.id];
    const when = rule.from <= g.day ? L('오늘부터', 'Starts today') : rule.from === g.day + 1 ? L('내일부터', 'Starts tomorrow') : L('모레부터', 'Starts in 2 days');
    const len = d.days == null ? L('바꿀 때까지', 'until you change it') : L(`${d.days}일`, `${d.days} day${d.days > 1 ? 's' : ''}`);
    const extra = rule.react === 'refuse' ? L(' · 마지못해', ' · grudgingly') : '';
    return `${when} · ${len}${extra}`;
}

export function removeRule(g, rid) { g.rules = (g.rules || []).filter(r => r.rid !== rid); }
export function ackRule(g, rid) {
    const r = (g.rules || []).find(x => x.rid === rid); if (!r) return;
    if (r.ended) removeRule(g, rid); else r.ack = true;
}
/** 뜻밖의 행운이면 [연장하기]: 원래 기간만큼 더 */
export function extendRule(g, rid) {
    const r = (g.rules || []).find(x => x.rid === rid); if (!r || r.until == null) return;
    r.until += HR[r.id].days; r.ack = true;
    logBoss(g, L(`사장님이 ${book(r.sid)?.name}의 ${ruleName(r)} 대책을 연장했어요`, `You extended ${book(r.sid)?.name}'s ${ruleName(r)}`));
}

// ---------- 하루 흐름 ----------
/** 결과 이름표·글 (아직 안 드러났으면 null) */
export function outcomeOf(r) {
    if (r.id === 'warn') return null;
    const o = OUT[r.out] || OUT.ok;
    const x = HR[r.id].out?.[r.out];
    // half·back = [ko, en] / unexp·lucky = [[ko, en], 효과]
    const withEff = Array.isArray(x?.[0]);
    const pair = r.out === 'ok' || !x ? o.text : withEff ? x[0] : x;
    return { label: L(...o.label), cls: o.cls, text: L(...pair), eff: withEff ? x[1] : null };
}

/**
 * 결과 드러내기 (그날 처음 대책이 걸린 날, 한 번만). 효과도 여기서.
 * 반환: 소식/로그 한 줄 { text, chip, cc, sid, k, good }
 */
export function revealRule(g, r, biz = null, scale = 1) {
    if (r.shown || r.id === 'warn') return null;
    r.shown = true;
    const o = outcomeOf(r);
    if (r.out === 'back') r.until = Math.max(r.from, g.day); // 하루 만에 풀림
    let chip = o.label;
    if (o.eff) {
        const { sales = 0, ...rest } = o.eff;
        const eff = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Math.round(v * scale) || Math.sign(v)]));
        applyEff(g, eff, { staffIds: [r.sid], kind: 'rule' }, biz);
        if (sales > 0) {
            const v = Math.round(avgPrice(g) * sales * scale / 100) * 100;
            g.money += v; if (biz) { biz.revenue += v; biz.served += sales; }
        }
    }
    const good = r.out === 'ok' || r.out === 'lucky';
    return { text: `${book(r.sid)?.name} · ${ruleName(r)} — ${o.text}`, chip, cc: 'hr-' + o.cls, sid: r.sid, k: good ? 'good' : r.out === 'unexp' ? 'twist' : 'bad', good };
}

/** 새 날 아침: 기간이 끝난 대책은 "끝났어요"로 하루 남겼다가 지움 */
export function rulesDayStart(g) {
    g.rules = (g.rules || []).filter(r => !(r.ended && r.endedDay < g.day) && !(r.ended && r.id === 'warn'));
    for (const r of g.rules) if (!r.ended && r.until != null && r.until < g.day) { r.ended = true; r.endedDay = g.day; if (r.id === 'warn') r.gone = true; }
    g.rules = g.rules.filter(r => !r.gone);
}

/**
 * 하루 끝 (마감 / 직원들끼리 하루): 비용·매일 효과 + 아직 안 드러난 결과
 * auto = 직원들끼리 영업한 날 (돈은 0 밑으로 안 내려감, 결과 효과 작게)
 * 반환: 로그 줄 목록
 */
export function rulesDayEnd(g, biz = null, auto = false) {
    const items = [];
    let cost = 0;
    const names = [];
    for (const r of activeRules(g)) {
        const d = HR[r.id];
        if (d.cost) { cost += d.cost; names.push(ruleName(r)); }
        if (d.daily) {
            const { ing = 0, ...rest } = d.daily;
            applyEff(g, rest, { staffIds: [r.sid], kind: 'rule' }, null);
            if (ing) g.ing = Math.max(0, g.ing + ing);
        }
        if (d.pairTired) for (const s of g.staff) if (s.id !== r.sid && (s.role === 'serve' || s.role === 'floor')) { s.fatigue = Math.min(100, (s.fatigue ?? 30) + d.pairTired); break; }
        const line = revealRule(g, r, biz, auto ? .5 : 1);
        if (line) items.push(line);
    }
    if (cost) {
        const pay = auto ? Math.min(cost, Math.max(0, g.money)) : cost;
        g.money -= pay;
        if (biz) biz.ruleCost = (biz.ruleCost || 0) + pay;
        if (pay) items.push({ text: L(`대책 비용 · ${names.join(', ')}`, `House rule cost · ${names.join(', ')}`), chip: '−' + money(pay), cc: 'dn', k: 'boss', boss: true });
    }
    return items;
}

/** 직원들끼리 영업한 날: 대책이 걸린 직원의 몰래 먹기 사건은 덜 나옴 */
export function filterAutoPicks(g, picks) {
    return picks.filter(p => p.kind !== 'sneak' || Math.random() < ruleMul(g, p.staffIds?.[0], 'sneak'));
}
