// 설정 칸 — 확장 설정 칸(panel)과 게임 창 안(game) 두 곳에서 같은 값을 고친다.
// 한쪽에서 바꾸면 onSettings 로 알려서 다른 쪽도 바로 다시 그린다.
import { esc, ctx, clamp } from './util.js';
import { S, save, ensureGame, shopName } from './state.js';
import { L, resetLang } from './i18n.js';
import { getProfiles } from './ai.js';
import { bossFace, bossUrl, personaAvatarFile, bossFaceStyle, BOSS_FACE0, getBossFace, setBossFace, bossFaceKey } from './looks.js';

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

/** 가게 이름 저장 (지금 가게) */
export function setShopName(v, scope) {
    const g = ensureGame();
    g.name = String(v || '').trim().slice(0, 24);
    g.nameAsked = true;
    save();
    emitSettings('shopName', scope);
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
        lab('bossPhoto', L('사장 사진', 'Owner photo')) +
        `<div class="cr-bossPhoto" data-bossphoto>${bossPhotoInner(game)}</div>` +
        lab('shop', L('가게 이름', 'Shop name')) +
        `<input id="${id('shop')}" data-s="shopName" class="${sel}" type="text" maxlength="24" value="${esc(shopName(s.game))}" placeholder="${esc(L('예: 말랑 제과점', 'e.g. Little Crumb Bakery'))}">` +
        group(L('🖼 화면', '🖼 Display')) +
        lab('win', L('창 크기', 'Window size')) +
        `<select id="${id('win')}" data-s="winSize" class="${sel}">${opt('auto', s.winSize || 'auto', L('자동 (컴퓨터에서 크게)', 'Auto (bigger on desktop)'))}${opt('s', s.winSize, L('보통', 'Normal'))}${opt('m', s.winSize, L('크게', 'Large'))}${opt('l', s.winSize, L('아주 크게', 'Extra large'))}</select>` +
        lab('lang', L('언어', 'Language')) +
        `<select id="${id('lang')}" data-s="lang" class="${sel}">${opt('auto', s.lang, L('자동 (실리태번 언어)', 'Auto (SillyTavern language)'))}${opt('ko', s.lang, '한국어')}${opt('en', s.lang, 'English')}</select>` +
        check('rememberZoom', L('확대해서 보던 위치 기억하기', 'Remember zoom & position')) +
        check('staffTags', L('영업 중 직원 머리 위에 하는 일 글로 보기', 'Show what staff are doing above their heads')) +
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

        group(L('🌙 사장님 없을 때', '🌙 While you\'re away')) +
        lab('autoday', L('직원들끼리 하루 영업하는 시간', 'Staff run a day on their own every')) +
        `<select id="${id('autoday')}" data-s="autoDayHours" class="${sel}">${[[4, L('4시간', '4 hours')], [8, L('8시간 (기본)', '8 hours (default)')], [12, L('12시간', '12 hours')], [24, L('24시간', '24 hours')]].map(([v, t]) => opt(String(v), String(s.autoDayHours), t)).join('')}</select>` +
        note(L('창을 닫고 이만큼 지날 때마다 직원들끼리 하루를 영업해요 (최대 3일). 돌아오면 다음 날 아침이에요.', 'Each time this passes with the window closed, the staff run a day on their own (max 3). You come back to the next morning.')) +
        lab('away', L('일지가 쌓이기 시작하는 시간', 'Away log starts after')) +
        `<select id="${id('away')}" data-s="awayMinutes" class="${sel}">${[[0, L('끔', 'Off')], [15, L('15분', '15 min')], [30, L('30분 (기본)', '30 min (default)')], [60, L('1시간', '1 hour')], [120, L('2시간', '2 hours')]].map(([v, t]) => opt(String(v), String(s.awayMinutes), t)).join('')}</select>` +
        note(L('창을 닫고 이만큼 지나면 문 열기 전·마감 후에 작은 일이 생겨요. AI는 하루 3번까지만 불러요.', 'After the window is closed this long, small things happen before opening or after closing. The AI is called at most 3 times a day.')) +
        lab('backlog', L('영업 중 밀린 일이 쌓이는 시간', 'Business backlog starts after')) +
        `<select id="${id('backlog')}" data-s="backlogMinutes" class="${sel}">${[[0, L('끔', 'Off')], [30, L('30분', '30 min')], [60, L('1시간 (기본)', '1 hour (default)')], [120, L('2시간', '2 hours')]].map(([v, t]) => opt(String(v), String(s.backlogMinutes), t)).join('')}</select>` +
        note(L('영업 중에 창을 닫고 이만큼 지날 때마다 밀린 일이 하나씩 (최대 3개). 가게 시간은 그대로예요.', 'Each time this passes with the window closed during business, one task piles up (max 3). Shop time stays put.'));
}

// ---------- 0.3.1 사장 사진 ----------
let bpEditOpen = false;
function bossPhotoInner(game) {
    const s = S(), src = s.bossPhoto || 'persona';
    const has = !!bossUrl();
    const btn = (k, t, on = false, dis = false) => `<button type="button" class="cr-bp${game ? '' : ' menu_button'}${on ? ' on' : ''}" data-bp="${k}" ${dis ? 'disabled' : ''}>${t}</button>`;
    const note = src === 'none' ? L('사진 없음 · 👑로 보여요', 'No photo · shows 👑')
        : src === 'upload' ? (s.bossImg ? L('올린 사진 · 확장 설정에만 저장돼요', 'Uploaded photo · saved only in the extension settings') : L('올린 사진이 없어요 · 👑로 보여요', 'No uploaded photo · shows 👑'))
            : personaAvatarFile() ? L('지금: 페르소나 사진 · 페르소나를 바꾸면 따라가요', 'Now: persona avatar · follows your persona') : L('페르소나 사진을 못 찾았어요 · 👑로 보여요', 'Couldn\'t find a persona avatar · shows 👑');
    const edit = bpEditOpen && has ? `<div class="cr-bpEdit">
<div class="cr-facePrev"><div class="cr-faceBig cr-bpBig"></div><div class="cr-faceSmall cr-bpSmall"></div></div>
<p class="cr-bpHint">${L('동그라미 안을 끌어서 옮겨요 · 두 손가락이나 휠로 확대', 'Drag inside the circle · pinch or scroll to zoom')}</p>
<label>${L('확대', 'Zoom')}<input type="range" min="100" max="400" step="5" data-bpk="z"></label>
<div class="cr-bpDone"><button type="button" class="cr-bp${game ? '' : ' menu_button'}" data-bp="reset">${L('처음대로', 'Reset')}</button><button type="button" class="cr-bp on${game ? '' : ' menu_button'}" data-bp="adjust">${L('다 맞췄어요', 'Done')}</button></div></div>` : '';
    return `${bossFace(54)}<div style="flex:1;min-width:0"><div class="cr-bpBtns">${btn('persona', L('페르소나 사진', 'Persona avatar'), src === 'persona')}${btn('upload', L('사진 올리기', 'Upload photo'), src === 'upload' && !!s.bossImg)}${btn('adjust', L('위치 맞추기', 'Adjust'), bpEditOpen && has, !has)}${btn('none', L('지우기', 'Remove'), src === 'none')}</div>
<small class="cr-bpNote">${note}</small>${edit}</div><input type="file" accept="image/*" data-bpfile hidden>`;
}
/** 올린 사진을 작게 줄여서 (긴 쪽 256px, jpg) */
function shrinkImage(file) {
    return new Promise((res, rej) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.min(1, 256 / Math.max(img.width, img.height));
            const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
        img.src = url;
    });
}
function bindBossPhoto(box, scope) {
    const host = box.querySelector('[data-bossphoto]'); if (!host) return;
    const game = scope === 'game', s = S();
    let f = null, fKey = '', dirty = false; // 맞추는 중인 값 (어느 사진 것인지)
    const paint = (edit = true) => {
        if (edit && f) dirty = true;
        const st = bossFaceStyle(bossUrl(), f || getBossFace());
        const face = host.querySelector('.cr-face.photo'); if (face) face.style.cssText = `width:54px;height:54px;${st}`;
        host.querySelectorAll('.cr-bpBig, .cr-bpSmall').forEach(x => { x.style.cssText = st; });
        const z = host.querySelector('[data-bpk=z]'); if (z && f) z.value = Math.round(f.z * 100);
    };
    const bindEdit = () => {
        const big = host.querySelector('.cr-bpBig'); if (!big) return;
        f = { ...getBossFace() }; fKey = bossFaceKey();
        paint(false); dirty = false;
        // 끌기 + 두 손가락 확대 (직원 얼굴 맞추기와 같은 느낌)
        const pts = new Map(); let drag = null, pinch = null;
        big.addEventListener('pointerdown', e => {
            e.preventDefault(); big.setPointerCapture(e.pointerId);
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
            if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: f.z }; drag = null; }
        });
        big.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId)) return;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; f.z = clamp(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), 1, 4); paint(); return; }
            if (!drag) return;
            const k = 100 / (big.clientWidth * Math.max(.2, f.z - 1 + .3));
            f.x = clamp(drag.fx - (e.clientX - drag.x) * k, 0, 100); f.y = clamp(drag.fy - (e.clientY - drag.y) * k, 0, 100); paint();
        });
        const up = e => {
            pts.delete(e.pointerId);
            if (pts.size < 2) pinch = null;
            if (pts.size === 1) { const [p] = [...pts.values()]; drag = { x: p.x, y: p.y, fx: f.x, fy: f.y }; }
            if (!pts.size) { drag = null; commit(); }
        };
        big.addEventListener('pointerup', up); big.addEventListener('pointercancel', up);
        big.addEventListener('wheel', e => { e.preventDefault(); f.z = clamp(f.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4); paint(); clearTimeout(big._t); big._t = setTimeout(commit, 250); }, { passive: false });
    };
    // 맞추는 사이 페르소나가 바뀌었으면 다른 사진에 저장하지 않음
    const commit = () => { if (!f || !dirty || fKey !== bossFaceKey()) return; setBossFace(f); dirty = false; save(); emitSettings('bossPhoto', scope); };
    const redraw = () => { f = null; host.innerHTML = bossPhotoInner(game); bindEdit(); };
    const changed = () => { save(); redraw(); emitSettings('bossPhoto', scope); };
    host.addEventListener('click', e => {
        const b = e.target.closest('[data-bp]'); if (!b || b.disabled) return;
        e.preventDefault();
        const k = b.dataset.bp;
        if (k === 'persona') { s.bossPhoto = 'persona'; changed(); }
        else if (k === 'none') { s.bossPhoto = 'none'; bpEditOpen = false; changed(); }
        else if (k === 'upload') host.querySelector('[data-bpfile]')?.click();
        else if (k === 'adjust') { if (bpEditOpen) commit(); bpEditOpen = !bpEditOpen; redraw(); }
        else if (k === 'reset') { f = { ...BOSS_FACE0 }; paint(); commit(); }
    });
    host.addEventListener('change', async e => {
        if (!e.target.matches('[data-bpfile]')) return;
        const file = e.target.files?.[0]; if (!file) return;
        try {
            s.bossImg = await shrinkImage(file); s.bossPhoto = 'upload';
            if (s.bossFaces) delete s.bossFaces.upload; // 새 사진은 처음 위치부터
            bpEditOpen = true; // 올리면 바로 위치 맞추기
            changed();
        } catch { host.querySelector('.cr-bpNote').textContent = L('이 사진은 열 수 없어요', 'Couldn\'t open that image'); }
    });
    host.addEventListener('input', e => {
        if (e.target.dataset?.bpk !== 'z' || !f) return;
        f.z = +e.target.value / 100; paint();
    });
    host.addEventListener('change', e => { if (e.target.dataset?.bpk) commit(); });
    bindEdit();
}

/** 설정 칸 안의 입력들에 바꾸기 연결 */
export function bindFields(box, scope) {
    const s = S();
    const on = (k, ev, fn) => box.querySelector(`[data-s="${k}"]`)?.addEventListener(ev, e => { fn(e.target); save(); emitSettings(k, scope); });
    box.querySelector('[data-s="bossName"]')?.addEventListener('change', e => setBossName(e.target.value, scope));
    box.querySelector('[data-s="shopName"]')?.addEventListener('change', e => setShopName(e.target.value, scope));
    bindBossPhoto(box, scope);
    on('winSize', 'change', t => { s.winSize = t.value; });
    on('lang', 'change', t => { s.lang = t.value; resetLang(); });
    on('rememberZoom', 'change', t => { s.rememberZoom = t.checked; });
    on('staffTags', 'change', t => {
        s.staffTags = t.checked;
        // 끄면 지금 떠 있는 이름표도 바로 지움 (켜면 다음 행동부터 다시 뜸)
        if (!t.checked) document.querySelectorAll('#crumble-root .cr-stag').forEach(x => { x.parentElement?.classList.remove('cr-hasTag'); x.remove(); });
    });
    on('profileId', 'change', t => { s.profileId = t.value; refreshProfileSelects(); });
    on('cardRef', 'change', t => { s.cardRef = t.value; });
    on('responseLength', 'change', t => { s.responseLength = Math.max(400, Math.min(8000, +t.value || 1600)); t.value = s.responseLength; });
    on('businessMinutes', 'input', t => { s.businessMinutes = +t.value; box.querySelector('[data-s-val="businessMinutes"]').textContent = t.value; });
    on('autoDayHours', 'change', t => { s.autoDayHours = +t.value || 8; });
    on('awayMinutes', 'change', t => { s.awayMinutes = +t.value || 0; });
    on('backlogMinutes', 'change', t => { s.backlogMinutes = +t.value || 0; });
}
