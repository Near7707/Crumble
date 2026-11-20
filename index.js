// Crumble — 캐릭터 카드 직원들과 꾸리는 디저트 가게 (SillyTavern 확장)
import { esc, ctx } from './src/util.js';
import { S, save } from './src/state.js';
import { L, resetLang } from './src/i18n.js';
import { openWindow, closeWindow, render, applyWinSize } from './src/ui.js';
import { getProfiles } from './src/ai.js';
import { businessActive } from './src/screens.js';

function settingsHtml() {
    const s = S();
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div class="crumble-settings"><div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>Crumble</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
<div class="inline-drawer-content">
<button class="menu_button crumble-openbtn" id="crumble_open_btn"><i class="fa-solid fa-cookie-bite"></i> ${L('가게 열기', 'Open shop')}</button>
<label for="crumble_boss">${L('사장 이름', 'Owner name')}</label>
<input id="crumble_boss" class="text_pole" type="text" maxlength="30" value="${esc(s.bossName || '')}" placeholder="${esc(L('비우면 페르소나 이름', 'Blank = persona name'))}">
<label for="crumble_win">${L('창 크기', 'Window size')}</label>
<select id="crumble_win" class="text_pole">${opt('auto', s.winSize || 'auto', L('자동 (컴퓨터에서 크게)', 'Auto (bigger on desktop)'))}${opt('s', s.winSize, L('보통', 'Normal'))}${opt('m', s.winSize, L('크게', 'Large'))}${opt('l', s.winSize, L('아주 크게', 'Extra large'))}</select>
<label for="crumble_lang">${L('언어', 'Language')}</label>
<select id="crumble_lang" class="text_pole">${opt('auto', s.lang, L('자동 (실리태번 언어)', 'Auto (SillyTavern language)'))}${opt('ko', s.lang, '한국어')}${opt('en', s.lang, 'English')}</select>
<label for="crumble_profile">${L('AI 연결', 'AI connection')}</label>
<select id="crumble_profile" class="text_pole">${profileOptions()}</select>
<small id="crumble_profile_note">${profileNote()}</small>
<label for="crumble_cardref">${L('원본 카드 참고', 'Use original card text')}</label>
<select id="crumble_cardref" class="text_pole">${opt('all', s.cardRef, L('직접 영업 전부 (기본)', 'All of direct business (default)'))}${opt('important', s.cardRef, L('중요 장면만', 'Important scenes only'))}${opt('none', s.cardRef, L('안 함 (설명서만)', 'Off (manual only)'))}</select>
<small>${L('자동 일지·마감 일기·장면 말풍선은 언제나 설명서만 써요.', 'Away logs, diaries and speech bubbles always use the manual only.')}</small>
<label for="crumble_minutes">${L('영업 시간 길이 (분)', 'Business length (minutes)')}: <span id="crumble_minutes_v">${s.businessMinutes}</span></label>
<input id="crumble_minutes" type="range" min="2" max="8" step="1" value="${s.businessMinutes}">
<label for="crumble_len">${L('AI 응답 길이 (토큰)', 'AI response length (tokens)')}</label>
<input id="crumble_len" class="text_pole" type="number" min="400" max="8000" step="100" value="${s.responseLength}">
<label class="checkbox_label"><input id="crumble_skip" type="checkbox" ${s.skipWait ? 'checked' : ''}> ${L('기다리지 않고 바로 다음 날 영업하기', 'Allow skipping to the next day without waiting')}</label>
<label class="checkbox_label"><input id="crumble_zoom" type="checkbox" ${s.rememberZoom ? 'checked' : ''}> ${L('확대해서 보던 위치 기억하기', 'Remember zoom & position')}</label>
</div></div></div>`;
}

function profileOptions() {
    const cur = S().profileId || '';
    const list = getProfiles();
    let html = `<option value="" ${cur ? '' : 'selected'}>${esc(L('지금 연결 그대로 (기본)', 'Current connection (default)'))}</option>`;
    for (const p of list) html += `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.name || p.id)}</option>`;
    // 목록에 없어도 저장값은 지우지 않는다 (불러오는 순간 목록이 비어 있을 수 있음)
    if (cur && !list.some(p => p.id === cur)) html += `<option value="${esc(cur)}" selected>⚠️ ${esc(L('찾을 수 없는 프로필', 'Profile not found'))}</option>`;
    return html;
}

function profileNote() {
    const cur = S().profileId || '';
    if (cur && !getProfiles().some(p => p.id === cur)) return L('⚠️ 고른 프로필을 찾을 수 없어서 지금 연결 그대로 써요.', '⚠️ The chosen profile is missing, so the current connection is used.');
    return L('게임 글만 이 연결로 보내요. 채팅 연결은 그대로예요.', 'Only game text uses this. Your chat connection stays as is.');
}

function refreshProfileSelect() {
    const sel = document.querySelector('#crumble_profile');
    if (!sel) return;
    sel.innerHTML = profileOptions();
    const note = document.querySelector('#crumble_profile_note');
    if (note) note.textContent = profileNote();
}

function bindSettings() {
    const s = S();
    const $ = sel => document.querySelector(sel);
    $('#crumble_open_btn')?.addEventListener('click', () => openWindow());
    $('#crumble_lang')?.addEventListener('change', e => { s.lang = e.target.value; resetLang(); save(); redrawSettings(); if (document.querySelector('#crumble-root.open')) render(); });
    $('#crumble_boss')?.addEventListener('change', e => { s.bossName = e.target.value.trim().slice(0, 30); save(); });
    $('#crumble_win')?.addEventListener('change', e => { s.winSize = e.target.value; save(); if (document.querySelector('#crumble-root.open')) { applyWinSize(); if (!businessActive()) render(); } });
    $('#crumble_profile')?.addEventListener('change', e => { s.profileId = e.target.value; save(); refreshProfileSelect(); });
    $('#crumble_cardref')?.addEventListener('change', e => { s.cardRef = e.target.value; save(); });
    $('#crumble_minutes')?.addEventListener('input', e => { s.businessMinutes = +e.target.value; $('#crumble_minutes_v').textContent = e.target.value; save(); });
    $('#crumble_len')?.addEventListener('change', e => { s.responseLength = Math.max(400, Math.min(8000, +e.target.value || 1600)); save(); });
    $('#crumble_skip')?.addEventListener('change', e => { s.skipWait = e.target.checked; save(); });
    $('#crumble_zoom')?.addEventListener('change', e => { s.rememberZoom = e.target.checked; save(); });
}

function redrawSettings() {
    const host = document.querySelector('#crumble_settings_host');
    if (!host) return;
    host.innerHTML = settingsHtml();
    bindSettings();
}

function addMenuButton() {
    const menu = document.querySelector('#extensionsMenu');
    if (!menu || document.querySelector('#crumble_menu_item')) return;
    const item = document.createElement('div');
    item.id = 'crumble_menu_item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-cookie-bite extensionsMenuExtensionButton"></div><span>Crumble</span>';
    item.addEventListener('click', () => openWindow());
    menu.appendChild(item);
}

// 설정 칸 자리는 파일을 불러오자마자 왼쪽 칸에 잡아 둠 (manifest.json의 loading_order 순서대로 놓이게)
function mountSettingsHost() {
    if (document.querySelector('#crumble_settings_host')) return;
    const host = document.createElement('div');
    host.id = 'crumble_settings_host';
    (document.querySelector('#extensions_settings') || document.querySelector('#extensions_settings2'))?.appendChild(host);
}
mountSettingsHost();

async function init() {
    S(); // 기본 설정 채우기
    mountSettingsHost();
    redrawSettings();
    addMenuButton();
    // 연결 프로필이 늦게 불러와지거나 바뀌면 목록 다시 채우기
    const c = ctx();
    for (const name of ['CONNECTION_PROFILE_LOADED', 'CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED', 'SETTINGS_LOADED']) {
        const ev = c?.event_types?.[name];
        if (ev) c.eventSource.on(ev, refreshProfileSelect);
    }
    // 확장 메뉴가 늦게 그려지는 경우
    setTimeout(addMenuButton, 1500);
}

// 다른 곳에서 열 수 있게
window.Crumble = { open: openWindow, close: closeWindow };

if (typeof jQuery === 'function') jQuery(() => init());
else document.addEventListener('DOMContentLoaded', init);

