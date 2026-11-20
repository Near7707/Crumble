// 0.2.4 영업 중 직접 개입: 성격 사고 → 사장님 지시 → 성격대로 반응 → 시간이 지나면 이어지는 일
// 숫자·반응 고르기는 전부 규칙. 말풍선만 AI(아침 호출 때 미리 받아 둔 직원 말투).
import { L } from './i18n.js';
import { bossRel, staffById } from './state.js';
import { hasTag } from './rules.js';

const K = (ko, en) => [ko, en];

/** 반응 4가지 — line = 말풍선 키, tag = 장면 이름표 색 */
export const REACT = {
    obey: { label: K('따랐어요', 'Did as told'), tag: 'work', line: 'rObey', chip: 'up', start: K('알겠어요', 'On it') },
    delay: { label: K('미뤘어요', 'Stalled'), tag: 'move', line: 'rDelay', chip: 'gray', start: K('이따가요…', 'In a sec…') },
    refuse: { label: K('안 들었어요', 'Ignored you'), tag: 'bad', line: 'rRefuse', chip: 'dn', start: K('안 할래요', 'Nope') },
    twist: { label: K('엉뚱하게 알아들음', 'Took it their own way'), tag: 'twist', line: 'rTwist', chip: 'twist', start: K('알겠어요!', 'Got it!') },
};
/** 이어지는 일 이름표 (화면엔 이 말만, 안쪽 이름은 안 보임) */
export const FOLLOW = {
    unexpected: { label: K('예상 밖 전개', 'Unexpected turn'), chip: 'unexp', k: 'bad' },
    again: { label: K('또 그랬어요', 'Did it again'), chip: 'dn', k: 'bad' },
    fight: { label: K('직원끼리 다툼', 'Staff squabble'), chip: 'dn', k: 'bad' },
    lucky: { label: K('뜻밖의 행운', 'Lucky break'), chip: 'up', k: 'good' },
};
export const FOLLOW_OF = { obey: 'unexpected', delay: 'again', refuse: 'fight', twist: 'lucky' };

// {n} = 이름 + 이/가 (영어는 이름), {w} = 아까 / 어제
// goal: oven · counter · display · tables · home(원래 자리) · stay(그 자리)
// eff: shelf(진열대 −) · sales(평균 판매가 × n 만큼 매출) · rep · money · ing · mood · fatigue · relBoss · clean
// mul = 오늘 남은 시간 동안 그 사고가 나올 확률 배수 (반응이 "따름"일 때)
export const ACC = {
    sneak: {
        title: K('몰래 먹기', 'Sneaking a bite'), key: 'xSneak',
        situ: K('{n} 진열대 디저트를 몰래 먹고 있어요.', '{n} is sneaking desserts off the display.'),
        boss: K('또 진열대 거 먹고 있었어?', 'Eating off the display again?'),
        again: K('{w} 미뤘던 {n} 또 진열대에 손을 댔어요', '{n} is at the display again, just like {w}'),
        unexpected: { text: K('{w} 진열대에서 쫓겨난 {n} 배가 고파서 한 판을 태웠어요', '{n}, still hungry from {w}, burnt a batch'), eff: { ing: -1, burnt: 1 }, tag: K('태움!', 'Burnt!') },
        lucky: { text: K('{w} {n} 나눠 준 디저트 얘기를 듣고 손님들이 찾아왔어요', 'Guests came in after hearing about {n}\'s treats {w}'), eff: { sales: 2, rep: 1 } },
        orders: [
            { label: K('오븐으로 돌려보내기', 'Send them back to the oven'), goal: 'oven', doing: K('굽는 중', 'Baking'), dk: 'focus', obey: {},
              twist: { goal: 'oven', tag: K('자기 간식 굽는 중', 'Baking a snack for me'), text: K('{n} 오븐에서 자기 간식부터 구웠어요', '{n} baked a snack for themself first'), eff: { ing: -2, relBoss: 2 } } },
            { label: K('손님 시식으로 나눠 주게 하기', 'Have them hand out samples'), goal: 'tables', doing: K('시식 나눠 주는 중', 'Handing out samples'), dk: 'work', obey: { shelf: -2, rep: 2 },
              twist: { goal: 'tables', tag: K('시식 중 · 반은 내 입', 'Sampling · half for me'), text: K('{n} 시식을 나눠 주면서 반은 자기가 먹었어요', '{n} handed out samples — and ate half'), eff: { shelf: -3, rep: 1, sales: 2 } } },
            { label: K('딱 하나만 먹으라고 하기', 'Tell them: just one'), goal: 'stay', doing: K('딱 하나만', 'Just one'), dk: 'work', obey: { shelf: -1, mood: 4 }, soft: true,
              twist: { goal: 'stay', tag: K('제일 큰 거 먹는 중', 'Eating the biggest one'), text: K('{n} "하나"라며 홀 케이크를 통째로 먹었어요', '{n} said "just one" and ate a whole cake'), eff: { shelf: -3, mood: 8 } } },
            { label: K('따끔하게 혼내기', 'Scold them'), goal: 'oven', doing: K('굽는 중', 'Baking'), dk: 'focus', obey: { mood: -10, relBoss: -5 }, scold: true, mul: .25,
              twist: { goal: 'display', tag: K('진열대 지키는 중', 'Guarding the display'), text: K('{n} 아무도 못 먹게 진열대를 지키느라 손님을 막았어요', '{n} guarded the display so hard a guest got turned away'), eff: { rep: -2 } } },
        ],
    },
    freebie: {
        title: K('몰래 덤 주기', 'Secret freebies'), key: 'xFree',
        situ: K('{n} 손님에게 몰래 덤을 줬어요.', '{n} slipped a guest a free treat.'),
        boss: K('방금 그거 공짜로 준 거야?', 'Did you just give that away?'),
        again: K('{w} 미뤘던 {n} 또 손님에게 덤을 줬어요', '{n} slipped out another freebie, just like {w}'),
        unexpected: { text: K('{w} 덤을 못 받은 단골이 서운해하며 갔어요', 'A regular who missed out on a freebie {w} left a bit hurt'), eff: { rep: -1 } },
        lucky: { text: K('{w} 덤 받은 손님이 친구들을 데려왔어요', 'The guest who got a freebie {w} came back with friends'), eff: { sales: 3 } },
        orders: [
            { label: K('덤은 그만, 계산만 하게 하기', 'No more freebies — just ring them up'), goal: 'stay', doing: K('계산만 하는 중', 'Just ringing up'), dk: 'work', obey: {}, mul: 0,
              twist: { goal: 'stay', tag: K('덤 대신 칭찬 폭탄', 'Compliments instead'), text: K('{n} 덤 대신 손님 칭찬을 늘어놓느라 줄이 밀렸어요', '{n} showered guests with compliments instead, and the line backed up'), eff: { rep: 1 } } },
            { label: K('단골에게만 주라고 하기', 'Only for regulars'), goal: 'stay', doing: K('단골만 챙기는 중', 'Regulars only'), dk: 'work', obey: { rep: 1 }, mul: .5,
              twist: { goal: 'stay', tag: K('다들 단골이래요', 'Everyone\'s a regular'), text: K('{n} 오는 손님마다 단골이라며 덤을 줬어요', '{n} decided every guest was a regular'), eff: { shelf: -2, rep: 2 }, mul: 1.5 } },
            { label: K('덤 값은 월급에서 뺀다고 하기', 'Say it comes out of their pay'), goal: 'stay', doing: K('계산만 하는 중', 'Just ringing up'), dk: 'work', obey: { mood: -8, relBoss: -6 }, scold: true, mul: 0,
              twist: { goal: 'stay', tag: K('자기 돈으로 덤', 'Paying for freebies'), text: K('{n} 자기 돈으로 쿠키를 사 와서 계속 나눠 줬어요', '{n} bought cookies with their own money and kept handing them out'), eff: { rep: 2, mood: -4 } } },
            { label: K('오늘은 넘어가 주기', 'Let it slide today'), goal: 'stay', doing: K('계산대 · 주문 받는 중', 'Taking orders'), dk: 'work', obey: { relBoss: 4 }, soft: true, mul: 1,
              twist: { goal: 'stay', tag: K('칭찬인 줄 앎', 'Thinks it was praise'), text: K('{n} 칭찬받은 줄 알고 덤을 더 신나게 줬어요', '{n} took it as praise and gave even more away'), eff: { shelf: -2, rep: 1 }, mul: 2 } },
        ],
    },
    chat: {
        title: K('수다로 계산대 비움', 'Chatting, counter empty'), key: 'xChat',
        situ: K('{n} 손님이랑 수다 떠느라 계산대가 비었어요.', '{n} is chatting with a guest and the counter is empty.'),
        boss: K('계산대 비었는데?', 'The counter\'s empty, you know.'),
        again: K('{w} 미뤘던 {n} 또 손님 테이블로 수다 떨러 갔어요', '{n} wandered off to chat again, just like {w}'),
        unexpected: { text: K('{w} 수다를 못 떤 {n} 손님에게 퉁명스러워졌어요', '{n}, cut off {w}, got curt with a guest'), eff: { rep: -1, mood: -4 }, tag: K('퉁명', 'Curt') },
        lucky: { text: K('{w} 수다 떤 손님이 다시 와서 케이크를 잔뜩 샀어요', 'The guest from that chat {w} came back and bought a pile of cake'), eff: { sales: 3 } },
        orders: [
            { label: K('계산대로 돌려보내기', 'Send them back to the counter'), goal: 'counter', doing: K('주문 받는 중', 'Taking orders'), dk: 'work', obey: {},
              twist: { goal: 'counter', tag: K('손님 데려와서 수다', 'Chatting at the counter'), text: K('{n} 수다 떨던 손님을 계산대까지 데려와서 계속 떠들었어요', '{n} brought the guest to the counter and kept talking'), eff: { rep: 1, mood: 4 } } },
            { label: K('그 손님한테 신메뉴 추천하게 하기', 'Have them pitch a dessert'), goal: 'stay', doing: K('메뉴 추천 중', 'Pitching desserts'), dk: 'work', obey: { sales: 1, rep: 1 }, soft: true,
              twist: { goal: 'stay', tag: K('옆 가게 메뉴 추천 중', 'Pitching the shop next door'), text: K('{n} 옆 가게 메뉴까지 신나게 추천했어요', '{n} happily recommended the shop next door too'), eff: { rep: -1, mood: 5 } } },
            { label: K('한가할 때만 하라고 하기', 'Only when it\'s quiet'), goal: 'counter', doing: K('주문 받는 중', 'Taking orders'), dk: 'work', obey: {}, mul: .5,
              twist: { goal: 'stay', tag: K('지금이 한가할 때', 'It IS quiet'), text: K('{n} "지금이 한가할 때"라며 수다를 계속했어요', '{n} insisted it was quiet and kept chatting'), eff: { rep: -1, mood: 4 } } },
            { label: K('따끔하게 혼내기', 'Scold them'), goal: 'counter', doing: K('주문 받는 중', 'Taking orders'), dk: 'work', obey: { mood: -10, relBoss: -5 }, scold: true, mul: .25,
              twist: { goal: 'counter', tag: K('사장님 흉보는 중', 'Grumbling about you'), text: K('{n} 계산하면서 손님에게 사장님 흉을 봤어요', '{n} grumbled about you to the guests while ringing up'), eff: { rep: -2, relBoss: -3 } } },
        ],
    },
    doze: {
        title: K('졸기', 'Dozing'), key: 'xDoze',
        situ: K('{n} 구석에서 꾸벅꾸벅 졸고 있어요.', '{n} is dozing off in the corner.'),
        boss: K('지금 자는 거야?', 'Are you asleep?'),
        again: K('{w} 미뤘던 {n} 또 꾸벅꾸벅 졸아요', '{n} is dozing again, just like {w}'),
        unexpected: { text: K('{w} 억지로 깬 {n} 오후 내내 멍해서 실수를 했어요', '{n}, woken up {w}, was foggy and made a mistake'), eff: { ing: -1, mood: -3 }, tag: K('멍…', 'Foggy…') },
        lucky: { text: K('{w} 푹 쉰 {n} 오후에 날아다니듯 일했어요', '{n}, well rested since {w}, flew through the afternoon'), eff: { fatigue: -15, mood: 6, rep: 1 } },
        orders: [
            { label: K('깨워서 일하게 하기', 'Wake them up'), goal: 'home', doing: K('일하러', 'Back to work'), dk: 'work', obey: {},
              twist: { goal: 'home', tag: K('잠결에 일하는 중', 'Working half-asleep'), text: K('{n} 잠결에 바닥을 닦다가 얼룩을 더 번지게 했어요', '{n} mopped half-asleep and smeared the spill'), eff: { clean: -4 } } },
            { label: K('잠깐 쉬게 해 주기', 'Let them rest a bit'), goal: 'stay', doing: K('잠깐 쉬는 중', 'Short rest'), dk: 'sleep', obey: { fatigue: -15, relBoss: 3 }, soft: true, mul: 1,
              twist: { goal: 'stay', tag: K('아예 푹 자는 중', 'Out cold'), text: K('{n} 잠깐이 아니라 아예 푹 잤어요', '{n} didn\'t rest a bit — they slept like a log'), eff: { fatigue: -25, mood: 6 }, long: true } },
            { label: K('커피 타 주기', 'Make them a coffee'), goal: 'home', doing: K('커피 마시고 일하는 중', 'Coffee, then work'), dk: 'work', obey: { fatigue: -10, mood: 5, relBoss: 4, money: -1500 }, soft: true,
              twist: { goal: 'home', tag: K('커피 마시고 들뜸', 'Over-caffeinated'), text: K('{n} 커피를 마시고 너무 들떠서 컵을 엎었어요', '{n} got so wired from the coffee they knocked over a cup'), eff: { fatigue: -10, money: -1500, clean: -3 } } },
            { label: K('따끔하게 혼내기', 'Scold them'), goal: 'home', doing: K('일하러', 'Back to work'), dk: 'work', obey: { mood: -10, relBoss: -5 }, scold: true, mul: .25,
              twist: { goal: 'home', tag: K('서서 조는 중', 'Dozing on their feet'), text: K('{n} 혼나고 제자리에 서서 졸았어요', '{n} got scolded and dozed off standing up'), eff: { mood: -6 } } },
        ],
    },
};

/**
 * 반응 고르기 (규칙): 성격 태그 + 기분 + 피로 + 사장 친밀도 + 지시 종류.
 * 실제 대사는 직원 말투(AI), 고르는 건 숫자로.
 */
export function pickReaction(staffId, kind, orderIdx) {
    const s = staffById(staffId) || {};
    const o = ACC[kind].orders[orderIdx];
    const w = { obey: 40, delay: 22, refuse: 15, twist: 20 };
    const rb = bossRel(staffId), mood = s.mood ?? 60, fat = s.fatigue ?? 30;
    if (rb >= 40) { w.obey += 25; w.refuse -= 10; } else if (rb >= 15) w.obey += 10;
    if (rb <= -10) { w.refuse += 25; w.obey -= 15; }
    if (mood < 40) { w.refuse += 15; w.delay += 10; } else if (mood > 70) { w.obey += 10; w.twist += 5; }
    if (fat > 70) w.delay += 15;
    const T = (tags, d) => { if (hasTag(staffId, ...tags)) for (const [k, v] of Object.entries(d)) w[k] += v; };
    T(['rebel', 'prickly'], { refuse: 25, obey: -10 });
    T(['diligent', 'perfectionist'], { obey: 25, delay: -10 });
    T(['lazy'], { delay: 25 });
    T(['flatterer'], { obey: 15 });
    T(['timid'], { obey: 10, delay: 10, refuse: -10 });
    T(['cheerful', 'chatty'], { twist: 15 });
    T(['clumsy'], { twist: 10 });
    T(['quiet'], { delay: 5 });
    if (kind === 'sneak' || kind === 'freebie') T(['glutton', 'kind'], { twist: 12 });
    if (o.soft) { w.obey += 30; w.refuse -= 10; }
    if (o.scold) { w.obey += 15; if (rb < 0) w.refuse += 10; }
    const tot = Object.values(w).reduce((a, v) => a + Math.max(1, v), 0);
    let r = Math.random() * tot;
    for (const [k, v] of Object.entries(w)) { r -= Math.max(1, v); if (r <= 0) return k; }
    return 'obey';
}

/** 이어지는 일이 생길 확률 */
export function followChance(react, order) {
    return { obey: order?.scold ? .6 : .4, delay: .7, refuse: .6, twist: .55 }[react] || 0;
}
export const MAX_ACC_PER_DAY = 4; // "!"로 잡을 수 있는 성격 사고 (그 밖엔 예전처럼 소식 줄만)
export const MAX_FOLLOW_PER_DAY = 2;

/** 이름 + 이/가 → {n}, 아까/어제 → {w} */
export function accText(pair, name, particle, carried) {
    const w = carried ? L('어제', 'yesterday') : L('아까', 'earlier');
    return L(...pair).replace(/\{n\}/g, L(name + particle, name)).replace(/\{w\}/g, w).replace(/^./, c => c.toUpperCase());
}
export const moodLabel = id => { const m = staffById(id)?.mood ?? 60; return m >= 70 ? L('기분 좋음', 'Good mood') : m >= 45 ? L('기분 보통', 'Okay mood') : L('기분 별로', 'Bad mood'); };
