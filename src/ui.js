// 떠 있는 창 · 머리 부분 · 탭 4개 (가게 / 직원 / 결재함 / 일지)
import { esc, assetUrl, avatarUrl, ctx, clamp, dayKey } from './util.js';
import { L, F, money, signedMoney, isKo } from './i18n.js';
import {
    S, G, save, ensureGame, book, staffById, colorOf, hearts, bossRel, rel, nextColor,
    MAX_STAFF, MAX_INBOX, menuInfo, ING_PRICE, skillNeed, newGame, shopName,
} from './state.js';
import {
    TAGS, catchUp, storeAway, tagLabel, weatherLabel, roleLabel, workingStaff, inboxInfo, decideInbox,
    fireStaff, assignRoles, nextDayNow, kindTitle, hasTag, shortAway, logBoss,
} from './rules.js';
import { faceChip, faceStyle, ICON } from './looks.js';
import { createScene } from './scene.js';
import { awayJournal, makeManual, FALLBACK_KEYS, bossLabel, remakeLines, cardExampleLines } from './ai.js';
import { line, tapLine } from './lines.js';
import { renderBusiness, resumeIfNeeded, businessActive, pauseBusiness, bizPaused, addBacklog } from './screens.js';
import { fieldsHtml, bindFields, onSettings, personaName, setBossName, setShopName } from './settings.js';
import { renderEnding } from './ending.js';

export const view = { tab: 'shop', staffIdx: 0, staffSub: 'stats', journal: 'this', open: false, bizTab: 'biz', logFilter: 'all', logFold: {} };
let root = null, scenes = [], shopTimer = null, awayBusy = false;

export function addScene(s) { scenes.push(s); return s; }
function killScenes() { scenes.forEach(s => s.destroy()); scenes = []; clearInterval(shopTimer); shopTimer = null; }

// ---------- 창 ----------
export function mount() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'crumble-root';
    root.innerHTML = `<div class="cr-win" role="dialog" aria-label="Crumble"><div class="cr-inner"></div><div class="cr-dim"></div><div class="cr-sheet" role="dialog"></div><div class="cr-modal" role="dialog"></div><div class="cr-toast" role="status" aria-live="polite"></div></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.querySelector('.cr-dim').addEventListener('click', () => { if (!root.querySelector('.cr-sheet').classList.contains('lock')) closeSheet(); closeModal(); });
    // 실리태번 쪽 단축키·스와이프가 창 안에서 안 걸리게
    ['keydown', 'touchstart', 'touchmove', 'wheel'].forEach(t => root.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    // 글 입력칸을 누르면(키보드가 올라옴) 이름 창 등을 화면 위쪽에 붙이고, 창 위치도 다시 맞춘다
    root.addEventListener('focusin', e => { if (isTextInput(e.target) && touchScreen()) { kbStart(); fitSoon(); } });
    root.addEventListener('focusout', e => { if (isTextInput(e.target)) { setTimeout(() => { if (!isTextInput(document.activeElement)) kbEnd(); }, 50); fitSoon(); } });
    return root;
}
export const inner = () => root.querySelector('.cr-inner');
const isTextInput = el => !!el && root?.contains(el) && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type)));
// 폰(손가락으로 누르는 화면)에서는 창이 열리자마자 키보드가 뜨지 않게 자동 선택을 안 함
const touchScreen = () => window.matchMedia?.('(pointer: coarse)').matches;
const autoFocus = el => { if (el && !touchScreen()) el.focus(); };

// 창을 "지금 눈에 보이는 화면"에 딱 맞춘다.
// 아이폰 사파리는 페이지 전체 크기와 보이는 화면이 어긋날 수 있어서, fixed + inset:0 만으로는 창이 위로 밀려 잘린다.
// 키보드가 올라오면 아이폰이 페이지를 밀기 때문에 그때마다 다시 맞춘다.
function fitToScreen() {
    if (!root || !root.classList.contains('open')) return;
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth, h = vv ? vv.height : window.innerHeight;
    const x = vv ? vv.offsetLeft : 0, y = vv ? vv.offsetTop : 0;
    // 먼저 (0,0)에 놓고 재서, 기준점이 화면이 아닌 경우(부모 요소 때문)만 그만큼 보정한다.
    // 화면 기준이면 잰 값은 0이거나(-보이는 화면 위치)라서 보정하지 않는다 → 같은 거리를 두 번 미는 일이 없음.
    Object.assign(root.style, { inset: 'auto', left: '0px', top: '0px', width: w + 'px', height: h + 'px' });
    const r = root.getBoundingClientRect();
    const onScreen = (a, off) => Math.abs(a) <= 1 || Math.abs(a + off) <= 1;
    const bx = onScreen(r.left, x) ? 0 : r.left, by = onScreen(r.top, y) ? 0 : r.top;
    root.style.left = (x - bx) + 'px'; root.style.top = (y - by) + 'px';
}
// 입력 중인 창을 닫기 직전에 먼저 입력을 끝낸다.
// 그냥 숨기면 아이폰은 "입력 끝" 신호를 늦게 보내서, 키보드가 내려가는 동안 창이 못 따라가고 흔들린다.
function endTyping() {
    const a = document.activeElement;
    const typing = isTextInput(a);
    if (!typing && !root?.classList.contains('cr-kb')) return;
    if (typing) a.blur();
    kbEnd();
}
// 키보드가 내려가는 동안 따라 맞추기.
// 아이폰은 키보드를 다 내린 뒤에야 "화면이 커졌다"를 알려 줘서, 1초만 맞추면 창이 키보드 있을 때 크기로 잠깐 남는다.
// → 키보드 뜨기 전 화면 높이를 기억해 두고, 높이가 그만큼 돌아올 때까지(최대 3초) 매 프레임 맞춘다.
//   창을 위쪽에 붙이는 cr-kb도 그때 뺀다 (키보드가 아직 떠 있는데 가운데로 옮기지 않게).
let kbFullH = 0, kbRaf = 0, kbStop = 0;
const vvH = () => window.visualViewport ? window.visualViewport.height : window.innerHeight;
function kbStart() {
    if (kbRaf) { cancelAnimationFrame(kbRaf); kbRaf = 0; }
    else if (!root.classList.contains('cr-kb')) { kbFullH = vvH(); vpBegin(); }
    root.classList.add('cr-kb');
}
function kbEnd() {
    if (!root?.classList.contains('cr-kb') || kbRaf) return;
    vpClose();
    kbStop = performance.now() + 3000;
    const step = () => {
        fitToScreen();
        const back = kbFullH > 0 && vvH() >= kbFullH - 4;
        if (back || performance.now() >= kbStop) {
            kbRaf = 0;
            root.classList.remove('cr-kb');
            fitSoon();
            return;
        }
        kbRaf = requestAnimationFrame(step);
    };
    kbRaf = requestAnimationFrame(step);
}
let fitT = [], fitRaf = 0, fitUntil = 0;
// 키보드가 올라오는 동안 아이폰이 페이지를 여러 번 밀어서, 약 1초 동안은 화면이 바뀔 때마다(매 프레임) 따라 맞춘다.
// 바로 한 번 맞추고, 끝난 뒤에도 혹시 몰라 몇 번 더.
function fitFollow() {
    fitToScreen();
    fitRaf = performance.now() < fitUntil ? requestAnimationFrame(fitFollow) : 0;
}
const fitSoon = () => {
    fitUntil = performance.now() + 1000;
    if (!fitRaf) fitFollow();
    fitT.forEach(clearTimeout); fitT = [1100, 1500].map(ms => setTimeout(fitToScreen, ms));
};
window.visualViewport?.addEventListener('resize', () => { vpMark('vv resize'); fitSoon(); });
window.visualViewport?.addEventListener('scroll', () => { vpMark('vv scroll'); fitSoon(); });
window.addEventListener('orientationchange', fitSoon);

// ── 문제 찾기용: 화면 위치 기록 (설정 "화면 위치 기록", 기본 끔) ──
// 입력 시작 전 값 1줄 + 키보드 뜬 뒤 1줄, 그리고 입력을 끝낸 순간부터 5초 동안 값이 바뀔 때마다 1줄씩 적어
// 끝나면 화면 왼쪽 위에 표로 보여 준다 (사용자가 캡처해서 보내 주는 용도). 끄면 아무것도 안 함.
let vpLog = null, vpT0 = 0, vpLast = '', vpRaf = 0, vpUntil = 0;
const vpOn = () => !!S().vpDebug;
function vpRow(ev = '') {
    if (!vpLog) return;
    const vv = window.visualViewport, r = root?.getBoundingClientRect();
    const v = [vv ? Math.round(vv.height) : '-', vv ? Math.round(vv.offsetTop) : '-', window.innerHeight, Math.round(window.scrollY),
        r ? Math.round(r.top) : '-', r ? Math.round(r.height) : '-', root?.classList.contains('cr-kb') ? 'kb' : ''];
    const k = v.join(' ');
    if (!ev && k === vpLast) return;
    vpLast = k;
    vpLog.push([vpT0 ? Math.round(performance.now() - vpT0) : 'before', ...v, ev]);
    if (vpLog.length > 40) vpLog.splice(3, 1);
}
function vpMark(ev) { if (vpLog && (vpRaf || !vpT0)) vpRow(ev); }
function vpBegin() {
    if (!vpOn()) { vpLog = null; return; }
    if (vpRaf) { cancelAnimationFrame(vpRaf); vpRaf = 0; }
    vpLog = []; vpT0 = 0; vpLast = '';
    vpRow(L('입력 전', 'before typing'));
    setTimeout(() => { if (vpLog && !vpT0) vpRow(L('키보드 뜬 뒤', 'keyboard up')); }, 1200);
}
function vpClose() {
    if (!vpLog || !vpOn()) return;
    vpT0 = performance.now(); vpLast = '';
    vpRow(L('닫음', 'closed'));
    vpUntil = vpT0 + 5000;
    const step = () => {
        vpRow();
        if (performance.now() < vpUntil) { vpRaf = requestAnimationFrame(step); return; }
        vpRaf = 0; vpRow(L('5초', '5s')); vpShow();
    };
    vpRaf = requestAnimationFrame(step);
}
function vpShow() {
    const log = vpLog; vpLog = null; vpT0 = 0;
    if (!log) return;
    document.getElementById('crumble-vplog')?.remove();
    const box = document.createElement('div');
    box.id = 'crumble-vplog';
    Object.assign(box.style, { position: 'fixed', left: '6px', top: '6px', zIndex: 2147483647, background: 'rgba(20,12,6,.88)', color: '#fff',
        font: '10px/1.35 ui-monospace,Menlo,monospace', padding: '6px 8px', borderRadius: '8px', maxWidth: 'calc(100vw - 12px)', maxHeight: '80vh', overflow: 'auto', whiteSpace: 'pre' });
    const head = ['ms', 'vvH', 'vvTop', 'inH', 'scrY', 'top', 'h', 'kb', ''];
    const rows = [head, ...log].map(r => r.map((c, i) => String(c).padStart(i === 8 ? 0 : i === 0 ? 6 : 5)).join(' ')).join('\n');
    box.textContent = `Crumble ${L('화면 위치 기록', 'screen log')} · screen ${screen.width}×${screen.height}\n` + rows;
    const x = document.createElement('button');
    x.textContent = '✕';
    Object.assign(x.style, { position: 'sticky', float: 'right', top: '0', marginLeft: '8px', background: '#fff', color: '#000', border: '0', borderRadius: '6px', padding: '2px 8px', font: '14px sans-serif' });
    x.onclick = () => box.remove();
    box.prepend(x);
    ['touchstart', 'touchmove', 'wheel', 'click'].forEach(t => box.addEventListener(t, e => e.stopPropagation(), { passive: true }));
    document.body.appendChild(box);
}

// 창 크기: 자동이면 폰은 작게(꽉 차게), 컴퓨터는 크게
export function winSizeNow() {
    const v = S().winSize || 'auto';
    if (v !== 'auto') return v;
    const w = window.innerWidth, h = window.innerHeight;
    if (w >= 1200 && h >= 820) return 'l';
    if (w >= 760 && h >= 700) return 'm';
    return 's';
}
export function applyWinSize() {
    const win = root?.querySelector('.cr-win'); if (!win) return;
    const v = winSizeNow();
    win.classList.remove('sz-s', 'sz-m', 'sz-l'); win.classList.add('sz-' + v);
}
let resizeT = null;
window.addEventListener('resize', () => {
    vpMark('win resize');
    fitSoon();
    if (!view.open || (S().winSize || 'auto') !== 'auto') return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { const win = root?.querySelector('.cr-win'); const before = win?.className; applyWinSize(); if (win && win.className !== before && !businessActive()) render(); }, 300);
});

// ---------- 사장님이 자리를 비운 시간 ----------
// 창을 보고 있는 동안 1분마다 "마지막으로 본 때"를 적어 둔다 (기기 저장소 — 설정 파일을 자꾸 저장하지 않게).
// 창을 닫을 때는 게임 저장에도 남김.
const seenKey = () => 'crumble_seenAt_' + (G()?.id || '');
function markSeen(persist = false) {
    const g = G(); if (!g) return;
    const now = Date.now();
    try { localStorage.setItem(seenKey(), String(now)); } catch { /* 저장소를 못 써도 괜찮음 */ }
    if (persist) { g.seenAt = now; save(); }
}
function minutesAway() {
    const g = G(); if (!g) return 0;
    let t = +g.seenAt || 0;
    try { t = Math.max(t, +localStorage.getItem(seenKey()) || 0); } catch { /* */ }
    return t ? Math.max(0, (Date.now() - t) / 60000) : 0;
}
setInterval(() => { if (view.open && !document.hidden) markSeen(); }, 60000);
document.addEventListener('visibilitychange', () => {
    if (!view.open || !root) return;
    if (document.hidden) { markSeen(); return; }
    // 창을 열어 둔 채 폰을 잠갔다가 돌아왔을 때도 같은 규칙
    const away = minutesAway();
    markSeen();
    if (businessActive()) { addBacklog(away); return; }
    if (BIZ.includes(G()?.phase)) return;
    const days = catchUp(away);
    const short = !days && G() ? shortAway(G(), away) : null;
    if (days || short) { render(); runAway(days || [short]); }
});

export async function openWindow() {
    mount();
    ensureGame();
    root.classList.add('open');
    fitToScreen();
    applyWinSize();
    view.open = true;
    const away = minutesAway();
    markSeen();
    if (businessActive()) { addBacklog(away); return; } // 멈춰 둔 영업 화면 그대로 (오래 비웠으면 밀린 일)
    const days = catchUp(away);
    // 날이 안 바뀌었어도 창을 오래 닫아 뒀으면 작은 일 몇 개 (문 열기 전·마감 후만)
    const short = !days ? shortAway(G(), away) : null;
    render();
    if (days) runAway(days);
    else if (short) runAway([short]);
    resumeIfNeeded();
    // 사장 이름·가게 이름을 한 번도 안 정했으면 한 번만 물어봄 (가게 탭일 때만)
    const g = G();
    if ((!S().bossNameAsked || !g.nameAsked) && ['ready', 'done'].includes(g.phase)) askBossName();
}
export function closeWindow() {
    if (!root) return;
    endTyping();
    root.classList.remove('open');
    view.open = false;
    markSeen(true);
    view.logBase = undefined; // 다음에 열 때 "새 일" 기준을 다시 잡음
    if (businessActive()) { bizAutoPaused = false; pauseBusiness(true); return; } // 장면은 그대로 두고 멈춤 (다시 열면 "멈춤" 띠)
    killScenes();
}

// 잠깐 비운 일지는 AI를 하루 3번까지만 (넘으면 기본 글)
function awayAiQuota() {
    const g = G(), k = dayKey();
    if (g.awayAI?.key !== k) g.awayAI = { key: k, n: 0 };
    if (g.awayAI.n >= 3) return false;
    g.awayAI.n++; save();
    return true;
}
async function runAway(days) {
    if (awayBusy) return;
    awayBusy = true;
    const short = !!days[0]?.short;
    const prev = G().away;
    // 잠깐 비운 거면 아직 안 본 지난 일은 남겨 둔 채로 "쓰는 중"
    G().away = short && prev && !prev.seen && !prev.loading ? { ...prev, loading: true } : { days: days.map(d => d.day), events: [], loading: true, seen: false };
    render();
    let texts = null;
    if (!short || awayAiQuota()) { try { texts = await awayJournal(days); } catch (e) { console.warn(e); } }
    storeAway(days, texts, short ? prev : null);
    awayBusy = false;
    if (view.open && !businessActive()) softRender();
}

// ---------- 그리기 ----------
const BIZ = ['morning', 'open', 'close'];
export const bizLocked = () => BIZ.includes(G()?.phase);
export function render() {
    if (!root) return;
    const g = ensureGame();
    const box = inner();
    // 영업 중 다른 탭을 보고 있으면 그 탭만 다시 그림 (영업 장면은 숨겨 둔 채 그대로)
    if (BIZ.includes(g.phase) && view.bizTab !== 'biz' && box.querySelector(`[data-biz][data-phase="${g.phase}"]`)) { drawOtherTab(); return; }
    killScenes();
    closeSheet(); closeModal();
    box.classList.remove('cr-onOther', 'cr-paused');
    if (g.phase === 'ending') { renderEnding(box); return; }
    if (BIZ.includes(g.phase)) {
        view.bizTab = 'biz'; bizAutoPaused = false;
        renderBusiness(box);
        box.querySelector('[data-biz]')?.setAttribute('data-phase', g.phase);
        box.insertAdjacentHTML('beforeend', '<main class="cr-main cr-otherTab cr-hide"></main>');
        return;
    }
    box.innerHTML = headHtml() + tabsHtml() + `<main class="cr-main">${tabBody()}</main>`;
    afterTab();
}

export function logoHtml() {
    return `<img class="cr-logo" src="${assetUrl('assets/crumble_logo@2x.png')}" alt="Crumble" draggable="false">`;
}
// 설정 버튼 (모든 화면 머리 부분)
export function gearBtn(push = false) {
    const teeth = [0, 45, 90, 135].map(a => `<rect x="10" y="1.6" width="4" height="20.8" rx="1.3" transform="rotate(${a} 12 12)"/>`).join('');
    return `<button class="cr-gear${push ? ' push' : ''}" type="button" data-act="settings" aria-label="${L('설정', 'Settings')}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g fill="#8A5A36">${teeth}<circle cx="12" cy="12" r="7.6"/></g><circle cx="12" cy="12" r="3.1" fill="#FFFDF9"/></svg></button>`;
}
export function closeBtn() {
    return `<button class="cr-x" type="button" data-act="close" aria-label="${L('창 닫기', 'Close')}"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="#8A5A36" stroke-width="2.4" stroke-linecap="round"/></svg></button>`;
}

function statusText(g) {
    if (g.away?.loading) return L('사장님 없음 · 일지 쓰는 중', 'Boss away · writing log');
    if (g.phase === 'ready') return workingStaff(g).length ? L('직원들끼리 영업 중', 'Staff running the shop') : L('직원이 필요해요', 'Need staff');
    if (g.phase === 'done') return L('오늘 영업 끝', 'Closed for today');
    return '';
}
/** 머리 부분 (모든 화면 같은 모양). 영업 중엔 biz로 돈·버튼·상태 이름표·시간 막대만 바꿔 끼움 */
export function headHtml(biz = null) {
    const g = G();
    const nm = shopName(g);
    const moneyH = biz?.money ?? `<span class="cr-money${g.money < 0 ? ' neg' : ''}">💰 ${money(g.money)}</span>`;
    const st = biz?.status ?? `<span class="cr-pill st ${g.phase === 'ready' && !g.away?.loading ? 'staff' : ''}"><i></i>${statusText(g)}</span>`;
    return `<header class="cr-top"><div class="cr-row">${logoHtml()}${moneyH}${biz?.btns ?? gearBtn()}${closeBtn()}</div>
<div class="cr-row cr-shopName">${shopNameRowHtml(nm)}</div>
<div class="cr-row cr-status"><span class="cr-pill day">${F(L('{n}일째', 'Day {n}'), { n: g.day })}</span><span class="cr-pill wx">${weatherLabel(g.weather)}</span>${st}${g.money < 0 ? `<span class="cr-pill debt">${F(L('빚 {n}/3일', 'Debt {n}/3'), { n: g.debtDays })}</span>` : ''}${biz?.tail ?? ''}</div></header><div class="cr-drip"></div>`;
}
function tabsHtml() {
    const g = G();
    const t = (id, ico, ko, en, badge) => `<button type="button" class="cr-tab${view.tab === id ? ' on' : ''}" data-tab="${id}">${ico} ${L(ko, en)}${badge ? `<b class="cr-badge">${badge}</b>` : ''}</button>`;
    return `<nav class="cr-tabs">${t('shop', '🏪', '가게', 'Shop')}${t('staff', '👩‍🍳', '직원', 'Staff')}${t('inbox', '📋', '결재함', 'Inbox', g.inbox.length || '')}${t('journal', '📖', '일지', 'Log')}</nav>`;
}
// ---------- 영업 중 탭 ----------
let bizAutoPaused = false;
export function bizTabs() {
    const g = G();
    const t = (id, ico, ko, en, badge) => `<button type="button" class="cr-tab${view.bizTab === id ? ' on' : ''}" data-btab="${id}">${ico} ${L(ko, en)}${badge ? `<b class="cr-badge">${badge}</b>` : ''}</button>`;
    return `<nav class="cr-tabs cr-bizTabs">${t('biz', '☕', '영업', 'Floor')}${t('shop', '🏪', '가게', 'Shop')}${t('staff', '👩‍🍳', '직원', 'Staff')}${t('inbox', '📋', '결재함', 'Inbox', g.inbox.length || '')}${t('journal', '📖', '일지', 'Log')}</nav>`;
}
function drawOtherTab() {
    const box = inner();
    const main = box.querySelector('.cr-otherTab'); if (!main) return;
    closeSheet(); closeModal();
    const top = main.scrollTop;
    main.innerHTML = `<div class="cr-alertCard soft">⏸ ${L('다른 탭을 보는 동안 가게는 멈춰 있어요', 'The shop waits while you look at other tabs')}</div>` + tabBody(view.bizTab === 'shop' ? 'bizShop' : view.bizTab);
    main.scrollTop = top;
    box.querySelectorAll('.cr-bizTabs [data-btab]').forEach(b => b.classList.toggle('on', b.dataset.btab === view.bizTab));
    const badge = box.querySelector('.cr-bizTabs [data-btab="inbox"] .cr-badge');
    if (badge) badge.textContent = G().inbox.length || '';
}
function switchBizTab(id) {
    const box = inner();
    if (!box.querySelector('[data-biz]')) return;
    view.bizTab = id;
    const other = id !== 'biz';
    box.querySelectorAll('[data-biz]').forEach(el => el.classList.toggle('cr-hide', other));
    box.querySelector('.cr-otherTab')?.classList.toggle('cr-hide', !other);
    box.classList.toggle('cr-onOther', other);
    if (other) {
        // 다른 탭을 보는 동안은 가게를 멈춤 (사장님이 직접 멈춘 거면 그대로)
        if (businessActive() && !bizPaused()) { pauseBusiness(true, false); bizAutoPaused = true; }
        drawOtherTab();
    } else {
        box.querySelectorAll('.cr-bizTabs [data-btab]').forEach(b => b.classList.toggle('on', b.dataset.btab === 'biz'));
        if (bizAutoPaused) { bizAutoPaused = false; pauseBusiness(false); }
    }
}

function tabBody(tab = view.tab) {
    switch (tab) {
        case 'staff': return staffTab();
        case 'inbox': return inboxTab();
        case 'journal': return journalTab();
        case 'bizShop': return shopTab(true);
        default: return shopTab();
    }
}
function afterTab() {
    if (view.tab === 'shop') mountShopScene();
}

// ---------- 공통 조각 ----------
const heartRow = v => { const n = hearts(v), bad = v < 0; return `<span class="cr-hearts${bad ? ' bad' : ''}" aria-label="${L('사장 친밀도', 'Bond')} ${v}">${[0, 1, 2, 3, 4].map(i => `<i class="${i < n ? 'on' : ''}">♥</i>`).join('')}</span>`; };
const bar = (v, col) => `<span class="cr-bar"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></span>`;
const nameTag = id => { const s = staffById(id); return `<span class="cr-ntag" style="background:${colorOf(s).tag}">${esc(book(id)?.name || '?')}</span>`; };
export { heartRow, bar, nameTag };

function doingLabel(s) {
    if (s.absent) return L('결근', 'Off today');
    if ((s.fatigue ?? 0) >= 75) return L('꾸벅꾸벅', 'Dozing');
    const g = G();
    if (g.phase === 'done') return L('퇴근', 'Gone home');
    return { bake: L('오븐 앞', 'At the oven'), serve: L('계산대', 'At the counter'), floor: L('홀 정리', 'Tidying up'), all: L('이것저것', 'Everything') }[s.role] || '';
}

// ---------- 🏪 가게 탭 ----------
/** biz = 영업 중 탭에서 볼 때: 작은 장면·버튼 없이 로그·수치·직원만 */
function shopTab(biz = false) {
    const g = G();
    const w = g.staff;
    let h = biz ? `<p class="cr-muted">☕ ${L('오늘 영업에서 생긴 일은 ☕ 영업 화면의 "지금 가게 소식"에 있어요. 가게 로그에는 마감 뒤에 들어가요.', 'Today\'s happenings are in Shop news on the ☕ Floor tab. They go into the shop log after closing.')}</p>`
        : `<div class="cr-sceneHost" id="cr-shopScene"></div>`;
    // 오늘 영업 끝: 결과 카드가 먼저, 가게 로그는 그 아래
    if (g.phase !== 'done') h += shopLogHtml(g);
    // 오늘 영업 끝: 그날 운영 결과 + [다음 날 시작]
    if (g.phase === 'done') h += dayResultHtml(g) + shopLogHtml(g);
    // 수치 2×2
    const last = g.journal[0];
    h += `<section class="cr-grid2">
<div class="cr-stat"><div class="cr-statT">💰 ${L('돈', 'Money')}</div><b class="${g.money < 0 ? 'neg' : ''}">${money(g.money)}</b><small>${biz && g.phase === 'morning' ? L('재료값은 영업을 시작할 때 빠져요', 'Stock is paid when you open') : last ? F(L('어제 {d}', 'Yesterday {d}'), { d: signedMoney(last.delta?.money || 0) }) : L('첫날이에요', 'First day')}</small></div>
<div class="cr-stat"><div class="cr-statT">⭐ ${L('평판', 'Reputation')} <b>${Math.round(g.rep)}</b></div>${bar(g.rep, '#F29A7C')}<small>${g.rep < 35 ? L('손님이 뜸해요', 'Few customers') : g.rep < 65 ? L('동네에서 알아봐요', 'Known locally') : L('줄 서는 가게!', 'People line up!')}</small></div>
<div class="cr-stat"><div class="cr-statT">🍰 ${L('재료', 'Stock')} <b>${g.ing}</b></div>${bar(g.ing * 3, '#FBE29A')}<small>${g.ing < 6 ? L('곧 바닥나요', 'Running low') : L('디저트는 남으면 상해요', 'Desserts spoil if left')}</small></div>
<div class="cr-stat"><div class="cr-statT">🧼 ${L('청결', 'Clean')} <b>${Math.round(g.clean)}</b></div>${bar(g.clean, '#BFD9E8')}<small>${g.clean < 35 ? L('위생 점검이 걱정돼요', 'Inspection risk') : L('바닥 반짝반짝', 'Floors are shiny')}</small></div></section>`;
    // 오늘 출근한 직원 (한 줄씩)
    h += `<section class="cr-card"><div class="cr-ttl">👩‍🍳 ${L('오늘 출근한 직원', 'Staff today')}<small>${g.staff.length}/${MAX_STAFF}</small></div>`;
    if (!w.length) h += `<div class="cr-empty">${L('아직 직원이 없어요. 캐릭터 카드에서 데려와 주세요.', 'No staff yet. Bring someone in from your character cards.')}<button class="cr-btn" type="button" data-act="hire">${L('직원 고용', 'Hire staff')}</button></div>`;
    else h += w.map(s => {
        const body = `${faceChip(s.id, 30)}<b>${esc(book(s.id)?.name)}</b>${heartRow(bossRel(s.id))}<span class="cr-doing${s.absent ? ' off' : ''}">${doingLabel(s)}</span>`;
        // 영업 중엔 가게 탭에 작은 장면이 없어서 눌러서 찾기는 안 함
        return biz ? `<div class="cr-who">${body}</div>` : `<button type="button" class="cr-who" data-act="findStaff" data-id="${esc(s.id)}">${body}</button>`;
    }).join('');
    h += `</section>`;
    if (biz) return h;
    // 버튼
    let main;
    if (g.phase === 'ready') main = `<button class="cr-pbtn" type="button" data-act="startDay" ${w.filter(s => !s.absent).length ? '' : 'disabled'}>${L('오늘 영업 시작 ›', 'Open the shop ›')}</button>`;
    else main = `<button class="cr-pbtn" type="button" data-act="nextDay">${L('다음 날 시작 ›', 'Start the next day ›')}</button>`;
    h += `<div class="cr-actions"><button class="cr-btn" type="button" data-act="quickBuy">${L('재료 사기', 'Buy stock')}</button>${main}</div><div class="cr-cookies" aria-hidden="true"></div>`;
    return h;
}

/** 영업 끝난 날: 그날 결과 카드 (돈·손님·평판 + 가게 소식 중 굵직한 것) */
function dayResultHtml(g) {
    const t = g.today || {};
    const sum = t.closed?.summary || t.biz?.summary || {};
    const j = g.journal.find(x => x.day === g.day && x.mode === 'direct');
    const net = j?.delta?.money ?? sum.net ?? 0;
    const rep0 = t.biz?.rep0 ?? g.rep, rep1 = rep0 + (j?.delta?.rep ?? 0);
    const repD = Math.round(rep1 - rep0);
    // 사건 결과·사고 먼저, 같은 종류는 하나만, 최대 3줄
    const rank = n => (String(n.key).startsWith('res') ? 0 : n.k === 'bad' ? 1 : n.k === 'good' ? 2 : 3);
    const seen = new Set();
    const picks = (t.biz?.news || []).filter(n => !String(n.key).startsWith('ev') && n.k !== 'sleep')
        .map((n, i) => ({ ...n, i })).sort((a, b) => rank(a) - rank(b) || b.i - a.i)
        .filter(n => { const k = String(n.key).replace(/[^a-z]/gi, '').slice(0, 5); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 3).sort((a, b) => a.i - b.i);
    return `<section class="cr-card cr-dayRes"><div class="cr-ttl">🌙 ${F(L('{n}일째 영업 결과', 'Day {n} results'), { n: g.day })}<small>${L('오늘 영업 끝', 'Closed for today')}</small></div>
<b class="cr-big ${net < 0 ? 'neg' : 'pos'}">${signedMoney(net)}</b>
<div class="cr-chips"><span class="cr-chip">${L('손님', 'Guests')} <b>${sum.served ?? 0}</b></span><span class="cr-chip ${repD >= 0 ? 'good' : 'warn'}">${L('평판', 'Rep')} <b>${Math.round(rep0)} → ${Math.round(rep1)}</b> ${repD >= 0 ? '▲' : '▼'}${Math.abs(repD)}</span>${(t.closed?.discarded || sum.spoiled) ? `<span class="cr-chip warn">${L('버린 재료', 'Tossed')} <b>${(t.closed?.discarded || 0) + (sum.spoiled || 0)}</b></span>` : ''}</div>
${picks.length ? picks.map(n => `<div class="cr-nrow"><time>${esc(n.t)}</time><span class="cr-nd ${n.k}"></span><span class="cr-nt">${esc(n.text)}</span>${n.chip ? `<span class="cr-chip ${n.good ? 'up' : 'dn'}">${esc(n.chip)}</span>` : ''}</div>`).join('') : `<p class="cr-muted">${L('별일 없이 조용한 하루였어요.', 'A quiet day with nothing much going on.')}</p>`}
<p class="cr-muted">${L('준비되면 아래 [다음 날 시작]을 눌러요. 창을 닫아 두면 시간이 지나는 만큼 직원들끼리 영업해요.', 'Press [Start the next day] when ready. With the window closed, the staff keep the shop going as time passes.')}</p></section>`;
}

// ---------- 가게 로그 (가게 탭) ----------
const LOG_SHOW = 3;
const isNewChunk = c => c.at > (view.logBase ?? 0);
/** 맨 위(가장 최근) 덩어리만 펼친 채로, 지난 덩어리는 접어 둠. 사장님이 누르면 그대로 기억 */
function logOpen(g, c) { return view.logFold[c.id] ?? (c === g.shopLog?.[0]); }
function awayLen(min) { return min >= 90 ? F(L('약 {n}시간', '~{n}h'), { n: Math.round(min / 60) }) : F(L('약 {n}분', '~{n} min'), { n: min }); }
function chunkTitle(c) {
    if (c.kind === 'present') return c.stats ? F(L('사장님 있음 · {n}일째 영업', 'You were in · Day {n}'), { n: c.day }) : F(L('사장님 있음 · {n}일째', 'You were in · Day {n}'), { n: c.day });
    if (c.short) return F(L('사장님 잠깐 없음 · {t}', 'Stepped out · {t}'), { t: awayLen(c.short) });
    const d = c.days || [];
    const range = d.length > 1 ? F(L('{a}~{b}일째', 'Days {a}–{b}'), { a: d[0], b: d[d.length - 1] }) : d.length ? F(L('{a}일째', 'Day {a}'), { a: d[0] }) : '';
    const len = d.length > 1 ? F(L('직원들끼리 {n}일', 'staff ran {n} days'), { n: d.length }) : L('직원들끼리 하루', 'staff ran a day');
    return `${L('사장님 없음', 'Boss away')} · ${len}` + (range ? ` <small>${range}</small>` : '');
}
function chunkStats(c) {
    const st = c.stats; if (!st) return '';
    const box = (t, v, cls = '') => `<div class="cr-lgStat"><small>${t}</small><b class="${cls}">${v}</b></div>`;
    if (st.guests === undefined) return st.leak ? `<div class="cr-lgStats one">${box(L('새는 돈', 'Leaked'), money(st.leak), 'neg')}</div>` : '';
    return `<div class="cr-lgStats">${box(L('손님', 'Guests'), F(L('{n}명', '{n}'), { n: st.guests }))}${box(L('매출', 'Sales'), money(st.sales || 0))}${box(L('새는 돈', 'Leaked'), money(st.leak || 0), st.leak ? 'neg' : '')}</div>`;
}
function logItem(it) {
    const face = it.boss ? '<span class="cr-face boss" aria-hidden="true">👑</span>' : it.sid && staffById(it.sid) ? faceChip(it.sid, 24) : '<span class="cr-face blank"></span>';
    const cc = it.cc || (it.boss ? 'boss' : it.good ? 'up' : 'dn');
    return `<div class="cr-lgRow${it.boss ? ' boss' : ''}${it.follow ? ' follow' : ''}">${it.follow ? '<span class="cr-lgArrow" aria-hidden="true">↳</span>' : ''}<time>${esc(it.t || '')}</time>${face}<span class="cr-lgText"><span class="cr-nd ${esc(it.k || 'work')}"></span>${esc(it.text)}</span>${it.chip ? `<span class="cr-chip ${esc(cc)}">${esc(it.chip)}</span>` : ''}</div>`;
}
function shopLogHtml(g) {
    view.logBase ??= g.logSeenAt || 0;
    const f = view.logFilter;
    const all = (g.shopLog || []).filter(c => f === 'all' || c.kind === f);
    const list = all.slice(0, LOG_SHOW);
    const newN = (g.shopLog || []).filter(isNewChunk).reduce((n, c) => n + c.items.length, 0);
    const seg = (id, ko, en) => `<button type="button" class="${f === id ? 'on' : ''}" data-act="logFilter" data-id="${id}" aria-pressed="${f === id}">${L(ko, en)}</button>`;
    let h = `<section class="cr-card cr-shopLog" id="cr-shopLog"><div class="cr-ttl">📜 ${L('가게 로그', 'Shop log')}${newN ? `<span class="cr-new">${F(L('새 일 {n}건', '{n} new'), { n: newN })}</span>` : ''}<small>${L('마지막으로 본 뒤', 'Since you last looked')}</small></div>
<div class="cr-seg sm">${seg('all', '전체', 'All')}${seg('present', '있을 때', 'With you')}${seg('away', '없을 때', 'Without you')}</div>`;
    // 자리 비운 동안 일을 AI가 정리하는 중
    if (g.away?.loading && f !== 'present') h += `<div class="cr-lgChunk away"><div class="cr-lgHead"><b>${L('사장님 없음 · 직원들끼리', 'Boss away · staff on their own')}</b></div><div class="cr-muted cr-loading">${L('직원들이 그동안 있었던 일을 정리하는 중…', 'The staff are writing up what happened…')}</div></div>`;
    if (!list.length && !g.away?.loading) h += `<p class="cr-muted">${f === 'all' ? L('아직 기록이 없어요. 영업하거나 창을 닫아 두면 여기에 쌓여요.', 'Nothing yet. Run the shop or leave the window closed and things pile up here.') : L('이쪽 기록은 아직 없어요.', 'Nothing here yet.')}</p>`;
    for (const c of list) {
        const open = logOpen(g, c);
        h += `<div class="cr-lgChunk ${c.kind}${isNewChunk(c) ? ' fresh' : ''}">
<button type="button" class="cr-lgHead" data-act="logFold" data-id="${esc(c.id)}" aria-expanded="${open}"><b>${chunkTitle(c)}</b><span class="cr-muted">${open ? L('접기', 'Hide') : F(L('{n}개 · 펼치기', '{n} · Show'), { n: c.items.length })}</span></button>`;
        if (open) h += chunkStats(c) + (c.items.length ? c.items.map(logItem).join('') : `<p class="cr-muted">${L('별일 없었어요.', 'Nothing much happened.')}</p>`);
        h += `</div>`;
    }
    h += `<button class="cr-link" type="button" data-act="toJournal">${L('지난날은 일지 탭에서 ›', 'Older days are in the Log tab ›')}</button></section>`;
    if (!g.away?.loading) { g.logSeenAt = Date.now(); if (g.away) g.away.seen = true; }
    return h;
}
function redrawShopLog() {
    const el = root?.querySelector('#cr-shopLog'); if (!el) return;
    el.outerHTML = shopLogHtml(G());
}

function mountShopScene() {
    const host = root.querySelector('#cr-shopScene'); if (!host) return;
    const g = G();
    const sc = addScene(createScene(host, { size: g.size, height: 170, zoom: .78, focus: [5, 3], zoomKey: 'shop' }));
    const hr = new Date().getHours();
    const tod = g.phase === 'done' ? (hr >= 18 || hr < 6 ? 'night' : 'eve') : hr < 10 ? 'am' : hr < 17 ? 'pm' : 'eve';
    sc.setEnv({ tod, weather: g.weather });
    sc.sign(g.phase === 'done' ? 'CLOSED' : 'OPEN');
    sc.display(Math.min(6, Math.ceil(g.ing / 3)));
    const stains = [];
    for (let i = 0; i < Math.round((100 - g.clean) / 15); i++) { const [c, r] = sc.randomFree(); stains.push({ c, r, dx: Math.random() * 8 - 4 }); }
    sc.setStains(stains);
    const lay = sc.lay;
    const spotOf = s => {
        if (g.phase === 'done' || s.absent) return null;
        if ((s.fatigue ?? 0) >= 75) return lay.idle[0];
        return { bake: lay.spots.oven, serve: lay.spots.counter, floor: stains[0] ? [stains[0].c, stains[0].r] : lay.idle[1], all: lay.spots.counter }[s.role] || lay.idle[2];
    };
    const ents = [];
    for (const s of g.staff) {
        const p = spotOf(s); if (!p) continue;
        const e = sc.ent({ staffId: s.id, label: book(s.id)?.name, c: p[0], r: p[1], onTap: e => { sc.jump(e); sc.say(e, tapLine(s.id)); } });
        const icon = (s.fatigue ?? 0) >= 75 ? 'zzz' : (s.mood ?? 60) < 30 ? 'angry' : (s.mood ?? 60) < 45 ? 'sweat' : (s.mood ?? 60) > 75 ? 'note' : s.role === 'bake' ? 'spark' : s.role === 'floor' && stains.length ? 'broom' : null;
        sc.emo(e, icon);
        if (s.role === 'bake' && icon !== 'zzz') { sc.work(e, true); sc.steam(true); }
        ents.push(e);
    }
    // 한마디는 장면 말풍선으로 돌아가며
    let k = 0;
    const talk = () => { if (!ents.length) return; const e = ents[k++ % ents.length]; sc.say(e, line(e.staffId, k < ents.length ? 'greet' : ['tap1', 'tap2', 'tap3', 'chat'][k % 4]), 3200); };
    setTimeout(talk, 600);
    shopTimer = setInterval(talk, 4200);
    root.__shopScene = { sc, ents };
}

// ---------- 👩‍🍳 직원 탭 ----------
function staffTab() {
    const g = G();
    if (!g.staff.length) return `<section class="cr-card cr-empty">${L('아직 직원이 없어요.', 'No staff yet.')}<br><small class="cr-muted">${L('처음엔 3~4명까지 데려올 수 있어요.', 'You can bring in up to 3–4 people.')}</small><button class="cr-pbtn" type="button" data-act="hire">${L('직원 고용', 'Hire staff')}</button></section>`;
    view.staffIdx = clamp(view.staffIdx, 0, g.staff.length - 1);
    const s = g.staff[view.staffIdx], b = book(s.id) || {};
    const lock = bizLocked();
    let h = `<div class="cr-row cr-pager"><button type="button" class="cr-ibtn" data-act="staffPrev" aria-label="${L('이전 직원', 'Previous')}">‹</button><span>${L('직원 상세', 'Staff')} · ${view.staffIdx + 1}/${g.staff.length}</span><button type="button" class="cr-ibtn" data-act="staffNext" aria-label="${L('다음 직원', 'Next')}">›</button><span class="cr-muted" style="margin-left:auto">${F(L('고용 {a}/{b}명', 'Hired {a}/{b}'), { a: g.staff.length, b: MAX_STAFF })}</span></div>`;
    h += `<section class="cr-card cr-profile"><div class="cr-pfFace" style="${faceStyle(s.id)}"></div><div class="cr-pfInfo"><div class="cr-row"><b class="cr-pfName">${esc(b.name)}</b><button type="button" class="cr-ibtn" data-act="staffMenu" aria-label="${L('더 보기', 'More')}">…</button></div>${heartRow(bossRel(s.id))}<div class="cr-muted">${esc(b.job || '')}</div><div class="cr-tags">${(b.tags || []).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}</div><p class="cr-intro">${esc(b.intro || '')}</p></div></section>`;
    h += `<div class="cr-subtabs">${[['stats', '능력치', 'Skills'], ['manual', '설명서', 'Manual'], ['rel', '관계', 'Bonds'], ['log', '기록', 'History']].map(([id, ko, en]) => `<button type="button" class="${view.staffSub === id ? 'on' : ''}" data-act="staffSub" data-id="${id}">${L(ko, en)}</button>`).join('')}</div>`;
    h += `<section class="cr-card">${staffSub(s, b)}</section>`;
    h += `<div class="cr-actions"><button class="cr-btn" type="button" data-act="editMemo">${L('메모 편집', 'Edit note')}</button><button class="cr-pbtn" type="button" data-act="hire" ${g.staff.length >= MAX_STAFF || lock ? 'disabled' : ''}>${L('직원 고용', 'Hire staff')}</button></div>${lock ? `<p class="cr-muted cr-center">${L('고용·해고는 영업이 끝나면 할 수 있어요', 'Hiring and letting go open up after business')}</p>` : ''}`;
    return h;
}
function skillRow(s, k, label, col) {
    const lv = s[k];
    return `<div class="cr-skill"><div class="cr-row"><b>${label}</b><span class="cr-lv">Lv ${lv}</span><span class="cr-muted" style="margin-left:auto">${lv >= 10 ? 'MAX' : F(L('경험 {a}/{b}', 'EXP {a}/{b}'), { a: s.exp?.[k] || 0, b: skillNeed(lv) })}</span></div><div class="cr-ten">${[...Array(10)].map((_, i) => `<i style="${i < lv ? 'background:' + col : ''}"></i>`).join('')}</div></div>`;
}
function staffSub(s, b) {
    const g = G();
    switch (view.staffSub) {
        case 'manual': {
            const m = b.manual || {};
            const row = (ko, en, v) => v ? `<div class="cr-mrow"><b>${L(ko, en)}</b><p>${esc(v)}</p></div>` : '';
            const lv = { casual: L('반말', 'Casual (banmal)'), polite: L('존댓말', 'Polite (jondaetmal)') }[b.speechLevel];
            const voice = String(b.voice || '').split('\n').map(x => x.trim()).filter(Boolean);
            return (voice.length || lv ? `<div class="cr-mrow cr-voice"><b>🎙 ${L('말투 샘플', 'Voice samples')}${lv && isKo() ? ` <span class="cr-tag">${lv}</span>` : ''}</b>${voice.map(x => `<p class="cr-quote">“${esc(x)}”</p>`).join('')}</div>` : `<p class="cr-muted">🎙 ${L('[고치기]에서 RP 속 실제 대사를 "말투 샘플"에 넣으면 그 말투를 따라 해요.', 'Add real roleplay lines as "Voice samples" in [Edit] and they\'ll talk like that.')}</p>`) +
                row('성격', 'Personality', m.personality) + row('말투', 'Speech', m.speech) + row('가치관', 'Values', m.values) + row('행동 원칙', 'How they act', m.principles) + row('단점', 'Flaws', m.flaws) + row('사장·일을 대하는 태도', 'Attitude to boss & work', m.attitude) +
                (m.examples?.length ? `<div class="cr-mrow"><b>${L('예시 대사', 'Example lines')}</b>${m.examples.map(x => `<p class="cr-quote">“${esc(x)}”</p>`).join('')}</div>` : '') +
                linesBox(b) +
                `<div class="cr-actions"><button class="cr-btn" type="button" data-act="editManual">${L('고치기', 'Edit')}</button><button class="cr-btn" type="button" data-act="remakeLines">${L('말풍선 다시 만들기', 'Remake bubbles')}</button></div><div class="cr-actions"><button class="cr-btn" type="button" data-act="reextract">${L('카드에서 다시 뽑기', 'Re-read from card')}</button></div><p class="cr-muted">${L('다시 뽑아도 가게 기억(관계·기록)은 그대로예요.', 'Re-reading keeps shop memories (bonds, history).')}</p>`;
        }
        case 'rel': {
            const others = [{ id: 'boss' }, ...g.staff.filter(o => o.id !== s.id)];
            return others.map(o => {
                const r = o.id === 'boss' ? rel('boss', s.id) : rel(s.id, o.id);
                const face = o.id === 'boss' ? `<span class="cr-face boss">👑</span>` : faceChip(o.id, 30);
                const nm = o.id === 'boss' ? bossLabel() : book(o.id)?.name;
                return `<div class="cr-relrow">${face}<div style="flex:1"><div class="cr-row"><b>${esc(nm)}</b>${heartRow(r.v)}<span class="cr-muted">${r.v}</span></div>${r.memo ? `<p class="cr-muted">${esc(r.memo)}</p>` : ''}</div></div>`;
            }).join('') || `<p class="cr-muted">${L('아직 관계가 없어요.', 'No bonds yet.')}</p>`;
        }
        case 'log': {
            const list = g.memory[s.id] || [];
            return list.length ? list.slice(0, 30).map(m => `<div class="cr-hist"><span class="cr-pill day sm">${F(L('{n}일', 'D{n}'), { n: m.day })}</span>${esc(m.text)}</div>`).join('') : `<p class="cr-muted">${L('아직 기록이 없어요.', 'Nothing yet.')}</p>`;
        }
        default: {
            const moodT = (s.mood ?? 60) >= 70 ? L('기분 좋음', 'Happy') : (s.mood ?? 60) >= 45 ? L('그럭저럭', 'Okay') : (s.mood ?? 60) >= 25 ? L('기분 별로', 'Down') : L('화남', 'Upset');
            return skillRow(s, 'bake', L('제빵', 'Baking'), '#F29A7C') + skillRow(s, 'serve', L('접객', 'Service'), '#F7B6C6') +
                `<div class="cr-row" style="margin-top:8px;gap:6px"><span class="cr-tag">${L('기분', 'Mood')} · ${moodT}</span><span class="cr-tag">${L('피로', 'Fatigue')} ${Math.round(s.fatigue ?? 0)}</span><span class="cr-tag">${roleLabel(s.role)}</span></div>
<p class="cr-note">${L('능력이 자라도 성격은 그대로예요. 유능해도 사고는 칠 수 있어요.', 'Skills grow, personality doesn\'t. Even a pro can cause trouble.')}</p>`;
        }
    }
}

// ---------- 📋 결재함 ----------
function inboxTab() {
    const g = G();
    let h = `<div class="cr-row cr-inboxHead"><span>${L('결정 안 하면 그 일은 멈춰 있어요', 'Undecided items just wait here')}</span><b>${g.inbox.length}/${MAX_INBOX}</b></div>`;
    for (const it of g.inbox) {
        const info = inboxInfo(it);
        const say = it.line ? `<p class="cr-say">“${esc(it.line)}”</p>` : '';
        const held = bizLocked(); // 영업 중엔 보기만 (돈 계산·직원이 꼬이지 않게)
        h += `<section class="cr-card cr-ib ${info.tag}">${it.staffId && staffById(it.staffId) ? faceChip(it.staffId, 36) : '<span class="cr-face blank big">📋</span>'}<div style="flex:1"><div class="cr-row"><span class="cr-ibTag ${info.tag}">${{ idea: L('제안', 'Idea'), complaint: L('불만', 'Complaint'), money: L('돈', 'Money') }[info.tag]}</span><b>${esc(info.title)}</b></div>${say}<p class="cr-muted">${esc(info.desc)}</p><div class="cr-actions"><button class="cr-btn" type="button" data-act="ibNo" data-id="${it.id}" ${held ? 'disabled' : ''}>${esc(info.b)}</button><button class="cr-pbtn sm" type="button" data-act="ibYes" data-id="${it.id}" ${held ? 'disabled' : ''}>${esc(info.a)}</button></div>${held ? `<p class="cr-muted">${L('영업이 끝나면 정할 수 있어요', 'You can decide after business')}</p>` : ''}</div></section>`;
    }
    for (let i = g.inbox.length; i < MAX_INBOX; i++) h += `<div class="cr-slot">${L('빈 자리', 'Empty')}</div>`;
    if (g.inboxHistory.length) h += `<details class="cr-card"><summary>${L('지난 결재 기록 보기', 'Past decisions')}</summary>${g.inboxHistory.slice(0, 20).map(x => `<div class="cr-hist"><span class="cr-pill day sm">${F(L('{n}일', 'D{n}'), { n: x.day })}</span>${esc(x.title)} → <b>${x.yes ? L('승인', 'Yes') : L('거절', 'No')}</b></div>`).join('')}</details>`;
    return h;
}

// ---------- 📖 일지 ----------
function journalTab() {
    const s = S(), g = G();
    let h = `<div class="cr-seg"><button type="button" class="${view.journal === 'this' ? 'on' : ''}" data-act="jMode" data-id="this">${L('이번 가게', 'This shop')}</button><button type="button" class="${view.journal === 'past' ? 'on' : ''}" data-act="jMode" data-id="past">${L('지난 가게들', 'Past shops')} (${s.pastShops.length})</button></div>`;
    if (view.journal === 'past') {
        if (!s.pastShops.length) return h + `<p class="cr-muted cr-center">${L('아직 문 닫은 가게가 없어요.', 'No closed shops yet.')}</p>`;
        return h + s.pastShops.map(p => `<section class="cr-card cr-past"><div class="cr-ttl">🏚 ${esc(p.name)} <small>${F(L('{n}일 영업', '{n} days'), { n: p.days })}</small></div>
<div class="cr-muted">${L('최고 평판', 'Best rep')} ${p.maxRep} · ${L('가장 많이 번 날', 'Best day')} ${p.bestDay ? F(L('{d}일 {m}', 'D{d} {m}'), { d: p.bestDay.day, m: money(p.bestDay.revenue) }) : '-'}</div>
${(p.memorable || []).map(m => `<div class="cr-hist"><span class="cr-pill day sm">${F(L('{n}일', 'D{n}'), { n: m.day })}</span>${esc(m.title)}${m.text ? ' — ' + esc(m.text) : ''}</div>`).join('')}
${(p.reviews || []).map(r => `<div class="cr-hist"><b>${esc(r.name)}</b> ${esc(r.text)}</div>`).join('')}
${p.bossWords ? `<p class="cr-say">👑 “${esc(p.bossWords)}”</p>` : ''}</section>`).join('');
    }
    if (!g.journal.length) return h + `<p class="cr-muted cr-center">${L('아직 기록이 없어요. 첫 영업을 시작해 보세요!', 'Nothing yet. Open the shop for the first time!')}</p>`;
    return h + g.journal.map(j => `<section class="cr-card cr-jday ${j.mode}"><div class="cr-ttl"><span class="cr-pill day sm">${F(L('{n}일째', 'Day {n}'), { n: j.day })}</span>${j.mode === 'auto' ? (j.short ? F(L('사장님 잠깐 없음 · {t}', 'Boss stepped out · {t}'), { t: j.short >= 90 ? F(L('약 {n}시간', '~{n}h'), { n: Math.round(j.short / 60) }) : F(L('약 {n}분', '~{n} min'), { n: j.short }) }) : L('사장님 없음', 'Boss away')) : L('직접 영업', 'You ran it')}<small>${weatherLabel(j.weather)}</small></div>
${(j.events || []).map(e => `<div class="cr-hist">${e.staffId && book(e.staffId) ? nameTag(e.staffId) : ''}<b>${esc(e.title)}</b>${e.text ? ' — ' + esc(e.text) : ''}</div>`).join('') || `<p class="cr-muted">${L('조용한 하루', 'A quiet day')}</p>`}
${j.diaries && Object.keys(j.diaries).length ? Object.entries(j.diaries).map(([id, d]) => `<div class="cr-hist">${book(id) ? nameTag(id) : ''}<i>“${esc(d)}”</i></div>`).join('') : ''}
<div class="cr-jsum">${L('돈', 'Money')} ${signedMoney(j.delta?.money || 0)} · ${L('평판', 'Rep')} ${(j.delta?.rep || 0) >= 0 ? '+' : ''}${j.delta?.rep || 0} · ${L('경험', 'EXP')} +${j.delta?.exp || 0}</div></section>`).join('');
}

// ---------- 시트·모달·알림 ----------
export function openSheet(html, lock = false) {
    const sh = root.querySelector('.cr-sheet');
    sh.innerHTML = `<div class="cr-grab"></div>${html}`;
    sh.classList.toggle('lock', lock);
    sh.classList.add('open'); root.querySelector('.cr-dim').classList.add('on');
}
export function closeSheet() {
    if (!root) return;
    endTyping();
    root.querySelector('.cr-sheet').classList.remove('open', 'lock');
    if (!root.querySelector('.cr-modal').classList.contains('open')) root.querySelector('.cr-dim').classList.remove('on');
}
export function openModal(html, kind = '') {
    const m = root.querySelector('.cr-modal');
    m.innerHTML = html; m.dataset.kind = kind; m.classList.add('open'); root.querySelector('.cr-dim').classList.add('on');
    return m;
}
export function closeModal() {
    if (!root) return;
    endTyping();
    const m = root.querySelector('.cr-modal');
    const kind = m.classList.contains('open') ? m.dataset.kind : '';
    m.classList.remove('open'); m.dataset.kind = '';
    if (!root.querySelector('.cr-sheet').classList.contains('open')) root.querySelector('.cr-dim').classList.remove('on');
    if (kind === 'boss' && (!S().bossNameAsked || !G()?.nameAsked)) { S().bossNameAsked = true; if (G()) G().nameAsked = true; save(); }
    if (kind === 'settings' && settingsPausedBiz) { settingsPausedBiz = false; pauseBusiness(false); }
    if ((kind === 'settings' || kind === 'boss') && pendingRender) { pendingRender = false; render(); }
}

// ---------- ⚙ 설정 (창 안) ----------
let pendingRender = false, settingsPausedBiz = false;
const keepModal = () => { const m = root?.querySelector('.cr-modal'); return !!m && m.classList.contains('open') && ['settings', 'boss'].includes(m.dataset.kind); };
/** 설정·이름 창이 떠 있으면 닫힐 때 다시 그리고, 아니면 바로 다시 그림 */
export function softRender() { if (keepModal()) { pendingRender = true; return; } render(); }

function settingsBody() {
    return `<div class="cr-mtitle">⚙ ${L('설정', 'Settings')}<small>${L('확장 설정 칸과 같은 설정이에요. 한쪽에서 바꾸면 다른 쪽도 바뀌어요.', 'Same as the extension settings panel. Changing one updates the other.')}</small></div>
<div class="cr-sBox">${fieldsHtml('game')}</div>
<div class="cr-actions"><button class="cr-pbtn sm" type="button" data-act="modalClose">${L('닫기', 'Close')}</button></div>`;
}
function openSettings() {
    const m = openModal(settingsBody(), 'settings');
    bindFields(m.querySelector('.cr-sBox'), 'game');
    // 영업 중이면 설정 보는 동안 가게를 멈춤
    if (businessActive() && !bizPaused()) { pauseBusiness(true, false); settingsPausedBiz = true; }
}
function redrawSettingsModal() {
    const m = root?.querySelector('.cr-modal');
    if (!m || !m.classList.contains('open') || m.dataset.kind !== 'settings') return;
    const top = m.scrollTop;
    m.innerHTML = settingsBody();
    bindFields(m.querySelector('.cr-sBox'), 'game');
    m.scrollTop = top;
}

onSettings((key, scope) => {
    if (!root || !view.open) return;
    if (key === 'winSize') applyWinSize();
    // 확장 설정 칸에서 바꿨거나 언어가 바뀌면 창 안 설정도 다시 그림
    if (scope !== 'game' || key === 'lang') redrawSettingsModal();
    if (key === 'shopName') { refreshShopName(); return; }
    if (!['lang', 'bossName', 'winSize'].includes(key)) return;
    if (businessActive()) { if (key !== 'winSize') toast(L('영업이 끝나면 화면에 반영돼요', 'Shows up after today\'s business')); return; }
    softRender();
});

/** 가게 이름이 바뀌면 영업 중이어도 그 자리에서 바로: 머리의 이름 줄 + 장면 간판만 갈아 끼움 */
function shopNameRowHtml(nm) {
    return `<b class="${nm ? '' : 'none'}">${esc(nm || L('이름 없는 가게', 'Unnamed shop'))}</b><button class="cr-nameBtn" type="button" data-act="renameShop">${nm ? L('이름 바꾸기', 'Rename') : L('이름 짓기', 'Name it')}</button>`;
}
function refreshShopName() {
    const g = G(); if (!g || !root) return;
    const nm = shopName(g);
    root.querySelectorAll('.cr-shopName').forEach(el => { el.innerHTML = shopNameRowHtml(nm); });
    scenes.forEach(sc => { try { sc.shopSign?.(nm); } catch { /* */ } });
}

// ---------- 👑 사장 이름 정하기 (처음 한 번) ----------
export function askBossName() {
    const s = S(), g = G(), pn = personaName();
    const askBoss = !s.bossNameAsked, askShop = !g.nameAsked;
    const m = openModal(`<div class="cr-mtitle">${askBoss ? '👑' : '🏪'} ${askBoss ? L('사장님 이름을 정해 주세요', 'What should your staff call you?') : L('가게 이름을 정해 주세요', 'Name your shop')}<small>${L('나중에 ⚙ 설정에서 바꿀 수 있어요.', 'You can change this later in ⚙ Settings.')}</small></div>
${askBoss ? `<label class="cr-field">${L('사장 이름', 'Owner name')}<input class="cr-input" data-n="boss" type="text" maxlength="30" value="${esc(s.bossName || pn)}" placeholder="${esc(L('사장 이름', 'Owner name'))}"></label>
${pn ? `<p class="cr-muted">${F(L('비워 두면 페르소나 이름({n})을 써요.', 'Leave blank to use your persona name ({n}).'), { n: esc(pn) })}</p>` : ''}` : ''}
${askShop ? `<label class="cr-field">${L('가게 이름', 'Shop name')}<input class="cr-input" data-n="shop" type="text" maxlength="24" value="${esc(shopName(g))}" placeholder="${esc(L('예: 말랑 제과점', 'e.g. Little Crumb Bakery'))}"></label>
<p class="cr-muted">${L('직원들이 가게 이름을 부를 수 있어요.', 'Your staff may call the shop by name.')}</p>` : ''}
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('나중에', 'Later')}</button><button class="cr-pbtn sm" type="button" data-act="bossOk">${L('정했어요', 'Done')}</button></div>`, 'boss');
    const ok = () => {
        const b = m.querySelector('[data-n="boss"]'), sh = m.querySelector('[data-n="shop"]');
        if (b) setBossName(b.value, 'game');
        if (sh) setShopName(sh.value, 'game');
        closeModal();
    };
    m.querySelector('[data-act="bossOk"]').onclick = e => { e.stopPropagation(); ok(); };
    m.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
    autoFocus(m.querySelector('input'));
}
function askShopName() {
    const g = G();
    const m = openModal(`<div class="cr-mtitle">🏪 ${L('가게 이름', 'Shop name')}<small>${L('직원들이 가게 이름을 부를 수 있어요.', 'Your staff may call the shop by name.')}</small></div>
<input class="cr-input" type="text" maxlength="24" value="${esc(shopName(g))}" placeholder="${esc(L('예: 말랑 제과점', 'e.g. Little Crumb Bakery'))}" aria-label="${esc(L('가게 이름', 'Shop name'))}">
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="shopOk">${L('바꾸기', 'Save')}</button></div>`, 'boss');
    const inp = m.querySelector('input');
    const ok = () => { setShopName(inp.value, 'game'); closeModal(); };
    m.querySelector('[data-act="shopOk"]').onclick = e => { e.stopPropagation(); ok(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    autoFocus(inp);
}
let toastT = null;
export function toast(t, ms = 2600) {
    const el = root?.querySelector('.cr-toast'); if (!el) return;
    el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms);
}
export function confirmBox(text, yes, no = L('취소', 'Cancel')) {
    return new Promise(res => {
        const m = openModal(`<p class="cr-mtext">${esc(text)}</p><div class="cr-actions"><button class="cr-btn" type="button" data-r="0">${esc(no)}</button><button class="cr-pbtn sm" type="button" data-r="1">${esc(yes)}</button></div>`);
        m.querySelectorAll('[data-r]').forEach(b => b.onclick = e => { e.stopPropagation(); closeModal(); res(b.dataset.r === '1'); });
    });
}

// ---------- 고용 ----------
function hirePicker() {
    const g = G();
    const chars = (ctx().characters || []).filter(c => c && c.avatar && c.name);
    const hired = new Set(g.staff.map(s => s.id));
    const m = openModal(`<div class="cr-mtitle">${L('직원 고용', 'Hire staff')}<small>${L('내 캐릭터 카드에서 골라요', 'Pick from your character cards')}</small></div>
<input class="cr-input" type="search" placeholder="${L('이름 검색', 'Search name')}" aria-label="${L('이름 검색', 'Search name')}">
<div class="cr-pick"></div><div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('닫기', 'Close')}</button></div>`);
    const list = m.querySelector('.cr-pick');
    const draw = q => {
        const f = chars.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 80);
        list.innerHTML = f.map(c => `<button type="button" class="cr-pickItem" data-av="${esc(c.avatar)}" ${hired.has(c.avatar) ? 'disabled' : ''}><img loading="lazy" src="/thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}" alt=""><span>${esc(c.name)}</span>${hired.has(c.avatar) ? `<small>${L('근무 중', 'Hired')}</small>` : ''}</button>`).join('') || `<p class="cr-muted">${L('캐릭터가 없어요.', 'No characters.')}</p>`;
    };
    draw('');
    m.querySelector('.cr-input').oninput = e => draw(e.target.value);
    list.onclick = e => { const b = e.target.closest('.cr-pickItem'); if (b && !b.disabled) hireFlow(b.dataset.av); };
}

async function hireFlow(avatar) {
    const ch = (ctx().characters || []).find(c => c.avatar === avatar);
    if (!ch) return;
    openModal(`<div class="cr-mtitle">${esc(ch.name)}</div><div class="cr-loading big">${L('카드를 읽고 직원 설명서를 만드는 중…', 'Reading the card and writing the staff manual…')}</div>`);
    const s = S();
    let made = s.staffBook[avatar]?.manual ? s.staffBook[avatar] : null;
    if (!made) {
        const r = await makeManual(avatar);
        if (!r) { openModal(`<p class="cr-mtext">${L('AI 응답을 받지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.', 'Could not get an AI response. Check your connection and try again.')}</p><div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('닫기', 'Close')}</button><button class="cr-pbtn sm" type="button" data-act="hireRetry" data-id="${esc(avatar)}">${L('다시 시도', 'Retry')}</button></div>`); return; }
        made = { avatar, name: ch.name, face: s.staffBook[avatar]?.face || { z: 2, x: 50, y: 14 }, ...r, baseBake: r.bake, baseServe: r.serve };
    }
    pointsModal(avatar, ch.name, made);
}

function pointsModal(avatar, name, made) {
    const pts = { bake: 0, serve: 0 };
    const draw = () => {
        const left = 3 - pts.bake - pts.serve;
        const row = (k, ko, en) => `<div class="cr-row cr-ptRow"><b>${L(ko, en)}</b><span class="cr-lv">Lv ${made['base' + (k === 'bake' ? 'Bake' : 'Serve')] + pts[k]}</span><span class="cr-stp" style="margin-left:auto"><button type="button" data-pt="${k}" data-d="-1" aria-label="-">−</button><button type="button" data-pt="${k}" data-d="1" aria-label="+" ${left <= 0 ? 'disabled' : ''}>+</button></span></div>`;
        const m = openModal(`<div class="cr-mtitle">${esc(name)}<small>${esc(made.job || '')}</small></div>
<div class="cr-tags">${(made.tags || []).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}</div>
<p class="cr-intro">${esc(made.intro || '')}</p>
<div class="cr-card flat">${row('bake', '제빵', 'Baking')}${row('serve', '접객', 'Service')}<p class="cr-muted">${F(L('사장님 포인트 {n}개 남음 · 시작 능력은 카드의 직업·경력으로 정했어요', '{n} boss points left · starting skills come from the card\'s job/experience'), { n: left })}</p></div>
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="hireOk">${L('고용하기', 'Hire')}</button></div>`);
        m.querySelectorAll('[data-pt]').forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.pt, d = +b.dataset.d; if (pts[k] + d < 0 || (d > 0 && left <= 0) || made['base' + (k === 'bake' ? 'Bake' : 'Serve')] + pts[k] + d > 10) return; pts[k] += d; draw(); });
        m.querySelector('[data-act="hireOk"]').onclick = e => { e.stopPropagation(); doHire(avatar, made, pts); };
    };
    draw();
}

function doHire(avatar, made, pts) {
    const s = S(), g = G();
    if (g.staff.length >= MAX_STAFF) return;
    const { bake, serve, baseBake, baseServe, ...bk } = made;
    s.staffBook[avatar] = { ...bk, avatar, baseBake: baseBake ?? bake, baseServe: baseServe ?? serve };
    g.staff.push({ id: avatar, avatar, color: nextColor(), bake: clamp((baseBake ?? bake) + pts.bake, 1, 10), serve: clamp((baseServe ?? serve) + pts.serve, 1, 10), exp: { bake: 0, serve: 0 }, mood: 65, fatigue: 20, hiredDay: g.day, role: 'floor', absent: false });
    rel('boss', avatar);
    assignRoles(g);
    logBoss(g, F(L('사장님이 {n} 님을 고용했어요', 'You hired {n}'), { n: made.name }));
    save();
    closeModal();
    view.tab = 'staff'; view.staffIdx = g.staff.length - 1; view.staffSub = 'stats';
    render();
    toast(F(L('{n} 님이 출근했어요!', '{n} joined the shop!'), { n: made.name }));
    faceModal(avatar, true);
}

// ---------- 얼굴 위치 맞추기 ----------
function faceModal(id, first = false) {
    const b = book(id); if (!b) return;
    const f = { ...(b.face || { z: 2, x: 50, y: 14 }) };
    const m = openModal(`<div class="cr-mtitle">${L('얼굴 위치 맞추기', 'Adjust face')}<small>${first ? L('카드 그림에서 얼굴이 잘 보이게 맞춰 주세요', 'Frame the face from the card art') : ''}</small></div>
<div class="cr-facePrev"><div class="cr-faceBig"></div><div class="cr-faceSmall"></div></div>
<p class="cr-muted cr-center">${L('동그라미 안을 끌어서 옮길 수 있어요', 'Drag inside the circle to move')}</p>
<label class="cr-range">${L('확대', 'Zoom')}<input type="range" min="100" max="400" step="5" data-k="z"></label>
<label class="cr-range">${L('좌우', 'Left/right')}<input type="range" min="0" max="100" data-k="x"></label>
<label class="cr-range">${L('위아래', 'Up/down')}<input type="range" min="0" max="100" data-k="y"></label>
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="faceOk">${L('저장', 'Save')}</button></div>`);
    const big = m.querySelector('.cr-faceBig'), small = m.querySelector('.cr-faceSmall');
    const url = avatarUrl(b.avatar);
    const upd = () => {
        const st = `background-image:url('${url}');background-size:${Math.round(100 * f.z)}% auto;background-position:${f.x}% ${f.y}%;background-color:${colorOf(staffById(id)).tag}`;
        big.style.cssText = st; small.style.cssText = st;
        m.querySelector('[data-k=z]').value = Math.round(f.z * 100); m.querySelector('[data-k=x]').value = f.x; m.querySelector('[data-k=y]').value = f.y;
    };
    upd();
    m.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => { f[i.dataset.k] = i.dataset.k === 'z' ? +i.value / 100 : +i.value; upd(); });
    let drag = null;
    big.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y }; big.setPointerCapture(e.pointerId); });
    big.addEventListener('pointermove', e => { if (!drag) return; const k = 100 / (big.clientWidth * Math.max(.2, f.z - 1 + .3)); f.x = clamp(drag.fx - (e.clientX - drag.x) * k, 0, 100); f.y = clamp(drag.fy - (e.clientY - drag.y) * k, 0, 100); upd(); });
    big.addEventListener('pointerup', () => { drag = null; });
    m.querySelector('[data-act="faceOk"]').onclick = e => { e.stopPropagation(); b.face = { z: f.z, x: Math.round(f.x), y: Math.round(f.y) }; save(); closeModal(); render(); };
}

function staffMenu() {
    const g = G(); const s = g.staff[view.staffIdx];
    const m = openModal(`<div class="cr-mtitle">${esc(book(s.id)?.name)}</div><div class="cr-menuList">
<button type="button" class="cr-btn" data-m="face">${L('얼굴 위치 맞추기', 'Adjust face')}</button>
<button type="button" class="cr-btn" data-m="mini" disabled title="${L('4단계에서 추가될 예정', 'Coming later')}">${L('미니 모습 (준비 중)', 'Mini sprite (coming later)')}</button>
<button type="button" class="cr-btn danger" data-m="fire" ${bizLocked() ? 'disabled' : ''}>${L('해고', 'Let go')}${bizLocked() ? ` <small>· ${L('영업 끝나고', 'after business')}</small>` : ''}</button>
<button type="button" class="cr-btn" data-act="modalClose">${L('닫기', 'Close')}</button></div>`);
    m.querySelector('[data-m=face]').onclick = e => { e.stopPropagation(); faceModal(s.id); };
    m.querySelector('[data-m=fire]').onclick = async e => {
        e.stopPropagation();
        if (bizLocked()) return;
        if (await confirmBox(F(L('{n} 님을 해고할까요? 가게 기억은 남아요.', 'Let {n} go? Their shop memories stay.'), { n: book(s.id)?.name }), L('해고', 'Let go'))) { fireStaff(s.id); view.staffIdx = 0; render(); }
    };
}

function lineKeyLabel(k) {
    return {
        greet: L('출근 인사', 'Morning hello'), pricy: L('가격이 비쌀 때', 'Prices high'), cheap: L('가격이 쌀 때', 'Prices low'),
        buyMore: L('재료를 많이 샀을 때', 'Bought lots'), buyLess: L('재료를 적게 샀을 때', 'Bought little'), busy: L('손님 많을 때', 'Busy'),
        soldout: L('다 팔렸을 때', 'Sold out'), mistake: L('실수했을 때', 'Mistake'), sneak: L('몰래 먹다 걸렸을 때', 'Caught snacking'),
        chat: L('손님과 수다', 'Chatting'), clean: L('청소할 때', 'Cleaning'), tired: L('피곤할 때', 'Tired'),
        thanks: L('팔고 나서 인사', 'After a sale'), freebie: L('몰래 덤 줄 때', 'Slipping a freebie'), rescue: L('동료 실수 막을 때', 'Saving a coworker'),
        tap1: L('눌렀을 때 1', 'Tapped 1'), tap2: L('눌렀을 때 2', 'Tapped 2'), tap3: L('눌렀을 때 3', 'Tapped 3'),
        xSneak: L('몰래 먹다 사장님께 걸림', 'Caught snacking by you'), xFree: L('덤 주다 걸림', 'Caught giving freebies'), xChat: L('수다 떨다 걸림', 'Caught chatting'), xDoze: L('졸다 걸림', 'Caught dozing'),
        rObey: L('지시 · 따를 때', 'Order · going along'), rDelay: L('지시 · 미룰 때', 'Order · stalling'), rRefuse: L('지시 · 안 들을 때', 'Order · refusing'), rTwist: L('지시 · 엉뚱하게 알아들을 때', 'Order · own way'),
    }[k] || k;
}

function linesBox(b) {
    const ln = b.lines || {};
    if (!Object.keys(ln).length) return `<p class="cr-muted">${L('기본 말풍선이 아직 없어요. [말풍선 다시 만들기]를 누르면 이 직원 말투로 만들어져요.', 'No fallback bubbles yet. [Remake bubbles] makes them in this character\'s voice.')}</p>`;
    return `<details class="cr-card flat cr-linesBox"><summary><b>${L('기본 말풍선', 'Fallback bubbles')}</b> <small class="cr-muted">${L('AI가 응답하지 않을 때 장면에서 써요', 'Used in the scene when the AI doesn\'t answer')}</small></summary>${FALLBACK_KEYS.filter(k => ln[k]).map(k => `<div class="cr-lineRow"><span class="cr-muted">${esc(lineKeyLabel(k))}</span><span>“${esc(ln[k])}”</span></div>`).join('')}</details>`;
}

function editManual() {
    const g = G(); const s = g.staff[view.staffIdx]; const b = book(s.id); const mn = b.manual || {};
    const tags = [...(b.tags || [])];
    const fields = [['personality', '성격', 'Personality'], ['speech', '말투', 'Speech'], ['values', '가치관', 'Values'], ['principles', '행동 원칙', 'How they act'], ['flaws', '단점', 'Flaws'], ['attitude', '사장·일을 대하는 태도', 'Attitude to boss & work']];
    const m = openModal(`<div class="cr-mtitle">${L('설명서 고치기', 'Edit manual')}</div>
<label class="cr-field">🎙 ${L('말투 샘플 (줄마다 하나)', 'Voice samples (one per line)')}<textarea class="cr-input" data-f="voice" rows="5" maxlength="1500" placeholder="${esc(L('RP에서 이 캐릭터가 실제로 한 대사를 붙여 넣어 주세요. 영어 대사도 괜찮아요.', 'Paste lines this character actually said in your roleplay. Any language is fine.'))}">${esc(b.voice || '')}</textarea></label>
<div class="cr-row" style="flex-wrap:wrap"><button type="button" class="cr-btn sm" data-x="cardEx">${L('카드 예시 대화에서 가져오기', 'Take from card examples')}</button><small class="cr-muted">${L('가져온 뒤 어색한 줄은 지워 주세요', 'Delete any odd lines after')}</small></div>
<small class="cr-muted">${L('AI가 이 샘플을 가장 먼저 따라요. 다른 언어로 적어도 말투의 느낌만 살려서 옮겨요.', 'The AI follows these first. Other languages are fine — the feel is carried over, not word-for-word.')}</small>
<label class="cr-field">${L('한국어 말 높이', 'Korean speech level')}<select class="cr-input" data-f="speechLevel">${[['auto', L('알아서 (샘플·설명서대로)', 'Auto (from samples/manual)')], ['casual', L('반말', 'Casual (banmal)')], ['polite', L('존댓말', 'Polite (jondaetmal)')]].map(([v, t]) => `<option value="${v}" ${(b.speechLevel || 'auto') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
<small class="cr-muted">${L('한국어로 할 때만 써요.', 'Only used when playing in Korean.')}</small>
<label class="cr-field">${L('직업', 'Job')}<input class="cr-input" data-f="job" value="${esc(b.job || '')}"></label>
<label class="cr-field">${L('소개', 'Intro')}<textarea class="cr-input" data-f="intro" rows="2">${esc(b.intro || '')}</textarea></label>
${fields.map(([k, ko, en]) => `<label class="cr-field">${L(ko, en)}<textarea class="cr-input" data-m="${k}" rows="3">${esc(mn[k] || '')}</textarea></label>`).join('')}
<label class="cr-field">${L('예시 대사 (줄마다 하나)', 'Example lines (one per line)')}<textarea class="cr-input" data-m="examples" rows="3">${esc((mn.examples || []).join('\n'))}</textarea></label>
<div class="cr-field">${L('성격 태그 (1~3개)', 'Personality tags (1–3)')}<div class="cr-tags cr-tagPick">${Object.keys(TAGS).map(t => `<button type="button" class="cr-tag${tags.includes(t) ? ' on' : ''}" data-tag="${t}" aria-pressed="${tags.includes(t)}">${esc(tagLabel(t))}</button>`).join('')}</div><small class="cr-muted">${L('태그는 오늘 일어날 사건과 가게 안에서 돌아다니는 모습에만 쓰여요. 대사는 설명서를 따라요.', 'Tags only pick events and how they move around the shop. Lines follow the manual.')}</small></div>
${b.lines && Object.keys(b.lines).length ? `<label class="cr-field">${L('기본 말풍선 (AI가 응답하지 않을 때)', 'Fallback bubbles (when the AI doesn\'t answer)')}${FALLBACK_KEYS.map(k => `<span class="cr-lineEdit"><small class="cr-muted">${esc(lineKeyLabel(k))}</small><input class="cr-input" data-l="${k}" maxlength="100" value="${esc(b.lines[k] || '')}" placeholder="${esc(L('비우면 공통 대사', 'Blank = common line'))}"></span>`).join('')}</label>` : ''}
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="manualOk">${L('저장', 'Save')}</button></div>`);
    m.querySelector('[data-x="cardEx"]').onclick = e => {
        e.stopPropagation();
        const got = cardExampleLines(b.avatar || s.id);
        if (!got.length) { toast(L('카드에 가져올 예시 대화가 없어요', 'No example dialogue found on the card')); return; }
        const ta = m.querySelector('[data-f=voice]');
        const have = new Set(ta.value.split('\n').map(x => x.trim()).filter(Boolean));
        const add = got.filter(x => !have.has(x));
        ta.value = [...have, ...add].join('\n').slice(0, 1500);
        toast(F(L('{n}줄 가져왔어요', 'Added {n} lines'), { n: add.length }));
    };
    m.querySelectorAll('[data-tag]').forEach(btn => btn.onclick = e => {
        e.stopPropagation();
        const t = btn.dataset.tag, i = tags.indexOf(t);
        if (i >= 0) { if (tags.length <= 1) return toast(L('태그는 1개 이상 있어야 해요', 'Keep at least one tag')); tags.splice(i, 1); }
        else { if (tags.length >= 3) return toast(L('태그는 3개까지예요', 'Up to 3 tags')); tags.push(t); }
        btn.classList.toggle('on', tags.includes(t)); btn.setAttribute('aria-pressed', tags.includes(t));
    });
    m.querySelector('[data-act=manualOk]').onclick = e => {
        e.stopPropagation();
        b.tags = [...tags];
        if (b.lines) m.querySelectorAll('[data-l]').forEach(i => { const v = i.value.trim().slice(0, 60); if (v) b.lines[i.dataset.l] = v; else delete b.lines[i.dataset.l]; });
        b.job = m.querySelector('[data-f=job]').value.trim(); b.intro = m.querySelector('[data-f=intro]').value.trim();
        b.voice = m.querySelector('[data-f=voice]').value.split('\n').map(x => x.trimEnd()).filter(x => x.trim()).join('\n').slice(0, 1500);
        b.speechLevel = m.querySelector('[data-f=speechLevel]').value;
        b.manual ??= {};
        m.querySelectorAll('[data-m]').forEach(t => { b.manual[t.dataset.m] = t.dataset.m === 'examples' ? t.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6) : t.value.trim(); });
        save(); closeModal(); render();
        if (b.voice) toast(L('[말풍선 다시 만들기]를 누르면 기본 말풍선도 이 말투로 바뀌어요', 'Tap [Remake bubbles] to redo the fallback bubbles in this voice'), 3600);
    };
}

async function remakeLinesFlow() {
    const g = G(); const s = g.staff[view.staffIdx]; const b = book(s.id);
    if (!await confirmBox(L('설명서와 말투 샘플로 기본 말풍선 26줄을 새로 만들까요? AI를 한 번 불러요. 직접 고친 말풍선은 바뀌어요.', 'Rewrite the 26 fallback bubbles from the manual and voice samples? This calls the AI once. Your hand-edited bubbles will be replaced.'), L('다시 만들기', 'Remake'))) return;
    openModal(`<div class="cr-loading big">${L('말투를 맞추는 중…', 'Matching their voice…')}</div>`);
    const r = await remakeLines(s.id);
    if (!r) { closeModal(); toast(L('AI 응답을 받지 못했어요', 'No AI response')); return; }
    b.lines = r.lines; b.linesLang = r.linesLang;
    save(); closeModal(); render(); toast(L('기본 말풍선을 새로 만들었어요', 'Fallback bubbles remade'));
}

async function reextract() {
    const g = G(); const s = g.staff[view.staffIdx]; const b = book(s.id);
    if (!await confirmBox(L('카드를 다시 읽어 설명서를 새로 만들까요? 직접 고친 내용은 사라지고, 가게 기억은 그대로예요.', 'Re-read the card and rewrite the manual? Your edits will be replaced; shop memories stay.'), L('다시 뽑기', 'Re-read'))) return;
    openModal(`<div class="cr-loading big">${L('카드를 다시 읽는 중…', 'Re-reading the card…')}</div>`);
    const r = await makeManual(s.id);
    if (!r) { closeModal(); toast(L('AI 응답을 받지 못했어요', 'No AI response')); return; }
    Object.assign(b, { job: r.job, intro: r.intro, manual: r.manual, tags: r.tags, lines: r.lines, linesLang: r.linesLang, name: (ctx().characters || []).find(c => c.avatar === s.id)?.name || b.name });
    save(); closeModal(); render(); toast(L('설명서를 새로 뽑았어요', 'Manual updated'));
}

function editMemo() {
    const g = G(); const s = g.staff[view.staffIdx]; const r = rel('boss', s.id);
    const m = openModal(`<div class="cr-mtitle">${L('사장님과의 한 줄 메모', 'One-line note with the boss')}</div><input class="cr-input" maxlength="80" value="${esc(r.memo || '')}"><div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="memoOk">${L('저장', 'Save')}</button></div>`);
    m.querySelector('[data-act=memoOk]').onclick = e => { e.stopPropagation(); r.memo = m.querySelector('input').value.trim().slice(0, 80); save(); closeModal(); render(); };
}

function quickBuy() {
    const g = G(); let n = 5;
    const draw = () => {
        const m = openModal(`<div class="cr-mtitle">🍰 ${L('재료 사기', 'Buy stock')}<small>${F(L('지금 재고 {a} · 개당 {p}', 'In stock {a} · {p} each'), { a: g.ing, p: money(ING_PRICE) })}</small></div>
<div class="cr-row"><span class="cr-stp"><button type="button" data-d="-5" aria-label="-">−</button><b>${n}</b><button type="button" data-d="5" aria-label="+">+</button></span><span style="margin-left:auto">${L('총', 'Total')} <b>${money(n * ING_PRICE)}</b></span></div>
<p class="cr-muted">${L('디저트 재료는 밤마다 일부 상해요. 영업 날 아침에 사는 게 좋아요.', 'Some stock spoils every night. Buying on the morning of a business day is best.')}</p>
<div class="cr-actions"><button class="cr-btn" type="button" data-act="modalClose">${L('취소', 'Cancel')}</button><button class="cr-pbtn sm" type="button" data-act="buyOk">${L('사기', 'Buy')}</button></div>`);
        m.querySelectorAll('[data-d]').forEach(b => b.onclick = e => { e.stopPropagation(); n = clamp(n + +b.dataset.d, 0, 40); draw(); });
        m.querySelector('[data-act=buyOk]').onclick = e => { e.stopPropagation(); g.ing += n; g.money -= n * ING_PRICE; save(); closeModal(); render(); toast(F(L('재료 {n}개를 샀어요', 'Bought {n} stock'), { n })); };
    };
    draw();
}

// ---------- 클릭 ----------
async function onClick(e) {
    const t = e.target.closest('[data-act],[data-tab],[data-btab]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) { view.tab = t.dataset.tab; render(); return; }
    if (t.dataset.btab) { switchBizTab(t.dataset.btab); return; }
    const g = G();
    const a = t.dataset.act;
    switch (a) {
        case 'close': closeWindow(); break;
        case 'settings': openSettings(); break;
        case 'modalClose': closeModal(); break;
        case 'toJournal': view.tab = 'journal'; view.journal = 'this'; render(); break;
        case 'renameShop': askShopName(); break;
        case 'logFilter': view.logFilter = t.dataset.id; redrawShopLog(); break;
        case 'logFold': { const c = g.shopLog?.find(x => x.id === t.dataset.id); if (c) view.logFold[c.id] = !logOpen(g, c); redrawShopLog(); break; }
        case 'hire': if (g.staff.length < MAX_STAFF && !bizLocked()) hirePicker(); break;
        case 'hireRetry': hireFlow(t.dataset.id); break;
        case 'staffPrev': view.staffIdx = (view.staffIdx - 1 + g.staff.length) % g.staff.length; render(); break;
        case 'staffNext': view.staffIdx = (view.staffIdx + 1) % g.staff.length; render(); break;
        case 'staffSub': view.staffSub = t.dataset.id; render(); break;
        case 'staffMenu': staffMenu(); break;
        case 'editManual': editManual(); break;
        case 'reextract': reextract(); break;
        case 'remakeLines': remakeLinesFlow(); break;
        case 'editMemo': editMemo(); break;
        case 'jMode': view.journal = t.dataset.id; render(); break;
        case 'quickBuy': quickBuy(); break;
        case 'nextDay': nextDayNow(); render(); break;
        case 'ibYes': case 'ibNo': {
            if (bizLocked()) break; const note = decideInbox(t.dataset.id, a === 'ibYes'); render(); if (note) toast(note); break; }
        case 'findStaff': {
            const ss = root.__shopScene; if (!ss) break;
            const ent = ss.ents.find(x => x.staffId === t.dataset.id);
            if (ent) { ss.sc.focus(ent, 1.4); ss.sc.say(ent, tapLine(ent.staffId), 2600); ss.sc.jump(ent); }
            else toast(L('오늘은 가게에 없어요', 'Not in the shop today'));
            break;
        }
        case 'startDay': {
            if (g.phase !== 'ready') break;
            g.phase = 'morning'; save(); render(); break;
        }
    }
}

// 다른 파일에서 쓰는 것
export { hasTag, kindTitle, dayKey, newGame, isKo, menuInfo, ICON };
