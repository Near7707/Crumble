// 폐업 엔딩 — 5단계 (마지막 영업일 → 마지막 한마디 → 폐업 일지 → 사장 한마디 → 다시 시작)
import { esc, clamp } from './util.js';
import { L, F, money, signedMoney } from './i18n.js';
import { S, G, save, book, staffById, bossRel, rel, newGame, shopName } from './state.js';
import { createScene } from './scene.js';
import { faceChip } from './looks.js';
import { endingWords, bossLabel } from './ai.js';
import { line } from './lines.js';
import { render, addScene, closeBtn, gearBtn, heartRow } from './ui.js';
import { personaName, setBossName } from './settings.js';

const STEPS = [['마지막 영업일', 'Last day'], ['마지막 한마디', 'Last words'], ['폐업 일지', 'Closing log'], ['사장 한마디', 'Your words'], ['다시 시작', 'Start over']];

function E() {
    const g = G();
    g.ending ??= { step: 0, ai: null, loading: false, bossWords: '', carry: false };
    return g.ending;
}

async function loadAi() {
    const e = E(); if (e.ai || e.loading) return;
    e.loading = true;
    let r = null;
    try { r = await endingWords(G()); } catch (err) { console.warn(err); }
    e.loading = false;
    e.ai = r || { failed: true, last: {}, aware: {}, today: {}, review: {}, memorable: [] };
    save();
    if (document.querySelector('#crumble-root .cr-end')) render();
}

export function renderEnding(box) {
    const g = G(); const e = E();
    loadAi();
    const head = `<header class="cr-top biz cr-end"><div class="cr-row"><div class="cr-endSteps">${STEPS.map((s, i) => `<span class="${i === e.step ? 'now' : i < e.step ? 'done' : ''}">${i === e.step ? L(...s) : i + 1}</span>`).join('')}</div>${gearBtn()}${closeBtn()}</div></header><div class="cr-drip dark"></div>`;
    const nav = `<div class="cr-actions cr-endNav"><button class="cr-btn" type="button" data-e="prev" ${e.step === 0 ? 'disabled' : ''}>${L('‹ 이전', '‹ Back')}</button>${e.step < 4 ? `<button class="cr-pbtn" type="button" data-e="next">${[L('직원들에게 알리기', 'Tell the staff'), L('다음', 'Next'), L('다음', 'Next'), L('다음', 'Next')][e.step]} ›</button>` : `<button class="cr-pbtn" type="button" data-e="restart">${L('새 가게 열기', 'Open a new shop')}</button>`}</div>`;
    box.innerHTML = head + `<main class="cr-main cr-endMain"><div class="cr-sceneHost" id="cr-eScene"></div>${body(e.step)}${nav}</main>`;
    const sc = addScene(createScene(box.querySelector('#cr-eScene'), { size: e.step === 4 ? '11x9' : g.size, ...(e.step === 4 ? { shopName: e.newShop || '' } : {}), height: 210, zoom: .7, focus: [5, 4] }));
    scene(sc, e.step);
    box.querySelector('#cr-newBoss')?.addEventListener('input', ev => { e.newBoss = ev.target.value.slice(0, 30); save(); });
    box.querySelector('#cr-newShop')?.addEventListener('input', ev => { e.newShop = ev.target.value.slice(0, 24); save(); sc.shopSign?.(e.newShop); });
    box.querySelector('main').addEventListener('click', ev => {
        const b = ev.target.closest('[data-e]'); if (!b) return;
        const a = b.dataset.e;
        if (a === 'prev') { e.step = clamp(e.step - 1, 0, 4); save(); render(); }
        if (a === 'next') { if (e.step === 3) e.bossWords = (box.querySelector('#cr-bossWords')?.value || '').slice(0, 120); e.step = clamp(e.step + 1, 0, 4); save(); render(); }
        if (a === 'skip') { e.bossWords = ''; e.step = 4; save(); render(); }
        if (a === 'carry') { e.carry = !e.carry; save(); render(); }
        if (a === 'restart') restart();
        if (a === 'focus') { const en = sc.ents.find(x => x.staffId === b.dataset.id); if (en) { sc.focus(en, 1.5); } }
    });
}

function aiOr(map, id, fb) { return E().ai?.[map]?.[id] || fb; }
const loading = () => `<p class="cr-muted cr-loading">${L('직원들이 할 말을 고르는 중…', 'The staff are finding their words…')}</p>`;

function body(step) {
    const g = G(), e = E();
    const W = g.staff;
    const today = g.journal.find(j => j.day === g.day && j.mode === 'direct');
    const sum = g.today?.closed?.summary || {};
    switch (step) {
        case 0: {
            const aw = id => { const v = String(aiOr('aware', id, 'no')).toLowerCase(); return v.startsWith('k') ? L('알고 있음', 'Knew') : v.startsWith('s') ? L('눈치챔', 'Sensed it') : L('모름', 'No idea'); };
            return `<section class="cr-card">${W.map(s => `<div class="cr-relrow">${faceChip(s.id, 30)}<div style="flex:1"><div class="cr-row"><b>${esc(book(s.id)?.name)}</b><span class="cr-tag">${e.ai ? aw(s.id) : '…'}</span></div><p class="cr-muted">${esc(aiOr('today', s.id, e.ai ? line(s.id, 'tap2') : '…'))}</p></div></div>`).join('') || `<p class="cr-muted">${L('남은 직원이 없어요.', 'No staff left.')}</p>`}</section>
<section class="cr-card"><div class="cr-line"><span>${L('오늘 번 돈', 'Earned today')}</span><b>${signedMoney(today?.delta?.money || 0)}</b></div><div class="cr-line"><span>${L('밀린 월급·이자', 'Unpaid wages & interest')}</span><b>${signedMoney(-((sum.wages || 0) + (sum.interest || 0)))}</b></div><div class="cr-line"><span>${L('남은 돈', 'Money left')}</span><b class="neg">${money(g.money)}</b></div></section>
<div class="cr-darkCard">${L('오늘을 끝으로 가게 문을 닫아요', 'After today, the shop closes its doors')}</div>`;
        }
        case 1:
            if (!e.ai) return loading();
            return W.map(s => `<button type="button" class="cr-card cr-lastw" data-e="focus" data-id="${esc(s.id)}">${faceChip(s.id, 40)}<div><div class="cr-row"><b>${esc(book(s.id)?.name)}</b>${heartRow(bossRel(s.id))}</div><p>“${esc(aiOr('last', s.id, line(s.id, 'tap1')))}”</p></div></button>`).join('') || `<p class="cr-muted">${L('남은 직원이 없어요.', 'No staff left.')}</p>`;
        case 2: {
            if (!e.ai) return loading();
            const best = g.stats.bestDay;
            const mem = e.ai.memorable?.length ? e.ai.memorable : g.stats.memorable.slice(-3);
            return `<section class="cr-card cr-grid3"><div><small>${L('영업한 날', 'Days open')}</small><b>${g.day}</b></div><div><small>${L('최고 평판', 'Best rep')}</small><b>${g.stats.maxRep}</b></div><div><small>${L('가장 많이 번 날', 'Best day')}</small><b>${best ? F(L('{d}일', 'D{d}'), { d: best.day }) : '-'}</b></div></section>
${best ? `<p class="cr-muted cr-center">${F(L('{d}일째, 손님 {n}명에게 {m}어치를 팔았어요.', 'Day {d}: sold {m} to {n} guests.'), { d: best.day, n: best.served, m: money(best.revenue) })}</p>` : ''}
<section class="cr-card"><div class="cr-ttl">✨ ${L('기억에 남는 일', 'Memorable moments')}</div>${mem.map(m => `<div class="cr-hist"><span class="cr-pill day sm">${F(L('{n}일', 'D{n}'), { n: m.day })}</span><b>${esc(m.title)}</b>${m.text ? ' — ' + esc(m.text) : ''}</div>`).join('') || `<p class="cr-muted">${L('기록이 별로 없어요.', 'Not many records.')}</p>`}</section>
<section class="cr-card"><div class="cr-ttl">👩‍🍳 ${L('직원별 한 줄 평', 'A line for each')}</div>${W.map(s => `<div class="cr-hist">${faceChip(s.id, 24)} <b>${esc(book(s.id)?.name)}</b> ${esc(aiOr('review', s.id, ''))}</div>`).join('')}</section>`;
        }
        case 3:
            return `<section class="cr-card"><div class="cr-ttl">👑 ${L('사장님의 마지막 한마디', 'Your final words')}</div><textarea id="cr-bossWords" class="cr-input" maxlength="120" rows="3" placeholder="${L('가게에, 직원들에게 남길 말 (120자)', 'Something to leave the shop and staff (120 chars)')}">${esc(e.bossWords)}</textarea><div class="cr-actions"><button class="cr-btn" type="button" data-e="skip">${L('건너뛰기', 'Skip')}</button></div></section>`;
        case 4: {
            const pairs = Object.entries(g.rel).filter(([, v]) => v.v || v.memo).slice(0, 8);
            return `<section class="cr-card cr-past"><div class="cr-ttl">🏚 ${L('지난 가게들', 'Past shops')}</div><div class="cr-hist"><b>${esc(shopName(g) || L('이름 없는 가게', 'Unnamed shop'))}</b> · ${F(L('{n}일 영업', '{n} days'), { n: g.day })} · ${L('최고 평판', 'Best rep')} ${g.stats.maxRep}</div>${e.bossWords ? `<p class="cr-say">👑 “${esc(e.bossWords)}”</p>` : ''}</section>
<section class="cr-card"><label class="cr-field" for="cr-newBoss">👑 ${L('새 가게 사장 이름', 'Owner name for the new shop')}<input id="cr-newBoss" class="cr-input" type="text" maxlength="30" value="${esc(e.newBoss ?? (S().bossName || personaName()))}" placeholder="${esc(L('사장 이름', 'Owner name'))}"></label><small class="cr-muted">${L('비우면 페르소나 이름을 써요. 나중에 ⚙ 설정에서도 바꿀 수 있어요.', 'Blank = persona name. You can also change it later in ⚙ Settings.')}</small>
<label class="cr-field" for="cr-newShop">🏪 ${L('새 가게 이름', 'Name for the new shop')}<input id="cr-newShop" class="cr-input" type="text" maxlength="24" value="${esc(e.newShop ?? '')}" placeholder="${esc(L('예: 말랑 제과점', 'e.g. Little Crumb Bakery'))}"></label><small class="cr-muted">${L('비워 두면 나중에 가게 탭에서 정할 수 있어요.', 'Leave blank to name it later from the Shop tab.')}</small></section>
<section class="cr-card"><label class="cr-switch"><span>${L('지난 관계 이어가기', 'Carry over relationships')}</span><button type="button" role="switch" aria-checked="${e.carry}" class="cr-sw${e.carry ? ' on' : ''}" data-e="carry"><i></i></button></label>
${e.carry ? `<div class="cr-muted">${pairs.map(([k, v]) => { const [a, b] = k.split('|'); const nm = x => x === 'boss' ? bossLabel() : book(x)?.name || '?'; return `<div class="cr-hist">${esc(nm(a))} ↔ ${esc(nm(b))} · ${v.v}${v.memo ? ' — ' + esc(v.memo) : ''}</div>`; }).join('') || L('이어갈 관계가 없어요.', 'Nothing to carry over.')}</div><p class="cr-note">${L('관계가 이어져도 게임이 쉬워지지는 않아요.', 'Carried bonds don\'t make the game easier.')}</p>` : ''}</section>`;
        }
    }
    return '';
}

async function scene(sc, step) {
    const g = G(), e = E();
    const L0 = sc.lay;
    const W = g.staff;
    if (step === 4) { sc.setEnv({ tod: 'am', weather: 'sun' }); sc.sign('OPEN'); sc.display(0); return; }
    sc.setEnv({ tod: 'dark', weather: g.weather }); sc.sign('CLOSED'); sc.display(0);
    if (step === 3) return;
    const row = W.map((s, i) => [L0.rug[0] + .6 + i, Math.floor((L0.rug[1] + L0.rug[3]) / 2)].map(Math.floor));
    const ents = W.map((s, i) => sc.ent({ staffId: s.id, label: book(s.id)?.name, c: row[i][0], r: step === 0 ? row[i][1] + (i % 2) : row[i][1] }));
    try {
        if (step === 0) {
            sc.tint('rgba(28,20,55,.45)');
            for (const en of ents) { await sc.wait(700); sc.say(en, (aiOr('today', en.staffId, '') || line(en.staffId, 'tired')).slice(0, 26), 2600); }
        } else if (step === 1) {
            sc.tint('rgba(28,20,55,.5)');
            for (const en of ents) {
                await sc.wait(900);
                await sc.go(en, [en.c, en.r + 1]);
                sc.focus(en, 1.2);
                sc.say(en, (aiOr('last', en.staffId, line(en.staffId, 'tap1')) || '').slice(0, 28), 3400);
                await sc.wait(3400);
                await sc.go(en, [en.c, en.r - 1]);
            }
            sc.fit();
        } else if (step === 2) {
            sc.tint('rgba(28,20,55,.4)'); sc.lamps(.6);
            for (const en of ents) {
                await sc.wait(800);
                sc.go(en, [L0.door, L0.frontRow]).then(() => sc.go(en, [L0.door, 0])).then(() => { en.el.style.opacity = 0; }).catch(() => { });
            }
            await sc.wait(4500); sc.lamps(0); sc.tint('rgba(18,12,40,.62)');
        }
    } catch { /* 화면이 바뀜 */ }
}

function restart() {
    const s = S(), g = G(), e = E();
    const reviews = g.staff.map(x => ({ name: book(x.id)?.name, text: e.ai?.review?.[x.id] || '' }));
    s.pastShops.unshift({
        id: g.id, name: shopName(g) || L('이름 없는 가게', 'Unnamed shop'), days: g.day, maxRep: g.stats.maxRep, bestDay: g.stats.bestDay,
        memorable: (e.ai?.memorable?.length ? e.ai.memorable : g.stats.memorable.slice(-3)),
        reviews, bossWords: e.bossWords, closedOn: g.dayKey,
    });
    if (s.pastShops.length > 30) s.pastShops.length = 30;
    // 가게 기억(사건 기록)은 직원 설명서와 따로. 관계는 고른 경우만 이어감.
    const carry = e.carry ? structuredClone(g.rel) : null;
    const ns = String(e.newShop || '').trim();
    s.game = newGame(carry);
    if (ns) { s.game.name = ns; s.game.nameAsked = true; }
    const nb = e.newBoss;
    save(true);
    if (nb !== undefined) setBossName(nb, 'game'); // 설정 칸도 같이 바뀜
    render();
}

export { staffById, rel };
