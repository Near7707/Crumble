// AI 대사가 없을 때 쓰는 기본 말풍선 (성격 태그로 조금씩 다르게)
import { L, AI_LANG } from './i18n.js';
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
    // 0.2.4 사장님에게 걸렸을 때 변명 / 지시를 받았을 때 반응
    xSneak: [['맛만 보는 거예요! 품질 검사요!', 'Just a taste! Quality check!']],
    xFree: [['단골이라서요… 조금만요!', 'They\'re a regular… just a little!']],
    xChat: [['잠깐만요, 이야기가 재밌어서요!', 'One sec, the story was good!']],
    xDoze: [['아, 안 잤어요! 눈만 감았어요!', 'I wasn\'t asleep! Just resting my eyes!']],
    rObey: [['네, 알겠어요.', 'Okay, got it.']],
    rDelay: [['네에… 이것만 하고요.', 'Yeah… right after this.']],
    rRefuse: [['싫은데요.', 'I\'d rather not.']],
    rTwist: [['아하, 그런 뜻이죠? 맡겨 주세요!', 'Ohh, I get it! Leave it to me!']],
};
const BY_TAG = {
    lazy: { tap2: ['조금만 쉬면 안 돼요?', 'Can I rest a bit?'], tired: ['졸려요…', 'So sleepy…'], rDelay: ['조금만 있다가요…', 'In a little bit…'] },
    glutton: { sneak: ['이건 시식이에요, 시식!', 'It\'s a taste test!'], greet: ['오늘 뭐 구워요? 배고파요!', 'What are we baking? I\'m hungry!'], xSneak: ['시식이에요, 시식!', 'It\'s a taste test!'] },
    prickly: { tap1: ['…왜 불러요.', '…What.'], pricy: ['그 가격 제가 설명하는 거예요?', 'And I have to explain that price?'], rRefuse: ['그걸 왜 제가요.', 'Why should I?'] },
    quiet: { tap1: ['…', '…'], greet: ['…안녕하세요.', '…Morning.'] },
    chatty: { chat: ['아 그거 아세요? 어제요~', 'Oh, did you hear? Yesterday~'] },
    flatterer: { tap1: ['역시 우리 사장님!', 'Our boss is the best!'], rObey: ['역시 사장님 말씀이 맞아요!', 'You\'re right as always, boss!'] },
    rebel: { tap2: ['제 방식대로 할게요.', 'I\'ll do it my way.'], rRefuse: ['제 방식대로 할래요.', 'I\'ll do it my way.'] },
    timid: { busy: ['소, 손님이 너무 많아요…', 'T-too many customers…'], rObey: ['죄, 죄송해요! 바로 할게요!', 'S-sorry! Right away!'] },
    cheerful: { greet: ['오늘도 파이팅!', 'Let\'s go, today!'], rTwist: ['오케이! 제 식대로 해 볼게요!', 'Okay! I\'ll do it my way!'] },
};

export function line(staffId, key) {
    const g = G();
    const ai = g?.today?.lines?.[staffId]?.[key];
    if (ai) return ai;
    // 고용할 때 그 직원 말투로 뽑아 둔 기본 말풍선 (지금 언어와 같을 때만)
    const b0 = book(staffId);
    const own = b0?.linesLang === AI_LANG() ? b0.lines?.[key] : null;
    if (own) return own;
    const tags = book(staffId)?.tags || [];
    for (const t of tags) { const v = BY_TAG[t]?.[key]; if (v) return L(...v); }
    const b = BASE[key];
    return b ? L(...pick(b)) : '';
}
export function tapLine(staffId) { return line(staffId, pick(['tap1', 'tap2', 'tap3'])); }
