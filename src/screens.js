// 직접 영업: ① 아침 준비 → ② 영업 중 → ③ 마감 정산
import { esc, clamp, chance, pick } from './util.js';
import { L, F, money, signedMoney } from './i18n.js';
import { G, S, save, book, staffById, colorOf, bossRel, menuInfo, ING_PRICE, skillNeed, addJournal } from './state.js';
import {
    prepToday, expectedGuests, ingCost, pickEvents, fallbackEventText, resolveEvent, deltaText, newBiz, sellOne,
    closeDay, worries, finishClose, applyNotices, workingStaff, hasTag, friendSaves, EVENT_KINDS, guestMult,
    roleLabel, weatherLabel,
} from './rules.js';
import { createScene } from './scene.js';
import { faceChip } from './looks.js';
import { line, tapLine } from './lines.js';
import { morningPrep, closingDiary } from './ai.js';
import { render, addScene, openSheet, closeSheet, toast, logoHtml, closeBtn, gearBtn, heartRow, bar, nameTag, closeWindow, inner } from './ui.js';

let B = null; // 지금 돌아가는 영업
const inflight = new Set(); // 지금 기다리는 AI 호출 (저장하지 않음 → 새로고침하면 다시 부름)

export const businessActive = () => !!(B && B.running && !B.sc.dead);
export function pauseBusiness(on, cover = on) {
    if (!B) return;
    B.sc.paused = on;
    B.host?.closest('.cr-inner')?.classList.toggle('cr-paused', on && cover);
    const pb = document.querySelector('#crumble-root .cr-pause');
    if (pb) { pb.innerHTML = on ? PLAY : PAUSE; pb.setAttribute('aria-label', on ? L('다시 시작', 'Resume') : L('일시정지', 'Pause')); }
}
export const bizPaused = () => !!B?.sc?.paused;
export function resumeIfNeeded() { /* 영업 화면은 render()에서 이어서 시작 */ }

const PAUSE = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1.5" fill="#8A5A36"/><rect x="11.5" y="4" width="3.5" height="12" rx="1.5" fill="#8A5A36"/></svg>';
const PLAY = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" fill="#8A5A36"/></svg>';

function steps(now) {
    const st = [['morning', '아침', 'Morning'], ['open', '영업', 'Open'], ['close', '마감', 'Close']];
    const idx = st.findIndex(s => s[0] === now);
    return st.map(([id, ko, en], i) => `<span class="cr-step${i < idx ? ' done' : i === idx ? ' now' : ''}">${i < idx ? '✓ ' : ''}${L(ko, en)}</span>`).join('<span class="cr-arrow">›</span>');
}

export function renderBusiness(box) {
    const g = G();
    if (g.phase === 'morning') morningScreen(box);
    else if (g.phase === 'open') openScreen(box);
    else if (g.phase === 'close') closeScreen(box);
}

// ======================= ① 아침 준비 =======================
function morningScreen(box) {
    const g = G();
    const t = prepToday(g);
    if (!t.noticesDone) { t.notices = applyNotices(g); t.noticesDone = true; }
    if (!t.events.length && !t.picked) { t.events = pickEvents(g, 'direct').map(e => ({ ...e, text: fallbackEventText(e) })); t.picked = true; }
    save();
    if (!t.aiDone && !t.aiError && !inflight.has('m' + g.id + g.day)) startMorningAI(g);

    box.innerHTML = `<header class="cr-top biz"><div class="cr-row">${steps('morning')}<span class="cr-money sm" id="cr-mMoney"></span>${gearBtn()}${closeBtn()}</div>
<div class="cr-time"><b>${L('오전 9:40', '9:40 AM')}</b>${bar(4, '#FBE29A')}<span class="cr-muted">${L('10시 문 열기', 'Opens at 10')}</span></div></header><div class="cr-drip"></div>
<main class="cr-main">
${(t.notices || []).map(n => `<div class="cr-alertCard">🌙 ${esc(n.text)}</div>`).join('')}
<div class="cr-sceneHost" id="cr-mScene"></div>
<section class="cr-card"><div class="cr-talk" id="cr-mTalk"></div></section>
<section class="cr-card"><div class="cr-ttl">🍰 ${L('재료 사기', 'Buy stock')}<small>${F(L('지금 재고 {a} · 개당 {p}', 'In stock {a} · {p} each'), { a: g.ing, p: money(ING_PRICE) })}</small></div>
<div class="cr-row"><span class="cr-stp"><button type="button" data-m="buy" data-d="-5" aria-label="${L('재료 덜 사기', 'Buy less')}">−</button><b id="cr-buyN"></b><button type="button" data-m="buy" data-d="5" aria-label="${L('재료 더 사기', 'Buy more')}">+</button></span>
<span class="cr-muted cr-right">${L('총', 'Total')} <b id="cr-buyCost"></b><br>${L('디저트는 남으면 버려요', 'Leftover desserts get tossed')}</span></div></section>
<section class="cr-card"><div class="cr-ttl">📋 ${L('오늘의 메뉴', 'Today\'s menu')}<small>${L('가격을 바꿔 보세요', 'Adjust prices')}</small></div><div id="cr-menu"></div></section>
<section class="cr-card"><div class="cr-ttl">🧁 ${L('예상 손님', 'Expected customers')}<small>${L('평판', 'Rep')} ${Math.round(g.rep)} · ${weatherLabel(g.weather)}${t.crowd ? ' · ' + L('손님 많은 날', 'Busy day') : ''}</small></div><b class="cr-big" id="cr-eGuest"></b><div class="cr-chips" id="cr-eWarn"></div></section>
<div class="cr-ai" id="cr-aiState"></div>
<button class="cr-pbtn" type="button" id="cr-open">${L('오늘 영업 시작 ›', 'Open the shop ›')}</button>
</main>`;
    const host = box.querySelector('#cr-mScene');
    const sc = addScene(createScene(host, { size: g.size, height: 230, zoom: .78, focus: [5, 3], zoomKey: 'morning' }));
    const ents = {};
    const react = (id, key) => {
        if (!id) return;
        const txt = line(id, key);
        const talk = box.querySelector('#cr-mTalk');
        talk.innerHTML = `${faceChip(id, 30)}<p><b>${esc(book(id)?.name)}</b> · ${esc(txt)}</p>`;
        if (ents[id]?.el.isConnected) sc.say(ents[id], txt, 2800);
    };
    const w = workingStaff(g);
    const byRole = r => (w.find(s => s.role === r) || w.find(s => s.role === 'all') || w[0])?.id;
    const update = () => {
        box.querySelector('#cr-buyN').textContent = t.buy;
        box.querySelector('#cr-buyCost').textContent = money(ingCost(t.buy));
        box.querySelector('#cr-mMoney').textContent = '💰 ' + money(g.money - ingCost(t.buy));
        box.querySelector('#cr-mMoney').classList.toggle('neg', g.money - ingCost(t.buy) < 0);
        box.querySelector('#cr-menu').innerHTML = g.menu.map((m, i) => {
            const info = menuInfo(m.id), r = m.p / info.base;
            const tag = r > 1.15 ? `<span class="cr-tag warn">${L('비싸요', 'Pricey')}</span>` : r < .85 ? `<span class="cr-tag good">${L('싸요', 'Cheap')}</span>` : '';
            return `<div class="cr-line"><span class="cr-dot" style="background:${info.col}"></span><span>${L(...info.n)}</span>${tag}<span class="cr-stp" style="margin-left:auto"><button type="button" data-m="price" data-i="${i}" data-d="-500" aria-label="-">−</button><b class="wide">${money(m.p, false)}</b><button type="button" data-m="price" data-i="${i}" data-d="500" aria-label="+">+</button></span></div>`;
        }).join('');
        const eg = expectedGuests(g);
        box.querySelector('#cr-eGuest').textContent = F(L('{a}~{b}명', '{a}–{b} people'), { a: Math.max(2, eg - 3), b: eg + 3 });
        const have = g.ing + t.buy, need = Math.round(eg * .9);
        let wn = `<span class="cr-chip">${L('필요한 재료 약', 'Stock needed ~')} <b>${need}</b></span><span class="cr-chip">${L('준비한 재료', 'Prepared')} <b>${have}</b></span>`;
        if (have < need - 2) wn += `<span class="cr-chip warn">${L('모자랄 수 있어요', 'Might run short')}</span>`;
        else if (have > need * 1.4) wn += `<span class="cr-chip warn">${L('많이 남으면 버려야 해요', 'Lots may go to waste')}</span>`;
        else wn += `<span class="cr-chip good">${L('딱 적당해요', 'Just right')}</span>`;
        box.querySelector('#cr-eWarn').innerHTML = wn;
        sc.boxes(Math.ceil(t.buy / 5));
        const ai = box.querySelector('#cr-aiState');
        ai.innerHTML = t.aiDone ? '' : t.aiError ? `<span class="cr-chip warn">${L('대사를 못 받아서 기본 대사로 진행해요', 'Using default lines (AI unavailable)')}</span>` : `<span class="cr-chip cr-loading">${L('직원들이 오늘 할 말을 고르는 중…', 'Staff are getting ready…')}</span>`;
    };
    box.querySelector('main').addEventListener('click', e => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        if (b.dataset.m === 'buy') {
            t.buy = clamp(t.buy + +b.dataset.d, 0, 60);
            if (+b.dataset.d > 0) react(t.buy >= 25 ? (w.find(s => hasTag(s.id, 'quiet', 'prickly', 'neat'))?.id || byRole('floor')) : byRole('bake'), t.buy >= 25 ? 'buyMore' : 'greet');
            else react(byRole('bake'), 'buyLess');
        } else {
            const m = g.menu[+b.dataset.i], base = menuInfo(m.id).base;
            m.p = clamp(m.p + +b.dataset.d, Math.round(base * .4 / 100) * 100, base * 2);
            const r = m.p / base;
            react(byRole('serve'), r > 1.15 ? 'pricy' : r < .85 ? 'cheap' : 'tap1');
        }
        update(); save();
    });
    box.querySelector('#cr-open').onclick = () => {
        const cost = ingCost(t.buy);
        g.money -= cost; g.ing += t.buy;
        t.spentIng = cost;
        t.snap = { money: g.money, rep: g.rep, ing: g.ing, clean: g.clean };
        t.biz = null;
        g.phase = 'open';
        save(); render();
    };
    t.onAi = () => { if (box.isConnected) update(); };
    update();
    // 장면: 어두운 가게 → 불 켜짐 → 직원 출근
    sc.setEnv({ tod: 'dawn', weather: g.weather }); sc.sign('CLOSED'); sc.display(0);
    const st = []; for (let i = 0; i < Math.round((100 - g.clean) / 18); i++) { const [c, r] = sc.randomFree(); st.push({ c, r }); }
    sc.setStains(st);
    (async () => {
        try {
            await sc.wait(800);
            sc.setEnv({ tod: 'am', weather: g.weather }); sc.lamps(.8);
            const door = [sc.lay.door, 0];
            const jobs = [];
            for (const s of w) {
                await sc.wait(900);
                const e = sc.ent({ staffId: s.id, label: book(s.id)?.name, c: door[0], r: door[1], onTap: e => { sc.jump(e); react(s.id, 'tap' + (1 + Math.floor(Math.random() * 3))); } });
                ents[s.id] = e; e.el.style.opacity = 0; await sc.wait(30); e.el.style.opacity = 1;
                sc.say(e, line(s.id, 'greet'), 1800);
                jobs.push((async () => {
                    if (s.role === 'bake' || s.role === 'all') {
                        await sc.go(e, sc.lay.spots.oven); sc.emo(e, 'spark'); sc.work(e, true); sc.steam(true);
                        await sc.wait(4200); sc.work(e, false); sc.steam(false); sc.emo(e, null);
                        await sc.go(e, sc.lay.spots.display); sc.display(2); await sc.wait(600); sc.display(3);
                        await sc.go(e, sc.lay.spots.oven); sc.emo(e, 'spark'); sc.work(e, true); sc.steam(true);
                    } else if (s.role === 'serve') {
                        await sc.go(e, sc.lay.spots.counter); sc.emo(e, 'note'); sc.work(e, true); await sc.wait(3000); sc.work(e, false);
                        if (hasTag(s.id, 'lazy') || (s.fatigue ?? 0) > 60) { sc.emo(e, 'zzz'); sc.say(e, line(s.id, 'tired'), 1500); } else sc.emo(e, null);
                    } else {
                        await sc.go(e, [sc.lay.boxSpot[0], sc.lay.frontRow]); sc.emo(e, 'box'); await sc.wait(1400);
                        for (const x of [...st]) { await sc.go(e, [x.c, x.r]); sc.emo(e, 'broom'); sc.work(e, true); await sc.wait(1800); sc.work(e, false); st.splice(st.indexOf(x), 1); sc.setStains(st); }
                        sc.emo(e, null); await sc.go(e, sc.lay.idle[0]);
                    }
                })().catch(() => { }));
            }
            await Promise.all(jobs);
        } catch { /* 화면이 바뀜 */ }
    })();
    if (w[0]) setTimeout(() => react(w[0].id, 'greet'), 300);
}

async function startMorningAI(g) {
    const t = g.today;
    const key = 'm' + g.id + g.day;
    inflight.add(key);
    let r = null;
    try { r = await morningPrep(g, t.events); } catch (e) { console.warn(e); }
    inflight.delete(key);
    if (G() !== g || g.today !== t) return;
    if (r) {
        t.lines = r.lines;
        t.events.forEach((ev, i) => {
            const x = r.texts[i]; if (!x || ev.shown) return;
            const fb = fallbackEventText(ev);
            ev.text = {
                title: x.title || fb.title, situation: x.situation || fb.situation, guest: x.guest ?? fb.guest, staff: x.staff || fb.staff,
                choices: fb.choices.map((c, ci) => ({ label: x.choices[ci]?.label || c.label, line: x.choices[ci]?.line || '', interfere: !!x.choices[ci]?.interfere, effects: x.choices[ci]?.effects || null })),
            };
        });
        t.aiDone = true;
    } else t.aiError = true;
    save();
    t.onAi?.();
}

// ======================= ② 영업 중 =======================
function openScreen(box) {
    const g = G(); const t = g.today;
    // 새로고침 등으로 끊겼으면 영업 시작 때로 되돌려 다시
    if (t.biz && !t.biz.finished && t.snap) { Object.assign(g, { money: t.snap.money, rep: t.snap.rep, ing: t.snap.ing, clean: t.snap.clean }); t.events.forEach(e => { delete e.done; delete e.shown; }); }
    const biz = t.biz = newBiz(g);
    const minutes = clamp(S().businessMinutes || 4, 2, 10);
    const D = minutes * 60000;
    box.innerHTML = `<header class="cr-top biz"><div class="cr-row">${steps('open')}${gearBtn(true)}<button class="cr-pause" type="button" aria-label="${L('일시정지', 'Pause')}">${PAUSE}</button></div>
<div class="cr-time"><b id="cr-clock"></b><span class="cr-bar time"><i id="cr-tfill"></i></span><span class="cr-muted">${L('저녁 8시 마감', 'Closes 8 PM')}</span></div></header><div class="cr-drip"></div>
<main class="cr-main">
<div class="cr-sceneHost" id="cr-oScene"></div>
<div class="cr-chips" id="cr-chips"></div>
<section class="cr-card" id="cr-who"></section>
<p class="cr-muted cr-center">${L('직원을 눌러 보세요 · [찾기]를 누르면 그 직원 쪽으로 확대돼요', 'Tap staff · [Find] zooms to them')}</p>
</main><div class="cr-pauseCover"><button type="button" class="cr-pbtn" data-b="resume">▶ ${L('다시 시작', 'Resume')}</button></div>`;
    const host = box.querySelector('#cr-oScene');
    const lay = (() => { const s = createScene(host, { size: g.size, height: 360, zoom: .85, focus: [6, 3], zoomKey: 'open' }); addScene(s); return s; })();
    const sc = lay;
    B = { sc, host, biz, running: true, queue: [], guests: [], shelf: 0, counterBy: null, ovenBy: null, active: null, wait: 0, elapsed: 0, ents: {} };
    const L0 = sc.lay;
    const W = workingStaff(g);
    const doing = {};

    // 진열대: 아침에 구운 첫 판
    const first = Math.min(3, g.ing); g.ing -= first; B.shelf = first; biz.baked += first; sc.display(B.shelf);
    sc.sign('OPEN');
    const stains = []; for (let i = 0; i < Math.round((100 - g.clean) / 16); i++) { const [c, r] = sc.randomFree(); stains.push({ c, r, dx: Math.random() * 8 - 4 }); }
    sc.setStains(stains);
    const addStain = (c, r) => { if (stains.length >= 10) return; stains.push({ c, r, dx: Math.random() * 8 - 4 }); g.clean = clamp(g.clean - 4, 0, 100); sc.setStains(stains); };

    // ---------- 화면 갱신 ----------
    const chips = () => {
        box.querySelector('#cr-chips').innerHTML =
            `<span class="cr-chip">${L('손님', 'Guests')} <b>${biz.served}</b></span><span class="cr-chip">${L('매출', 'Sales')} <b>${money(biz.revenue)}</b></span><span class="cr-chip">${L('평판', 'Rep')} <b>${Math.round(g.rep)}</b></span>` +
            `<span class="cr-chip${g.ing + B.shelf < 4 ? ' warn' : ''}">${L('재료', 'Stock')} <b>${g.ing}</b>+${B.shelf}</span><span class="cr-chip${g.clean < 35 ? ' warn' : ''}">${L('청결', 'Clean')} <b>${Math.round(g.clean)}</b></span>` +
            (t.crowd ? `<span class="cr-chip warn">${L('손님 많은 날', 'Busy day')}</span>` : '');
    };
    const who = () => {
        box.querySelector('#cr-who').innerHTML = `<div class="cr-ttl">${L('지금 가게 안', 'In the shop now')}</div>` + W.map(s => `<div class="cr-whoRow">${faceChip(s.id, 28)}<b>${esc(book(s.id)?.name)}</b><span class="cr-muted">${esc(doing[s.id] || roleLabel(s.role))}</span><button type="button" class="cr-find" data-b="find" data-id="${esc(s.id)}">${L('찾기', 'Find')}</button></div>`).join('');
    };
    const setDoing = (s, txt) => { doing[s.id] = txt; const row = [...box.querySelectorAll('.cr-whoRow')].find(r => r.querySelector('[data-id]')?.dataset.id === s.id); if (row) row.querySelector('.cr-muted').textContent = txt; };
    chips(); who();

    // ---------- 직원 ----------
    for (const s of W) {
        const spot = s.role === 'bake' ? L0.spots.oven : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0];
        const e = sc.ent({
            staffId: s.id, label: book(s.id)?.name, c: spot[0], r: spot[1],
            onTap: e => { if (e.alerted) { openEvent(); return; } sc.jump(e); sc.say(e, tapLine(s.id)); },
        });
        B.ents[s.id] = e;
    }
    const E = s => B.ents[s.id];
    const at = (e, p) => e.c === p[0] && e.r === p[1];
    const walk = async (s, p) => {
        const e = E(s);
        if (at(e, p)) return;
        await sc.go(e, p);
        if (hasTag(s.id, 'clumsy') && chance(.06) && e.r >= L0.frontRow) addStain(e.c, e.r);
    };
    const fat = s => ((s.fatigue ?? 30) > 75 ? 1.3 : 1);

    const tasks = {
        async bake(s) {
            if (g.ing <= 0 || B.shelf >= 6 || (B.ovenBy && B.ovenBy !== s.id)) return false;
            if (s.role === 'all' && B.queue.length && B.shelf > 0) return false;
            const e = E(s); B.ovenBy = s.id;
            setDoing(s, L('오븐 앞 · 굽는 중', 'Oven · baking'));
            await walk(s, L0.spots.oven); sc.emo(e, 'spark'); sc.work(e, true); sc.steam(true);
            await sc.wait(Math.max(1800, 4400 - s.bake * 240) * fat(s));
            sc.work(e, false); sc.steam(false);
            const pBurn = .2 - s.bake * .018 + (hasTag(s.id, 'clumsy') ? .08 : 0) + ((s.mood ?? 60) < 35 ? .06 : 0) + ((s.fatigue ?? 30) > 75 ? .05 : 0);
            if (chance(Math.max(.02, pBurn))) {
                const helper = friendSaves(g, biz, s.id);
                if (helper) { sc.say(B.ents[helper] || e, L('잠깐! 내가 볼게!', 'Wait! I\'ve got it!'), 2200); sc.emo(e, 'heart'); toast(F(L('{a}가 {b}의 실수를 막아 줬어요', '{a} saved {b}\'s batch'), { a: book(helper)?.name, b: book(s.id)?.name })); }
                else { biz.burnt++; g.ing = Math.max(0, g.ing - 1); sc.emo(e, 'sweat'); sc.say(e, line(s.id, 'mistake'), 2200); setDoing(s, L('오븐 앞 · 태움', 'Oven · burnt it')); await sc.wait(1400); B.ovenBy = null; chips(); return true; }
            }
            const batch = Math.min(3, g.ing); g.ing -= batch; biz.baked += batch;
            B.ovenBy = null;
            sc.emo(e, null); setDoing(s, L('진열대로 옮기는 중', 'Stocking the display'));
            await walk(s, L0.spots.display);
            B.shelf += batch; sc.display(B.shelf); chips();
            const pSneak = hasTag(s.id, 'glutton') ? .25 : hasTag(s.id, 'lazy') ? .08 : .03;
            if (B.shelf > 0 && chance(pSneak)) {
                B.shelf--; biz.eaten++; sc.display(B.shelf); sc.emo(e, 'cake'); sc.say(e, line(s.id, 'sneak'), 2400);
                setDoing(s, L('진열대 · 몰래 먹는 중', 'Display · sneaking a bite')); await sc.wait(2400); sc.emo(e, null);
            } else await sc.wait(500);
            return true;
        },
        async serve(s, helping) {
            const q = B.queue[0];
            if (!q || !q.arrived || q.done || (B.counterBy && B.counterBy !== s.id)) {
                if (s.role === 'serve' && !B.counterBy && !at(E(s), L0.spots.counter) && !helping) { await walk(s, L0.spots.counter); return true; }
                return false;
            }
            const e = E(s); B.counterBy = s.id;
            await walk(s, L0.spots.counter);
            setDoing(s, L('계산대 · 주문 받는 중', 'Counter · taking orders'));
            sc.work(e, true); sc.emo(e, null);
            await sc.wait(Math.max(700, 2100 - s.serve * 120) * fat(s));
            sc.work(e, false);
            if (B.shelf > 0) {
                B.shelf--; sc.display(B.shelf); sellOne(g, biz); sc.emo(q.e, 'bag'); q.done = 'ok';
                const freebie = hasTag(s.id, 'kind', 'flatterer', 'chatty') ? .14 : .03;
                if (B.shelf > 0 && chance(freebie)) { B.shelf--; sc.display(B.shelf); sc.emo(e, 'note'); sc.say(e, L('하나 서비스예요~', 'This one\'s on the house~'), 1600); }
                else if (chance(.25)) sc.say(e, L('감사합니다~', 'Thank you~'), 1200);
                if (hasTag(s.id, 'prickly') && chance(.15)) { g.rep = clamp(g.rep - .5, 0, 100); sc.emo(q.e, 'sweat'); }
            } else {
                q.done = 'soldout'; biz.soldout++; g.rep = clamp(g.rep - 1, 0, 100); sc.say(q.e, L('다 팔렸네…', 'All sold out…'), 1800); sc.emo(q.e, 'sweat');
                sc.say(e, line(s.id, 'soldout'), 1800);
            }
            B.queue.shift(); shiftQueue(); B.counterBy = null; chips();
            return true;
        },
        async chat(s) {
            if (!hasTag(s.id, 'chatty') && !(hasTag(s.id, 'kind') && chance(.3))) return false;
            const seated = L0.seats.filter(x => x.g);
            if (B.queue.length || !seated.length || !chance(.22)) return false;
            const seat = pick(seated), e = E(s);
            setDoing(s, L('테이블 · 손님이랑 수다', 'Table · chatting'));
            sc.emo(e, 'note');
            await walk(s, seat.chat);
            sc.say(e, line(s.id, 'chat'), 2600);
            await sc.wait(4200);
            sc.emo(e, null);
            return true;
        },
        async clean(s) {
            if (!stains.length) return false;
            if (s.role !== 'floor' && !hasTag(s.id, 'neat', 'diligent') && stains.length < 4) return false;
            const e = E(s);
            const st = stains.reduce((a, x) => (Math.abs(x.c - e.c) + Math.abs(x.r - e.r) < Math.abs(a.c - e.c) + Math.abs(a.r - e.r) ? x : a));
            setDoing(s, L('바닥 얼룩 치우러 가는 중', 'Going to wipe a spill'));
            sc.emo(e, 'broom');
            await walk(s, [st.c, st.r]);
            setDoing(s, L('바닥 청소 중', 'Mopping'));
            sc.work(e, true); await sc.wait(2200 * fat(s)); sc.work(e, false);
            const i = stains.indexOf(st); if (i >= 0) stains.splice(i, 1);
            g.clean = clamp(g.clean + 4, 0, 100); sc.setStains(stains); chips();
            if (chance(.3)) sc.say(e, line(s.id, 'clean'), 1800);
            sc.emo(e, null);
            return true;
        },
        async help(s) {
            if (B.queue.length < 2 || B.counterBy) return false;
            if (hasTag(s.id, 'lazy') && chance(.6)) return false;
            return tasks.serve(s, true);
        },
        async doze(s) {
            const tired = (s.fatigue ?? 30) > 70 || (t.crowd && chance(.3));
            if (!(tired || hasTag(s.id, 'lazy')) || !chance(.18)) return false;
            const e = E(s);
            setDoing(s, L('구석 · 꾸벅꾸벅', 'Corner · dozing'));
            sc.emo(e, 'zzz'); if (chance(.5)) sc.say(e, line(s.id, 'tired'), 1600);
            await sc.wait(3800); sc.emo(e, null);
            return true;
        },
        async idle(s) {
            const e = E(s);
            const home = s.role === 'bake' ? L0.spots.oven : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0];
            if (!at(e, home)) await walk(s, home);
            if (s.role === 'bake' && g.ing <= 0) { sc.emo(e, 'sweat'); setDoing(s, L('오븐 앞 · 재료가 없어 멍', 'Oven · out of stock')); if (chance(.15)) sc.say(e, line(s.id, 'soldout'), 1800); }
            else if (s.role === 'bake') { sc.emo(e, (s.mood ?? 60) > 70 ? 'note' : null); setDoing(s, L('오븐 앞 · 진열대 꽉 참', 'Oven · display is full')); }
            else if (s.role === 'serve' || s.role === 'all') setDoing(s, B.queue.length ? L('계산대 · 손님 기다리는 중', 'Counter · waiting') : L('계산대 · 한가함', 'Counter · quiet'));
            else setDoing(s, L('구석 · 말없이 서 있음', 'Corner · standing by'));
            if (B.guests.length > 5 && chance(.08)) sc.say(e, line(s.id, 'busy'), 1800);
            await sc.wait(900);
            return true;
        },
    };
    const PLAN = {
        bake: ['bake', 'help', 'idle'],
        serve: ['serve', 'chat', 'doze', 'clean', 'idle'],
        floor: ['clean', 'help', 'doze', 'chat', 'idle'],
        all: ['serve', 'bake', 'clean', 'idle'],
    };
    const brain = async s => {
        while (B.running && !sc.dead) {
            try {
                if (E(s).alerted) { await sc.wait(500); continue; }
                for (const k of PLAN[s.role] || PLAN.floor) if (await tasks[k](s)) break;
            } catch (err) { if (err === 'stop') return; console.error('[Crumble]', err); try { await sc.wait(1000); } catch { return; } }
        }
    };

    // ---------- 손님 ----------
    const GCOL = ['#C7B6E0', '#BFD9E8', '#F2C6A0', '#CDE3B8', '#F7C6D3', '#E8D3A8'];
    const door = [L0.door, 0];
    const shiftQueue = () => B.queue.forEach((q, i) => { q.arrived = false; sc.go(q.e, L0.queue[i]).then(() => { q.arrived = true; }).catch(() => { }); });
    const patience = clamp(D / 17, 9000, 26000);
    const guestLife = async () => {
        const e = sc.ent({ shirt: pick(GCOL), c: door[0], r: door[1] });
        const q = { e, arrived: false, done: null };
        B.guests.push(q); B.queue.push(q);
        e.el.style.opacity = 0;
        try {
            await sc.wait(40); e.el.style.opacity = 1;
            if (g.weather === 'hot' && chance(.4)) sc.say(e, L('빙수 있어요?', 'Got any bingsu?'), 1800);
            if (g.weather === 'rain') sc.emo(e, 'wet');
            await sc.go(e, L0.queue[B.queue.indexOf(q)] || L0.queue[2]); q.arrived = true;
            let waited = 0;
            while (!q.done) {
                await sc.wait(500); waited += 500;
                if (waited > patience * .45 && e.icon !== 'sweat' && e.icon !== 'angry') sc.emo(e, 'sweat');
                if (waited > patience * .75 && e.icon !== 'angry') sc.emo(e, 'angry');
                if (waited > patience && !q.done) {
                    if (B.counterBy && B.queue[0] === q) continue; // 지금 주문 받는 중
                    sc.say(e, L('너무 오래 걸리네…', 'This is taking forever…'), 1800);
                    g.rep = clamp(g.rep - 2, 0, 100); biz.left++; q.done = 'left';
                    B.queue = B.queue.filter(x => x !== q); shiftQueue(); chips();
                }
            }
            const free = L0.seats.filter(x => !x.g);
            if (q.done === 'ok' && free.length && chance(.6)) {
                const seat = pick(free); seat.g = q;
                await sc.go(e, [seat.c, seat.r]); sc.emo(e, 'heart');
                await sc.wait(6500 + Math.random() * 3000);
                if (chance(.3 + (100 - g.clean) / 260)) addStain(seat.c, seat.r);
                seat.g = null;
            }
            await sc.go(e, [L0.door, L0.frontRow]);
            await sc.go(e, door);
            e.el.style.opacity = 0; await sc.wait(450);
        } catch { /* 끝 */ }
        sc.remove(e); B.guests = B.guests.filter(x => x !== q); B.queue = B.queue.filter(x => x !== q);
    };
    const maxGuests = L0.seats.length + 3;
    const spawner = async () => {
        try {
            await sc.wait(1200);
            while (B.running && B.elapsed < D * .94) {
                const exp = Math.max(3, expectedGuests(g) * biz.mult);
                const gap = (D * .9) / exp;
                await sc.wait(gap * (.6 + Math.random() * .8));
                if (B.elapsed >= D * .94) break;
                if (B.queue.length < 3 && B.guests.length < maxGuests) guestLife();
                else biz.left += chance(.5) ? 1 : 0; // 줄이 꽉 차 그냥 지나감
            }
        } catch { /* 끝 */ }
    };
    const mess = async () => {
        try {
            while (B.running) {
                await sc.wait(3200);
                if (chance((100 - g.clean) / 180 + B.guests.length * .035)) { const [c, r] = sc.randomFree(); addStain(c, r); chips(); }
            }
        } catch { /* 끝 */ }
    };

    // ---------- 사건 ----------
    const openEvent = () => {
        const ev = B.active; if (!ev) return;
        pauseBusiness(true, false);
        const tx = ev.text || fallbackEventText(ev);
        const k = EVENT_KINDS[ev.kind];
        const sid = ev.staffIds[0];
        openSheet(`<div class="cr-row"><span class="cr-evTag ${k.cat}">${esc(tx.title)}</span><span class="cr-muted" style="margin-left:auto">${F(L('{n} 담당', '{n} handling'), { n: book(sid)?.name })}</span></div>
<p class="cr-situ">${esc(tx.situation)}</p>
${tx.guest ? `<div class="cr-say2"><span class="cr-face guest">🙂</span><p>${esc(tx.guest)}</p></div>` : ''}
${ev.staffIds.map((id, i) => (i === 0 && tx.staff) ? `<div class="cr-say2">${faceChip(id, 30)}<p>${esc(tx.staff)}</p></div>` : '').join('')}
${tx.choices.map((c, i) => `<button type="button" class="cr-opt" data-b="opt" data-i="${i}">${esc(c.label)}</button>`).join('')}`, true);
    };
    const finishEvent = (ci, auto) => {
        const ev = B.active; if (!ev) return;
        const res = resolveEvent(g, ev, ci, biz);
        closeSheet(); pauseBusiness(false);
        for (const id of ev.staffIds) { const e = B.ents[id]; if (e) sc.alert(e, false); }
        const e = B.ents[ev.staffIds[0]];
        if (e) { sc.emo(e, res.interfere ? 'note' : res.ok ? 'heart' : 'sweat'); if (res.line) sc.say(e, res.line, 3200); }
        const dt = deltaText(res.delta);
        toast((auto ? L('사장님이 안 봐서 알아서 했어요 · ', 'You didn\'t look, so they handled it · ') : '') + (res.interfere ? L('성격이 끼어들었어요 · ', 'Personality got in the way · ') : '') + (dt || L('별일 없이 지나갔어요', 'Nothing much changed')), 3200);
        B.active = null; B.wait = 0;
        if (ev.kind === 'inspection' && ci === 1) { stains.length = 0; sc.setStains(stains); }
        chips(); save();
    };

    // ---------- 시계 ----------
    const clockEl = box.querySelector('#cr-clock'), fill = box.querySelector('#cr-tfill');
    let tod = '';
    const showClock = () => {
        const tt = clamp(B.elapsed / D, 0, 1);
        const mins = 10 * 60 + Math.round(tt * 600);
        const hh = Math.floor(mins / 60), mm = String(mins % 60 - mins % 10).padStart(2, '0');
        clockEl.textContent = L(`${hh < 12 ? '오전' : hh < 18 ? '오후' : '저녁'} ${hh > 12 ? hh - 12 : hh}:${mm}`, `${hh > 12 ? hh - 12 : hh}:${mm} ${hh < 12 ? 'AM' : 'PM'}`);
        fill.style.width = (tt * 100) + '%';
        const nt = tt < .2 ? 'am' : tt < .75 ? 'pm' : 'eve';
        if (nt !== tod) { tod = nt; sc.setEnv({ tod, weather: g.weather }); }
    };
    const ticker = async () => {
        try {
            while (B.running) {
                await sc.wait(250);
                B.elapsed += 250; showClock();
                const tt = B.elapsed / D;
                if (!B.active) {
                    const ev = t.events.find(x => !x.done && !x.shown && tt >= x.at);
                    if (ev) {
                        const e = B.ents[ev.staffIds[0]];
                        ev.shown = true;
                        if (!e) { ev.done = { skipped: true }; continue; }
                        B.active = ev; B.wait = 0;
                        sc.alert(e, true); sc.emo(e, 'sweat'); sc.focus(e, 1.3);
                        e.el.setAttribute('aria-label', F(L('{n} — 사건 발생, 눌러서 보기', '{n} — something happened, tap to see'), { n: book(ev.staffIds[0])?.name }));
                    }
                } else {
                    B.wait += 250;
                    if (B.wait > Math.max(20000, D * .1)) finishEvent(2, true);
                }
                if (tt >= 1 && !B.active && (B.guests.length === 0 || tt >= 1.12)) { await finish(); return; }
            }
        } catch { /* 끝 */ }
    };
    const finish = async () => {
        B.running = false;
        biz.finished = true;
        biz.shelfLeft = B.shelf;
        t.events.filter(x => !x.done).forEach(x => (x.done = { skipped: true }));
        sc.setEnv({ tod: 'eve', weather: g.weather }); sc.sign('CLOSED');
        toast(L('저녁 8시, 영업 끝!', '8 PM — closing time!'), 1800);
        try { await new Promise(r => setTimeout(r, 1400)); } catch { /* */ }
        closeDay(g, biz);
        B = null;
        render();
    };

    // ---------- 버튼 ----------
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-b]');
        if (b) {
            if (b.dataset.b === 'find') { const en = B?.ents[b.dataset.id]; if (en) { sc.focus(en, 1.5); sc.say(en, L('저 여기요!', 'Over here!'), 1400); } }
            if (b.dataset.b === 'resume') pauseBusiness(false);
            return;
        }
        if (e.target.closest('.cr-pause')) {
            if (sc.paused && !B?.active) { pauseBusiness(false); return; }
            pauseBusiness(true);
            closeWindow(); // 가게가 멈추고 채팅으로
        }
    });
    const sheet = document.querySelector('#crumble-root .cr-sheet');
    B.sheetHandler = e => { const b = e.target.closest('[data-b="opt"]'); if (b && B?.active) finishEvent(+b.dataset.i, false); };
    sheet.onclick = B.sheetHandler;

    sc.setEnv({ tod: 'am', weather: g.weather });
    showClock();
    W.forEach(s => brain(s));
    ticker(); spawner(); mess();
    setTimeout(() => { if (B && B.running) guestLife(); }, 700);
    t.biz = biz; save();
}

// ======================= ③ 마감 정산 =======================
function closeScreen(box) {
    const g = G(); const t = g.today; const biz = t.biz || newBiz(g); const sum = t.closed?.summary || {};
    const W = g.staff.filter(s => !s.absent);
    const j = g.journal.find(x => x.day === g.day && x.mode === 'direct');
    const expOf = id => (biz.expLog || []).filter(x => x.id === id).reduce((a, x) => { a[x.skill] = (a[x.skill] || 0) + x.n; return a; }, {});
    const repD = Math.round(g.rep - biz.rep0), cleanD = Math.round(g.clean - biz.clean0);
    const net = g.money - biz.money0 - (t.spentIng || 0);
    box.innerHTML = `<header class="cr-top biz"><div class="cr-row">${steps('close')}<span class="cr-money sm${g.money < 0 ? ' neg' : ''}">💰 ${money(g.money)}</span>${gearBtn()}${closeBtn()}</div>
<div class="cr-time"><b>${L('저녁 8:00', '8:00 PM')}</b>${bar(100, '#FBE29A')}<span class="cr-muted">${L('문 닫음', 'Closed')}</span></div></header><div class="cr-drip"></div>
<main class="cr-main">
<div class="cr-sceneHost" id="cr-cScene"></div>
<section class="cr-card"><div class="cr-ttl">💰 ${L('오늘 번 돈', 'Today\'s earnings')}<small>${F(L('{n}일째', 'Day {n}'), { n: g.day })}</small></div>
<b class="cr-big ${net < 0 ? 'neg' : 'pos'}">${signedMoney(net)}</b>
<div class="cr-line"><span>${F(L('매출 (손님 {n}명)', 'Sales ({n} guests)'), { n: biz.served })}</span><b>${signedMoney(biz.revenue)}</b></div>
<div class="cr-line"><span>${L('재료', 'Stock')}</span><b>${signedMoney(-(t.spentIng || 0))}</b></div>
<div class="cr-line"><span>${F(L('월급 ({n}명)', 'Wages ({n})'), { n: g.staff.length })}</span><b>${signedMoney(-(sum.wages || 0))}</b></div>
${sum.interest ? `<div class="cr-line"><span>${L('대출 이자', 'Loan interest')}</span><b>${signedMoney(-sum.interest)}</b></div>` : ''}
${biz.eventMoney ? `<div class="cr-line"><span>${L('사건', 'Events')}</span><b>${signedMoney(biz.eventMoney)}</b></div>` : ''}
</section>
<div class="cr-chips">
<span class="cr-chip ${repD >= 0 ? 'good' : 'warn'}">${L('평판', 'Rep')} <b>${Math.round(biz.rep0)} → ${Math.round(g.rep)}</b> ${repD >= 0 ? '▲' : '▼'}${Math.abs(repD)}</span>
<span class="cr-chip">${L('재료 남음', 'Stock left')} <b>${g.ing}</b></span>
${(sum.spoiled || 0) + (biz.shelfLeft || 0) ? `<span class="cr-chip warn">${L('버린 재료', 'Tossed')} <b>${(sum.spoiled || 0) + (biz.shelfLeft || 0)}</b></span>` : ''}
<span class="cr-chip ${cleanD >= 0 ? '' : 'warn'}">${L('청결', 'Clean')} <b>${Math.round(biz.clean0)} → ${Math.round(g.clean)}</b></span>
${biz.left ? `<span class="cr-chip warn">${L('그냥 간 손님', 'Walked out')} <b>${biz.left}</b></span>` : ''}
${biz.burnt ? `<span class="cr-chip warn">${L('태운 판', 'Burnt')} <b>${biz.burnt}</b></span>` : ''}
${g.money < 0 ? `<span class="cr-chip warn">${F(L('빚 {n}/3일', 'Debt {n}/3'), { n: g.debtDays })}</span>` : ''}
</div>
<section class="cr-card"><div class="cr-ttl">👩‍🍳 ${L('오늘의 직원', 'Today\'s staff')}<small>${L('누르면 장면에서 찾아요', 'Tap to find in scene')}</small></div><div id="cr-cStaff"></div></section>
${worries(g).length ? `<section class="cr-card"><div class="cr-ttl">🌧 ${L('내일 걱정', 'Tomorrow\'s worries')}</div>${worries(g).map(w => `<div class="cr-line"><span class="cr-dot" style="background:${w.col}"></span>${esc(w.t)}</div>`).join('')}</section>` : ''}
<div class="cr-actions"><button class="cr-btn" type="button" data-c="log">${L('일지 보기', 'View log')}</button><button class="cr-pbtn" type="button" data-c="end" style="flex:1">${t.closed?.ended ? L('…마감하기', '…Close up') : L('마감하고 하루 끝 ›', 'Close up for the day ›')}</button></div>
</main>`;
    const drawStaff = () => {
        box.querySelector('#cr-cStaff').innerHTML = W.map(s => {
            const ex = expOf(s.id);
            const mood = s.mood ?? 60, moodT = mood >= 70 ? L('♪ 기분 좋음', '♪ Happy') : mood >= 45 ? L('… 그냥 그럼', '… Meh') : L('💧 조금 지침', '💧 Worn out');
            const tc = s.fatigue > 75 ? '#F28CA6' : s.fatigue > 55 ? '#F6C26B' : '#9CC48A';
            const diary = j?.diaries?.[s.id];
            return `<div class="cr-staffc" data-c="find" data-id="${esc(s.id)}">${faceChip(s.id, 30)}<div style="flex:1;min-width:0"><div class="cr-row"><b>${esc(book(s.id)?.name)}</b><span class="cr-tag">${moodT}</span><span class="cr-muted" style="margin-left:auto">${L('피로', 'Fatigue')}</span>${bar(s.fatigue ?? 0, tc)}</div>
<div class="cr-muted">${Object.entries(ex).map(([k, n]) => `+${n} ${k === 'bake' ? L('제빵', 'Baking') : L('접객', 'Service')} (${s.exp?.[k] || 0}/${skillNeed(s[k])})`).join(' · ')}</div>
${diary ? `<p class="cr-diary">“${esc(diary)}”</p>` : (t.diaryError || t.diaryDone) ? '' : `<p class="cr-diary"><span class="cr-loading">${L('일기 쓰는 중…', 'Writing diary…')}</span></p>`}</div></div>`;
        }).join('') || `<p class="cr-muted">${L('오늘 출근한 직원이 없어요.', 'No one worked today.')}</p>`;
    };
    drawStaff();
    const dkey = 'd' + g.id + g.day;
    if (!t.diaryDone && !t.diaryError && !inflight.has(dkey)) {
        inflight.add(dkey);
        (async () => {
            let r = null;
            try { r = await closingDiary(g, biz, g.inbox); } catch (e) { console.warn(e); }
            inflight.delete(dkey);
            t.diaryDone = true;
            if (r) {
                if (j) j.diaries = r.diary;
                for (const it of g.inbox) if (r.requests?.[it.id]) it.line = r.requests[it.id];
            } else t.diaryError = true;
            save();
            if (box.isConnected) drawStaff();
            for (const s of W) if (r?.diary?.[s.id] && ents[s.id]) ents[s.id].diary = r.diary[s.id];
        })();
    }
    // 장면: 밤, 성격대로 정리 → 한 명씩 퇴근 → 불 꺼짐
    const sc = addScene(createScene(box.querySelector('#cr-cScene'), { size: g.size, height: 230, zoom: .78, focus: [5, 3], zoomKey: 'close' }));
    sc.setEnv({ tod: 'night', weather: g.weather }); sc.sign('CLOSED'); sc.display(Math.min(6, biz.shelfLeft || 0)); sc.boxes(0);
    const st = []; for (let i = 0; i < Math.round((100 - g.clean) / 16) + 1; i++) { const [c, r] = sc.randomFree(); st.push({ c, r }); }
    sc.setStains(st);
    const ents = {};
    const L0 = sc.lay;
    for (const s of W) {
        const p = s.role === 'bake' ? L0.spots.display : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0];
        ents[s.id] = sc.ent({ staffId: s.id, label: book(s.id)?.name, c: p[0], r: p[1], onTap: e => { sc.jump(e); const d = j?.diaries?.[s.id]; sc.say(e, d ? (d.length > 26 ? d.slice(0, 25) + '…' : d) : tapLine(s.id), 3200); } });
    }
    (async () => {
        try {
            await Promise.all(W.map(async s => {
                const e = ents[s.id];
                if (hasTag(s.id, 'glutton', 'lazy') && (biz.shelfLeft || 0) > 0) {
                    await sc.wait(1000); sc.emo(e, 'cake'); sc.say(e, line(s.id, 'sneak'), 2400); await sc.wait(2600); sc.display(Math.max(0, (biz.shelfLeft || 0) - 1)); sc.emo(e, 'heart');
                } else if (s.role === 'serve' || s.role === 'all' || hasTag(s.id, 'greedy')) {
                    sc.emo(e, 'coin'); sc.work(e, true); await sc.wait(4500); sc.work(e, false); sc.emo(e, null);
                } else {
                    for (const x of [...st]) { await sc.go(e, [x.c, x.r]); sc.emo(e, 'broom'); sc.work(e, true); await sc.wait(1700); sc.work(e, false); st.splice(st.indexOf(x), 1); sc.setStains(st); }
                    sc.emo(e, 'zzz');
                }
            }));
            await sc.wait(900);
            for (const s of W) {
                const e = ents[s.id]; sc.emo(e, null);
                sc.go(e, [L0.door, L0.frontRow]).then(() => sc.go(e, [L0.door, 0])).then(() => { e.el.style.opacity = 0; }).catch(() => { });
                await sc.wait(1200);
            }
            await sc.wait(3200);
            sc.setEnv({ tod: 'dark', weather: g.weather });
        } catch { /* 화면이 바뀜 */ }
    })();
    box.querySelector('main').addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        if (b.dataset.c === 'find') { const en = ents[b.dataset.id]; if (en && en.el.style.opacity !== '0') { sc.focus(en, 1.4); en.onTap(en); } }
        if (b.dataset.c === 'log' || b.dataset.c === 'end') {
            finishClose(g);
            if (b.dataset.c === 'log' && g.phase === 'done') { import('./ui.js').then(m => { m.view.tab = 'journal'; m.view.journal = 'this'; render(); }); return; }
            render();
        }
    });
}

export { inner, colorOf, staffById, bossRel, heartRow, nameTag, logoHtml, addJournal, guestMult };
