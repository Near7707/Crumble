// 0.3.2 수습 대기 — 사장님 없을 때 생긴 큰 일. 사장님이 돌아와야 결과가 정해진다.
// 여기엔 데이터(선택지·기본 이야기)와 작은 도구만. 규칙(만들기·수습·기한)은 rules.js.
import { pick } from './util.js';
import { L, F, isKo } from './i18n.js';
import { book } from './state.js';

export const FIX_KINDS = ['fight', 'friends', 'rude', 'spoil'];
export const FIX_MAX = 3;      // 최대 3개
export const FIX_DAYS = 3;     // 돌아온 뒤 3일 안 보면 직원이 알아서
export const FIX_SCALE = .7;   // 수습 효과 = 직접 영업의 70%
export const LEAK_CAP = .3;    // 직원들끼리 영업한 날 사건으로 잃는 돈 = 그날 매출의 30%까지
export const PAIR_FIX = k => k === 'fight' || k === 'friends';

const K = (ko, en) => [ko, en];

// 선택지 (싸움은 "한쪽 편 들기"를 둘로 나눔: side 0 = 첫 번째 직원 편, 1 = 두 번째 직원 편)
export const FIX_CHOICES = {
    fight: [
        { label: K('둘 다 불러서 화해시키기', 'Get them to make up'), eff: { pairRel: 10, mood: -2 } },
        { label: K('{a} 편 들기', 'Side with {a}'), side: 0, eff: { pairRel: -6, relBoss: 4, relBoss2: -8 } },
        { label: K('{b} 편 들기', 'Side with {b}'), side: 1, eff: { pairRel: -6, relBoss: 4, relBoss2: -8 } },
        { label: K('모른 척', 'Stay out of it'), eff: { pairRel: -10, rep: -1, slide: true } },
    ],
    friends: [
        { label: K('사이좋다고 칭찬하기', 'Praise their teamwork'), eff: { mood: 6, relBoss: 3, pairRel: 4 } },
        { label: K('일할 땐 떨어져 있으라고 하기', 'Tell them to split up while working'), eff: { mood: -4, relBoss: -3, rep: 1 } },
        { label: K('그냥 둔다', 'Leave them be'), eff: { gamble: true, slide: true } },
    ],
    rude: [
        { label: K('사과하고 새로 만들어 주기', 'Apologize and remake it'), eff: { rep: 2, ing: -1, mood: -6, ok: true, skill: 'serve' } },
        { label: K('그냥 환불해 주기', 'Just refund it'), eff: { money: -4000, mood: -2 } },
        { label: K('직원에게 알아서 하라고 맡기기', 'Let the staff handle it'), eff: { rep: 2, mood: -3, relBoss: 2, ok: true, skill: 'serve', gamble: true, delegate: true } },
    ],
    spoil: [
        { label: K('바로 수리 부르기', 'Call a repair right away'), eff: { money: -15000, ing: -1 } },
        { label: K('살릴 수 있는 것만 챙기기', 'Save what we can'), eff: { ing: -3, clean: -5 } },
        { label: K('그냥 버리고 계속', 'Toss it and carry on'), eff: { ing: -5 } },
    ],
};
export const FIX_TITLE = {
    fight: K('직원끼리 싸움', 'Staff quarrel'), friends: K('친한 사이 사건', 'Close friends'),
    rude: K('진상 손님', 'Difficult customer'), spoil: K('냉장고 고장', 'Fridge broke'),
};
export const FIX_CAT = { fight: 'staff', friends: 'staff', rude: 'guest', spoil: 'shop' };

// ---------- 이름 자리 채우기: {a} {a이}(이/가) {a은}(은/는) {a을}(을/를) {a과}(과/와) {a도} {a의} {a에게} ----------
function batchim(n) {
    const s = String(n || '').trim();
    const c = s.slice(-1).charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 !== 0;
    // 한글이 아닌 이름: 모음 글자로 끝나면 받침 없음으로 (Lumi → 가, Pip → 이)
    if (/[a-z]$/i.test(s)) return !/[aeiouy]$/i.test(s);
    return /[0136780lmnLMN]$/.test(s);
}
const JOSA = { 이: ['이', '가'], 은: ['은', '는'], 을: ['을', '를'], 과: ['과', '와'] };
function josa(name, j) {
    if (!JOSA[j]) return j;
    return batchim(name) ? JOSA[j][0] : JOSA[j][1];
}
/** names: {a: '이름', b: '이름'} */
export function fillNames(t, names) {
    return String(t || '').replace(/\{([ab])(이|은|을|과|도|의|에게)?\}/g, (_, w, j) => {
        const n = names[w] || '';
        if (!j || !isKo()) return n;
        return n + josa(n, j);
    });
}

// ---------- 기본 이야기 (AI가 못 쓸 때). 성격 태그로 고르고, a = 그 성격을 가진 쪽 ----------
// lines: [누가, 한국어, English] — 누가 = 'a' | 'b' | 'guest'
const V = (tags, cause, lines, now) => ({ tags, cause, lines, now });
const STORY = {
    fight: [
        V(['glutton'], K('마감 직전, {b이} 단골에게 주려고 따로 빼 둔 딸기 타르트를 {a이} "남은 거"인 줄 알고 먹어 버렸어요. 다음 날 단골이 찾으러 왔고, {b은} 사과만 하다 돌려보냈어요.', 'Right before closing, {a} ate the strawberry tart {b} had set aside for a regular, thinking it was a leftover. The regular came for it the next day and {b} could only apologize.'),
            [['b', '"이름표 붙여 놨잖아. 그것도 안 봐?"', '"It had a name tag on it. Didn\'t you even look?"'], ['a', '"진열대 뒤에 숨겨 놓으면 누가 알아!"', '"Who\'d notice it hidden behind the display!"'], ['b', '"…그게 할 말이야?"', '"…That\'s all you have to say?"']],
            K('둘이 말을 안 해요. {a은} 오븐 쪽에만, {b은} 계산대에만 있어요.', 'They\'re not speaking. {a} stays by the oven, {b} at the counter.')),
        V(['lazy'], K('마감 청소 당번이 {a}였는데, "내일 아침에 할게"라며 먼저 퇴근했어요. 결국 {b이} 혼자 바닥까지 닦고 늦게 들어갔어요.', '{a} was on closing cleanup but left early saying "I\'ll do it in the morning." {b} ended up mopping alone and got home late.'),
            [['b', '"어제 당번 누구였더라?"', '"Who was on cleanup yesterday?"'], ['a', '"아침에 하려고 했다니까. 아직 아침이잖아."', '"I said morning. It\'s still morning."'], ['b', '"벌써 손님 들어와."', '"Customers are already coming in."']],
            K('{b이} 걸레를 {a} 앞에 툭 놓고 갔어요. {a은} 못 본 척해요.', '{b} dropped a mop in front of {a} and walked off. {a} pretends not to see it.')),
        V(['chatty'], K('{a이} 단골이랑 한참 수다를 떠는 동안 줄이 길어져서 {b이} 혼자 계산하고 포장까지 했어요. 손님 하나는 기다리다 나가 버렸어요.', 'While {a} chatted with a regular for ages, the line grew and {b} had to ring up and box everything alone. One customer gave up and left.'),
            [['b', '"나 혼자 세 명 받았어."', '"I handled three people by myself."'], ['a', '"단골 챙긴 것도 일이거든?"', '"Keeping regulars happy is work too, you know."'], ['b', '"그럼 다음엔 줄 선 손님도 챙겨."', '"Then look after the ones in line next time."']],
            K('{a은} 괜히 큰 소리로 웃고, {b은} 대꾸를 안 해요.', '{a} laughs a little too loudly; {b} won\'t answer.')),
        V(['perfectionist', 'neat'], K('{a이} {b이} 진열한 케이크를 "각도가 다 틀렸다"며 손님 앞에서 전부 다시 놓았어요. {b은} 망신당했다고 생각해요.', '{a} rearranged every cake {b} had displayed — in front of customers — because "the angles were all wrong." {b} feels humiliated.'),
            [['b', '"그냥 둬도 다 팔리는 거였어."', '"They\'d have sold just fine."'], ['a', '"팔리는 거랑 제대로 된 거랑은 달라."', '"Selling and being done right aren\'t the same."'], ['b', '"그럼 처음부터 네가 하든가."', '"Then do it yourself from the start."']],
            K('진열대 앞을 두고 서로 자리를 피해요.', 'They take turns avoiding the display case.')),
        V(['clumsy'], K('{a이} 쟁반을 엎어서 {b이} 아침부터 만든 슈크림이 바닥에 쏟아졌어요. {a은} 미안하다고는 했는데 웃으면서 말했어요.', '{a} knocked over a tray and the cream puffs {b} had made all morning hit the floor. {a} did say sorry — while laughing.'),
            [['b', '"그게 웃을 일이야?"', '"Is that funny to you?"'], ['a', '"일부러 그런 것도 아니잖아…"', '"It\'s not like I did it on purpose…"'], ['b', '"그 말만 벌써 세 번째야."', '"That\'s the third time you\'ve said that."']],
            K('{b은} 다시 반죽 중이고, {a은} 근처를 서성여요.', '{b} is making a new batch; {a} hovers nearby.')),
        V(['prickly', 'rebel'], K('{a이} 손님 앞에서 {b의} 포장을 보고 "이게 뭐야"라고 했어요. 손님이 웃는 바람에 {b은} 얼굴이 빨개졌어요.', '{a} looked at {b}\'s gift wrapping in front of a customer and said "what is this?" The customer laughed and {b} turned red.'),
            [['b', '"손님 앞에서 꼭 그래야 했어?"', '"Did you have to do that in front of a customer?"'], ['a', '"틀린 말 했어? 리본 삐뚤었던데."', '"Was I wrong? The ribbon was crooked."'], ['b', '"…알았어. 앞으로 네 거나 잘해."', '"…Fine. Worry about your own work."']],
            K('포장대엔 둘 중 한 명만 서 있어요.', 'Only one of them will stand at the wrapping table.')),
        V([], K('둘이 같은 주말에 쉬고 싶어 했어요. 누가 먼저 말했는지로 다투다 언성이 높아졌어요.', 'They both wanted the same weekend off, and arguing over who asked first turned into shouting.'),
            [['b', '"내가 지난주에 먼저 말했잖아."', '"I asked first, last week."'], ['a', '"메모에 적힌 건 내 이름인데?"', '"My name\'s the one on the note."'], ['b', '"그거 네가 적은 거잖아!"', '"Because YOU wrote it!"']],
            K('둘 다 사장님이 정해 주길 기다리는 눈치예요.', 'Both are clearly waiting for the boss to decide.')),
    ],
    friends: [
        V(['clumsy'], K('{a이} 한 판을 태웠는데 {b이} 얼른 버리고 자기가 구운 걸로 채워 놨어요. 장부엔 아무 일 없던 걸로 돼 있어요.', '{a} burned a batch, and {b} quickly tossed it and filled the gap with their own. The books say nothing happened.'),
            [['a', '"고마워, 진짜 살았다."', '"Thanks, you saved me."'], ['b', '"사장님한텐 비밀이다?"', '"Not a word to the boss, okay?"'], ['a', '"당연하지."', '"Obviously."']],
            K('둘이 눈만 마주치면 킥킥거려요. 재료 수가 하나 안 맞아요.', 'They giggle whenever their eyes meet. The stock count is off by one.')),
        V(['lazy', 'chatty'], K('손님 없는 오후에 둘이 창고에서 간식을 먹으며 한 시간 넘게 수다를 떨었어요. 그동안 진열대가 반쯤 비어 있었어요.', 'On a slow afternoon the two snacked and chatted in the storeroom for over an hour. The display sat half empty the whole time.'),
            [['a', '"오늘 손님 없었잖아, 괜찮아."', '"There were no customers anyway."'], ['b', '"맞아, 우리 쉬는 시간도 없잖아."', '"Right, we never get a break."'], ['a', '"사장님 오시면 그냥 바빴다고 하자."', '"Let\'s just tell the boss it was busy."']],
            K('둘이 같이 있으면 일이 느려져요. 대신 둘 다 기분은 좋아요.', 'Work slows down when they\'re together — but they\'re both in a great mood.')),
        V(['diligent', 'kind'], K('{b이} 몸이 안 좋아 보이자 {a이} 오븐 일을 대신 맡고, {b은} 계산대만 봤어요. 손님들은 눈치채지 못했어요.', 'When {b} looked unwell, {a} took over the oven and left {b} on the register. No customer noticed.'),
            [['a', '"앉아 있어. 오늘은 내가 굽는다."', '"Sit down. I\'ll bake today."'], ['b', '"미안해, 내일은 내가 다 할게."', '"Sorry. I\'ll do everything tomorrow."'], ['a', '"그럼 내일 두 판 부탁해."', '"Then you owe me two batches."']],
            K('둘이 일을 바꿔서 하고 있어요. 손발은 잘 맞는데 순서가 엉망이에요.', 'They\'ve swapped jobs. Good teamwork, messy order.')),
        V(['perfectionist', 'glutton'], K('둘이 마감 뒤에 남은 재료로 몰래 새 디저트를 만들어 봤어요. 꽤 맛있었는데, 재료를 허락 없이 썼어요.', 'After closing, the two secretly tried a new dessert with leftover stock. It was pretty good — but they used ingredients without asking.'),
            [['a', '"이거 메뉴에 올리면 대박이야."', '"This would be a hit on the menu."'], ['b', '"재료 쓴 건 어떻게 말하지?"', '"How do we explain the stock?"'], ['a', '"맛보면 사장님도 아무 말 못 해."', '"One bite and the boss won\'t say a thing."']],
            K('진열대 구석에 이름 없는 디저트 한 접시가 있어요.', 'There\'s a plate of unnamed dessert in the corner of the display.')),
        V([], K('둘이 손님 별명을 지어 부르며 웃다가, 그 손님이 들었어요. 손님은 웃어넘겼지만 표정이 애매했어요.', 'The two made up a nickname for a customer and were laughing about it — and the customer heard. They laughed it off, but looked unsure.'),
            [['a', '"근데 진짜 닮았잖아."', '"But it really fits."'], ['b', '"쉿, 아직 계셔."', '"Shh, they\'re still here."'], ['a', '"…다음엔 작게 말하자."', '"…Quieter next time."']],
            K('둘은 아직도 서로 보며 웃음을 참고 있어요.', 'They\'re still trying not to laugh when they look at each other.')),
    ],
    rude: [
        V(['prickly', 'rebel'], K('손님이 고르는 데 오래 걸리자 {a이} 한숨을 쉬었어요. 손님은 직원 태도를 문제 삼으며 사장님을 찾았어요.', 'The customer took a long time choosing and {a} sighed out loud. The customer complained about the attitude and asked for the owner.'),
            [['guest', '"방금 한숨 쉬셨어요?"', '"Did you just sigh at me?"'], ['a', '"아뇨, 숨 쉰 건데요."', '"No, I breathed."'], ['guest', '"사장님 연락처 주세요."', '"Give me the owner\'s number."']],
            K('계산대 옆에 손님이 남긴 메모가 있어요: "사장님께".', 'There\'s a note by the register: "To the owner."')),
        V(['clumsy', 'chatty'], K('{a이} 수다를 떨다 주문을 헷갈려서 생일 케이크에 이름을 틀리게 썼어요. 손님은 파티 직전에 알았대요.', '{a} got distracted chatting and wrote the wrong name on a birthday cake. The customer noticed right before the party.'),
            [['guest', '"이름이 틀렸잖아요, 오늘 생일인데!"', '"You got the name wrong — it\'s today!"'], ['a', '"아… 발음이 비슷해서…"', '"Oh… they sound similar…"'], ['guest', '"이걸로 어떻게 축하해요?"', '"How am I supposed to celebrate with this?"']],
            K('손님이 내일 다시 와서 이야기하겠대요.', 'The customer says they\'ll come back tomorrow to talk.')),
        V(['greedy', 'flatterer'], K('{a이} 손님에게 비싼 세트를 자꾸 권해서 손님이 "강매"라며 화를 냈어요.', '{a} kept pushing the pricey set until the customer called it a hard sell and got angry.'),
            [['guest', '"하나만 산다고 했잖아요."', '"I said I only wanted one."'], ['a', '"세트가 훨씬 이득인데…"', '"But the set is a much better deal…"'], ['guest', '"됐고, 환불해 주세요."', '"Forget it. Refund me."']],
            K('손님은 일단 돌아갔지만 동네 모임에 글을 올리겠대요.', 'The customer left, but says they\'ll post about it in the neighborhood group.')),
        V(['timid', 'quiet'], K('손님이 큰 소리로 따지자 {a은} 아무 말도 못 하고 창고로 들어가 버렸어요. 손님은 무시당했다며 더 화가 났어요.', 'When the customer raised their voice, {a} froze and slipped into the storeroom. The customer felt ignored and got angrier.'),
            [['guest', '"저기요, 대답 좀 하세요!"', '"Excuse me, answer me!"'], ['a', '"……죄송합니다…"', '"……I\'m sorry…"'], ['guest', '"사장 나오라 그래요."', '"Get me the owner."']],
            K('{a은} 아직 창고 쪽을 힐끔거려요.', '{a} keeps glancing toward the storeroom.')),
        V([], K('크림이 사진보다 적다며 손님이 환불을 요구했어요. {a이} "원래 이렇다"고 하자 손님이 사장님을 만나러 다시 오겠대요.', 'A customer demanded a refund because there was less cream than in the photo. When {a} said "that\'s how it always is," they said they\'d be back to see the owner.'),
            [['guest', '"사진이랑 완전 다르잖아요."', '"This looks nothing like the picture."'], ['a', '"…사진은 사진이죠."', '"…A picture\'s a picture."'], ['guest', '"사장 있을 때 다시 올게요."', '"I\'ll come back when the owner\'s in."']],
            K('영수증과 반쯤 먹은 케이크가 계산대 옆에 놓여 있어요.', 'A receipt and a half-eaten cake sit by the register.')),
    ],
    spoil: [
        V(['lazy'], K('{a이} 마감 때 냉장고 문을 "조금 있다 닫겠다"며 열어 두고 퇴근했어요. 아침에 크림이 다 미지근해졌어요.', '{a} left the fridge open at closing, "just for a minute," and went home. By morning all the cream was lukewarm.'),
            [['b', '"어제 마지막에 누가 나갔어?"', '"Who left last yesterday?"'], ['a', '"…문은 닫았을걸?"', '"…I\'m pretty sure I closed it?"'], ['b', '"그럼 이 크림은 왜 녹았는데."', '"Then why is the cream melted."']],
            K('냉장고 안 재료 절반이 상태가 애매해요.', 'Half the stock in the fridge is questionable.')),
        V(['clumsy'], K('{a이} 냉장고에 상자를 억지로 밀어 넣다가 문 고무가 찢어졌어요. 밤새 찬 공기가 새 나갔어요.', '{a} forced a box into the fridge and tore the door seal. Cold air leaked out all night.'),
            [['a', '"들어가긴 들어갔는데…"', '"Well, it fit…"'], ['b', '"문이 안 닫히잖아!"', '"The door won\'t close!"'], ['a', '"테이프로 붙여 놨어."', '"I taped it."']],
            K('냉장고 문에 테이프가 덕지덕지 붙어 있어요.', 'The fridge door is covered in tape.')),
        V(['diligent', 'neat', 'perfectionist'], K('{a이} 새벽에 냉장고 온도가 이상한 걸 알아채고 재료를 얼음물에 옮겨 놨어요. 그래도 수리는 사장님이 정해야 해요.', '{a} noticed the fridge temperature creeping up at dawn and moved the stock into ice water. Repairs are still the boss\'s call.'),
            [['a', '"밤새 2도씩 올라갔어요. 적어 뒀어요."', '"It rose two degrees overnight. I wrote it down."'], ['b', '"덕분에 크림은 살았네."', '"At least the cream made it."'], ['a', '"근데 오늘 밤은 못 버텨요."', '"It won\'t last another night."']],
            K('얼음물 통 세 개가 주방 바닥에 놓여 있어요.', 'Three tubs of ice water sit on the kitchen floor.')),
        V(['glutton'], K('{a이} 밤에 냉장고를 몇 번이나 열고 간식을 꺼내 먹다가, 마지막에 문을 제대로 안 닫았어요.', '{a} kept opening the fridge for snacks at night and didn\'t shut it properly the last time.'),
            [['b', '"냉장고 앞에 포크가 왜 있어?"', '"Why is there a fork in front of the fridge?"'], ['a', '"…그건 다른 사람 거일 수도 있지."', '"…Could be anyone\'s."'], ['b', '"포크에 네 이름 적혀 있어."', '"It has your name on it."']],
            K('냉장고 안 케이크 하나에 포크 자국이 있어요.', 'One cake in the fridge has fork marks.')),
        V([], K('냉장고에서 덜덜거리는 소리가 나더니 아침에 멈춰 있었어요. 직원들끼리 고칠지 버릴지 정하지 못했어요.', 'The fridge rattled all evening and was dead by morning. The staff couldn\'t decide whether to fix it or toss everything.'),
            [['a', '"크림이 미지근해요…"', '"The cream is lukewarm…"'], ['b', '"수리 부르면 돈 들잖아."', '"A repair costs money."'], ['a', '"그럼 오늘 뭘로 만들어?"', '"Then what do we bake with today?"']],
            K('멈춘 냉장고 앞에서 다들 한 번씩 문을 열어 보고 가요.', 'Everyone opens the dead fridge once on their way past.')),
    ],
};

// 선택지별 기본 결과 (이어지는 이야기 한 줄 + 반응 + 관계 메모)
const R = (t, lines, memo = null, bad = null) => ({ t, lines, memo, bad });
const RESULT = {
    fight: [
        R(K('둘을 같이 앉혀 이야기를 들었어요. 어색하게 악수는 했는데, 아직 완전히 풀린 건 아니에요.', 'You sat them down together and listened. They shook hands awkwardly — not fully over it yet.'),
            [['a', '"…미안. 다음엔 물어볼게."', '"…Sorry. I\'ll ask next time."'], ['b', '"알았어. 이번만이야."', '"Fine. Just this once."']], K('다툰 뒤 사장님이 화해시킴 · 아직 어색함', 'Boss made them make up · still awkward')),
        R(K('{a} 편을 들자 {a은} 의기양양해졌고, {b은} 하루 종일 말수가 줄었어요.', 'You sided with {a}. {a} is smug; {b} barely spoke all day.'),
            [['a', '"거봐, 사장님도 내 말이 맞대."', '"See? The boss agrees with me."'], ['b', '"…네, 알겠어요."', '"…Yes, understood."']], K('다툼에서 사장님이 {a} 편 · {b은} 서운함', 'Boss sided with {a} in a fight · {b} is hurt')),
        R(K('{b} 편을 들자 {a이} 마지못해 사과했어요. 대신 하루 종일 {b} 쪽은 안 쳐다봐요.', 'You sided with {b}. {a} apologized grudgingly — and won\'t look {b}\'s way all day.'),
            [['a', '"…알았어요. 제가 잘못했네요."', '"…Fine. My fault, then."'], ['b', '"고마워요, 사장님."', '"Thanks, boss."']], K('다툼에서 사장님이 {b} 편 · {a은} 앙금이 남음', 'Boss sided with {b} in a fight · {a} holds a grudge')),
        R(K('모른 척하자 둘은 각자 다른 사람에게 하소연했어요. 가게 분위기가 하루 종일 무거웠어요.', 'You stayed out of it. Each complained to someone else, and the shop felt heavy all day.'),
            [['a', '"사장님은 관심도 없나 봐."', '"Guess the boss doesn\'t care."'], ['b', '"그러게."', '"Guess not."']], K('다툰 일을 사장님이 그냥 넘김 · 아직 안 풀림', 'Boss ignored their fight · not resolved')),
    ],
    friends: [
        R(K('둘을 칭찬하자 신이 나서 더 붙어 다녀요. 일은 즐겁게 하는데 수다도 늘었어요.', 'You praised them and they stuck together even more — happier at work, chattier too.'),
            [['a', '"역시 사장님은 알아주신다니까!"', '"I knew the boss would get it!"'], ['b', '"우리 팀 최고지?"', '"Best team, right?"']], K('사장님이 둘 사이를 칭찬함', 'Boss praised their friendship')),
        R(K('일할 땐 떨어져 있으라고 하자 둘 다 시무룩해졌어요. 대신 실수는 줄었어요.', 'You told them to split up at work. Both sulked, but mistakes dropped.'),
            [['a', '"…네에."', '"…Okaaay."'], ['b', '"쉬는 시간엔 같이 있어도 되죠?"', '"We can still hang out on breaks, right?"']], K('사장님이 일할 땐 떨어져 있으라고 함', 'Boss told them to work apart')),
        R(K('그냥 두었더니 둘이 알아서 손발을 맞췄어요. 별일 없이 지나갔어요.', 'You left them be, and they worked it out between them. Nothing came of it.'),
            [['a', '"사장님 아무 말 안 하시네?"', '"The boss didn\'t say anything?"'], ['b', '"그럼 괜찮은 거겠지."', '"Then we\'re fine."']], K('둘이 서로 감싸 주는 사이 · 사장님은 모름', 'They cover for each other · the boss doesn\'t know'),
            K('그냥 두었더니 감싸 준 일이 쌓여서 재료 수가 계속 안 맞아요. 언젠가 터질 것 같아요.', 'You left them be, and the cover-ups piled up. The stock count keeps coming out wrong — this will blow up someday.')),
    ],
    rude: [
        R(K('다시 온 손님에게 사과하고 새로 만들어 드렸어요. 손님은 누그러졌고, {a은} 뒤에서 입을 삐죽였어요.', 'You apologized when the customer came back and made a fresh one. They softened; {a} pouted in the back.'),
            [['guest', '"…이번엔 괜찮네요."', '"…This one\'s fine."'], ['a', '"제 잘못은 아닌데…"', '"It wasn\'t my fault, though…"']]),
        R(K('말없이 환불해 드렸어요. 손님은 돌아갔지만 돈이 나갔어요.', 'You refunded them without argument. The customer left, and so did the money.'),
            [['guest', '"진작 이렇게 하지."', '"Should\'ve done that from the start."'], ['a', '"…그냥 돈 드리면 끝이네요."', '"…So we just hand over money."']]),
        R(K('{a}에게 맡겼더니 손님을 잘 달래서 오히려 단골이 될 것 같대요.', 'You left it to {a}, who smoothed things over so well the customer might become a regular.'),
            [['a', '"제가 알아서 할게요."', '"Leave it to me."'], ['guest', '"…다음에 또 올게요."', '"…I\'ll come again."']], null,
            K('{a}에게 맡겼더니 또 말다툼이 붙어서 손님이 화난 채 나갔어요.', 'You left it to {a}, and it turned into another argument. The customer stormed out.')),
    ],
    spoil: [
        R(K('바로 수리 기사를 불렀어요. 돈은 들었지만 재료는 거의 살렸어요.', 'You called a repair right away. It cost money, but most of the stock survived.'),
            [['a', '"이제 좀 시원하네요."', '"Finally cold again."'], ['b', '"수리비 얼마 나왔어요?"', '"How much was the repair?"']]),
        R(K('살릴 것만 골라냈어요. 주방이 한동안 엉망이었어요.', 'You sorted out what could be saved. The kitchen was a mess for a while.'),
            [['a', '"이건 괜찮고, 이건… 냄새 맡아 볼래?"', '"This one\'s fine, this one… want to smell it?"'], ['b', '"싫어."', '"No."']]),
        R(K('애매한 건 다 버리고 다시 시작했어요. 재료가 꽤 줄었어요.', 'You tossed anything questionable and started over. Stock took a real hit.'),
            [['a', '"아깝다…"', '"What a waste…"'], ['b', '"배탈 나는 것보단 낫지."', '"Better than a stomachache."']]),
    ],
};
const HINT = {
    fight: [K('"둘 다 이리 와 봐. 얘기 좀 하자."', '"Both of you, come here. Let\'s talk."'), K('"이번 일은 {a} 말도 일리가 있어."', '"{a} has a point this time."'), K('"이번 일은 {b} 말이 맞아."', '"{b} is right this time."'), K('"둘이 알아서 풀어."', '"Sort it out yourselves."')],
    friends: [K('"둘이 손발 잘 맞네."', '"You two make a good team."'), K('"일할 땐 좀 떨어져 있자."', '"Let\'s keep apart during work."'), K('', '')],
    rude: [K('"제가 다시 만들어 드릴게요."', '"Let me make you a new one."'), K('"환불해 드릴게요."', '"I\'ll refund you."'), K('', '')],
    spoil: [K('"돈 들어도 고치자."', '"Fix it, whatever it costs."'), K('"살릴 수 있는 것만 골라."', '"Save what you can."'), K('"아깝지만 버려."', '"Painful, but toss it."')],
};

/** 그 직원이 이 이야기에 맞는 성격인지 */
const fits = (id, tags) => !tags.length || (book(id)?.tags || []).some(t => tags.includes(t));

/**
 * 수습 대기 하나를 새로 만들 때: 이야기 고르기 + (짝 사건이면) 누가 a인지 정하기.
 * ids = 관련 직원 [주인공, 상대], withId = 손님·냉장고 일에 같이 나오는 다른 직원 (없으면 null)
 * 반환: { staffIds, with, story }
 */
export function makeFixStory(kind, ids, withId = null, avoid = []) {
    const vs = STORY[kind];
    const pair = PAIR_FIX(kind);
    const opts = [];
    vs.forEach((v, i) => {
        if (!v.tags.length) return;
        if (pair) { if (fits(ids[0], v.tags)) opts.push([i, ids[0], ids[1]]); if (fits(ids[1], v.tags)) opts.push([i, ids[1], ids[0]]); }
        else if (fits(ids[0], v.tags)) opts.push([i, ids[0], withId]);
    });
    // 맞는 성격 이야기가 없거나, 가끔은 기본 이야기. 최근에 쓴 이야기(avoid)는 되도록 피함
    const generic = vs.findIndex(v => !v.tags.length);
    const fresh = opts.filter(o => !avoid.includes(o[0]));
    const useGeneric = !fresh.length || (!avoid.includes(generic) && Math.random() < .15);
    const [vi, a, b] = useGeneric ? [generic, ids[0], pair ? ids[1] : withId] : pick(fresh);
    const staffIds = pair ? [a, b] : [a];
    return { vi, staffIds, with: pair ? null : b, story: fallbackStory(kind, vi, a, b) };
}

function fallbackStory(kind, vi, a, b) {
    const names = { a: book(a)?.name || '', b: book(b)?.name || '' };
    const fx = t => fillNames(L(...t), names);
    const ln = arr => arr.filter(([w]) => w !== 'b' || b).map(([w, ko, en]) => ({ w, t: fillNames(L(ko, en), names) }));
    const v = STORY[kind][vi];
    return {
        ai: false,
        cause: fx(v.cause),
        lines: ln(v.lines),
        now: fx(v.now),
        hints: HINT[kind].map(fx),
        res: RESULT[kind].map(r => ({ t: fx(r.t), bad: r.bad ? fx(r.bad) : '', lines: ln(r.lines), memo: r.memo ? fx(r.memo) : '' })),
    };
}

/** 선택지 글 (싸움은 이름이 들어감) */
export function fixChoiceLabel(f, i) {
    const c = FIX_CHOICES[f.kind]?.[i]; if (!c) return '';
    return fillNames(L(...c.label), { a: book(f.staffIds[0])?.name || '', b: book(f.staffIds[1])?.name || '' });
}
export const fixTitle = f => L(...(FIX_TITLE[f.kind] || K('일', 'Trouble')));
/** 이야기 속 'a' / 'b' / 'guest' → 직원 id (손님이면 null) */
export const whoId = (f, w) => (w === 'a' ? f.staffIds[0] : w === 'b' ? (f.staffIds[1] || f.with) : null);
