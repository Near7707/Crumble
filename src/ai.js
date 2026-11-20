// AI 호출 — 글만 받는다. 숫자 계산은 rules.js가 한다.
// 실패하면 null을 돌려주고, 부르는 쪽은 기본 문구로 계속 진행한다.
import { ctx, parseJsonLoose, str, num } from './util.js';
import { S, G, book, staffById, rel, menuInfo } from './state.js';
import { EVENT_KINDS, TAGS, isImportantKind, WEATHER, roleLabel } from './rules.js';
import { AI_LANG, isKo, L } from './i18n.js';

// 설정의 "사장 이름" → 없으면 페르소나 이름 → 없으면 "사장님"
const bossName = () => String(S().bossName || '').trim() || ctx().name1 || (isKo() ? '사장님' : 'Boss');

/** 실리태번 연결 프로필 목록 (읽기만) */
export function getProfiles() {
    const list = ctx().extensionSettings?.connectionManager?.profiles;
    return Array.isArray(list) ? list : [];
}

/** 저장된 프로필이 지금 쓸 수 있으면 그 프로필, 아니면 null (= 지금 연결 그대로) */
export function activeProfile() {
    const id = S().profileId;
    if (!id) return null;
    return getProfiles().find(p => p.id === id) || null;
}

async function raw(prompt, system, minLen = 0) {
    const c = ctx();
    const len = Math.max(S().responseLength || 1600, minLen);
    // 게임용 연결 프로필: 채팅 쪽 연결은 바꾸지 않고 이 요청만 그 프로필로 보낸다.
    // 프로필을 못 찾으면 아래 "지금 연결 그대로"로 내려간다.
    const prof = activeProfile();
    const svc = c.ConnectionManagerRequestService;
    if (prof && svc?.sendRequest) {
        const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
        const res = await svc.sendRequest(prof.id, messages, len, {
            stream: false, extractData: true, includePreset: true, includeInstruct: true,
        });
        return typeof res === 'string' ? res : (res?.content ?? '');
    }
    const fn = c.generateRaw;
    if (typeof fn !== 'function') throw new Error('generateRaw not available');
    // 예전 실리태번: generateRaw(prompt, api, instructOverride, quietToLoud, systemPrompt, responseLength)
    // 요즘 실리태번: generateRaw({ prompt, systemPrompt, responseLength })
    if (fn.length >= 2) return await fn(prompt, null, false, false, system, len);
    return await fn({ prompt, systemPrompt: system, responseLength: len });
}

async function askJson(prompt, system, tries = 2, minLen = 0) {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
        try {
            const out = await raw(prompt, system, minLen);
            const j = parseJsonLoose(out);
            if (j) return j;
            lastErr = new Error('bad json');
        } catch (e) { lastErr = e; }
    }
    console.warn('[Crumble] AI failed', lastErr);
    return null;
}

function system() {
    return [
        'You write text for "Crumble", a small dessert-shop management game inside SillyTavern.',
        `The player is the shop owner ("${bossName()}"). The staff are characters taken from character cards.`,
        `Write ALL text values in ${AI_LANG()}.`,
        'Rules:',
        '- Every staff member acts true to their own manual: personality, speech style, values, flaws, attitude to the boss.',
        '- Do NOT make everyone nice and hard-working. Show flaws, slacking, sulking, talking back, flattery, small mischief when it fits.',
        '- VOICE: each staff member must sound like THEIR OWN character — same speech level, bluntness or coldness, slang, catchphrases, sentence endings and way of addressing the boss as in their voice samples / manual. Never smooth anyone into a generic friendly, polite shop clerk. A rude or cold character stays rude or cold even at work.',
        '- If "Voice samples" are given, they are the HIGHEST authority on how that person talks. If the samples are in another language, do not translate them word for word: carry over the feel (tone, attitude, quirks, how they address people) and write it naturally in the output language.',
        '- Skill and personality are separate: a skilled worker can still cause trouble because of their personality.',
        '- Keep it light and slice-of-life. No graphic content. Never invent staff who are not listed.',
        '- Reply with ONE JSON object only. No markdown, no commentary.',
    ].join('\n');
}

const fill = (t, name) => String(t || '').replace(/\{\{char\}\}/gi, name).replace(/\{\{user\}\}/gi, bossName());

/** 원본 카드 글 (읽기만) */
export function cardText(avatar, max = 1800) {
    const ch = (ctx().characters || []).find(c => c.avatar === avatar);
    if (!ch) return '';
    const d = ch.data || {};
    const parts = [
        ['Description', d.description ?? ch.description],
        ['Personality', d.personality ?? ch.personality],
        ['Scenario', d.scenario ?? ch.scenario],
        ['Example dialogue', d.mes_example ?? ch.mes_example],
    ].filter(([, v]) => v && String(v).trim());
    let out = parts.map(([k, v]) => `${k}:\n${fill(v, ch.name)}`).join('\n\n');
    if (out.length > max) out = out.slice(0, max) + '…';
    return out;
}

const LEVEL = {
    casual: 'Korean speech level: ALWAYS banmal (반말, casual), never 존댓말 — even to the boss and customers unless the voice samples clearly show otherwise.',
    polite: 'Korean speech level: ALWAYS 존댓말 (polite), never 반말.',
};
/** 사장님이 적은 말투 샘플 + 한국어 말 높이 (모든 호출에 맨 앞으로) */
function voiceText(b) {
    const out = [];
    const v = String(b.voice || '').trim();
    if (v) out.push(`Voice samples (real lines from the user's roleplay — copy this voice):\n${v.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12).map(x => `  "${x}"`).join('\n')}`);
    if (isKo() && LEVEL[b.speechLevel]) out.push(LEVEL[b.speechLevel]);
    return out.join('\n');
}

function manualText(id) {
    const b = book(id); if (!b) return '';
    const m = b.manual || {};
    return [
        `Name: ${b.name}`,
        voiceText(b),
        b.job && `Job/background: ${b.job}`,
        m.personality && `Personality: ${m.personality}`,
        m.speech && `Speech style: ${m.speech}`,
        m.values && `Values: ${m.values}`,
        m.principles && `How they act: ${m.principles}`,
        m.flaws && `Flaws: ${m.flaws}`,
        m.attitude && `Attitude to the boss and to work: ${m.attitude}`,
        m.examples?.length && `Example lines: ${m.examples.map(x => `"${x}"`).join(' / ')}`,
    ].filter(Boolean).join('\n');
}

function staffBlock(ids, withCard) {
    const g = G();
    return ids.map((id, i) => {
        const s = staffById(id);
        const r = rel('boss', id);
        let t = `[S${i + 1}] ${book(id)?.name}\n${manualText(id)}\n`;
        if (s) t += `Today: role=${roleLabel(s.role)}, mood=${Math.round(s.mood ?? 60)}/100, fatigue=${Math.round(s.fatigue ?? 30)}/100, baking=${s.bake}/10, service=${s.serve}/10\n`;
        t += `Bond with boss: ${r.v} (-100..100)${r.memo ? ` — note: ${r.memo}` : ''}\n`;
        const others = (g?.staff || []).filter(o => o.id !== id).map(o => { const x = rel(id, o.id); return x.v || x.memo ? `${book(o.id)?.name}: ${x.v}${x.memo ? ` (${x.memo})` : ''}` : ''; }).filter(Boolean);
        if (others.length) t += `Bonds with coworkers: ${others.join('; ')}\n`;
        if (withCard?.(id)) { const c = cardText(book(id)?.avatar); if (c) t += `--- Original character card (reference) ---\n${c}\n`; }
        return t;
    }).join('\n');
}

const keyMap = ids => Object.fromEntries(ids.map((id, i) => ['S' + (i + 1), id]));

// ---------- 1. 고용: 직원 설명서 (+ 그 직원 말투의 기본 말풍선) ----------
// 기본 말풍선: AI가 실패하거나 아직 안 불렀을 때 장면에서 쓰는 대사. 고용 호출에서 같이 뽑는다.
export const FALLBACK_KEYS = ['greet', 'pricy', 'cheap', 'buyMore', 'buyLess', 'busy', 'soldout', 'mistake', 'sneak', 'chat', 'clean', 'tired', 'thanks', 'freebie', 'rescue', 'tap1', 'tap2', 'tap3'];
const FALLBACK_HINT = 'greet=arriving in the morning, pricy=boss set prices high, cheap=prices low, buyMore=boss bought lots of stock, buyLess=bought too little, busy=shop is crowded, soldout=display is empty, mistake=messed up a batch, sneak=caught sneaking a bite, chat=small talk with a customer, clean=while cleaning, tired=tired, thanks=to a customer after selling (their own way of saying thanks — or not), freebie=slipping a customer a free extra treat, rescue=jumping in to save a coworker\'s botched batch, tap1/tap2/tap3=random lines when the boss taps them';
function cleanLines(o) {
    const out = {};
    if (o && typeof o === 'object') for (const k of FALLBACK_KEYS) { const v = str(Array.isArray(o[k]) ? o[k][0] : o[k], 100); if (v) out[k] = v; }
    return out;
}

export async function makeManual(avatar) {
    const ch = (ctx().characters || []).find(c => c.avatar === avatar);
    if (!ch) return null;
    const card = cardText(avatar, 6000);
    const tagList = Object.keys(TAGS).join(', ');
    const prompt = `Read this character card and write a rich "staff manual" for this character working at the player's dessert shop.
Keep the character exactly as the card describes. Include real flaws.

=== CHARACTER CARD: ${ch.name} ===
${card}
=== END ===
${(() => { const b = S().staffBook[avatar]; const v = b ? voiceText(b) : ''; return v ? `\n=== HOW THE USER SAYS THIS CHARACTER REALLY TALKS (follow this for speech, examples and lines) ===\n${v}\n` : ''; })()}
Return JSON:
{
 "job": "their job/background in a few words (from the card)",
 "intro": "two short lines introducing them as a shop worker",
 "personality": "3-5 sentences",
 "speech": "how they talk (tone, quirks, how they address the boss)",
 "values": "what they care about",
 "principles": "how they behave at work, what they always/never do",
 "flaws": "their weaknesses that can cause trouble at the shop",
 "attitude": "attitude toward the boss and toward work",
 "examples": ["3 short example lines they might say at the shop"],
 "tags": ["2-3 tags chosen ONLY from: ${tagList}"],
 "bake": 2-8 (starting baking skill, judged from job/experience, NOT personality),
 "serve": 2-8 (starting customer-service skill, judged from job/experience, NOT personality),
 "lines": { very short in-shop speech bubbles (max ~25 characters each) in THIS character's own voice and speech style,
   one string per key: ${FALLBACK_KEYS.map(k => `"${k}"`).join(', ')}
   (${FALLBACK_HINT}) }
}`;
    const j = await askJson(prompt, system(), 2, 2400);
    if (!j) return null;
    const tags = (Array.isArray(j.tags) ? j.tags : []).map(t => String(t).trim()).filter(t => TAGS[t]).slice(0, 3);
    return {
        job: str(j.job, 60),
        intro: str(j.intro, 200),
        manual: {
            personality: str(j.personality, 700), speech: str(j.speech, 400), values: str(j.values, 400),
            principles: str(j.principles, 500), flaws: str(j.flaws, 500), attitude: str(j.attitude, 400),
            examples: (Array.isArray(j.examples) ? j.examples : []).map(x => str(x, 120)).filter(Boolean).slice(0, 4),
        },
        tags: tags.length ? tags : ['diligent'],
        lines: cleanLines(j.lines),
        linesLang: AI_LANG(),
        bake: Math.round(num(j.bake, 2, 8, 4)),
        serve: Math.round(num(j.serve, 2, 8, 4)),
    };
}

// ---------- 1-2. 기본 말풍선만 다시 만들기 (설명서 + 말투 샘플로) ----------
export async function remakeLines(id) {
    const b = book(id); if (!b) return null;
    const prompt = `Rewrite this shop worker's short in-shop speech bubbles so they sound exactly like them.

${manualText(id)}

Return JSON: {"lines": { very short in-shop speech bubbles (max ~25 characters each) in THIS person's own voice,
   one string per key: ${FALLBACK_KEYS.map(k => `"${k}"`).join(', ')}
   (${FALLBACK_HINT}) }}`;
    const j = await askJson(prompt, system());
    const lines = cleanLines(j?.lines);
    if (!Object.keys(lines).length) return null;
    return { lines, linesLang: AI_LANG() };
}

/** 카드의 예시 대화에서 그 캐릭터 대사만 뽑기 (읽기만, AI 안 부름) */
export function cardExampleLines(avatar, max = 10) {
    const ch = (ctx().characters || []).find(c => c.avatar === avatar);
    if (!ch) return [];
    const ex = String(ch.data?.mes_example ?? ch.mes_example ?? '');
    const name = String(ch.name || '').trim();
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const head = new RegExp(`^\\s*(?:\\{\\{char\\}\\}${name ? '|' + esc(name) : ''})\\s*:\\s*`, 'i');
    const out = [];
    for (const raw of ex.split(/\r?\n/)) {
        if (!head.test(raw)) continue;
        const t = fill(raw.replace(head, ''), name).trim();
        if (t) out.push(t.length > 200 ? t.slice(0, 199) + '…' : t);
        if (out.length >= max) break;
    }
    return out;
}

// ---------- 2. 아침: 장면 대사 + 오늘 사건 글 (한 번에) ----------
const LINE_KEYS = FALLBACK_KEYS;

// linesToo=false: 밀린 일처럼 사건 글만 필요할 때 (말풍선은 안 씀)
export async function morningPrep(g, events, linesToo = true) {
    const ids = g.staff.filter(s => !s.absent).map(s => s.id);
    if (!ids.length) return null;
    if (!linesToo && !events.length) return null;
    const ref = S().cardRef;
    const evIds = new Set(events.flatMap(e => e.staffIds));
    const withCard = id => ref === 'all' ? evIds.has(id) : ref === 'important' ? events.some(e => e.staffIds.includes(id) && isImportantKind(e.kind)) : false;
    const km = keyMap(ids);
    const k = id => Object.entries(km).find(([, v]) => v === id)?.[0];
    const menu = g.menu.map(m => `${menuInfo(m.id).n[isKo() ? 0 : 1]} ${m.p}`).join(', ');
    const evDesc = events.map((e, i) => {
        const kd = EVENT_KINDS[e.kind];
        return `E${i + 1}: type="${kd.label[1]}" (${kd.cat}), involved=${e.staffIds.map(k).join('+')}
   choices: ${kd.choices.map((c, ci) => `${ci + 1}) ${c.label[1]}${c.eff.skillCheck || c.eff.gamble ? ' (UNCERTAIN — can go well or badly)' : ''}${c.eff.delegate ? ' (the staff handles it alone, their own way)' : ''} [base effect: ${JSON.stringify(c.eff)}]`).join(' | ')}`;
    }).join('\n');
    const linesPart = `1) "lines": for EACH staff key (S1..), very short in-shop speech bubbles (max ~25 characters each) in their own voice:
   greet (arriving in the morning), pricy (boss set prices high), cheap (prices low), buyMore (boss bought lots of stock), buyLess (bought too little),
   busy (shop is crowded), soldout (display is empty), mistake (they messed up a batch / order), sneak (caught sneaking a bite, or teasing),
   chat (small talk with a customer), clean (while cleaning), tired, thanks (to a customer after a sale, their own way — a cold one may not really thank),
   freebie (secretly giving a customer a free extra treat), rescue (jumping in to save a coworker's botched batch), tap1, tap2, tap3 (random lines when the boss taps them).
`;
    const prompt = `Shop day ${g.day}. Weather: ${WEATHER[g.weather]?.n[1]}. Reputation ${Math.round(g.rep)}/100. Menu: ${menu}.

STAFF:
${staffBlock(ids, withCard)}

${linesToo ? 'TODAY\'S EVENTS' : 'EVENTS THAT PILED UP WHILE THE BOSS WAS AWAY'} (already decided by the game):
${evDesc || '(none)'}

Write:
${linesToo ? linesPart : ''}${linesToo ? '2' : '1'}) "events": for EACH event E1.., write {"title","situation","guest","staff","choices":[3 x {"label","line","result","resultBad","interfere","effects"}]}.
   - situation: 1 sentence. guest: the customer's line (or "" if no customer). staff: the involved staff's line, in character.
   - choices: keep the same 3 choices in order, label them in ${AI_LANG()}.
   - line: what the staff says right after that choice is made (in character, 1 sentence).
   - result: ONE short narrator sentence telling who did what and how it turned out, if it goes well (e.g. "<name> remade the cake and the customer left smiling."). Use the staff's real name.
   - resultBad: only for UNCERTAIN choices — the same kind of sentence when it goes badly; otherwise "".
   - interfere: true if their personality makes them NOT do it exactly as told (slacking, talking back, secretly giving freebies...).
   - effects: optional small numeric changes {rep, money, ing, mood, fatigue, relBoss, clean} if personality changes the outcome; otherwise {}.

Return JSON: {${linesToo ? '"lines":{"S1":{...}}, ' : ''}"events":[...]}`;
    const j = await askJson(prompt, system(), 2, 2600);
    if (!j) return null;
    const lines = {};
    for (const [key, id] of Object.entries(km)) {
        const src = j.lines?.[key] || j.lines?.[book(id)?.name] || {};
        lines[id] = {};
        for (const lk of LINE_KEYS) { const v = str(src[lk], 100); if (v) lines[id][lk] = v; }
    }
    const texts = events.map((e, i) => {
        const x = Array.isArray(j.events) ? j.events[i] : null;
        if (!x) return null;
        const kd = EVENT_KINDS[e.kind];
        return {
            title: str(x.title, 40) || null,
            situation: str(x.situation, 200),
            guest: str(x.guest, 160),
            staff: str(x.staff, 160),
            choices: kd.choices.map((c, ci) => {
                const y = Array.isArray(x.choices) ? x.choices[ci] || {} : {};
                return { label: str(y.label, 60), line: str(y.line, 160), result: str(y.result, 180), resultBad: str(y.resultBad, 180), interfere: !!y.interfere, effects: typeof y.effects === 'object' && y.effects ? y.effects : null };
            }),
        };
    });
    return { lines, texts };
}

// ---------- 3. 마감: 하루 일기 ----------
export async function closingDiary(g, biz, inbox) {
    const ids = g.staff.filter(s => !s.absent).map(s => s.id);
    if (!ids.length) return null;
    const km = keyMap(ids);
    const k = id => Object.entries(km).find(([, v]) => v === id)?.[0];
    const log = biz.log.map(l => `- ${l.title}: ${l.by === 'boss' || !l.by ? 'boss chose' : l.by === 'delegate' ? 'boss left it to the staff, who chose' : 'boss didn\'t look, so the staff chose'} "${l.choice}"${l.result ? ` → ${l.result}` : ''}${l.line ? ` ("${l.line}")` : ''} (involved: ${l.staffIds.map(k).join('+')})`).join('\n');
    const asks = inbox.filter(it => it.staffId && ids.includes(it.staffId) && ['complaint', 'menu', 'quit'].includes(it.kind)).map(it => `${it.id}: ${k(it.staffId)} ${it.kind}`).join('\n');
    const prompt = `End of shop day ${g.day}. Customers served: ${biz.served}. Sold out moments: ${biz.soldout}. Customers who left angry: ${biz.left}. Burnt batches: ${biz.burnt}. Sneaked bites: ${biz.eaten}.
Today's events:
${log || '(quiet day)'}

STAFF:
${staffBlock(ids, null)}

Write a one-line private diary entry (max ~60 characters) for each staff key, in their own voice, about today. Be honest to their personality; not everyone is happy.
${asks ? `Also write what each of these staff says to the boss for their request (one line):\n${asks}\n` : ''}
Return JSON: {"diary":{"S1":"..."}${asks ? ', "requests":{"<id>":"line"}' : ''}}`;
    const j = await askJson(prompt, system());
    if (!j) return null;
    const diary = {};
    for (const [key, id] of Object.entries(km)) { const v = str(j.diary?.[key] || j.diary?.[book(id)?.name], 140); if (v) diary[id] = v; }
    const requests = {};
    if (j.requests) for (const [id, v] of Object.entries(j.requests)) requests[id] = str(v, 160);
    return { diary, requests };
}

// ---------- 4. 사장님 없을 때 일지 ----------
export async function awayJournal(days) {
    const g = G();
    const ids = g.staff.map(s => s.id);
    if (!ids.length) return null;
    const km = keyMap(ids);
    const k = id => Object.entries(km).find(([, v]) => v === id)?.[0];
    const picks = days.flatMap(d => d.picks.map(p => `day ${d.day}: ${p.kind === 'nightThief' ? 'night burglar (someone forgot to lock up)' : EVENT_KINDS[p.kind].label[1]} — ${(p.staffIds || []).map(k).join('+')}`)).join('\n');
    const d0 = days[0];
    const hrs = d0?.short ? (d0.minutes >= 90 ? `${Math.round(d0.minutes / 60)} hours` : `${d0.minutes} minutes`) : '';
    const head = d0?.short
        ? `On day ${d0.day} the boss stepped away for about ${hrs}, ${d0.when === 'after' ? 'after closing time (the shop is closed, staff tidying up or hanging around)' : 'before opening (staff getting ready)'}.`
        : `The boss was away for ${days.length} day(s) (days ${days.map(d => d.day).join(', ')}). The staff ran the shop alone.`;
    const count = d0?.short ? `${Math.max(1, d0.picks.length)}` : '3-5';
    const prompt = `${head}
Things that happened (decided by the game):
${picks || '(nothing special)'}

STAFF:
${staffBlock(ids, null)}

Write a short journal of ${count} entries about what happened while the boss was away, including the listed events${d0?.short ? '' : ' and some behind-the-scenes moments'}.
Do NOT make it all heartwarming — include flaws and small mischief.
Each entry: {"day": number, "staff": "S1", "time": "short time like 오후 3시 / 3 PM", "title": "short title", "text": "1-2 sentences"}.
Return JSON: {"entries":[...]}`;
    const j = await askJson(prompt, system());
    if (!j || !Array.isArray(j.entries)) return null;
    return j.entries.slice(0, 5).map(e => ({
        day: Math.round(num(e.day, 0, 99999, days[0].day)),
        staffId: km[String(e.staff).trim()] || ids.find(id => book(id)?.name === e.staff) || null,
        time: str(e.time, 20),
        title: str(e.title, 40),
        text: str(e.text, 220),
    })).filter(e => e.title || e.text);
}

// ---------- 5. 폐업: 마지막 한마디 + 폐업 일지 (한 번에) ----------
export async function endingWords(g) {
    const ids = g.staff.map(s => s.id);
    const km = keyMap(ids);
    const ref = S().cardRef;
    const withCard = () => ref !== 'none';
    const mem = g.stats.memorable.slice(-15).map(m => `- day ${m.day}: ${m.title}${m.text ? ' — ' + m.text : ''}`).join('\n');
    const prompt = `The shop is closing down for good after ${g.day} days (debt). Best reputation ${g.stats.maxRep}.
Memorable moments so far:
${mem || '(few records)'}

STAFF (still here):
${staffBlock(ids, withCard)}

Write:
- "last": each staff's final words to the boss (1-2 sentences), matching personality and their bond with the boss (some may be cold, some may cry, some may joke).
- "aware": for each staff, did they see this coming? one of "no", "sensed", "knew".
- "today": each staff's one-line description of what they did on this last day.
- "memorable": pick the 3 most memorable moments [{"day": n, "title": "...", "text": "one line"}].
- "review": one-line review of each staff's time at the shop (narrator voice).
Return JSON: {"last":{"S1":"..."},"aware":{"S1":"no"},"today":{"S1":"..."},"memorable":[...],"review":{"S1":"..."}}`;
    const j = await askJson(prompt, system());
    if (!j) return null;
    const by = obj => Object.fromEntries(Object.entries(km).map(([key, id]) => [id, str(obj?.[key] || obj?.[book(id)?.name], 240)]));
    return {
        last: by(j.last), aware: by(j.aware), today: by(j.today), review: by(j.review),
        memorable: (Array.isArray(j.memorable) ? j.memorable : []).slice(0, 3).map(m => ({ day: Math.round(num(m.day, 0, 99999, 0)), title: str(m.title, 50), text: str(m.text, 160) })),
    };
}

export { bossName };

/** 화면에 보이는 사장 이름표: 이름이 있으면 "이름 (사장)", 없으면 "사장님" */
export function bossLabel() {
    let nm = String(S().bossName || '').trim();
    if (!nm) { try { nm = ctx().name1 || ''; } catch { nm = ''; } }
    return nm ? `${nm} (${L('사장', 'Boss')})` : L('사장님', 'Boss');
}
