// AI 대사가 없을 때 쓰는 기본 말풍선 (성격 태그로 조금씩 다르게)
import { L } from './i18n.js';
import { pick } from './util.js';
import { G, book } from './state.js';

const BASE = {
    greet: [['좋은 아침이에요!', 'Morning!'], ['출근했어요~', 'I\'m here~']],
    pricy: [['이 가격이면 손님들 투덜댈 텐데요…', 'Customers will grumble at that price…']],
    cheap: [['와, 오늘 엄청 바쁘겠네요…', 'Wow, it\'ll be a busy one…']],
    buyMore: [['남으면 버리는 거죠?', 'We\'ll toss the leftovers, right?']],
    buyLess: [['조금만 더 사요, 네?', 'Buy a little more, please?']],
    busy: [['손님 많다!', 'So many people!'], ['정신없어요~', 'It\'s hectic~']],
    soldout: [['다 팔렸어요!', 'Sold out!']],
    mistake: [['앗, 망했다…', 'Oops… ruined it.']],
    sneak: [['맛만 보는 거예요…', 'Just a taste…']],
    chat: [['오늘 날씨 좋죠~', 'Nice day, huh~'], ['이거 제가 추천해요!', 'I recommend this one!']],
    clean: [['…또 흘렸네.', '…Spilled again.']],
    tired: [['하암…', '*yawn*']],
    tap1: [['네, 사장님?', 'Yes, boss?']],
    tap2: [['일하는 중이에요~', 'Working here~']],
    tap3: [['왜요?', 'What is it?']],
};
const BY_TAG = {
    lazy: { tap2: ['조금만 쉬면 안 돼요?', 'Can I rest a bit?'], tired: ['졸려요…', 'So sleepy…'] },
    glutton: { sneak: ['이건 시식이에요, 시식!', 'It\'s a taste test!'], greet: ['오늘 뭐 구워요? 배고파요!', 'What are we baking? I\'m hungry!'] },
    prickly: { tap1: ['…왜 불러요.', '…What.'], pricy: ['그 가격 제가 설명하는 거예요?', 'And I have to explain that price?'] },
    quiet: { tap1: ['…', '…'], greet: ['…안녕하세요.', '…Morning.'] },
    chatty: { chat: ['아 그거 아세요? 어제요~', 'Oh, did you hear? Yesterday~'] },
    flatterer: { tap1: ['역시 우리 사장님!', 'Our boss is the best!'] },
    rebel: { tap2: ['제 방식대로 할게요.', 'I\'ll do it my way.'] },
    timid: { busy: ['소, 손님이 너무 많아요…', 'T-too many customers…'] },
    cheerful: { greet: ['오늘도 파이팅!', 'Let\'s go, today!'] },
};

export function line(staffId, key) {
    const g = G();
    const ai = g?.today?.lines?.[staffId]?.[key];
    if (ai) return ai;
    const tags = book(staffId)?.tags || [];
    for (const t of tags) { const v = BY_TAG[t]?.[key]; if (v) return L(...v); }
    const b = BASE[key];
    return b ? L(...pick(b)) : '';
}
export function tapLine(staffId) { return line(staffId, pick(['tap1', 'tap2', 'tap3'])); }
