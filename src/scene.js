// 가게 장면 — 비스듬히 내려다보기(아이소메트릭)
// 크기·가구 배치는 layouts.js 설정값을 따른다.
// 직원·손님 움직임은 작은 조각(go / work / say / emo / jump)으로 만들어 두어,
// 3단계 행동(성격대로 돌아다니기, 마주치면 대화)을 조합으로 얹을 수 있게 했다.

import { layoutFor, cellsOf } from './layouts.js';
import { ICON, staffLook, guestLook } from './looks.js';
import { G, S as settings, save, shopName } from './state.js';
import { L } from './i18n.js';
import { esc } from './util.js';

const TW = 22, TH = 11;

export function createScene(host, opts = {}) {
    const lay = layoutFor(opts.size || '11x9');
    const { cols: COLS, rows: ROWS, OX, OY, WW, WH } = lay;
    // 창이 넓으면 장면 높이도 같이 커지게 (폭 400 기준, 최대 1.45배)
    const winEl = host.closest('.cr-win');
    const grow = Math.min(1.45, Math.max(1, (winEl?.clientWidth || 400) / 400));
    const VH0 = Math.round((opts.height || 230) * grow);
    let VH = VH0;
    let VW = 366;

    const P = (c, r, h = 0) => [OX + (c - r) * TW, OY + (c + r) * TH - h];
    const pt = a => a.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const poly = (a, f, sw = 1.3, st = '#8A5A36') => `<polygon points="${pt(a)}" fill="${f}" stroke="${st}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    // 간판 글자: 간판 폭에 맞게 글씨를 줄이고(최소 6px), 그래도 길면 뒤를 "…"로 자름
    function signText(name) {
        const [s1, s2] = lay.sign;
        const t0 = String(name || '').trim() || 'Crumble';
        const room = (s2 - s1 - .5) * TW;
        const w1 = ch => /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1.02 : /[A-Z0-9MW@&%]/.test(ch) ? .72 : ch === ' ' ? .3 : .6;
        const width = (str, fs) => [...str].reduce((a, ch) => a + w1(ch), 0) * fs;
        let t = t0, fs = 12;
        if (width(t, fs) > room) fs = Math.max(6, room / width(t, 1));
        if (width(t, fs) > room) { const a = [...t0]; while (a.length > 1 && width(a.join('') + '…', fs) > room) a.pop(); t = a.join('').trimEnd() + '…'; }
        const tp = P((s1 + s2) / 2, 0, 68.6 - fs * .36);
        return `<text transform="matrix(1,0.5,0,1,0,0)" x="${tp[0].toFixed(1)}" y="${(tp[1] - tp[0] * .5).toFixed(1)}" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="#FFF7EC">${esc(t)}</text>`;
    }
    const tileC = (c, r) => [OX + (c - r) * TW, OY + (c + r + 1) * TH];
    function box(c, r, w, d, h, z0, top, left, right) {
        const A = P(c, r, z0 + h), B = P(c + w, r, z0 + h), C = P(c + w, r + d, z0 + h), D = P(c, r + d, z0 + h), Bb = P(c + w, r, z0), Cb = P(c + w, r + d, z0), Db = P(c, r + d, z0);
        return poly([D, C, Cb, Db], left) + poly([C, B, Bb, Cb], right) + poly([A, B, C, D], top);
    }
    const qA = (c1, c2, h1, h2) => [P(c1, 0, h1), P(c2, 0, h1), P(c2, 0, h2), P(c1, 0, h2)];
    const qB = (r1, r2, h1, h2) => [P(0, r1, h1), P(0, r2, h1), P(0, r2, h2), P(0, r1, h2)];
    const qC = (cp, r1, r2, h1, h2) => [P(cp, r1, h1), P(cp, r2, h1), P(cp, r2, h2), P(cp, r1, h2)];
    const qR = (rp, c1, c2, h1, h2) => [P(c1, rp, h1), P(c2, rp, h1), P(c2, rp, h2), P(c1, rp, h2)];
    const layer = (z, inner, cls = '') => `<svg class="cr-layer ${cls}" viewBox="0 0 ${WW} ${WH}" style="z-index:${z}" aria-hidden="true">${inner}</svg>`;
    const uidp = 'crs' + Math.random().toString(36).slice(2, 7);

    // ---------- 바닥·벽 ----------
    function floorSvg() {
        let h = `<rect width="${WW}" height="${WH}" fill="#F6E8D2"/><rect y="${lay.grassY}" width="${WW}" height="${WH - lay.grassY}" fill="#CDE3B8"/>`;
        h += `<path d="M0 ${WH - 26} Q${WW / 2} ${WH - 52} ${WW} ${WH - 16} L${WW} ${WH} L0 ${WH}Z" fill="#F3DDB6"/>`;
        h += `<circle cx="22" cy="${lay.grassY + 70}" r="18" fill="#9CC48A" stroke="#6E9A5C" stroke-width="1.3"/><circle cx="${WW - 26}" cy="${lay.grassY + 85}" r="17" fill="#9CC48A" stroke="#6E9A5C" stroke-width="1.3"/><circle cx="66" cy="${lay.grassY + 115}" r="11" fill="#A9CF96" stroke="#6E9A5C" stroke-width="1.3"/>`;
        h += poly([P(0, ROWS), P(COLS, ROWS), P(COLS, ROWS, -8), P(0, ROWS, -8)], '#B9844A') + poly([P(COLS, ROWS), P(COLS, 0), P(COLS, 0, -8), P(COLS, ROWS, -8)], '#9E6E3B');
        for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) h += poly([P(c, r), P(c + 1, r), P(c + 1, r + 1), P(c, r + 1)], (c + r) % 2 ? '#EAC69C' : '#F3D9B8', .5, '#E0BA8E');
        const [r1, r2, r3, r4] = lay.rug;
        h += poly([P(r1, r2), P(r3, r2), P(r3, r4), P(r1, r4)], '#E7A0A6', 1.3, '#C9607D') + poly([P(r1 + .3, r2 + .3), P(r3 - .3, r2 + .3), P(r3 - .3, r4 - .3), P(r1 + .3, r4 - .3)], 'none', 1, '#FFF3E2');
        h += poly(qA(0, COLS, 0, 84), '#FCEBD9');
        for (let c = .5; c < COLS; c += .5) { const a = P(c, 0, 0), b = P(c, 0, 84); if ((c * 2) % 2) h += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#F8D6CC" stroke-width="5"/>`; }
        h += poly(qA(0, COLS, 0, 6), '#C9A27E');
        h += poly(qB(0, ROWS, 0, 84), '#F8E2CE');
        for (let r = .5; r < ROWS; r += .5) { const a = P(0, r, 0), b = P(0, r, 84); if ((r * 2) % 2) h += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#F4D2C6" stroke-width="5"/>`; }
        h += poly(qB(0, ROWS, 0, 6), '#B9925F');
        for (let c = .4; c < COLS; c += .9) { const a = P(c, 0, 80), b = P(c + .5, 0, 80), m = P(c + .25, 0, 68); h += `<polygon points="${pt([a, b, m])}" fill="${['#F7B6C6', '#FBE29A', '#F29A7C'][Math.round(c * 1.1) % 3]}"/>`; }
        for (let r = .4; r < ROWS; r += .9) { const a = P(0, r, 80), b = P(0, r + .5, 80), m = P(0, r + .25, 68); h += `<polygon points="${pt([a, b, m])}" fill="${['#FBE29A', '#F29A7C', '#F7B6C6'][Math.round(r * 1.1) % 3]}"/>`; }
        lay.windows.forEach(([a, b, cl], i) => {
            const win = qA(a, b, 28, 64);
            h += `<defs><clipPath id="${uidp}w${i}"><polygon points="${pt(win)}"/></clipPath></defs>`;
            h += `<polygon class="cr-sky" points="${pt(win)}" fill="#DDEFF5"/>`;
            h += `<g clip-path="url(#${uidp}w${i})">`;
            if (i === 0) { const sc = P(a + 1.4, 0, 54); h += `<circle class="cr-sun" cx="${sc[0]}" cy="${sc[1]}" r="6" fill="#FBE29A"/><circle class="cr-moon" cx="${sc[0]}" cy="${sc[1]}" r="5" fill="#FFF7EC" opacity="0"/>`; }
            h += `<g class="cr-cloud" opacity="0">`;
            { const cp = P(a + .9, 0, 50); h += `<ellipse cx="${cp[0]}" cy="${cp[1]}" rx="10" ry="5" fill="#FFFDF9"/><ellipse cx="${cp[0] + 9}" cy="${cp[1] + 4}" rx="8" ry="4" fill="#F3F1EE"/>`; }
            h += `</g><g class="cr-rain" opacity="0" stroke="#8FB3C9" stroke-width="1.4" stroke-linecap="round">`;
            for (let k = 0; k < 9; k++) { const p = P(a + .1 + k * .2, 0, 36 + (k * 13) % 26); h += `<line x1="${p[0]}" y1="${p[1]}" x2="${p[0] - 3}" y2="${p[1] + 8}"/>`; }
            h += '</g></g>' + poly(win, 'none', 2);
            const mid = (a + b) / 2, m1 = P(mid, 0, 28), m2 = P(mid, 0, 64), m3 = P(a, 0, 46), m4 = P(b, 0, 46);
            h += `<line x1="${m1[0]}" y1="${m1[1]}" x2="${m2[0]}" y2="${m2[1]}" stroke="#8A5A36" stroke-width="1.5"/><line x1="${m3[0]}" y1="${m3[1]}" x2="${m4[0]}" y2="${m4[1]}" stroke="#8A5A36" stroke-width="1.5"/>`;
            h += poly([P(a - .2, 0, 64), P(b + .2, 0, 64), P(b + .2, 0, 70), P(a - .2, 0, 70)], cl);
        });
        const [s1, s2] = lay.sign;
        h += poly(qA(s1, s2, 60, 76), '#8A5A36');
        h += `<g class="cr-shopSign">${signText(opts.shopName ?? shopName(G()))}</g>`;
        const D = lay.door;
        h += poly(qA(D - .05, D + .85, 0, 58), '#C9813F') + poly(qA(D + .1, D + .7, 30, 50), '#DDEFF5', 1.1);
        const kn = P(D + .7, 0, 24); h += `<circle cx="${kn[0]}" cy="${kn[1]}" r="2" fill="#FBE29A" stroke="#8A5A36"/>`;
        h += poly(qA(D + .05, D + .75, 36, 46), '#FFFDF9', 1.1);
        const sp = P(D + .12, 0, 39.5);
        h += `<text class="cr-signT" transform="matrix(1,0.5,0,1,0,0)" x="${sp[0]}" y="${sp[1] - sp[0] * .5}" font-family="system-ui,sans-serif" font-weight="800" font-size="5.3" fill="#C2603E">OPEN</text>`;
        h += poly(qB(2.2, 4.6, 48, 52), '#C9813F') + poly(qB(5.4, 7.6, 48, 52), '#C9813F');
        [5.8, 6.3, 6.8, 7.3].forEach((r, i) => { const p = P(0, r, 58); h += `<rect x="${p[0] - 4}" y="${p[1] - 6}" width="8" height="11" rx="2" fill="${['#FBE29A', '#F7B6C6', '#E8B97A', '#CDE3B8'][i]}" stroke="#8A5A36" stroke-width="1.1"/>`; });
        [2.6, 3.1, 3.6, 4.1].forEach((r, i) => { const p = P(0, r, 58); h += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${['#F7B6C6', '#FBE29A', '#BFD9E8', '#E8B97A'][i]}" stroke="#8A5A36" stroke-width="1.1"/>`; });
        if (lay.board) {
            const [b1, b2] = lay.board;
            h += poly(qB(b1, b2, 26, 60), '#E8C9A0', 1.5) + poly(qB(b1 + .3, b1 + 1, 40, 54), '#F7B6C6', 1) + poly(qB(b1 + 1.2, b2 - .3, 34, 50), '#FBE29A', 1) + poly(qB(b1 + .5, b1 + 1.3, 30, 37), '#FFFDF9', 1);
        }
        h += '<g class="cr-lamps" opacity="0">';
        lay.lamps.forEach(([c, r]) => { const p = P(c, r, 50); h += `<circle cx="${p[0]}" cy="${p[1]}" r="36" fill="#FFE7A8" opacity=".33"/>`; });
        h += '</g>';
        return h;
    }

    // ---------- 가구 조각 ----------
    const DRAW = {
        plant: f => { const { c, r } = f; const q = P(c + .5, r + .5, 30); return box(c + .2, r + .2, .6, .6, 14, 0, '#E8A07A', '#D07A55', '#B8653F') + `<ellipse cx="${q[0] - 6}" cy="${q[1] + 4}" rx="9" ry="6" fill="#8CC28A" stroke="#5E8F5C"/><ellipse cx="${q[0] + 7}" cy="${q[1] + 2}" rx="9" ry="6" fill="#9CCF94" stroke="#5E8F5C"/><ellipse cx="${q[0]}" cy="${q[1] - 6}" rx="7" ry="9" fill="#8CC28A" stroke="#5E8F5C"/>`; },
        oven: f => {
            const { c, r } = f;
            let ov = box(c, r, 1, 2, 46, 0, '#F3E1C6', '#E6CBA9', '#D8B890') + poly(qC(c + 1, r + .25, r + 1.75, 8, 32), '#6B4226', 1.2) + `<polygon class="cr-ovenGlow" points="${pt(qC(c + 1, r + .4, r + 1.6, 11, 29))}" fill="#F29A7C" opacity=".2"/>`;
            const s0 = P(c + .5, r + 1, 52);
            ov += `<g class="cr-steam" fill="none" stroke="#FFFDF9" stroke-width="2.4" stroke-linecap="round">${[-8, 0, 8].map(dx => `<path d="M${s0[0] + dx} ${s0[1]}q-4-5 0-10t0-10"/>`).join('')}</g>`;
            return ov;
        },
        display: () => '',
        counter: f => {
            const { c, r } = f; const p = P(c + .6, r + .5, 24);
            return box(c, r, 3, 1, 24, 0, '#F3D2A8', '#C9813F', '#B06E33') + box(c + 2.15, r + .2, .6, .55, 10, 24, '#E6CBA9', '#D8B890', '#C9A27E') + `<path d="M${p[0] - 8} ${p[1]}a8 8 0 0116 0z" fill="#DDEFF5" fill-opacity=".8" stroke="#8A5A36" stroke-width="1.1"/><circle cx="${p[0]}" cy="${p[1] - 3}" r="2.5" fill="#F7B6C6"/>`;
        },
        table: f => { const { c, r } = f; const t0 = P(c + .5, r + .5, 0), t1 = P(c + .5, r + .5, 16); return `<line x1="${t0[0]}" y1="${t0[1]}" x2="${t1[0]}" y2="${t1[1]}" stroke="#8A5A36" stroke-width="4"/><ellipse cx="${t1[0]}" cy="${t1[1]}" rx="19" ry="9.5" fill="#C9813F" stroke="#8A5A36" stroke-width="1.5"/><circle cx="${t1[0] - 4}" cy="${t1[1] - 3}" r="3" fill="${f.dot || '#FFFDF9'}" stroke="#8A5A36" stroke-width=".8"/>`; },
        chair: f => { const q = P(f.c + .5, f.r + .5, 7); return `<ellipse cx="${q[0]}" cy="${q[1]}" rx="9" ry="4.5" fill="#F7B6C6" stroke="#8A5A36" stroke-width="1.2"/>`; },
        bucket: f => box(f.c + .2, f.r + .2, .55, .55, 13, 0, '#CFE3EE', '#BFD9E8', '#A7C6D8'),
    };
    const displayF = lay.furniture.find(f => f.kind === 'display');

    function furnitureHtml() {
        return lay.furniture.map(f => {
            const cells = cellsOf(f);
            const front = Math.max(...cells.map(([c, r]) => c + r));
            const z = front * 10 + (f.kind === 'chair' ? 1 : 2);
            const cls = f.kind === 'display' ? 'cr-disp' : '';
            return layer(z, DRAW[f.kind] ? DRAW[f.kind](f) : '', cls);
        }).join('') + layer((lay.boxSpot[0] + lay.boxSpot[1]) * 10 + 2, '', 'cr-boxes');
    }

    // ---------- 만들기 ----------
    host.innerHTML = `<div class="cr-scene" style="height:${VH}px"><div class="cr-world" style="width:${WW}px;height:${WH}px">${layer(0, floorSvg())}${layer(1, '', 'cr-props')}${furnitureHtml()}<div class="cr-tint"></div></div>
<span class="cr-panhint">${L('끌어서 둘러보기 · 두 손가락으로 확대', 'Drag to look around · pinch to zoom')}</span></div>
<div class="cr-zoom"><button class="cr-zi" type="button" aria-label="${L('확대', 'Zoom in')}">+</button><button class="cr-zo" type="button" aria-label="${L('축소', 'Zoom out')}">−</button><span class="cr-zl"></span><button class="cr-zfit" type="button" aria-label="${L('가게 전체 보기', 'Show whole shop')}">${L('전체', 'All')}</button></div><button class="cr-zbig" type="button" aria-label="${L('크게 보기', 'Big view')}">⤢ ${L('크게', 'Big')}</button>`;
    host.classList.add('cr-sbox');
    const scene = host.querySelector('.cr-scene'), world = host.querySelector('.cr-world');
    const Q = s => world.querySelector(s), QA = s => world.querySelectorAll(s);
    const ac = new AbortController();

    const api = {
        lay, tileC, ents: [], paused: false, run: 0, dead: false, shelf: 0, stains: [],
    };

    // ---------- 기다리기 (일시정지·중단 반영) ----------
    api.wait = ms => new Promise((res, rej) => {
        const my = api.run; let left = ms; let last = performance.now();
        (function tick() {
            if (api.dead || my !== api.run) { rej('stop'); return; }
            const now = performance.now();
            if (!api.paused) left -= now - last;
            last = now;
            if (left <= 0) res(); else setTimeout(tick, Math.min(120, Math.max(16, left)));
        })();
    });
    api.stop = () => { api.run++; };

    // ---------- 등장인물 ----------
    api.ent = o => {
        const staff = !!o.staffId;
        const el = document.createElement(staff ? 'button' : 'div');
        el.className = 'cr-ent' + (staff ? '' : ' cr-guest');
        if (staff) { el.type = 'button'; el.setAttribute('aria-label', o.label || ''); } else el.setAttribute('aria-hidden', 'true');
        el.innerHTML = `<span class="cr-bub"></span>` + (staff ? staffLook(o.staffId) : guestLook(o.shirt || '#C7B6E0'));
        const e = { el, ...o };
        api.place(e, o.c, o.r, 0);
        world.appendChild(el);
        api.ents.push(e);
        if (staff) {
            el.addEventListener('click', () => {
                if (e.onTap) e.onTap(e);
                else api.jump(e);
            });
            el.addEventListener('animationend', ev => { if (ev.animationName === 'cr-jump') el.classList.remove('cr-jumping'); });
        }
        return e;
    };
    api.remove = e => { e.el.remove(); api.ents = api.ents.filter(x => x !== e); };
    api.place = (e, c, r, dur, depth = c + r) => {
        const [x, y] = tileC(c, r);
        e.el.style.transition = `left ${dur}s linear, top ${dur}s linear, opacity .5s`;
        e.el.style.left = x + 'px'; e.el.style.top = (y - 64) + 'px'; e.el.style.zIndex = depth * 10 + 5;
        e.c = c; e.r = r;
    };

    // ㄱ자 길 (길 찾기 없음: 정해진 통로·건너는 열을 이용)
    const blockedAt = (c, r, goal) => {
        if (goal && c === goal[0] && r === goal[1]) return false;
        return lay.blocked.has(c + ',' + r);
    };
    function segClear(a, b, goal) {
        const dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]);
        let c = a[0], r = a[1];
        while (c !== b[0] || r !== b[1]) { c += dc; r += dr; if (blockedAt(c, r, goal)) return false; }
        return true;
    }
    function pathClear(start, pts, goal) {
        let a = start;
        for (const p of pts) { if (!segClear(a, p, goal)) return false; a = p; }
        return true;
    }
    function routeSame(a, b, lane) {
        const opts = [[[b[0], a[1]], b], [[a[0], b[1]], b], [[a[0], lane], [b[0], lane], b], [[a[0], ROWS - 1], [b[0], ROWS - 1], b]];
        for (const o of opts) if (pathClear(a, o, b)) return o;
        return [[b[0], a[1]], b];
    }
    api.route = (from, to) => {
        const F = lay.frontRow;
        const za = from[1] >= F ? 'front' : 'back', zb = to[1] >= F ? 'front' : 'back';
        if (za === zb) return routeSame(from, to, za === 'front' ? F : 1);
        const crosses = [lay.crossCol, lay.door];
        const x = crosses.reduce((best, c) => (Math.abs(from[0] - c) + Math.abs(to[0] - c) < Math.abs(from[0] - best) + Math.abs(to[0] - best) ? c : best), crosses[0]);
        if (za === 'back') return [...routeSame(from, [x, 1], 1), [x, F], ...routeSame([x, F], to, F)];
        return [...routeSame(from, [x, F], F), [x, 1], ...routeSame([x, 1], to, 1)];
    };
    api.go = async (e, target, speed = .55) => {
        const path = api.route([e.c, e.r], target);
        for (const [c, r] of path) {
            const d = Math.abs(c - e.c) + Math.abs(r - e.r); if (!d) continue;
            const dur = d * speed;
            e.el.classList.remove('cr-work'); e.el.classList.add('cr-walk');
            api.place(e, c, r, dur, Math.max(c + r, e.c + e.r));
            try { await api.wait(dur * 1000); } catch (err) { e.el.classList.remove('cr-walk'); throw err; }
            e.el.style.zIndex = (c + r) * 10 + 5;
        }
        e.el.classList.remove('cr-walk');
    };
    api.emo = (e, k) => { const m = e.el.querySelector('.cr-emo'); if (!m) return; if (k && ICON[k]) { m.innerHTML = ICON[k]; m.classList.add('on'); } else m.classList.remove('on'); e.icon = k || null; };
    api.say = (e, t, ms = 2400) => {
        if (!t) return;
        const b = e.el.querySelector('.cr-bub'); b.textContent = t; b.classList.add('show');
        // 긴 말은 그만큼 오래 보여 줌 (잘리지 않게 여러 줄로 접힘)
        const dur = Math.min(9000, Math.max(ms, 900 + String(t).length * 110));
        clearTimeout(e._t); e._t = setTimeout(() => b.classList.remove('show'), dur);
    };
    api.work = (e, on) => e.el.classList.toggle('cr-work', !!on);
    api.jump = e => { e.el.classList.remove('cr-jumping'); void e.el.offsetWidth; e.el.classList.add('cr-jumping'); };
    api.alert = (e, on) => {
        e.el.querySelector('.cr-ex')?.remove();
        if (on) { const x = document.createElement('span'); x.className = 'cr-ex'; x.textContent = '!'; e.el.appendChild(x); }
        e.alerted = !!on;
    };
    api.fade = (e, on) => { e.el.style.opacity = on ? 1 : 0; };

    // ---------- 0.2.0: 운영 상태 잘 보이게 ----------
    // A 직원 글 이름표 — kind: focus(집중) / work(일) / bad(사고) / sleep(졸음) / move(이동·대기)
    api.tag = (e, text, kind = 'work') => {
        let t = e.el.querySelector('.cr-stag');
        if (!text || settings().staffTags === false) { t?.remove(); e.el.classList.remove('cr-hasTag'); return; }
        if (!t) { t = document.createElement('span'); t.className = 'cr-stag'; t.innerHTML = '<i></i><b></b>'; e.el.appendChild(t); }
        t.className = 'cr-stag ' + kind;
        t.querySelector('b').textContent = text;
        e.el.classList.add('cr-hasTag');
    };
    // B 손님 기다림 막대 (0~1, 없애려면 null)
    api.waitBar = (e, f) => {
        let w = e.el.querySelector('.cr-wbar');
        if (f == null) { w?.remove(); e.el.classList.remove('cr-hasTag'); return; }
        if (!w) { w = document.createElement('span'); w.className = 'cr-wbar'; w.innerHTML = '<i></i>'; e.el.appendChild(w); e.el.classList.add('cr-hasTag'); }
        const v = Math.max(0, Math.min(1, f));
        const i = w.querySelector('i');
        i.style.width = Math.round((1 - v) * 100) + '%';
        i.style.background = v < .45 ? '#7CC47A' : v < .75 ? '#F2B24C' : '#E8616B';
    };
    // C 떠오르는 숫자·표시 — tone: good / bad / heart / leave
    api.float = (e, text, tone = 'good', dy = 0) => {
        if (!e || !text) return;
        const [x, y] = tileC(e.c, e.r);
        const f = document.createElement('div');
        f.className = 'cr-float ' + tone;
        f.textContent = text;
        f.style.left = x + 'px'; f.style.top = (y - 78 - dy) + 'px';
        f.setAttribute('aria-hidden', 'true');
        world.appendChild(f);
        setTimeout(() => f.remove(), 1900);
    };
    api.clearEnts = () => { api.run++; api.ents.forEach(e => e.el.remove()); api.ents = []; };

    // ---------- 풍경 ----------
    api.setEnv = ({ tod, weather }) => {
        const eve = tod === 'eve' || tod === 'night', dark = tod === 'dark';
        const sky = { sun: '#DDEFF5', cloud: '#D7DEE3', rain: '#B9C4CC', hot: '#FFE2B0' }[weather] || '#DDEFF5';
        QA('.cr-sky').forEach(e => e.setAttribute('fill', eve || dark ? '#3C3A63' : tod === 'dawn' ? '#F6CDB4' : sky));
        QA('.cr-sun').forEach(e => { e.setAttribute('opacity', (!eve && !dark && weather !== 'rain' && weather !== 'cloud') ? 1 : 0); e.setAttribute('r', weather === 'hot' ? 9 : 6); });
        QA('.cr-moon').forEach(e => e.setAttribute('opacity', eve || dark ? 1 : 0));
        QA('.cr-rain').forEach(e => e.setAttribute('opacity', weather === 'rain' ? 1 : 0));
        QA('.cr-cloud').forEach(e => e.setAttribute('opacity', (weather === 'cloud' || weather === 'rain') && !eve && !dark ? 1 : 0));
        Q('.cr-lamps').setAttribute('opacity', eve ? 1 : 0);
        Q('.cr-tint').style.background = { dawn: 'rgba(40,30,70,.40)', am: 'rgba(255,232,180,.14)', pm: 'transparent', eve: 'rgba(50,40,90,.24)', night: 'rgba(50,40,90,.30)', dark: 'rgba(28,20,55,.52)' }[tod] || 'transparent';
        if (weather === 'hot' && !eve && !dark) Q('.cr-tint').style.background = tod === 'am' ? 'rgba(255,200,140,.16)' : 'rgba(255,190,120,.12)';
    };
    api.tint = v => { Q('.cr-tint').style.background = v; };
    api.lamps = v => Q('.cr-lamps').setAttribute('opacity', v);
    api.steam = on => { Q('.cr-steam')?.classList.toggle('on', !!on); Q('.cr-ovenGlow')?.setAttribute('opacity', on ? .8 : .2); };
    // 벽 간판: 가게 이름 (없으면 Crumble). 이름을 바꾸면 그 자리에서 바로 갈아 끼움
    api.shopSign = name => { const el = Q('.cr-shopSign'); if (el) el.innerHTML = signText(name); };
    api.sign = t => { const s = Q('.cr-signT'); s.textContent = t; s.setAttribute('fill', t === 'OPEN' ? '#C2603E' : '#6B4226'); };
    api.display = n => {
        api.shelf = n;
        if (!displayF) return;
        const { c, r } = displayF;
        let d = box(c, r, 2, 1, 40, 0, '#F3E1C6', '#DDEFF5', '#C9DDE6') + poly(qR(r + 1, c, c + 2, 19, 21), '#C9A27E', .8);
        const spots = [[c + .4, 22], [c + 1, 22], [c + 1.6, 22], [c + .4, 4], [c + 1, 4], [c + 1.6, 4]], colors = ['#F7B6C6', '#FBE29A', '#E8B97A', '#F7B6C6', '#E8B97A', '#FBE29A'];
        for (let i = 0; i < Math.min(6, n); i++) { const [cc, hh] = spots[i]; const q = P(cc, r + 1, hh); d += `<path d="M${q[0] - 6} ${q[1]}l1.5-8q4.5-3 9 0l1.5 8z" fill="${colors[i]}" stroke="#8A5A36" stroke-width="1"/><circle cx="${q[0]}" cy="${q[1] - 10}" r="1.8" fill="#E8616B"/>`; }
        if (n <= 0) { const q = P(c + 1, r + 1, 14); d += `<text x="${q[0]}" y="${q[1]}" text-anchor="middle" font-size="9" fill="#8E3550">${L('텅…', 'empty…')}</text>`; }
        d += poly([P(c, r + 1, 40), P(c + 2, r + 1, 40), P(c + 2, r + 1, 0), P(c, r + 1, 0)], 'none', 1.4);
        Q('.cr-disp').innerHTML = d;
    };
    api.boxes = n => {
        const [bc, br] = lay.boxSpot;
        const spots = [[bc + .1, br + .1, 0], [bc + .55, br + .1, 0], [bc + .1, br + .55, 0], [bc + .55, br + .55, 0], [bc + .3, br + .3, 12], [bc + .3, br + .3, 24]];
        let h = '';
        for (let i = 0; i < Math.min(n, 6); i++) { const [c, r, z] = spots[i]; h += box(c, r, .42, .42, 12, z, '#F0CB97', '#E8B97A', '#D09A5C'); }
        Q('.cr-boxes').innerHTML = h;
    };
    api.setStains = list => {
        api.stains = list;
        Q('.cr-props').innerHTML = list.map(s => { const [x, y] = tileC(s.c, s.r); const dx = s.dx || 0; return `<ellipse cx="${x + dx}" cy="${y}" rx="9" ry="4" fill="#B98A5E" opacity=".5"/><circle cx="${x + dx + 9}" cy="${y - 2}" r="2" fill="#B98A5E" opacity=".5"/>`; }).join('');
    };
    api.randomFree = () => lay.free[Math.floor(Math.random() * lay.free.length)];

    // ---------- 끌기 + 확대 ----------
    const zl = host.querySelector('.cr-zl');
    const Z0 = Math.min(2, (opts.zoom || .8) * grow);
    let ZMIN = .5, ZMAX = 2, Z = Z0, px = 0, py = 0;
    const measure = () => { VW = scene.clientWidth || VW; VH = scene.clientHeight || VH; ZMIN = Math.min(VW / WW, VH / WH); };
    const apply = () => {
        const w = WW * Z, h = WH * Z;
        px = w <= VW ? (VW - w) / 2 : Math.min(0, Math.max(VW - w, px));
        py = h <= VH ? (VH - h) / 2 : Math.min(0, Math.max(VH - h, py));
        world.style.transform = `translate(${px}px,${py}px) scale(${Z})`;
        zl.textContent = Math.round(Z * 100) + '%';
        if (opts.zoomKey && settings().rememberZoom) { const g = G(); if (g) { g.zoom[opts.zoomKey] = { Z, px, py }; save(); } }
    };
    const zoomAt = (nz, fx, fy, smooth) => {
        nz = Math.min(ZMAX, Math.max(ZMIN, nz));
        const wx = (fx - px) / Z, wy = (fy - py) / Z;
        Z = nz; px = fx - wx * Z; py = fy - wy * Z;
        world.classList.toggle('smooth', !!smooth); apply();
    };
    api.focus = (e, z) => {
        measure();
        const [x, y] = tileC(e.c, e.r);
        Z = Math.min(ZMAX, Math.max(ZMIN, z || Math.max(Z, 1.3)));
        px = VW / 2 - x * Z; py = VH / 2 - (y - 30) * Z;
        world.classList.add('smooth'); apply();
    };
    api.center = (c, r, z) => {
        measure();
        if (z) Z = Math.min(ZMAX, Math.max(ZMIN, z));
        const [x, y] = tileC(c, r); px = VW / 2 - x * Z; py = VH / 2 - y * Z; apply();
    };
    api.fit = () => { measure(); zoomAt(ZMIN, VW / 2, VH / 2, true); };
    host.querySelector('.cr-zi').onclick = () => { measure(); zoomAt(Z * 1.25, VW / 2, VH / 2, true); };
    host.querySelector('.cr-zo').onclick = () => { measure(); zoomAt(Z / 1.25, VW / 2, VH / 2, true); };
    host.querySelector('.cr-zfit').onclick = () => api.fit();

    // ---------- 크게 보기: 장면을 창 전체로 옮겼다가 되돌린다 ----------
    const zoomBar = host.querySelector('.cr-zoom'), bigBtn = host.querySelector('.cr-zbig');
    let bigBox = null;
    api.isBig = () => !!bigBox;
    api.setBig = on => {
        if (on === !!bigBox || !winEl) return;
        // 지금 보던 가운데를 기억했다가 그대로 보여 준다
        measure();
        const cx = (VW / 2 - px) / Z, cy = (VH / 2 - py) / Z;
        if (on) {
            bigBox = document.createElement('div');
            bigBox.className = 'cr-bigview';
            winEl.appendChild(bigBox);
            bigBox.append(scene, zoomBar, bigBtn);
            scene.style.height = '100%';
        } else {
            host.append(scene, zoomBar, bigBtn);
            scene.style.height = VH0 + 'px';
            bigBox.remove(); bigBox = null;
        }
        bigBtn.textContent = on ? '⤡ ' + L('작게', 'Small') : '⤢ ' + L('크게', 'Big');
        bigBtn.setAttribute('aria-label', on ? L('원래 크기로', 'Back to normal') : L('크게 보기', 'Big view'));
        measure();
        // 크게 볼 때는 한 단계 확대해서 (적어도 가게 전체가 화면 폭을 채우게)
        if (on) Z = Math.min(ZMAX, Math.max(Z * 1.4, Math.min(VW / WW, VH / WH)));
        else Z = Math.min(ZMAX, Math.max(Math.min(VW / WW, VH / WH), Z));
        px = VW / 2 - cx * Z; py = VH / 2 - cy * Z;
        world.classList.remove('smooth'); apply();
    };
    bigBtn.onclick = () => api.setBig(!bigBox);

    const local = e => { const r = scene.getBoundingClientRect(), k = r.width / VW || 1; return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]; };
    const pts = new Map(); let drag = null, pinch = null, dragged = false, lastTap = 0, lastTapXY = [0, 0], moved = 0;
    scene.addEventListener('pointerdown', e => {
        measure();
        const [x, y] = local(e); pts.set(e.pointerId, { x, y });
        world.classList.remove('smooth');
        if (pts.size === 1) { drag = { x, y, px, py }; dragged = false; moved = 0; }
        else if (pts.size === 2) {
            const [a, b] = [...pts.values()], m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
            pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: Z, wx: (m[0] - px) / Z, wy: (m[1] - py) / Z }; drag = null; dragged = true;
        }
        const hint = host.querySelector('.cr-panhint'); if (hint) hint.style.opacity = 0;
    }, { signal: ac.signal });
    window.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        const [x, y] = local(e); pts.set(e.pointerId, { x, y });
        if (pinch && pts.size >= 2) {
            const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
            Z = Math.min(ZMAX, Math.max(ZMIN, pinch.z0 * d / pinch.d0)); px = m[0] - pinch.wx * Z; py = m[1] - pinch.wy * Z; apply();
        } else if (drag) {
            const dx = x - drag.x, dy = y - drag.y; moved = Math.abs(dx) + Math.abs(dy);
            if (moved > 6) dragged = true;
            if (dragged) { px = drag.px + dx; py = drag.py + dy; apply(); }
        }
    }, { signal: ac.signal });
    const up = e => {
        if (!pts.has(e.pointerId)) return;
        const p = pts.get(e.pointerId);
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = null;
        if (pts.size === 1) { const q = [...pts.values()][0]; drag = { x: q.x, y: q.y, px, py }; }
        if (!pts.size) {
            drag = null;
            // 더블탭: 그 자리 확대 / 많이 확대된 상태면 전체 보기
            if (!dragged && e.type === 'pointerup') {
                const now = performance.now();
                if (now - lastTap < 320 && Math.hypot(p.x - lastTapXY[0], p.y - lastTapXY[1]) < 24) {
                    zoomAt(Z < 1.4 ? Z * 1.6 : ZMIN, p.x, p.y, true); lastTap = 0;
                } else { lastTap = now; lastTapXY = [p.x, p.y]; }
            }
        }
    };
    window.addEventListener('pointerup', up, { signal: ac.signal });
    window.addEventListener('pointercancel', up, { signal: ac.signal });
    scene.addEventListener('wheel', e => { e.preventDefault(); measure(); const [x, y] = local(e); world.classList.remove('smooth'); zoomAt(Z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), x, y); }, { passive: false, signal: ac.signal });
    // 끄는 중·확대 중엔 직원 누르기가 잘못 눌리지 않게
    scene.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, { capture: true, signal: ac.signal });

    api.destroy = () => { api.dead = true; api.run++; ac.abort(); bigBox?.remove(); bigBox = null; host.innerHTML = ''; };

    // 처음 보여줄 곳
    requestAnimationFrame(() => {
        measure();
        const saved = opts.zoomKey && settings().rememberZoom ? G()?.zoom?.[opts.zoomKey] : null;
        if (saved) { Z = saved.Z; px = saved.px; py = saved.py; apply(); }
        else if (opts.focus) api.center(opts.focus[0], opts.focus[1], Z0);
        else apply();
    });

    api.display(0);
    api.boxes(0);
    return api;
}
