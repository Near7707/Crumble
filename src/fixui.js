// 0.3.2 수습 대기 화면: 가게 로그 맨 위 칸 + 수습 창(아래 시트) + 결과 창
import { esc } from './util.js';
import { L, F } from './i18n.js';
import { G, save, book } from './state.js';
import { tagLabel, deltaChips, fixesOf, fixLeft, fixPick, fixCanDelegate, resolveFix } from './rules.js';
import { FIX_MAX, FIX_CHOICES, FIX_CAT, PAIR_FIX, fixChoiceLabel, fixTitle, whoId, fillNames } from './fixes.js';
import { faceChip } from './looks.js';
import { openSheet, closeSheet, toast, softRender, bizLocked } from './ui.js';

const nm = id => book(id)?.name || '';
const face = (f, w, size) => { const id = whoId(f, w); return id ? faceChip(id, size) : `<span class="cr-face guest">🙂</span>`; };
const whoName = (f, w) => { const id = whoId(f, w); return id ? nm(id) : L('손님', 'Customer'); };
const firstSentence = t => { const m = String(t || '').match(/^.*?[.!?。](?=\s|$)/); return m ? m[0] : String(t || ''); };
const dayTag = f => F(L('{d}일째 · 사장님 없을 때', 'Day {d} · while away'), { d: f.day });
function leftText(g, f) {
    const n = fixLeft(g, f);
    const when = n <= 1 ? L('오늘까지', 'Last day') : F(L('{n}일 남음', '{n} days left'), { n });
    const who = PAIR_FIX(f.kind) ? L('안 보면 그냥 넘어가요', 'then it slides') : F(L('안 보면 {a} 알아서 해요', 'then {a} handles it'), { a: fillNames('{a이}', { a: nm(f.staffIds[0]) }) });
    return `${when} · ${who}`;
}
function bubbles(f, lines) {
    // 첫 번째로 말하는 사람은 왼쪽, 다른 사람은 오른쪽
    const first = lines[0]?.w;
    return lines.map(x => {
        const L_ = x.w === first;
        const fc = face(f, x.w, 26);
        const p = `<p><b>${esc(whoName(f, x.w))}</b>${esc(x.t)}</p>`;
        return `<div class="cr-fxB ${L_ ? 'l' : 'r'}">${L_ ? fc + p : p + fc}</div>`;
    }).join('');
}

// ---------- 가게 로그 맨 위 "수습 대기 n/3" ----------
export function fixBlockHtml(g) {
    const list = fixesOf(g);
    if (!list.length) return '';
    const locked = bizLocked();
    const cards = list.map(f => {
        const faces = f.staffIds.map(id => faceChip(id, 26)).join('');
        const btn = locked ? `<span class="cr-muted cr-fxLock">${L('영업이 끝나면 수습할 수 있어요', 'Sort it out after closing')}</span>`
            : `<button type="button" class="cr-pbtn cr-fxGo" data-act="fixOpen" data-id="${esc(f.id)}">${L('수습하기', 'Sort it out')}</button>`;
        return `<div class="cr-fxCard"><div class="cr-fxTop"><span class="cr-evTag ${FIX_CAT[f.kind]}">${esc(fixTitle(f))}</span><span class="cr-fxDay">${esc(dayTag(f))}</span></div>
<div class="cr-fxMid">${faces}<span>${esc(firstSentence(f.story?.cause) || f.story?.now || '')}</span></div>
<div class="cr-fxBot"><span>⏳ ${esc(leftText(g, f))}</span>${btn}</div></div>`;
    }).join('');
    return `<div class="cr-fxBox"><div class="cr-fxHead">🧯 ${L('수습 대기', 'Waiting on you')} <span class="cr-fxN">${list.length}/${FIX_MAX}</span><small>${L('돌아와야 결과가 정해져요', 'Decided when you\'re back')}</small></div>${cards}
<div class="cr-fxNote">${list.length >= FIX_MAX ? L('가득 찼어요. 새 일은 직원들이 알아서 작게 처리해요 · ', 'Full — new trouble gets handled small by the staff · ') : ''}${L('사장님 없는 날 새는 돈은 그날 매출의 30%까지만', 'Money lost on days away is capped at 30% of that day\'s sales')}</div></div>`;
}

// ---------- 수습 창 ----------
let curId = null;
function openFix(id) {
    const g = G();
    const f = fixesOf(g).find(x => x.id === id);
    if (!f) return;
    if (bizLocked()) { toast(L('영업이 끝나면 수습할 수 있어요', 'Sort it out after closing')); return; }
    curId = id;
    const st = f.story || {};
    const ch = FIX_CHOICES[f.kind];
    const del = fixCanDelegate(f) ? ch.findIndex(c => c.eff.delegate) : -1;
    const opts = ch.map((c, i) => {
        if (i === del) return '';
        const hint = c.side != null ? st.hints?.[i] : '';
        return `<button type="button" class="cr-opt" data-act="fixPick" data-i="${i}">${esc(fixChoiceLabel(f, i))}${hint ? `<small>${esc(hint)}</small>` : ''}</button>`;
    }).join('');
    const delBtn = fixCanDelegate(f) ? `<button type="button" class="cr-opt cr-optDel" data-act="fixDel">🤝 ${F(L('{n}에게 맡기기', 'Leave it to {n}'), { n: esc(nm(f.staffIds[0])) })}<small>${L('성격대로 알아서 해요', 'They\'ll do it their own way')}</small></button>` : '';
    openSheet(`<div class="cr-row"><span class="cr-evTag ${FIX_CAT[f.kind]}">${esc(fixTitle(f))}</span><span class="cr-muted" style="margin-left:auto">🧯 ${F(L('수습 대기 · {d}일째', 'Waiting · Day {d}'), { d: f.day })}</span></div>
<div class="cr-resNote">${L('사장님 없을 때 생긴 일이에요. 고르는 대로 결과가 정해져요.', 'This happened while you were away. Your choice decides how it ends.')}</div>
<div class="cr-fxStory"><div class="cr-fxSh">📖 ${L('무슨 일이 있었냐면', 'What happened')}</div><p>${esc(st.cause || '')}</p></div>
${bubbles(f, st.lines || [])}
${st.now ? `<div class="cr-fxNow">${L('지금', 'Now')}: ${esc(st.now)}</div>` : ''}
${opts}${delBtn}
<div class="cr-actions"><button type="button" class="cr-btn" data-act="fixLater">${L('나중에 보기', 'Later')}</button></div>
<p class="cr-muted cr-center">${esc(leftText(g, f))}</p>`, true);
}

// ---------- 결과 창 ----------
function showResult(r) {
    const { f, ci, ids, delta, ok, uncertain, result, label, exp, by } = r;
    const ev = { kind: f.kind, staffIds: ids };
    const tag = by === 'delegate' ? L('맡긴 결과', 'Delegated') : L('수습 결과', 'Sorted out');
    const badge = uncertain ? (ok ? `<span class="cr-ok good">${L('잘 됐어요', 'Went well')}</span>` : `<span class="cr-ok bad">${L('잘 안 됐어요', 'Didn\'t go well')}</span>`) : '';
    const cs = deltaChips(delta || {}, ev, exp);
    // 편들기: 편 안 들어 준 쪽 ↔ 사장도 보여 줌
    if (FIX_CHOICES[f.kind][ci]?.eff.relBoss2 && ids[1]) cs.push({ t: `${nm(ids[1])} ↔ ${L('사장', 'boss')} ↓`, good: false });
    const chips = cs.map(c => `<span class="cr-chip ${c.good ? 'up' : 'dn'}">${esc(c.t)}</span>`).join('') || `<span class="cr-chip">${L('별일 없이 지나갔어요', 'Nothing much changed')}</span>`;
    const res = f.story?.res?.[ci] || {};
    const main = result ? esc(result) : `<b>${esc(nm(ids[0]))}</b> · ${esc(label)}`;
    const memo = PAIR_FIX(f.kind) && res.memo ? `<div class="cr-fxMemo">📝 ${L('관계 메모에 남았어요', 'Saved to their relationship note')}: "${esc(res.memo)}"</div>` : '';
    openSheet(`<div class="cr-row"><span class="cr-evTag ${FIX_CAT[f.kind]}">${esc(fixTitle(f))}</span><span class="cr-resTag ${by === 'delegate' ? 'delegate' : 'boss'}">${tag}</span></div>
<div class="cr-resWho">${f.staffIds.map((id, i) => faceChip(id, i ? 30 : 40)).join('')}<div><b>${esc(nm(f.staffIds[0]))}</b>${f.staffIds[1] ? ` <span class="cr-muted">· ${esc(nm(f.staffIds[1]))}</span>` : ''}<div class="cr-tags"><span class="cr-tag">${L('고른 것', 'Choice')}: ${esc(label)}</span>${(book(f.staffIds[0])?.tags || []).slice(0, 2).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}</div></div></div>
<div class="cr-story"><p class="cr-resMain">${main}</p>${badge ? `<p class="cr-resRow">${badge}</p>` : ''}</div>
${bubbles(f, res.lines || [])}
<div class="cr-chips">${chips}</div>
${memo}
<button type="button" class="cr-pbtn cr-wide" data-act="fixOk">${L('확인', 'OK')}</button>
<p class="cr-muted cr-center">${L('가게 로그에 "수습함"으로 남아요', 'Saved to the shop log as "Sorted out"')}</p>`, true);
}

function decide(ci, by) {
    const g = G();
    if (!curId || bizLocked()) return;
    const f = fixesOf(g).find(x => x.id === curId); if (!f) return;
    if (by === 'delegate') ci = fixPick(g, f);
    const r = resolveFix(g, curId, ci, by);
    curId = null;
    if (!r) { closeSheet(); return; }
    save();
    showResult(r);
}

export function fixAction(act, el) {
    switch (act) {
        case 'fixOpen': openFix(el.dataset.id); return true;
        case 'fixPick': decide(+el.dataset.i, false); return true;
        case 'fixDel': decide(0, 'delegate'); return true;
        case 'fixLater': curId = null; closeSheet(); return true;
        case 'fixOk': closeSheet(); softRender(); return true;
    }
    return false;
}
