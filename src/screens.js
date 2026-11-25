// 직접 영업: ① 아침 준비 → ② 영업 중 → ③ 마감 정산
import { esc, clamp, chance, pick } from './util.js';
import { L, F, money, signedMoney } from './i18n.js';
import { G, S, save, book, staffById, colorOf, bossRel, menuInfo, ING_PRICE, skillNeed, addJournal, addRel, remember } from './state.js';
import {
    prepToday, expectedGuests, ingCost, pickEvents, fallbackEventText, resolveEvent, deltaText, newBiz, sellOne,
    closeDay, worries, finishClose, applyNotices, workingStaff, hasTag, friendSaves, EVENT_KINDS, guestMult,
    roleLabel, weatherLabel, staffPick, delegateIndex, canDelegate, pickReason, deltaChips, tagLabel,
    applyEff, avgPrice, staffRest,
} from './rules.js';
import { ACC, REACT, FOLLOW, FOLLOW_OF, pickReaction, followChance, MAX_ACC_PER_DAY, MAX_FOLLOW_PER_DAY, accText, moodLabel } from './orders.js';
import { createScene } from './scene.js';
import { faceChip, bossFace } from './looks.js';
import { line, tapLine } from './lines.js';
import { morningPrep, closingDiary } from './ai.js';
import { ruleMul, ruleSlow, noteAcc, ruleFor, ruleName, activeRules, revealRule } from './houserules.js';
import { openRuleSheet } from './hrui.js';
import { render, addScene, openSheet, closeSheet, toast, confirmBox, logoHtml, headHtml, closeBtn, gearBtn, bizTabs, heartRow, bar, nameTag, closeWindow, inner } from './ui.js';

let B = null; // 지금 돌아가는 영업
const inflight = new Set(); // 지금 기다리는 AI 호출 (저장하지 않음 → 새로고침하면 다시 부름)

export const businessActive = () => !!(B && B.running && !B.sc.dead);
export function pauseBusiness(on, cover = on) {
    if (!B) return;
    B.sc.paused = on;
    // cover = "멈춤" 띠를 보여줄지 (사건 창·설정·다른 탭 때문에 멈춘 건 띠 없이)
    B.host?.closest('.cr-inner')?.classList.toggle('cr-paused', on && cover);
    const pb = document.querySelector('#crumble-root .cr-pause');
    if (pb) { pb.innerHTML = on ? PLAY : PAUSE; pb.setAttribute('aria-label', on ? L('다시 시작', 'Resume') : L('일시정지', 'Pause')); }
}
export const bizPaused = () => !!B?.sc?.paused;
export function resumeIfNeeded() { /* 영업 화면은 render()에서 이어서 시작 */ }

const PAUSE = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1.5" fill="#8A5A36"/><rect x="11.5" y="4" width="3.5" height="12" rx="1.5" fill="#8A5A36"/></svg>';
const PLAY = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" fill="#8A5A36"/></svg>';

/** 영업 화면 머리: 평소 머리 그대로. 상태 이름표에 단계·시간, 그 옆에 시간 막대(+ 영업 중이면 ⏸) */
function bizHead(now, { moneyHtml, clock, fill = 0, fillId = '', pause = '' }) {
    const name = { morning: L('아침 준비 중', 'Getting ready'), open: L('영업 중', 'Open'), close: L('마감 정산', 'Closing up') }[now];
    return headHtml({
        money: moneyHtml,
        status: `<span class="cr-pill st"><i></i>${name} · ${clock}</span>`,
        tail: `<span class="cr-bar time cr-headTime"><i${fillId ? ` id="${fillId}"` : ''} style="width:${fill}%"></i></span>${pause}`,
    });
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

    box.innerHTML = `${bizHead('morning', { moneyHtml: '<span class="cr-money" id="cr-mMoney"></span>', clock: L('오전 9:40', '9:40 AM'), fill: 4 })}${bizTabs()}
<main class="cr-main" data-biz>
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
        else wn += `<span class="cr-chip">${L('빠듯해요', 'Cutting it close')}</span>`; // 0.3.8 추천대로 사면 몰래 먹기·태움 때문에 실제로는 빠듯함
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
        fillTexts(t.events, r.texts, true);
        t.aiDone = true;
    } else t.aiError = true;
    save();
    t.onAi?.();
}

/** AI가 써 준 사건 글 채우기 (이미 열어 본 사건은 그대로) */
function fillTexts(events, texts, skipShown = false) {
    events.forEach((ev, i) => {
        const x = texts?.[i]; if (!x || ev.done || (skipShown && ev.shown)) return;
        if (B?.sheetEv === ev) return;
        const fb = fallbackEventText(ev);
        ev.text = {
            title: x.title || fb.title, situation: x.situation || fb.situation, guest: x.guest ?? fb.guest, staff: x.staff || fb.staff,
            choices: fb.choices.map((c, ci) => ({ label: x.choices[ci]?.label || c.label, line: x.choices[ci]?.line || '', result: x.choices[ci]?.result || '', resultBad: x.choices[ci]?.resultBad || '', interfere: !!x.choices[ci]?.interfere, effects: x.choices[ci]?.effects || null })),
        };
    });
}
const agoText = m => (m >= 90 ? F(L('{n}시간 전', '{n}h ago'), { n: Math.round(m / 60) }) : F(L('{n}분 전', '{n} min ago'), { n: Math.max(1, Math.round(m)) }));
/** 이름 뒤 "이/가" */
export const iga = n => { const c = String(n || '').trim().slice(-1).charCodeAt(0); if (!(c >= 0xAC00 && c <= 0xD7A3)) return L('가', ''); return L((c - 0xAC00) % 28 ? '이' : '가', ''); };
/** 영업 중 창을 오래 닫아 뒀을 때: 밀린 일 쌓기 (몇 개 쌓였는지 돌려줌) */
export function addBacklog(minutes) { return B?.addBacklog ? B.addBacklog(minutes) : 0; }
/** 0.3.6 사장님이 오래 비웠을 때: 직원들이 그날 영업을 마저 하고 문 닫음 → 마감 정산 화면 */
export function staffCloseBusiness() { return B?.staffClose ? (B.staffClose(), true) : false; }

// ======================= ② 영업 중 =======================
function openScreen(box) {
    const g = G(); const t = g.today;
    // 새로고침 등으로 끊겼으면 영업 시작 때로 되돌려 다시
    if (t.biz && !t.biz.finished && t.snap) { Object.assign(g, { money: t.snap.money, rep: t.snap.rep, ing: t.snap.ing, clean: t.snap.clean }); t.events.forEach(e => { delete e.done; delete e.shown; }); }
    const biz = t.biz = newBiz(g);
    const minutes = clamp(S().businessMinutes || 4, 2, 10);
    const D = minutes * 60000;
    box.innerHTML = `${bizHead('open', { moneyHtml: `<span class="cr-money" id="cr-oMoney">💰 ${money(g.money)}</span>`, pause: `<button class="cr-pause sm" type="button" aria-label="${L('일시정지', 'Pause')}">${PAUSE}</button>`, clock: '<span id="cr-clock"></span>', fillId: 'cr-tfill' })}${bizTabs()}
<main class="cr-main" data-biz>
<div class="cr-pauseBand" role="status"><span>⏸ ${L('가게가 멈춰 있어요', 'The shop is paused')}</span><span class="cr-pbBtns"><button type="button" class="cr-btn sm" data-b="closeEarly">🌙 ${L('오늘은 여기까지', 'Call it a day')}</button><button type="button" class="cr-pbtn sm" data-b="resume">▶ ${L('다시 시작', 'Resume')}</button></span></div>
<div class="cr-sceneHost" id="cr-oScene"></div>
<section class="cr-card cr-backlog cr-hide" id="cr-backlog"></section>
<section class="cr-card cr-news" id="cr-news" aria-live="polite"></section>
<div class="cr-chips" id="cr-chips"></div>
<section class="cr-card" id="cr-who"></section>
<p class="cr-muted cr-center">${L('직원을 눌러 보세요 · [찾기]를 누르면 그 직원 쪽으로 확대돼요', 'Tap staff · [Find] zooms to them')}</p>
</main>`;
    const host = box.querySelector('#cr-oScene');
    const lay = (() => { const s = createScene(host, { size: g.size, height: 360, zoom: .85, focus: [6, 3], zoomKey: 'open' }); addScene(s); return s; })();
    const sc = lay;
    B = { sc, host, biz, running: true, queue: [], guests: [], shelf: 0, counterBy: null, ovenBy: null, active: null, wait: 0, elapsed: 0, ents: {},
        backlog: [], sheetEv: null, results: [], resultOpen: false, holdPause: false,
        acc: null, accAt: {}, accLast: -1e9, hold: {}, forceAcc: {} };
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
        const mo = box.querySelector('#cr-oMoney');
        if (mo) { mo.textContent = '💰 ' + money(g.money); mo.classList.toggle('neg', g.money < 0); }
        box.querySelector('#cr-chips').innerHTML =
            `<span class="cr-chip">${L('손님', 'Guests')} <b>${biz.served}</b></span><span class="cr-chip">${L('매출', 'Sales')} <b>${money(biz.revenue)}</b></span><span class="cr-chip">${L('평판', 'Rep')} <b>${Math.round(g.rep)}</b></span>` +
            `<span class="cr-chip${g.ing + B.shelf < 4 ? ' warn' : ''}">${L('재료', 'Stock')} <b>${g.ing}</b>+${B.shelf}</span><span class="cr-chip${g.clean < 35 ? ' warn' : ''}">${L('청결', 'Clean')} <b>${Math.round(g.clean)}</b></span>` +
            (t.crowd ? `<span class="cr-chip warn">${L('손님 많은 날', 'Busy day')}</span>` : '');
    };
    const who = () => {
        box.querySelector('#cr-who').innerHTML = `<div class="cr-ttl">${L('지금 가게 안', 'In the shop now')}</div>` + W.map(s => `<div class="cr-whoRow">${faceChip(s.id, 28)}<b>${esc(book(s.id)?.name)}</b><span class="cr-muted">${esc(doing[s.id] || roleLabel(s.role))}</span><button type="button" class="cr-find" data-b="find" data-id="${esc(s.id)}">${L('찾기', 'Find')}</button></div>`).join('');
    };
    // kind·short = 장면 머리 위 글 이름표 (0.2.0 A)
    const setDoing = (s, txt, kind, short) => {
        doing[s.id] = txt;
        const row = [...box.querySelectorAll('.cr-whoRow')].find(r => r.querySelector('[data-id]')?.dataset.id === s.id); if (row) row.querySelector('.cr-muted').textContent = txt;
        const e = B?.ents[s.id]; if (e && short) sc.tag(e, short, kind);
    };
    // ---------- 지금 가게 소식 (0.2.0 D) — 이 줄들은 나중에 가게 로그 재료가 됨 ----------
    biz.news = biz.news || [];
    const nmGa = id => { const n = book(id)?.name || ''; return n + iga(n); };
    const drawNews = fresh => {
        const el = box.querySelector('#cr-news'); if (!el) return;
        const list = biz.news.slice(-4).reverse();
        el.innerHTML = `<div class="cr-ttl">📣 ${L('지금 가게 소식', 'Shop news')}<small>${L('최근 4개', 'Latest 4')}</small></div>` +
            (list.length ? list.map((n, i) => `<div class="cr-nrow${i === 0 && fresh ? ' fresh' : ''}${n.follow ? ' follow' : ''}"><time>${esc(n.t)}</time><span class="cr-nd ${n.k}"></span><span class="cr-nt">${esc(n.text)}${n.cause ? `<small class="cr-cause">${esc(n.cause)}</small>` : ''}</span>${n.chip ? `<span class="cr-chip ${n.cc || (n.good ? 'up' : 'dn')}">${esc(n.chip)}</span>` : ''}</div>`).join('')
                : `<p class="cr-muted">${L('아직 조용해요. 무슨 일이 생기면 여기에 떠요.', 'All quiet so far. Things that happen show up here.')}</p>`);
        if (fresh) setTimeout(() => el.querySelector('.cr-nrow.fresh')?.classList.remove('fresh'), 2500);
    };
    // key가 같은 소식은 잠깐 동안 다시 안 띄움 (졸기·수다가 줄을 다 차지하지 않게)
    // opt: { boss: 사장님이 한 일, follow: 아까 일 때문에 이어진 일, cc: 칩 색 }
    const news = (text, k = 'work', chip = '', good = false, key = text, sid = null, opt = {}) => {
        if (!B || !text) return;
        if (biz.news.slice(-6).some(n => n.key === key && B.elapsed - n.at < 40000)) return;
        biz.news.push({ t: clockStr(), at: B.elapsed, k, text, chip, good, key, sid, ...opt });
        if (biz.news.length > 40) biz.news.splice(0, biz.news.length - 40);
        drawNews(true);
    };
    chips(); who(); drawNews(false);

    // ---------- 직원 ----------
    for (const s of W) {
        const spot = s.role === 'bake' ? L0.spots.oven : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0];
        const e = sc.ent({
            staffId: s.id, label: book(s.id)?.name, c: spot[0], r: spot[1],
            onTap: e => { if (B.acc?.sid === s.id && !B.acc.open) { openTalk(); return; } if (e.alerted) { openEvent(pendingFor(s.id)); return; } sc.jump(e); sc.say(e, tapLine(s.id)); },
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
    const outOfStock = s => s.role === 'bake' && g.ing <= 0; // 0.3.8
    const fat = s => ((s.fatigue ?? 30) > 75 ? 1.3 : 1) * ruleSlow(g, s.id); // 0.3.0 대책 중엔 조금 느려질 수 있음

    const tasks = {
        async bake(s) {
            if (g.ing <= 0 || B.shelf >= 6 || (B.ovenBy && B.ovenBy !== s.id)) return false;
            if (s.role === 'all' && B.queue.length && B.shelf > 0) return false;
            const e = E(s); B.ovenBy = s.id;
            setDoing(s, L('오븐 앞 · 굽는 중', 'Oven · baking'), 'focus', L('굽는 중', 'Baking'));
            await walk(s, L0.spots.oven); sc.emo(e, 'spark'); sc.work(e, true); sc.steam(true);
            await sc.wait(Math.max(1800, 3800 - s.bake * 200) * fat(s)); // 0.3.5 능력 1: 3.6초 → 10: 1.8초
            sc.work(e, false); sc.steam(false);
            const pBurn = .14 - s.bake * .011 + // 0.3.5 능력 1: 13% → 10: 3%
                 (hasTag(s.id, 'clumsy') ? .08 : 0) + ((s.mood ?? 60) < 35 ? .06 : 0) + ((s.fatigue ?? 30) > 75 ? .05 : 0);
            if (chance(Math.max(.02, pBurn))) {
                const helper = friendSaves(g, biz, s.id);
                if (helper) { sc.say(B.ents[helper] || e, line(helper, 'rescue'), 2200); sc.emo(e, 'heart'); news(F(L('{a} {b}의 실수를 막아 줬어요', '{a} saved {b}\'s batch'), { a: nmGa(helper), b: book(s.id)?.name }), 'good', '', true, undefined, helper); }
                else {
                    biz.burnt++; g.ing = Math.max(0, g.ing - 1); sc.emo(e, 'sweat'); sc.say(e, line(s.id, 'mistake'), 2200); setDoing(s, L('오븐 앞 · 태움', 'Oven · burnt it'), 'bad', L('태움!', 'Burnt!'));
                    sc.float(e, L('재료 −1', 'Stock −1'), 'bad'); news(F(L('{n} 한 판을 태웠어요', '{n} burnt a batch'), { n: nmGa(s.id) }), 'bad', L('재료 −1', 'Stock −1'), false, undefined, s.id);
                    await sc.wait(1400); B.ovenBy = null; chips(); return true;
                }
            }
            const batch = Math.min(3, g.ing); g.ing -= batch; biz.baked += batch;
            B.ovenBy = null;
            sc.emo(e, null); setDoing(s, L('진열대로 옮기는 중', 'Stocking the display'), 'move', L('진열하러', 'Stocking'));
            await walk(s, L0.spots.display);
            B.shelf += batch; sc.display(B.shelf); chips();
            const pSneak = (hasTag(s.id, 'glutton') ? .25 : hasTag(s.id, 'lazy') ? .08 : .03) * mod(s, 'sneak');
            if (B.shelf > 0 && chance(pSneak)) {
                B.shelf--; biz.eaten++; noteAcc(g, biz, s.id, 'sneak'); sc.display(B.shelf); sc.emo(e, 'cake'); sc.say(e, line(s.id, 'sneak'), 2400);
                setDoing(s, L('진열대 · 몰래 먹는 중', 'Display · sneaking a bite'), 'bad', L('몰래 먹는 중', 'Sneaking a bite'));
                sc.float(e, L('재료 −1', 'Stock −1'), 'bad'); news(F(L('{n} 진열대 디저트를 몰래 먹었어요', '{n} snuck a dessert off the display'), { n: nmGa(s.id) }), 'bad', L('재료 −1', 'Stock −1'), false, 'sneak' + s.id, s.id);
                const a = await accident(s, 'sneak');
                if (a) return true;
                if (a === null) await sc.wait(2400);
                sc.emo(e, null);
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
            setDoing(s, L('계산대 · 주문 받는 중', 'Counter · taking orders'), 'work', helping ? L('거드는 중', 'Helping out') : L('주문 받는 중', 'Taking orders'));
            sc.work(e, true); sc.emo(e, null);
            await sc.wait(Math.max(700, 1800 - s.serve * 100) * fat(s)); // 0.3.5 능력 1: 1.7초 → 10: 0.8초
            sc.work(e, false);
            let gaveFree = false;
            if (B.shelf > 0) {
                B.shelf--; sc.display(B.shelf); const sold = sellOne(g, biz); sc.emo(q.e, 'bag'); q.done = 'ok';
                sc.waitBar(q.e, null); sc.float(e, '+' + money(sold.p), 'good'); sc.float(q.e, '♥', 'heart');
                const freebie = (hasTag(s.id, 'kind', 'flatterer', 'chatty') ? .14 : .03) * mod(s, 'freebie');
                // 덤·인사도 그 직원 말투로 (말투 대사가 없으면 아이콘만)
                if (B.shelf > 0 && chance(freebie)) {
                    B.shelf--; biz.freebie = (biz.freebie || 0) + 1; noteAcc(g, biz, s.id, 'freebie'); sc.display(B.shelf); sc.emo(e, 'note'); sc.say(e, line(s.id, 'freebie'), 1600); setTimeout(() => { if (e.icon === 'note') sc.emo(e, null); }, 1800);
                    sc.float(e, L('재료 −1', 'Stock −1'), 'bad', 16); news(F(L('{n} 손님에게 몰래 덤을 줬어요', '{n} slipped a guest a freebie'), { n: nmGa(s.id) }), 'focus', L('재료 −1', 'Stock −1'), false, 'free' + s.id, s.id);
                    gaveFree = true;
                }
                else if (chance(.25)) sc.say(e, line(s.id, 'thanks'), 1200);
                if (hasTag(s.id, 'prickly') && chance(.15)) {
                    g.rep = clamp(g.rep - .5, 0, 100); sc.emo(q.e, 'sweat');
                    sc.float(q.e, L('평판 ↓', 'Rep ↓'), 'bad', 18); news(F(L('{n} 손님에게 퉁명스럽게 굴었어요', '{n} was curt with a guest'), { n: nmGa(s.id) }), 'bad', L('평판 ↓', 'Rep ↓'), false, 'curt' + s.id, s.id);
                }
            } else {
                q.done = 'soldout'; biz.soldout++; g.rep = clamp(g.rep - 1, 0, 100); sc.say(q.e, L('다 팔렸네…', 'All sold out…'), 1800); sc.emo(q.e, 'sweat');
                sc.waitBar(q.e, null); sc.float(q.e, L('평판 −1', 'Rep −1'), 'bad'); news(L('다 팔려서 손님이 빈손으로 갔어요', 'Sold out — a guest left empty-handed'), 'bad', L('평판 −1', 'Rep −1'), false, 'soldout');
                sc.say(e, line(s.id, 'soldout'), 1800);
            }
            B.queue.shift(); shiftQueue(); B.counterBy = null; chips();
            if (gaveFree) await accident(s, 'freebie');
            return true;
        },
        async chat(s) {
            if (!hasTag(s.id, 'chatty') && !(hasTag(s.id, 'kind') && chance(.3))) return false;
            const seated = L0.seats.filter(x => x.g);
            if (B.queue.length || !seated.length || !chance(.22 * mod(s, 'chat'))) return false;
            const seat = pick(seated), e = E(s);
            const leftCounter = (s.role === 'serve' || s.role === 'all');
            setDoing(s, L('테이블 · 손님이랑 수다', 'Table · chatting'), leftCounter ? 'bad' : 'work', leftCounter ? L('수다 중 · 계산대 빔', 'Chatting · counter empty') : L('수다 중', 'Chatting'));
            if (leftCounter) noteAcc(g, biz, s.id, 'chat');
            if (leftCounter) news(F(L('{n} 손님이랑 수다 떠느라 계산대가 비었어요', '{n} is chatting; the counter is empty'), { n: nmGa(s.id) }), 'bad', '', false, 'chat' + s.id, s.id);
            sc.emo(e, 'note');
            await walk(s, seat.chat);
            sc.say(e, line(s.id, 'chat'), 2600);
            const a = leftCounter ? await accident(s, 'chat') : null;
            if (a) return true;
            if (a === null) await sc.wait(4200);
            sc.emo(e, null);
            return true;
        },
        async clean(s) {
            if (!stains.length) return false;
            if (s.role !== 'floor' && !outOfStock(s) && !hasTag(s.id, 'neat', 'diligent') && stains.length < 4) return false;
            const e = E(s);
            const st = stains.reduce((a, x) => (Math.abs(x.c - e.c) + Math.abs(x.r - e.r) < Math.abs(a.c - e.c) + Math.abs(a.r - e.r) ? x : a));
            setDoing(s, L('바닥 얼룩 치우러 가는 중', 'Going to wipe a spill'), 'move', L('청소하러', 'To a spill'));
            sc.emo(e, 'broom');
            await walk(s, [st.c, st.r]);
            setDoing(s, L('바닥 청소 중', 'Mopping'), 'work', L('청소 중', 'Mopping'));
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
            if (!(tired || hasTag(s.id, 'lazy')) || !chance(.18 * mod(s, 'doze'))) return false;
            const e = E(s);
            setDoing(s, L('구석 · 꾸벅꾸벅', 'Corner · dozing'), 'sleep', L('조는 중', 'Dozing')); noteAcc(g, biz, s.id, 'doze');
            news(F(L('{n} 구석에서 꾸벅꾸벅 졸아요', '{n} is dozing in the corner'), { n: nmGa(s.id) }), 'sleep', '', false, 'doze' + s.id, s.id);
            sc.emo(e, 'zzz'); if (chance(.5)) sc.say(e, line(s.id, 'tired'), 1600);
            const a = await accident(s, 'doze');
            if (a) return true;
            if (a === null) await sc.wait(3800);
            sc.emo(e, null);
            return true;
        },
        async idle(s) {
            const e = E(s);
            const home = outOfStock(s) ? (L0.idle[1] || L0.idle[0]) : s.role === 'bake' ? L0.spots.oven : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0];
            if (!at(e, home)) await walk(s, home);
            if (s.role === 'bake' && g.ing <= 0) {
                sc.emo(e, 'sweat'); setDoing(s, L('재료가 없어 한가함', 'Out of stock · nothing to bake'), 'bad', L('재료 없음', 'No stock')); if (chance(.15)) sc.say(e, line(s.id, 'soldout'), 1800);
                news(L('재료가 떨어져서 더 못 구워요', 'Out of stock — nothing left to bake'), 'bad', '', false, 'noing');
            }
            else if (s.role === 'bake') { sc.emo(e, (s.mood ?? 60) > 70 ? 'note' : null); setDoing(s, L('오븐 앞 · 진열대 꽉 참', 'Oven · display is full'), 'move', L('진열대 꽉 참', 'Display full')); }
            else if (s.role === 'serve' || s.role === 'all') setDoing(s, B.queue.length ? L('계산대 · 손님 기다리는 중', 'Counter · waiting') : L('계산대 · 한가함', 'Counter · quiet'), B.queue.length ? 'work' : 'move', B.queue.length ? L('손님 맞을 준비', 'Ready for guests') : L('한가함', 'Quiet'));
            else setDoing(s, L('구석 · 말없이 서 있음', 'Corner · standing by'), 'move', L('대기 중', 'Standing by'));
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
                if ((B.hold[s.id] || 0) > B.elapsed) { await sc.wait(300); continue; }
                if (B.forceAcc[s.id] && !B.acc) { const k = B.forceAcc[s.id]; delete B.forceAcc[s.id]; await againAcc(s, k); continue; }
                if (E(s).alerted && B.acc?.sid !== s.id) { await sc.wait(500); continue; }
                for (const k of (outOfStock(s) ? PLAN.floor : PLAN[s.role]) || PLAN.floor) if (await tasks[k](s)) break; // 0.3.8 재료가 없으면 제빵 담당도 홀 일
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
                if (!q.done) sc.waitBar(e, waited / patience);
                if (waited > patience * .45 && e.icon !== 'sweat' && e.icon !== 'angry') sc.emo(e, 'sweat');
                if (waited > patience * .75 && e.icon !== 'angry') sc.emo(e, 'angry');
                if (waited > patience && !q.done) {
                    if (B.counterBy && B.queue[0] === q) continue; // 지금 주문 받는 중
                    sc.say(e, L('너무 오래 걸리네…', 'This is taking forever…'), 1800);
                    g.rep = clamp(g.rep - 2, 0, 100); biz.left++; q.done = 'left';
                    sc.waitBar(e, null); sc.float(e, '!', 'leave'); sc.float(e, L('평판 −2', 'Rep −2'), 'bad', 22);
                    news(L('기다리다 지친 손님이 그냥 나갔어요', 'A guest got tired of waiting and left'), 'bad', L('평판 −2', 'Rep −2'), false, 'left');
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
        sc.remove(e);
        if (!B) return; // 영업이 끝난 뒤에 걷기가 끝난 손님
        B.guests = B.guests.filter(x => x !== q); B.queue = B.queue.filter(x => x !== q);
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
    // B.active = 지금 "!"가 떠 있는 사건 / B.backlog = 자리 비운 동안 밀린 일 / B.sheetEv = 지금 창이 열린 사건
    const pendingFor = id => B.backlog.find(x => x.staffIds[0] === id) || (B.active?.staffIds[0] === id ? B.active : null) || B.active || B.backlog[0];
    const refreshAlerts = () => {
        for (const s of W) {
            const e = B.ents[s.id]; if (!e) continue;
            const on = B.backlog.some(x => x.staffIds[0] === s.id) || B.active?.staffIds[0] === s.id || B.acc?.sid === s.id;
            if (!!e.alerted !== on) sc.alert(e, on);
        }
    };
    // 창을 닫은 뒤: 직접 멈췄거나 밀린 일이 있으면 "멈춤" 띠, 아니면 다시 움직임
    const afterSheet = () => { if (B.holdPause) pauseBusiness(true, true); else pauseBusiness(false); };
    const openEvent = (ev = B.active) => {
        if (!ev || B.resultOpen) return;
        B.sheetEv = ev;
        pauseBusiness(true, false);
        const tx = ev.text || fallbackEventText(ev);
        const k = EVENT_KINDS[ev.kind];
        const sid = ev.staffIds[0];
        openSheet(`<div class="cr-row"><span class="cr-evTag ${k.cat}">${esc(tx.title)}</span><span class="cr-muted" style="margin-left:auto">${ev.backlog ? `${agoText(ev.ago)} · ` : ''}${F(L('{n} 담당', '{n} handling'), { n: book(sid)?.name })}</span></div>
<p class="cr-situ">${esc(tx.situation)}</p>
${tx.guest ? `<div class="cr-say2"><span class="cr-face guest">🙂</span><p>${esc(tx.guest)}</p></div>` : ''}
${ev.staffIds.map((id, i) => (i === 0 && tx.staff) ? `<div class="cr-say2">${faceChip(id, 30)}<p>${esc(tx.staff)}</p></div>` : '').join('')}
${tx.choices.map((c, i) => (i === delegateIndex(ev) && canDelegate(ev)) ? '' : `<button type="button" class="cr-opt" data-b="opt" data-i="${i}">${esc(c.label)}</button>`).join('')}
${canDelegate(ev) ? `<button type="button" class="cr-opt cr-optDel" data-b="delegate">🤝 ${F(L('{n}에게 맡기기', 'Leave it to {n}'), { n: book(sid)?.name })}<small>${L('성격대로 알아서 해요', 'They\'ll do it their own way')}</small></button>` : ''}
<div class="cr-actions"><button type="button" class="cr-btn" data-b="later">${L('나중에 보기', 'Later')}</button></div>
<p class="cr-muted cr-center">${ev.backlog ? L('나중에 봐도 밀린 일 목록에 남아 있어요.', 'It stays in the backlog list.') : L('나중에 봐도 "!"는 남아 있어요. 너무 오래 두면 직원이 알아서 해요.', 'The "!" stays. Leave it too long and they\'ll handle it themselves.')}</p>`, true);
    };
    // 사건 창 닫기 (사건은 그대로 남음, 가게는 다시 움직임)
    const laterEvent = () => { if (!B?.sheetEv) return; B.sheetEv = null; closeSheet(); afterSheet(); };
    // mode: false = 사장님이 고름 / 'delegate' = 맡김 / 'auto' = 오래 안 봐서 직원이 알아서
    const finishEvent = (ci, mode, ev = B.sheetEv || B.active) => {
        if (!ev || ev.done) return;
        const byStaff = mode === 'delegate' || mode === 'auto';
        if (byStaff) ci = staffPick(g, ev);
        const n0 = (biz.expLog || []).length;
        const res = resolveEvent(g, ev, ci, biz, mode || false);
        const exp = (biz.expLog || []).length > n0 ? biz.expLog[biz.expLog.length - 1] : null;
        if (B.sheetEv === ev) B.sheetEv = null;
        if (B.active === ev) { B.active = null; B.wait = 0; }
        if (ev.backlog) B.backlog = B.backlog.filter(x => x !== ev);
        refreshAlerts();
        const e = B.ents[ev.staffIds[0]];
        if (e) { sc.emo(e, res.interfere ? 'note' : res.ok ? 'heart' : 'sweat'); if (res.line) sc.say(e, res.line, 3200); }
        if (ev.kind === 'inspection' && ci === 1) { stains.length = 0; sc.setStains(stains); }
        {
            const tx = ev.text || fallbackEventText(ev);
            const c0 = deltaChips(res.delta || {}, ev, exp)[0];
            news(res.result || `${book(ev.staffIds[0])?.name || ''} · ${tx.choices[ci]?.label || ''}`, res.interfere ? 'focus' : res.uncertain ? (res.ok ? 'good' : 'bad') : c0 ? (c0.good ? 'good' : 'bad') : 'work', c0?.t || '', !!c0?.good, 'res' + ev.id, ev.staffIds[0]);
        }
        chips(); drawBacklog(); save();
        B.results.push({ ev, ci, mode, res, exp });
        showResult(); // 이미 열려 있으면 "남은 결과" 수만 새로
    };
    // ---------- 결과 창: 누가 · 뭘 해서 · 어떻게 됐는지 ----------
    const showResult = () => {
        const r = B.results[0];
        if (!r) { B.resultOpen = false; closeSheet(); afterSheet(); return; }
        B.resultOpen = true;
        pauseBusiness(true, false);
        const { ev, ci, mode, res, exp } = r;
        const k = EVENT_KINDS[ev.kind];
        const tx = ev.text || fallbackEventText(ev);
        const sid = ev.staffIds[0], nm = book(sid)?.name || '';
        const label = tx.choices[ci]?.label || L(...k.choices[ci].label);
        const slide = mode === 'auto' && k.cat === 'staff';
        const modeTag = mode === 'delegate' ? L('맡긴 결과', 'Delegated') : mode === 'auto' ? L('알아서 한 결과', 'Handled by staff') : L('사장님 결정', 'Your call');
        const note = mode === 'auto' ? (slide ? L('사장님이 안 봐서 그냥 넘어갔어요', 'You didn\'t look, so it slid by') : F(L('사장님이 안 봐서 {n} 알아서 했어요', 'You didn\'t look, so {n} handled it'), { n: nm + iga(nm) })) : '';
        const why = byStaffWhy(mode) ? pickReason(ev, ci, mode) : (res.interfere ? L('성격이 끼어들어서 시킨 대로만 하진 않았어요.', 'Their personality got in the way of doing exactly as told.') : '');
        const badge = res.interfere ? `<span class="cr-ok wild">${L('제멋대로', 'Their own way')}</span>`
            : res.uncertain ? (res.ok ? `<span class="cr-ok good">${L('잘 해냈어요', 'Went well')}</span>` : `<span class="cr-ok bad">${L('잘 안 됐어요', 'Didn\'t go well')}</span>`)
                : slide ? `<span class="cr-ok">${L('넘어감', 'Let slide')}</span>` : '';
        const main = res.result ? esc(res.result) : `<b>${esc(nm)}</b> · ${esc(label)}`;
        const chipsHtml = deltaChips(res.delta || {}, ev, exp).map(c => `<span class="cr-chip ${c.good ? 'up' : 'dn'}">${esc(c.t)}</span>`).join('') || `<span class="cr-chip">${L('별일 없이 지나갔어요', 'Nothing much changed')}</span>`;
        const more = B.results.length > 1 ? `<span class="cr-muted">${F(L('남은 결과 {n}', '{n} more'), { n: B.results.length - 1 })}</span>` : '';
        openSheet(`<div class="cr-row"><span class="cr-evTag ${k.cat}">${esc(tx.title)}</span><span class="cr-resTag ${mode || 'boss'}">${modeTag}</span></div>
${note ? `<div class="cr-resNote">${note}</div>` : ''}
<div class="cr-resWho">${ev.staffIds.map((id, i) => faceChip(id, i ? 30 : 40)).join('')}<div><b>${esc(nm)}</b>${ev.staffIds[1] ? ` <span class="cr-muted">· ${esc(book(ev.staffIds[1])?.name || '')}</span>` : ''}<div class="cr-tags">${(book(sid)?.tags || []).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}</div></div></div>
<div class="cr-story"><p class="cr-resMain">${main}</p>${why ? `<p class="cr-why">${esc(why)}</p>` : ''}${badge || res.result ? `<p class="cr-resRow">${badge}${res.result ? `<span class="cr-muted">${L('고른 것', 'Choice')}: ${esc(label)}</span>` : ''}</p>` : ''}</div>
${res.line ? `<div class="cr-say2">${faceChip(sid, 30)}<p>${esc(res.line)}</p></div>` : ''}
<div class="cr-chips">${chipsHtml}</div>
<button type="button" class="cr-pbtn cr-wide" data-b="resOk">${B.results.length > 1 ? L('확인 · 다음 결과', 'OK · next') : L('확인', 'OK')}</button>
<p class="cr-muted cr-center">${more}${more ? ' · ' : ''}${L('확인을 누르면 가게가 다시 움직여요 · 일지에도 남아요', 'The shop moves again after OK · saved to the log')}</p>`, true);
    };
    const byStaffWhy = mode => mode === 'delegate' || mode === 'auto';
    const resultOk = () => { B.results.shift(); if (B.results.length) showResult(); else { B.resultOpen = false; closeSheet(); afterSheet(); } };

    // ---------- 자리 비운 동안 밀린 일 ----------
    const drawBacklog = () => {
        const el = box.querySelector('#cr-backlog'); if (!el) return;
        el.classList.toggle('cr-hide', !B.backlog.length);
        if (!B.backlog.length) { el.innerHTML = ''; return; }
        el.innerHTML = `<div class="cr-row"><b>${L('자리 비운 동안 밀린 일이 있어요', 'Things piled up while you were away')}</b><span class="cr-evTag guest" style="margin-left:auto">${B.backlog.length}/3</span></div>
<p class="cr-muted">${L('가게 시간은 그대로예요. 일만 쌓였어요.', 'Shop time didn\'t move. Only the work piled up.')}</p>
${B.backlog.map(x => `<div class="cr-whoRow">${faceChip(x.staffIds[0], 28)}<span class="cr-blT"><b>${esc((x.text || fallbackEventText(x)).title)}</b> <span class="cr-muted">· ${agoText(x.ago)}</span></span><button type="button" class="cr-find" data-b="blOpen" data-id="${esc(x.id)}">${L('보기', 'View')}</button></div>`).join('')}
<button type="button" class="cr-opt cr-optDel cr-center" data-b="blAll">🤝 ${L('전부 직원에게 맡기기', 'Leave them all to the staff')}</button>`;
    };
    B.addBacklog = minutes => {
        const th = +S().backlogMinutes || 0;
        if (!th || minutes < th || !B.running) return 0;
        const want = Math.min(3, Math.floor(minutes / th)) - B.backlog.length;
        if (want <= 0) return 0;
        const used = new Set([...t.events, ...B.backlog].map(x => x.kind));
        const picks = pickEvents(g, 'direct', want + 4).filter(x => !used.has(x.kind) && !EVENT_KINDS[x.kind].early).slice(0, want);
        if (!picks.length) return 0;
        picks.forEach((x, i) => { x.backlog = true; x.shown = true; x.ago = Math.max(1, Math.round(minutes * (1 - i / picks.length))); x.text = fallbackEventText(x); });
        B.backlog.push(...picks);
        B.holdPause = true;
        pauseBusiness(true, true);
        refreshAlerts(); drawBacklog(); save();
        // 사건 글만 AI로 (말풍선은 아침 것 그대로)
        (async () => {
            let r = null;
            try { r = await morningPrep(g, picks, false); } catch (err) { console.warn(err); }
            if (!r || !B || B.biz !== biz) return;
            fillTexts(picks, r.texts);
            drawBacklog();
        })();
        return picks.length;
    };


    // ======================= 0.2.4 성격 사고 → 사장님 지시 → 반응 → 이어지는 일 =======================
    // B.acc = 지금 "!"가 떠 있는 성격 사고 { sid, kind, open, done, order, react }
    biz.mods = biz.mods || {};
    biz.follows = biz.follows || [];
    biz.accN = biz.accN || 0;
    const mod = (s, k) => (biz.mods[s.id]?.[k] ?? 1) * ruleMul(g, s.id, k, { busy: !!t.crowd }); // 지시(그날) × 대책(며칠)
    const setMod = (s, k, v) => { (biz.mods[s.id] ??= {})[k] = v; };
    const homeOf = s => (s.role === 'bake' ? L0.spots.oven : s.role === 'serve' || s.role === 'all' ? L0.spots.counter : L0.idle[0]);
    const goalPos = (s, goal) => ({ oven: L0.spots.oven, counter: L0.spots.counter, display: L0.spots.display, tables: (L0.seats.find(x => x.g) || L0.seats[0])?.chat, home: homeOf(s) })[goal] || null;
    const nmOf = id => book(id)?.name || '';
    const K2 = (a, b) => [a, b];
    const T = (pair, id, carried = false) => accText(pair, nmOf(id), iga(nmOf(id)), carried);
    // 효과 적용 → 장면에 숫자 띄우기. 첫 칩 글을 돌려줌
    const applyAcc = (s, eff = {}) => {
        const e = E(s); const parts = [];
        let { shelf = 0, sales = 0, burnt = 0, ...rest } = eff;
        if (shelf < 0) {
            const n = -shelf, fromShelf = Math.min(B.shelf, n);
            B.shelf -= fromShelf; g.ing = Math.max(0, g.ing - (n - fromShelf)); sc.display(B.shelf);
            parts.push({ t: L('재료 ', 'Stock ') + '−' + n, good: false });
        }
        if (burnt) { biz.burnt += burnt; }
        if (sales > 0) {
            const v = Math.round(avgPrice(g) * sales / 100) * 100;
            g.money += v; biz.revenue += v; biz.served += sales;
            parts.push({ t: '+' + money(v), good: true });
        }
        const d = applyEff(g, rest, { staffIds: [s.id], kind: 'acc' }, biz);
        parts.push(...deltaChips(d, { staffIds: [s.id] }));
        parts.forEach((c, i) => setTimeout(() => { if (e?.el.isConnected) sc.float(e, c.t, c.good ? 'good' : 'bad', (i % 2) * 18); }, i * 800));
        chips();
        return parts[0]?.t || '';
    };
    const canAcc = (s, force) => !!B.running && !B.acc && !E(s).alerted && !B.sheetEv && !B.resultOpen && B.elapsed < D * .9 &&
        (force || (biz.accN < MAX_ACC_PER_DAY && B.elapsed - (B.accAt[s.id] ?? -1e9) > 60000 && B.elapsed - B.accLast > 25000));
    /** "!"를 띄우고 잠깐 기다림. 사장님이 누르면 지시 → 반응까지 하고 true / 안 누르고 지나가면 false / 못 띄우면 null */
    const accident = async (s, kind, force = false) => {
        if (!canAcc(s, force)) return null;
        const e = E(s);
        B.acc = { sid: s.id, kind, open: false, done: false };
        B.accAt[s.id] = B.accLast = B.elapsed; biz.accN++;
        sc.alert(e, true);
        e.el.setAttribute('aria-label', F(L('{n} — 눌러서 한마디 하기', '{n} — tap to step in'), { n: nmOf(s.id) }));
        let w = 0;
        while (w < 8000 && !B.acc.open) { await sc.wait(250); w += 250; }
        if (!B.acc.open) { B.acc = null; refreshAlerts(); return false; }
        while (!B.acc.done) await sc.wait(200);
        const A = B.acc; B.acc = null; refreshAlerts();
        if (A.order < 0) { sc.emo(e, null); return false; }
        await runReaction(s, A);
        return true;
    };
    // 0.3.0 같은 사고가 오늘 2번째면 [대책 걸기] / 이미 대책이 걸려 있으면 한 줄 안내
    const ruleChip = (sid, kind) => {
        const r = ruleFor(g, sid, kind);
        if (r) return `<p class="cr-muted cr-hrNow">📌 ${F(L('대책 중: {r}', 'House rule on: {r}'), { r: ruleName(r) })}</p>`;
        const n = biz.accTimes?.[sid]?.[kind] || 0;
        if (n < 2) return '';
        return `<button type="button" class="cr-hrChip" data-b="ordRule">📌 ${F(L('오늘 벌써 {n}번째예요 · 대책 걸기', '{o} time today · Set a house rule'), { n, o: n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th' })}<span aria-hidden="true">›</span></button>`;
    };
    const ruleFromTalk = () => {
        const A = B.acc; if (!A?.open || A.done) return;
        const e = B.ents[A.sid];
        openRuleSheet(A.sid, A.kind, {
            onSet: react => {
                A.order = -1; A.ruled = true; A.done = true;
                if (e) { sc.say(e, line(A.sid, REACT[react].line), 2600); sc.tag(e, L(...REACT[react].start), REACT[react].tag); }
                news(F(L('사장님이 {n}에게 대책을 걸었어요', 'You set a house rule for {n}'), { n: nmOf(A.sid) }), 'boss', L(...REACT[react].label), false, 'hr' + B.elapsed, A.sid, { cc: REACT[react].chip });
                save();
            },
            onClose: () => { closeSheet(); afterSheet(); },
            onCancel: () => { A.open = false; openTalk(); },
        });
    };
    const openTalk = () => {
        const A = B.acc; if (!A || A.open || B.sheetEv || B.resultOpen) return;
        A.open = true;
        pauseBusiness(true, false);
        const def = ACC[A.kind], sid = A.sid, st = staffById(sid);
        openSheet(`<div class="cr-row"><span class="cr-evTag staff">${esc(L(...def.title))}</span><span class="cr-muted" style="margin-left:auto">${L('가게가 잠깐 멈춰 있어요', 'The shop is paused')}</span></div>
<div class="cr-resWho">${faceChip(sid, 40)}<div><b>${esc(nmOf(sid))}</b> <span class="cr-muted">${esc(roleLabel(st?.role))}</span> ${heartRow(bossRel(sid))}<div class="cr-tags">${(book(sid)?.tags || []).map(t => `<span class="cr-tag">${esc(tagLabel(t))}</span>`).join('')}<span class="cr-tag gray">${esc(moodLabel(sid))}</span></div></div></div>
<p class="cr-situ">${esc(T(def.situ, sid))}</p>
${ruleChip(sid, A.kind)}
<div class="cr-say2">${bossFace(30)}<p>${esc(L(...def.boss))}</p></div>
<div class="cr-say2">${faceChip(sid, 30)}<p>${esc(line(sid, def.key))}</p></div>
<div class="cr-ttl sm" style="margin-top:10px">${F(L('{n}에게 뭐라고 할까요?', 'What do you tell {n}?'), { n: nmOf(sid) })}</div>
<div class="cr-ordGrid">${def.orders.map((o, i) => `<button type="button" class="cr-opt cr-ord" data-b="ord" data-i="${i}">${esc(L(...o.label))}</button>`).join('')}</div>
<div class="cr-actions"><button type="button" class="cr-btn" data-b="ordSkip">${L('그냥 두기', 'Let it go')}</button></div>
<p class="cr-muted cr-center">${L('지시는 지금 이 순간만이에요. 어떻게 받아들일지는 성격·기분·사장님과 사이에 따라 달라요.', 'This is just for right now. How they take it depends on their personality, mood, and how they feel about you.')}</p>`, true);
    };
    const chooseOrder = i => {
        const A = B.acc; if (!A) return;
        A.order = i; A.done = true;
        if (i >= 0) {
            A.react = pickReaction(A.sid, A.kind, i);
            const o = ACC[A.kind].orders[i];
            A.oid = 'o' + g.day + '_' + Math.round(B.elapsed); A.ot = clockStr(); // 0.3.8 이어지는 일이 이 줄을 가리킴
            news(F(L('사장님 → {n}: "{o}"', 'You → {n}: "{o}"'), { n: nmOf(A.sid), o: L(...o.label) }), 'boss', L(...REACT[A.react].label), false, 'ord' + B.elapsed, A.sid, { boss: true, cc: REACT[A.react].chip, oid: A.oid });
            remember(A.sid, F(L('사장님이 "{o}"라고 함 → {r}', 'Boss said "{o}" → {r}'), { o: L(...o.label), r: L(...REACT[A.react].label) }));
        }
        closeSheet(); afterSheet(); save();
    };
    // 하던 사고를 한 번 더 (미루거나 안 들을 때)
    const repeatAcc = (s, kind) => {
        const e = E(s);
        if ((kind === 'sneak' || kind === 'freebie') && B.shelf > 0) {
            B.shelf--; sc.display(B.shelf);
            if (kind === 'sneak') { biz.eaten++; sc.emo(e, 'cake'); } else { biz.freebie = (biz.freebie || 0) + 1; sc.emo(e, 'note'); }
            sc.float(e, L('재료 −1', 'Stock −1'), 'bad'); chips();
        } else if (kind === 'doze') sc.emo(e, 'zzz');
        else if (kind === 'chat') sc.emo(e, 'note');
    };
    const runReaction = async (s, A) => {
        const e = E(s), def = ACC[A.kind], o = def.orders[A.order], R0 = REACT[A.react];
        sc.say(e, line(s.id, R0.line), 2600);
        sc.tag(e, L(...R0.start), R0.tag);
        const doing = () => setDoing(s, L(...o.doing), o.dk, L(...o.doing));
        if (A.react === 'obey') {
            await sc.wait(900);
            const p = o.goal === 'stay' ? null : goalPos(s, o.goal); if (p) await walk(s, p);
            sc.emo(e, null); doing(); applyAcc(s, o.obey);
            setMod(s, A.kind, o.mul ?? .35);
            await sc.wait(1600);
        } else if (A.react === 'delay') {
            await sc.wait(1300); repeatAcc(s, A.kind);
            await sc.wait(2600);
            const p = o.goal === 'stay' ? null : goalPos(s, o.goal);
            setDoing(s, L('느릿느릿', 'Dragging feet'), 'move', L(...o.doing) + L(' · 느릿느릿', ' · slowly'));
            if (p) await sc.go(e, p, .95);
            sc.emo(e, null); applyAcc(s, o.obey);
            sc.tag(e, L(...o.doing) + L(' · 느릿느릿', ' · slowly'), o.dk);
            setMod(s, A.kind, Math.max(o.mul ?? .35, .7));
            await sc.wait(1600);
        } else if (A.react === 'refuse') {
            applyAcc(s, { relBoss: -3 });
            await sc.wait(1400); repeatAcc(s, A.kind);
            await sc.wait(2200); repeatAcc(s, A.kind);
            news(F(L('{n} 사장님 말을 안 듣고 하던 걸 계속해요', '{n} ignored you and kept at it'), { n: nmGa(s.id) }), 'bad', '', false, 'refuse' + s.id, s.id);
            setMod(s, A.kind, 1.3);
            await sc.wait(1800); sc.emo(e, null);
        } else {
            const tw = o.twist;
            await sc.wait(900);
            const p = tw.goal === 'stay' ? null : goalPos(s, tw.goal); if (p) await walk(s, p);
            sc.emo(e, null);
            setDoing(s, L(...tw.tag), 'twist', L(...tw.tag));
            const c = applyAcc(s, tw.eff);
            news(T(tw.text, s.id), 'twist', c, false, 'tw' + B.elapsed, s.id, { cc: 'twist' });
            setMod(s, A.kind, tw.mul ?? 1);
            await sc.wait(tw.long ? 6000 : 2400);
        }
        scheduleFollow(s, A, o);
        save();
    };
    // ---------- 이어지는 일: 시간이 지나면 저절로 (가끔만, 직원당 하루 1개 · 가게 하루 2개) ----------
    const scheduleFollow = (s, A, o) => {
        if (biz.follows.length >= MAX_FOLLOW_PER_DAY || biz.follows.some(x => x.sid === s.id)) return;
        if (!chance(followChance(A.react, o))) return;
        biz.follows.push({ sid: s.id, kind: A.kind, react: A.react, order: A.order, scold: !!o.scold, oid: A.oid, ot: A.ot, at: B.elapsed + D * (.18 + Math.random() * .14), fired: false });
    };
    const fireFollow = f => {
        const s = W.find(x => x.id === f.sid); const e = s && E(s);
        if (!e) return;
        const type = FOLLOW_OF[f.react], def = ACC[f.kind], FL = FOLLOW[type];
        // 0.3.8 원인 한 줄: ← (어제) 오전 10:42 · 지시 이름 · 반응
        const ord = def.orders?.[f.order];
        const cause = ord ? '← ' + [(f.carried ? L('어제 ', 'yesterday ') : '') + (f.ot || ''), L(...ord.label), L(...REACT[f.react].label)].filter(x => x.trim()).join(' · ') : '';
        const say = (txt, k, chip) => news(txt, k, L(...FL.label), false, 'fl' + f.sid + B.elapsed, f.sid, { follow: true, cc: FL.chip, sub: chip, cause, ref: f.carried ? null : f.oid });
        if (type === 'again') {
            say(T(def.again, s.id, f.carried), 'bad');
            B.forceAcc[s.id] = f.kind;
        } else if (type === 'fight') {
            const other = W.filter(x => x.id !== s.id && B.ents[x.id]);
            if (!other.length) { applyAcc(s, { relBoss: -3 }); say(F(L('{w} 일로 {n} 사장님 흉을 봤어요', '{n} grumbled about you after {w}'), { w: f.carried ? L('어제', 'yesterday\'s') : L('아까', 'earlier'), n: nmGa(s.id) }), 'bad'); return; }
            const o2 = pick(other), e2 = E(o2);
            addRel(s.id, o2.id, -6, L('지시 안 들은 일로 다툼', 'Squabbled after ignoring the boss'));
            B.hold[s.id] = B.hold[o2.id] = B.elapsed + 5000;
            sc.tag(e, L('다투는 중', 'Squabbling'), 'bad'); sc.tag(e2, (o2.role === 'serve' || o2.role === 'all') ? L('다투는 중 · 계산대 빔', 'Squabbling · counter empty') : L('다투는 중', 'Squabbling'), 'bad');
            sc.say(e2, L('아까 그거 너 때문이잖아!', 'That was your fault earlier!'), 2600);
            setTimeout(() => { if (e.el.isConnected) sc.say(e, line(s.id, 'rRefuse'), 2400); }, 1600);
            sc.float(e2, L('둘 사이 ↓', 'Their bond ↓'), 'bad');
            say(F(L('{w} 일로 {a} · {b} 둘이 다퉜어요', '{a} and {b} squabbled over what happened {w}'), { w: f.carried ? L('어제', 'yesterday') : L('아까', 'earlier'), a: nmOf(s.id), b: nmOf(o2.id) }), 'bad');
        } else {
            const x = f.scold && type === 'unexpected'
                ? { text: [`{w} 혼난 {n} 시무룩하게 일하다 실수를 했어요`, '{n}, still sulking after being scolded {w}, slipped up'], eff: { ing: -1, mood: -4 }, tag: K2('시무룩', 'Sulking') }
                : def[type];
            sc.tag(e, x.tag ? L(...x.tag) : L(...FL.label), type === 'lucky' ? 'work' : 'bad');
            sc.emo(e, type === 'lucky' ? 'note' : 'sweat');
            const c = applyAcc(s, x.eff);
            say(T(x.text, s.id, f.carried), FL.k, c);
            if (type === 'lucky') sc.say(e, line(s.id, 'rTwist'), 2200);
            setTimeout(() => { if (e.el.isConnected) sc.emo(e, null); }, 2600);
        }
        save();
    };
    // 다음 날로 넘어온 이어지는 일 (사장님이 영업할 때만)
    const againAcc = async (s, kind) => {
        const e = E(s);
        if (kind === 'sneak') { await walk(s, L0.spots.display); setDoing(s, L('진열대 · 또 몰래 먹는 중', 'Display · sneaking again'), 'bad', L('또 몰래 먹는 중', 'Sneaking again')); }
        else if (kind === 'chat') { const p = goalPos(s, 'tables'); if (p) await walk(s, p); setDoing(s, L('테이블 · 또 수다', 'Table · chatting again'), 'bad', L('또 수다 중', 'Chatting again')); }
        else if (kind === 'doze') setDoing(s, L('또 꾸벅꾸벅', 'Dozing again'), 'sleep', L('또 조는 중', 'Dozing again'));
        else setDoing(s, L('또 덤 주는 중', 'Freebie again'), 'bad', L('또 덤 주는 중', 'Freebie again'));
        repeatAcc(s, kind);
        const a = await accident(s, kind, true);
        if (a === null) await sc.wait(2400);
        sc.emo(e, null);
    };
    if (g.pendingFollow?.length) {
        g.pendingFollow.forEach((f, i) => biz.follows.push({ ...f, at: D * (.1 + i * .12 + Math.random() * .06), fired: false }));
        g.pendingFollow = [];
    }

    // ---------- 시계 ----------
    const clockEl = box.querySelector('#cr-clock'), fill = box.querySelector('#cr-tfill');
    function clockStr(long) {
        const tt = clamp((B?.elapsed || 0) / D, 0, 1);
        const mins = 10 * 60 + Math.round(tt * 600);
        const hh = Math.floor(mins / 60), mm = String(mins % 60 - mins % 10).padStart(2, '0'), h12 = hh > 12 ? hh - 12 : hh;
        if (!long) return `${hh}:${mm}`; // 소식 줄은 24시간 (오전·오후 헷갈리지 않게)
        return L(`${hh < 12 ? '오전' : hh < 18 ? '오후' : '저녁'} ${h12}:${mm}`, `${h12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`);
    }
    let tod = '';
    const showClock = () => {
        const tt = clamp(B.elapsed / D, 0, 1);
        clockEl.textContent = clockStr(true);
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
                        news(F(L('{n}에게 일이 생겼어요 · {t}', 'Something came up for {n}: {t}'), { n: book(ev.staffIds[0])?.name || '', t: (ev.text || fallbackEventText(ev)).title }), 'focus', '', false, 'ev' + ev.id);
                        e.el.setAttribute('aria-label', F(L('{n} — 사건 발생, 눌러서 보기', '{n} — something happened, tap to see'), { n: book(ev.staffIds[0])?.name }));
                    }
                } else if (!B.sheetEv && !B.acc?.open) {
                    B.wait += 250;
                    if (B.wait > Math.max(20000, D * .1)) finishEvent(0, 'auto', B.active);
                }
                // 0.3.0 대책 결과: 걸린 첫날 영업 40%쯤에 한 번
                if (tt >= .4 && tt < .95 && !B.acc && !B.sheetEv && !B.resultOpen) {
                    const r = activeRules(g).find(x => !x.shown && x.id !== 'warn' && B.ents[x.sid]);
                    if (r) {
                        const ln = revealRule(g, r, biz);
                        if (ln) {
                            const e = B.ents[r.sid];
                            sc.tag(e, ln.chip, ln.good ? 'work' : r.out === 'unexp' ? 'twist' : 'bad'); sc.emo(e, ln.good ? 'note' : 'sweat');
                            setTimeout(() => { if (e.el.isConnected) sc.emo(e, null); }, 2400);
                            news(ln.text, ln.k, ln.chip, ln.good, 'hrr' + r.rid, r.sid, { cc: ln.cc });
                            chips(); save();
                        }
                    }
                }
                if (!B.acc && !B.sheetEv && !B.resultOpen && tt < .97) {
                    const f = (biz.follows || []).find(x => !x.fired && B.elapsed >= x.at);
                    if (f) { f.fired = true; fireFollow(f); }
                }
                if (tt >= 1 && !B.active && !B.acc && (B.guests.length === 0 || tt >= 1.12)) { await finish(); return; }
            }
        } catch { /* 끝 */ }
    };
    const finish = async (early = false) => {
        B.running = false;
        biz.finished = true;
        if (early === 'staff') {
            // 0.3.6 사장님이 오래 비움: 멈춘 시각부터 직원들끼리 마저 영업
            const r = staffRest(g, biz, Math.max(0, 1 - B.elapsed / D));
            biz.staffAt = clockStr(true);
            biz.news.push({ t: clockStr(), at: B.elapsed, k: 'work', text: F(L('사장님이 자리를 비워서 직원들끼리 마저 영업했어요 · {t}부터 · 손님 {n}명', 'You were away, so the staff ran the rest of the day · from {t} · {n} guests'), { t: biz.staffAt, n: r.n }), chip: r.sales ? '+' + money(r.sales) : '', good: true, key: 'staffRest', sid: null });
        } else if (early) {
            // 일찍 닫기: 닫은 시각을 남겨 마감 화면·결과 카드에 보여 줌. 가게 로그에는 사장님 줄로.
            biz.earlyAt = clockStr(true);
            biz.news.push({ t: clockStr(), at: B.elapsed, k: 'boss', text: F(L('사장님이 일찍 문을 닫았어요 · {t}', 'You closed early · {t}'), { t: biz.earlyAt }), chip: '', good: false, key: 'early', sid: null, boss: true });
        }
        // 영업이 먼저 끝나서 못 터진 "이어지는 일"은 다음 날로 (직원들끼리 영업한 날엔 사라짐)
        g.pendingFollow = (biz.follows || []).filter(x => !x.fired).slice(0, MAX_FOLLOW_PER_DAY).map(x => ({ ...x, carried: true, fired: false }));
        biz.shelfLeft = B.shelf;
        // 끝까지 안 본 밀린 일은 직원이 알아서 (결과는 일지에)
        for (const x of B.backlog) { try { resolveEvent(g, x, staffPick(g, x), biz, 'auto'); } catch (err) { console.warn(err); } }
        B.backlog = [];
        t.events.filter(x => !x.done).forEach(x => (x.done = { skipped: true }));
        sc.setEnv({ tod: 'eve', weather: g.weather }); sc.sign('CLOSED');
        toast(early === 'staff' ? L('직원들이 마저 영업하고 문을 닫았어요', 'The staff finished the day and closed up') : early ? L('일찍 문을 닫았어요', 'Closed early') : L('저녁 8시, 영업 끝!', '8 PM — closing time!'), 1800);
        if (early !== 'staff') { try { await new Promise(r => setTimeout(r, 1400)); } catch { /* */ } }
        closeDay(g, biz);
        B = null;
        render();
    };

    B.staffClose = () => {
        if (!B || !B.running || B.closing) return;
        B.closing = true;
        closeSheet();
        B.sheetEv = null; B.resultOpen = false;
        if (B.acc) B.acc.open = false;
        finish('staff');
    };

    // 🌙 오늘은 여기까지 (멈춤 띠 안 버튼): 물어보고 바로 마감 정산으로. 손님을 덜 받은 만큼 매출만 줄고 월급은 그대로.
    const closeEarly = async () => {
        if (!B || !B.running || B.closing) return;
        B.closing = true;
        const ok = await confirmBox(L('오늘은 여기까지 하고 문을 닫을까요? 손님을 덜 받아서 매출이 줄어요. 아직 안 생긴 일은 오늘은 없어요.', 'Close the shop for today? You\'ll serve fewer guests, so sales drop. Anything that hasn\'t happened yet won\'t happen today.'), L('문 닫기', 'Close'));
        if (!B) return;
        B.closing = false;
        if (!ok || !B.running) return;
        closeSheet();
        B.sheetEv = null; B.resultOpen = false;
        if (B.acc) B.acc.open = false;
        await finish(true);
    };

    // ---------- 버튼 ----------
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-b]');
        if (b) {
            if (b.dataset.b === 'find') { const en = B?.ents[b.dataset.id]; if (en) { sc.focus(en, 1.5); sc.jump(en); sc.say(en, tapLine(b.dataset.id), 1400); } }
            if (b.dataset.b === 'resume') { B.holdPause = false; pauseBusiness(false); }
            if (b.dataset.b === 'closeEarly') closeEarly();
            if (b.dataset.b === 'blOpen') { const x = B.backlog.find(y => y.id === b.dataset.id); if (x) openEvent(x); }
            if (b.dataset.b === 'blAll') { for (const x of [...B.backlog]) finishEvent(0, canDelegate(x) ? 'delegate' : 'auto', x); }
            return;
        }
        // ⏸ = 그 자리에서 멈추기/다시 시작 (창 닫기는 ✕)
        if (e.target.closest('.cr-pause')) { if (sc.paused) B.holdPause = false; pauseBusiness(!sc.paused); }
    });
    const sheet = document.querySelector('#crumble-root .cr-sheet');
    B.sheetHandler = e => {
        const b = e.target.closest('[data-b]'); if (!b || !B) return;
        if (b.dataset.b === 'resOk') { if (B.resultOpen) resultOk(); return; }
        if (b.dataset.b === 'ordRule') { ruleFromTalk(); return; }
        if (b.dataset.b === 'ord' || b.dataset.b === 'ordSkip') { if (B.acc?.open && !B.acc.done) chooseOrder(b.dataset.b === 'ord' ? +b.dataset.i : -1); return; }
        if (!B.sheetEv || B.resultOpen) return;
        if (b.dataset.b === 'opt') finishEvent(+b.dataset.i, false);
        else if (b.dataset.b === 'delegate') finishEvent(0, 'delegate');
        else if (b.dataset.b === 'later') laterEvent();
    };
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
    box.innerHTML = `${bizHead('close', { moneyHtml: `<span class="cr-money${g.money < 0 ? ' neg' : ''}">💰 ${money(g.money)}</span>`, clock: biz.earlyAt || L('저녁 8:00', '8:00 PM'), fill: 100 })}${bizTabs()}
<main class="cr-main" data-biz>
<div class="cr-sceneHost" id="cr-cScene"></div>
${biz.staffAt ? `<div class="cr-resNote">🌙 ${F(L('사장님이 오래 자리를 비워서 {t}부터는 직원들끼리 마저 영업하고 문을 닫았어요.', 'You were away a long time, so from {t} the staff ran the shop themselves and closed up.'), { t: esc(biz.staffAt) })}</div>` : ''}
<section class="cr-card"><div class="cr-ttl">💰 ${L('오늘 번 돈', 'Today\'s earnings')}<small>${F(L('{n}일째', 'Day {n}'), { n: g.day })}</small></div>
<b class="cr-big ${net < 0 ? 'neg' : 'pos'}">${signedMoney(net)}</b>
<div class="cr-line"><span>${F(L('매출 (손님 {n}명)', 'Sales ({n} guests)'), { n: biz.served })}</span><b>${signedMoney(biz.revenue)}</b></div>
<div class="cr-line"><span>${L('재료', 'Stock')}</span><b>${signedMoney(-(t.spentIng || 0))}</b></div>
<div class="cr-line"><span>${F(L('월급 ({n}명)', 'Wages ({n})'), { n: g.staff.length })}</span><b>${signedMoney(-(sum.wages || 0))}</b></div>
${sum.interest ? `<div class="cr-line"><span>${L('대출 이자', 'Loan interest')}</span><b>${signedMoney(-sum.interest)}</b></div>` : ''}
${sum.ruleCost ? `<div class="cr-line"><span>${L('대책 비용', 'House rules')}</span><b>${signedMoney(-sum.ruleCost)}</b></div>` : ''}
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
        ents[s.id] = sc.ent({ staffId: s.id, label: book(s.id)?.name, c: p[0], r: p[1], onTap: e => { sc.jump(e); const d = j?.diaries?.[s.id]; sc.say(e, d || tapLine(s.id), 3200); } });
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
            if (b.dataset.c === 'log' && g.phase === 'done') { import('./ui.js').then(m => { m.view.tab = 'journal'; m.view.journal = 'this'; render(); m.afterClose(); }); return; }
            render();
            import('./ui.js').then(m => m.afterClose()); // 0.3.6 오래 비운 나머지 시간은 직원들끼리
        }
    });
}

export { inner, colorOf, staffById, bossRel, heartRow, nameTag, logoHtml, addJournal, guestMult };
