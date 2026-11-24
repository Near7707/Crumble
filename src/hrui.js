// 0.3.0 가게 대책 화면: 대책 거는 창(아래 시트) + 가게 탭 "가게 대책 n/3" 칸
import { esc } from './util.js';
import { L, F, money } from './i18n.js';
import { G, save, book, staffById, bossRel } from './state.js';
import { tagLabel, roleLabel } from './rules.js';
import { REACT, moodLabel } from './orders.js';
import { faceChip, bossFace } from './looks.js';
import { line } from './lines.js';
import { heartRow, openSheet, closeSheet, toast, redrawShopLog } from './ui.js';
import {
    HR, HR_ACC, MAX_RULES, rulesOf, slotsUsed, ruleFor, warnFor, ruleName, proneAccs, setRule, startText,
    outcomeOf, fading, daysLeft, removeRule, ackRule, extendRule, reactLabel,
} from './houserules.js';

// 지금 열린 대책 창 { sid, acc, onSet, onClose, onCancel, view: 'pick'|'done', res }
let cur = null;
const nm = id => book(id)?.name || '';
const len = d => (d.days == null ? L('바꿀 때까지', 'Until you change it') : F(L('{n}일', '{n} day{s}'), { n: d.days, s: d.days > 1 ? 's' : '' }));
const costTxt = d => (d.cost ? F(L('하루 {m}', '{m}/day'), { m: money(d.cost) }) : '');

function whoHtml(sid) {
    const st = staffById(sid);
    return `<div class="cr-resWho">${faceChip(sid, 40)}<div><b>${esc(nm(sid))}</b> <span class="cr-muted">${esc(roleLabel(st?.role))}</span> ${heartRow(bossRel(sid))}<div class="cr-tags">${(book(sid)?.tags || []).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}<span class="cr-tag gray">${esc(moodLabel(sid))}</span></div></div></div>`;
}
const head = g => `<div class="cr-row"><span class="cr-evTag">📌 ${L('대책 걸기', 'Set a house rule')}</span><span class="cr-muted" style="margin-left:auto">${F(L('대책 자리 {n}/{m}', 'House rules {n}/{m}'), { n: slotsUsed(g), m: MAX_RULES })}</span></div>`;

function pickHtml() {
    const g = G(), { sid, acc } = cur;
    const accs = [...new Set([acc, ...proneAccs(g, sid)])].filter(Boolean);
    const times = g.today?.biz?.accTimes?.[sid] || {};
    const seg = accs.map(k => `<button type="button" class="${k === acc ? 'on' : ''}" data-act="hrSeg" data-id="${k}" aria-pressed="${k === acc}">${HR_ACC[k].icon} ${esc(L(...HR_ACC[k].title))}${times[k] ? ` · ${F(L('오늘 {n}번', '{n}× today'), { n: times[k] })}` : ''}</button>`).join('');
    const now = ruleFor(g, sid, acc), w = warnFor(g, sid);
    const full = slotsUsed(g) >= MAX_RULES && !now;
    const E = L('예상 · 대신 생길 수도 있는 일', 'Expect · might happen instead');
    const opts = rulesOf(acc).map(id => {
        const d = HR[id];
        const on = (now && now.id === id) || (id === 'warn' && w);
        const off = full && !d.noSlot;
        const meta = [len(d), costTxt(d), d.noSlot ? L('자리 안 차지', 'no slot') : ''].filter(Boolean).join(' · ');
        const ex = id === 'warn' ? F(L('{n}과 사이가 조금 나빠질 수 있어요', 'Things with {n} might cool a little'), { n: nm(sid) }) : L(...d.exp);
        return `<button type="button" class="cr-hrOpt${id === 'warn' ? ' warn' : ''}" data-act="hrPick" data-id="${id}" ${off ? 'disabled' : ''}>${d.icon} <b>${esc(L(...d.n))}</b>${on ? `<span class="cr-tag good">${L('지금 걸려 있음', 'On now')}</span>` : ''}<span class="cr-hrMeta">${esc(meta)}</span><span class="cr-hrExp"><i>${E}</i>${esc(ex)}</span></button>`;
    }).join('');
    return `${head(g)}${whoHtml(sid)}
<div class="cr-seg sm cr-hrSeg">${seg}</div>
<p class="cr-muted cr-hrNote">${L('대책은 며칠 가는 지시예요. 어떻게 받아들일지는 걸어 봐야 알아요.', 'A house rule lasts a few days. How they take it, you only find out by trying.')}</p>
${now ? `<p class="cr-muted cr-hrNote">📌 ${F(L('지금 {r}이 걸려 있어요. 고르면 바꿔 끼워요.', '{r} is on now. Picking another swaps it.'), { r: ruleName(now) })}</p>` : ''}
${full ? `<p class="cr-hrFull">${L('대책 자리가 다 찼어요 (3/3). 가게 탭에서 하나를 풀거나, 경고만 할 수 있어요.', 'All 3 house rule slots are taken. Free one on the Shop tab, or just give a warning.')}</p>` : ''}
${opts}
<div class="cr-actions"><button type="button" class="cr-btn" data-act="hrCancel">${L('그냥 두기', 'Never mind')}</button></div>`;
}

function doneHtml() {
    const g = G(), { sid, res } = cur;
    const r = res.rule, d = HR[r.id], R = REACT[res.react];
    const meta = [len(d), costTxt(d)].filter(Boolean).join(' · ');
    return `${head(g)}${whoHtml(sid)}
<div class="cr-hrOpt picked">${d.icon} <b>${esc(L(...d.n))}</b><span class="cr-hrMeta">${esc(meta)}</span></div>
<div class="cr-say2">${bossFace(30)}<p>${esc(L(...d.boss))}</p></div>
<div class="cr-say2">${faceChip(sid, 30)}<p>${esc(line(sid, R.line) || L(...R.start))}</p></div>
<div class="cr-row cr-hrReact"><span class="cr-chip ${R.chip}">${esc(L(...reactLabel(res.react)))}</span><span class="cr-muted">${esc(startText(g, r))}</span></div>
<div class="cr-hrDone">${d.noSlot ? L('경고했어요', 'Warning given') : F(L('대책을 걸었어요 · {n}/{m}', 'House rule set · {n}/{m}'), { n: slotsUsed(g), m: MAX_RULES })}<small>${d.noSlot ? L('오늘 하루만 가요 · 자리는 안 차지해요', 'Lasts one day · takes no slot') : L('어떻게 될지는 영업해 봐야 알아요', 'You\'ll see how it goes once the shop runs')}</small></div>
<div class="cr-actions"><button type="button" class="cr-pbtn" data-act="hrOk">${L('확인', 'OK')}</button></div>`;
}

/**
 * 대책 거는 창 열기. 영업 중 지시 창에서 올 때는 onSet / onClose / onCancel을 넘김.
 * 가게 탭에서 열 때는 기본 동작 (닫고 대책 칸만 다시 그림).
 */
export function openRuleSheet(sid, acc = null, hooks = {}) {
    const g = G();
    acc = acc || proneAccs(g, sid)[0] || 'sneak';
    cur = { sid, acc, view: 'pick', ...hooks };
    openSheet(pickHtml(), true);
}
function redrawSheet() {
    const sh = document.querySelector('#crumble-root .cr-sheet'); if (!sh || !cur) return;
    sh.innerHTML = `<div class="cr-grab"></div>${cur.view === 'done' ? doneHtml() : pickHtml()}`;
    sh.scrollTop = 0;
}
export function redrawRules() {
    const el = document.querySelector('#crumble-root #cr-hrCard'); if (!el) return;
    el.outerHTML = ruleCardHtml(G());
}
function finishSheet() {
    const c = cur; cur = null;
    if (c?.onClose) c.onClose(); else closeSheet();
    redrawRules(); redrawShopLog();
}
/** 같은 대책 다시 걸기 (결과·반응 새로) */
function setAndShow(sid, acc, id) {
    const g = G();
    const res = setRule(g, sid, acc, id);
    save();
    if (!cur) cur = { sid, acc };
    cur.view = 'done'; cur.res = res;
    if (!document.querySelector('#crumble-root .cr-sheet.open')) openSheet(doneHtml(), true); else redrawSheet();
    cur.onSet?.(res.react);
}

/** ui.js onClick에서 부름. 처리했으면 true */
export function hrAction(act, el) {
    const g = G(); if (!g) return false;
    const id = el.dataset.id;
    const rule = (g.rules || []).find(r => r.rid === id);
    switch (act) {
        case 'hrOpen': openRuleSheet(id, el.dataset.acc || null); return true;
        case 'hrSeg': if (cur) { cur.acc = id; redrawSheet(); } return true;
        case 'hrPick': {
            if (!cur || el.disabled) return true;
            const d = HR[id];
            if (!d.noSlot && slotsUsed(g) >= MAX_RULES && !ruleFor(g, cur.sid, cur.acc)) { toast(L('대책 자리가 다 찼어요', 'All house rule slots are taken')); return true; }
            setAndShow(cur.sid, cur.acc, id);
            return true;
        }
        case 'hrCancel': { const c = cur; cur = null; if (c?.onCancel) c.onCancel(); else closeSheet(); return true; }
        case 'hrOk': finishSheet(); return true;
        case 'hrAgain': if (rule) { cur = { sid: rule.sid, acc: rule.acc }; setAndShow(rule.sid, rule.acc, rule.id); } return true;
        case 'hrOther': if (rule) openRuleSheet(rule.sid, rule.acc); return true;
        case 'hrKeep': if (rule) { ackRule(g, rule.rid); save(); redrawRules(); } return true;
        case 'hrExtend': if (rule) { extendRule(g, rule.rid); save(); redrawRules(); toast(L('대책을 연장했어요', 'House rule extended')); } return true;
        case 'hrOff': if (rule) { removeRule(g, rule.rid); save(); redrawRules(); toast(F(L('{n}의 대책을 풀었어요', 'Lifted {n}\'s house rule'), { n: nm(rule.sid) })); } return true;
    }
    return false;
}

// ---------- 가게 탭 "가게 대책 n/3" ----------
function statusOf(g, r) {
    if (r.ended) return { label: L('끝났어요', 'Ended'), cls: 'watch' };
    if (r.from > g.day) return { label: r.from === g.day + 1 ? L('내일부터', 'From tomorrow') : L('모레부터', 'In 2 days'), cls: 'watch' };
    if (fading(r, g.day)) return { label: L('흐려지는 중', 'Fading'), cls: 'watch', fade: true };
    if (r.shown) { const o = outcomeOf(r); return { label: o.label, cls: o.cls }; }
    return { label: L('지켜보는 중', 'Watching'), cls: 'watch' };
}
function ruleRow(g, r) {
    const d = HR[r.id], st = statusOf(g, r), o = r.shown ? outcomeOf(r) : null;
    const left = daysLeft(r, g.day);
    const pct = r.until == null ? 100 : Math.round(100 * (left || 0) / d.days);
    const days = r.ended ? '' : `<div class="cr-hrDays"><span class="cr-bar"><i style="width:${pct}%;background:${st.fade ? '#BFAF9F' : '#F29A7C'}"></i></span>${esc([r.until == null ? L('바꿀 때까지', 'Until you change it') : F(L('{n}일 남음', '{n} day{s} left'), { n: left, s: left === 1 ? '' : 's' }), costTxt(d)].filter(Boolean).join(' · '))}</div>`;
    let btns;
    if (r.ended || (r.shown && !r.ack)) {
        const main = r.ended ? ['hrAgain', L('다시 걸기', 'Set again')]
            : r.out === 'lucky' && r.until != null ? ['hrExtend', L('연장하기', 'Extend')]
                : r.out === 'back' ? ['hrAgain', L('다시 채우기', 'Try again')] : ['hrAgain', L('다시 걸기', 'Set again')];
        btns = `<div class="cr-hrBtns"><button type="button" class="main" data-act="${main[0]}" data-id="${r.rid}">${main[1]}</button><button type="button" data-act="hrOther" data-id="${r.rid}">${L('다른 대책', 'Other rule')}</button><button type="button" data-act="hrKeep" data-id="${r.rid}">${r.ended ? L('지우기', 'Clear') : L('그대로', 'Keep')}</button></div>`;
    } else btns = `<div class="cr-hrBtns"><button type="button" data-act="hrOff" data-id="${r.rid}">${L('풀기', 'Lift')}</button></div>`;
    return `<div class="cr-hrRule"><div class="cr-hrHead">${faceChip(r.sid, 30)}<b>${esc(nm(r.sid))}</b><span>${d.icon} ${esc(L(...d.n))}</span><span class="cr-hrLbl ${st.cls}">${esc(st.label)}</span></div>
${days}<div class="cr-hrLn"><i>${L('예상', 'Expected')}</i>${esc(L(...d.exp))}</div>
${o ? `<div class="cr-hrLn real"><i>${L('실제', 'Actual')}</i>${esc(o.text)}${st.fade ? ` <span class="cr-hrLbl ${o.cls}">${esc(o.label)}</span>` : ''}</div>` : ''}
${btns}</div>`;
}
export function ruleCardHtml(g) {
    if (!g.staff.length) return '';
    const rules = (g.rules || []).filter(r => r.id !== 'warn' && g.staff.some(s => s.id === r.sid));
    let rows = '';
    for (const s of g.staff) {
        const mine = rules.filter(r => r.sid === s.id);
        rows += mine.map(r => ruleRow(g, r)).join('');
        const free = proneAccs(g, s.id).filter(k => !mine.some(r => r.acc === k && !r.ended));
        if (!mine.length && free.length) {
            const why = { sneak: L('몰래 먹기가 잦아요', 'sneaks bites a lot'), freebie: L('덤을 막 줘요', 'hands out freebies'), chat: L('수다가 잦아요', 'chats a lot'), doze: L('요즘 자주 졸아요', 'dozing a lot lately') }[free[0]];
            rows += `<div class="cr-hrRule"><div class="cr-hrEmpty">${faceChip(s.id, 26)}<span><b>${esc(nm(s.id))}</b> · ${L('대책 없음', 'No rule')} · ${esc(why)}</span><button type="button" data-act="hrOpen" data-id="${esc(s.id)}" data-acc="${free[0]}">${L('대책 걸기', 'Set rule')}</button></div></div>`;
        } else if (mine.length && free.length && slotsUsed(g) < MAX_RULES) {
            rows += `<div class="cr-hrMore"><button type="button" class="cr-link" data-act="hrOpen" data-id="${esc(s.id)}" data-acc="${free[0]}">+ ${F(L('{n}에게 대책 하나 더', 'Another rule for {n}'), { n: nm(s.id) })}</button></div>`;
        }
        const w = warnFor(g, s.id);
        if (w) rows += `<div class="cr-hrWarn">⚠️ ${F(L('{n}에게 경고 · {d} (자리 안 차지)', 'Warning for {n} · {d} (no slot)'), { n: nm(s.id), d: w.from > g.day ? L('내일', 'tomorrow') : L('오늘까지', 'today only') })}</div>`;
    }
    if (!rows) rows = `<p class="cr-muted">${L('지금은 대책이 필요한 직원이 없어요. 몰래 먹기·덤·수다·졸기가 잦은 직원이 생기면 여기서 걸 수 있어요.', 'No one needs a house rule right now. When someone keeps sneaking bites, giving freebies, chatting, or dozing, you can set one here.')}</p>`;
    return `<section class="cr-card cr-hrCard" id="cr-hrCard"><div class="cr-ttl">📌 ${L('가게 대책', 'House rules')} <b class="cr-hrCount">${slotsUsed(g)}/${MAX_RULES}</b><small>${L('직원별 · 며칠 가는 지시', 'Per staff · lasts a few days')}</small></div>${rows}</section>`;
}
