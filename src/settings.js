// 설정 칸 — 확장 설정 칸(panel)과 게임 창 안(game) 두 곳에서 같은 값을 고친다.
// 한쪽에서 바꾸면 onSettings 로 알려서 다른 쪽도 바로 다시 그린다.
import { esc, ctx } from './util.js';
import { S, save } from './state.js';
import { L, resetLang } from './i18n.js';
import { getProfiles } from './ai.js';

const listeners = [];
/** fn(key, scope) — scope: 'panel' | 'game' (어디서 바꿨는지) */
export function onSettings(fn) { listeners.push(fn); }
export function emitSettings(key, scope) { for (const fn of listeners) { try { fn(key, scope); } catch (e) { console.warn('[Crumble]', e); } } }

export function personaName() { try { return String(ctx().name1 || '').trim(); } catch { return ''; } }

/** 사장 이름 저장: 페르소나 이름과 같고 원래 비어 있었으면 비워 둠 (페르소나를 바꾸면 따라가게) */
export function setBossName(v, scope) {
    const s = S();
    v = String(v || '').trim().slice(0, 30);
    s.bossName = (!s.bossName && v === personaName()) ? '' : v;
    s.bossNameAsked = true;
    save();
    emitSettings('bossName', scope);
}

export function profileOptions() {
    const cur = S().profileId || '';
    const list = getProfiles();
    let html = `<option value="" ${cur ? '' : 'selected'}>${esc(L('지금 연결 그대로 (기본)', 'Current connection (default)'))}</option>`;
    for (const p of list) html += `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name || p.id)}</option>`;
    // 목록에 없어도 저장값은 지우지 않는다 (불러오는 순간 목록이 비어 있을 수 있음)
    if (cur && !list.some(p => p.id === cur)) html += `<option value="${esc(cur)}" selected>⚠️ ${esc(L('찾을 수 없는 프로필', 'Profile not found'))}</option>`;
    return html;
}
export function profileNote() {
    const cur = S().profileId || '';
    if (cur && !getProfiles().some(p => p.id === cur)) return L('⚠️ 고른 프로필을 찾을 수 없어서 지금 연결 그대로 써요.', '⚠️ The chosen profile is missing, so the current connection is used.');
    return L('게임 글만 이 연결로 보내요. 채팅 연결은 그대로예요.', 'Only game text uses this. Your chat connection stays as is.');
}
/** 열려 있는 모든 AI 연결 칸 다시 채우기 */
export function refreshProfileSelects() {
    document.querySelectorAll('[data-s="profileId"]').forEach(sel => { sel.innerHTML = profileOptions(); });
    document.querySelectorAll('[data-s-note="profileId"]').forEach(n => { n.textContent = profileNote(); });
}

/** 설정 항목 HTML. scope 마다 id 앞부분과 모양(class)이 다름 */
export function fieldsHtml(scope) {
    const s = S();
    const game = scope === 'game';
    const id = k => `crumble_${scope}_${k}`;
    const sel = game ? 'cr-input' : 'text_pole';
    const lab = (k, t) => game ? `<label class="cr-field" for="${id(k)}">${t}</label>` : `<label for="${id(k)}">${t}</label>`;
    const note = (t, attr = '') => `<small class="${game ? 'cr-muted cr-sNote' : ''}" ${attr}>${t}</small>`;
    const group = t => `<div class="${game ? 'cr-sGroup' : 'crumble-sgroup'}">${t}</div>`;
    const check = (k, t) => `<label class="${game ? 'cr-check' : 'checkbox_label'}"><input id="${id(k)}" data-s="${k}" type="checkbox" ${s[k] ? 'checked' : ''}> ${t}</label>`;
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    return group(L('🏪 가게', '🏪 Shop')) +
        lab('boss', L('사장 이름', 'Owner name')) +
        `<input id="${id('boss')}" data-s="bossName" class="${sel}" type="text" maxlength="30" value="${esc(s.bossName || '')}" placeholder="${esc(L('비우면 페르소나 이름', 'Blank = persona name'))}">` +
        group(L('🖼 화면', '🖼 Display')) +
        lab('win', L('창 크기', 'Window size')) +
        `<select id="${id('win')}" data-s="winSize" class="${sel}">${opt('auto', s.winSize || 'auto', L('자동 (컴퓨터에서 크게)', 'Auto (bigger on desktop)'))}${opt('s', s.winSize, L('보통', 'Normal'))}${opt('m', s.winSize, L('크게', 'Large'))}${opt('l', s.winSize, L('아주 크게', 'Extra large'))}</select>` +
        lab('lang', L('언어', 'Language')) +
        `<select id="${id('lang')}" data-s="lang" class="${sel}">${opt('auto', s.lang, L('자동 (실리태번 언어)', 'Auto (SillyTavern language)'))}${opt('ko', s.lang, '한국어')}${opt('en', s.lang, 'English')}</select>` +
        check('rememberZoom', L('확대해서 보던 위치 기억하기', 'Remember zoom & position')) +
        group(L('🤖 AI', '🤖 AI')) +
        lab('profile', L('AI 연결', 'AI connection')) +
        `<select id="${id('profile')}" data-s="profileId" class="${sel}">${profileOptions()}</select>` +
        note(esc(profileNote()), 'data-s-note="profileId"') +
        lab('cardref', L('원본 카드 참고', 'Use original card text')) +
        `<select id="${id('cardref')}" data-s="cardRef" class="${sel}">${opt('all', s.cardRef, L('직접 영업 전부 (기본)', 'All of direct business (default)'))}${opt('important', s.cardRef, L('중요 장면만', 'Important scenes only'))}${opt('none', s.cardRef, L('안 함 (설명서만)', 'Off (manual only)'))}</select>` +
        note(L('자동 일지·마감 일기·장면 말풍선은 언제나 설명서만 써요.', 'Away logs, diaries and speech bubbles always use the manual only.')) +
        lab('len', L('AI 응답 길이 (토큰)', 'AI response length (tokens)')) +
        `<input id="${id('len')}" data-s="responseLength" class="${sel}" type="number" min="400" max="8000" step="100" value="${s.responseLength}">` +
        group(L('☕ 영업', '☕ Business')) +
        lab('minutes', `${L('영업 시간 길이 (분)', 'Business length (minutes)')}: <span data-s-val="businessMinutes">${s.businessMinutes}</span>`) +
        `<input id="${id('minutes')}" data-s="businessMinutes" type="range" min="2" max="8" step="1" value="${s.businessMinutes}"${game ? ' class="cr-sRange"' : ''}>` +
        (game ? note(L('영업 중에 바꾸면 다음 영업부터 적용돼요.', 'Changes during business apply from the next day.')) : '') +
        check('skipWait', L('기다리지 않고 바로 다음 날 영업하기', 'Allow skipping to the next day without waiting')) +
        group(L('🌙 사장님 없을 때', '🌙 While you\'re away')) +
        lab('away', L('일지가 쌓이기 시작하는 시간', 'Away log starts after')) +
        `<select id="${id('away')}" data-s="awayMinutes" class="${sel}">${[[0, L('끔', 'Off')], [15, L('15분', '15 min')], [30, L('30분 (기본)', '30 min (default)')], [60, L('1시간', '1 hour')], [120, L('2시간', '2 hours')]].map(([v, t]) => opt(String(v), String(s.awayMinutes), t)).join('')}</select>` +
        note(L('창을 닫고 이만큼 지나면 문 열기 전·마감 후에 작은 일이 생겨요. AI는 하루 3번까지만 불러요.', 'After the window is closed this long, small things happen before opening or after closing. The AI is called at most 3 times a day.')) +
        lab('backlog', L('영업 중 밀린 일이 쌓이는 시간', 'Business backlog starts after')) +
        `<select id="${id('backlog')}" data-s="backlogMinutes" class="${sel}">${[[0, L('끔', 'Off')], [30, L('30분', '30 min')], [60, L('1시간 (기본)', '1 hour (default)')], [120, L('2시간', '2 hours')]].map(([v, t]) => opt(String(v), String(s.backlogMinutes), t)).join('')}</select>` +
        note(L('영업 중에 창을 닫고 이만큼 지날 때마다 밀린 일이 하나씩 (최대 3개). 가게 시간은 그대로예요.', 'Each time this passes with the window closed during business, one task piles up (max 3). Shop time stays put.'));
}

/** 설정 칸 안의 입력들에 바꾸기 연결 */
export function bindFields(box, scope) {
    const s = S();
    const on = (k, ev, fn) => box.querySelector(`[data-s="${k}"]`)?.addEventListener(ev, e => { fn(e.target); save(); emitSettings(k, scope); });
    box.querySelector('[data-s="bossName"]')?.addEventListener('change', e => setBossName(e.target.value, scope));
    on('winSize', 'change', t => { s.winSize = t.value; });
    on('lang', 'change', t => { s.lang = t.value; resetLang(); });
    on('rememberZoom', 'change', t => { s.rememberZoom = t.checked; });
    on('profileId', 'change', t => { s.profileId = t.value; refreshProfileSelects(); });
    on('cardRef', 'change', t => { s.cardRef = t.value; });
    on('responseLength', 'change', t => { s.responseLength = Math.max(400, Math.min(8000, +t.value || 1600)); t.value = s.responseLength; });
    on('businessMinutes', 'input', t => { s.businessMinutes = +t.value; box.querySelector('[data-s-val="businessMinutes"]').textContent = t.value; });
    on('skipWait', 'change', t => { s.skipWait = t.checked; });
    on('awayMinutes', 'change', t => { s.awayMinutes = +t.value || 0; });
    on('backlogMinutes', 'change', t => { s.backlogMinutes = +t.value || 0; });
}
