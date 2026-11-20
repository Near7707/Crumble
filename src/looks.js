// 직원·손님 모습 — 한 곳에 모아 둠 (4단계에서 "전용 미니 그림" 방식으로 바꿔 끼울 자리)
import { esc, avatarUrl } from './util.js';
import { book, colorOf, staffById } from './state.js';

export const ICON = {
    heart: '<svg width="12" height="12" viewBox="0 0 20 20"><path d="M10 17s-6.5-4-6.5-8.5A3.5 3.5 0 0110 6.4a3.5 3.5 0 016.5 2.1C16.5 13 10 17 10 17z" fill="#F28CA6"/></svg>',
    angry: '<svg width="13" height="13" viewBox="0 0 18 18"><path d="M3 7Q7 7 7 3M11 3Q11 7 15 7M15 11Q11 11 11 15M7 15Q7 11 3 11" stroke="#E0475E" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>',
    sweat: '<svg width="11" height="13" viewBox="0 0 12 16"><path d="M6 1C6 1 1 8 1 11a5 5 0 0010 0C11 8 6 1 6 1z" fill="#8CC7E8" stroke="#4E8DB5" stroke-width="1.2"/></svg>',
    zzz: '<svg width="14" height="12" viewBox="0 0 22 18"><path d="M3 6h6l-6 7h6M12 2h5l-5 5h5" fill="none" stroke="#6B7FB0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cake: '<svg width="13" height="13" viewBox="0 0 20 20"><path d="M3 15l14-8v8z" fill="#FBE29A" stroke="#B88A22" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 15l14-8c-1-2.5-4-3.5-6-2z" fill="#F7B6C6" stroke="#B88A22" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    note: '<svg width="11" height="13" viewBox="0 0 14 18"><path d="M5 14V3l7-2v10" fill="none" stroke="#C9813F" stroke-width="1.8"/><circle cx="3.5" cy="14" r="2.5" fill="#C9813F"/><circle cx="10.5" cy="11.5" r="2.5" fill="#C9813F"/></svg>',
    spark: '<svg width="13" height="13" viewBox="0 0 20 20"><path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" fill="#FBE29A" stroke="#B88A22" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    broom: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B88A22" stroke-width="1.6" stroke-linejoin="round"><path d="M17 3l-6 9" stroke-linecap="round"/><path d="M9 11l4 2.5-2 6.5q-4 1-8-2z" fill="#FBE29A"/></svg>',
    bag: '<svg width="12" height="12" viewBox="0 0 20 20"><rect x="4" y="7" width="12" height="10" rx="2" fill="#F7B6C6" stroke="#C9607D" stroke-width="1.4"/><path d="M7 7V5a3 3 0 016 0v2" fill="none" stroke="#C9607D" stroke-width="1.4"/></svg>',
    coin: '<svg width="13" height="13" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="#FBE29A" stroke="#B88A22" stroke-width="1.5"/><path d="M10 6.5v7" stroke="#B88A22" stroke-width="1.5" stroke-linecap="round"/></svg>',
    box: '<svg width="13" height="13" viewBox="0 0 20 20"><rect x="3" y="6" width="14" height="11" rx="1.5" fill="#E8B97A" stroke="#8A5A36" stroke-width="1.3"/><path d="M3 9h14M10 6v3" stroke="#8A5A36" stroke-width="1.2"/></svg>',
    wet: '<svg width="12" height="12" viewBox="0 0 20 20"><path d="M4 9a6 6 0 0112 0z" fill="#BFD9E8" stroke="#4E8DB5" stroke-width="1.3"/><path d="M10 9v7q0 2-2 2" fill="none" stroke="#4E8DB5" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

export const bodySvg = c => `<svg class="cr-body" width="32" height="28" viewBox="0 0 38 34" aria-hidden="true"><circle cx="4" cy="22" r="3.4" fill="#FCE3CF" stroke="#8A5A36" stroke-width="1.3"/><circle cx="34" cy="22" r="3.4" fill="#FCE3CF" stroke="#8A5A36" stroke-width="1.3"/><path d="M6 33Q6 9 19 9Q32 9 32 33Z" fill="${c}" stroke="#8A5A36" stroke-width="1.6"/><path d="M11 33V17Q19 13 27 17V33Z" fill="#FFFDF9" stroke="#8A5A36" stroke-width="1.3"/></svg>`;
const guestFace = '<svg width="18" height="10" viewBox="0 0 22 12" aria-hidden="true"><circle cx="6" cy="4" r="2" fill="#5A3820"/><circle cx="16" cy="4" r="2" fill="#5A3820"/><path d="M8 9q3 2 6 0" stroke="#5A3820" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';

/** 얼굴 동그라미 스타일 (카드 그림 + 얼굴 위치 맞추기 값) */
export function faceStyle(id) {
    const b = book(id), s = staffById(id);
    const col = colorOf(s).tag;
    const url = avatarUrl(b?.avatar || s?.avatar);
    if (!url) return `background:${col}`;
    const f = b?.face || { z: 2, x: 50, y: 14 };
    return `background-color:${col};background-image:url('${url}');background-size:${Math.round(100 * f.z)}% auto;background-position:${f.x}% ${f.y}%`;
}

/** 작은 얼굴 동그라미 (목록·카드용) */
export function faceChip(id, size = 30) {
    const b = book(id);
    return `<span class="cr-face" style="width:${size}px;height:${size}px;${faceStyle(id)}" role="img" aria-label="${esc(b?.name || '')}"></span>`;
}

/**
 * 장면 속 모습. 지금은 "카드 얼굴 + 공통 몸".
 * 4단계: book(id).mini 가 있으면 전용 그림으로 바꿔 그리면 된다 (여기만 고치면 됨).
 */
export function staffLook(id) {
    const s = staffById(id), b = book(id);
    const c = colorOf(s);
    if (b?.mini) {
        return `<span class="cr-mini" style="background-image:url('${b.mini}')"><span class="cr-emo"></span></span><span class="cr-nm" style="background:${c.tag}">${esc(b.name)}</span>`;
    }
    return `<span class="cr-head" style="${faceStyle(id)}"><span class="cr-emo"></span></span>${bodySvg(c.shirt)}<span class="cr-feet"><i></i><i></i></span><span class="cr-nm" style="background:${c.tag}">${esc(b?.name || s?.name || '')}</span>`;
}

export function guestLook(shirt) {
    return `<span class="cr-head cr-ghead">${guestFace}<span class="cr-emo"></span></span>${bodySvg(shirt)}<span class="cr-feet"><i></i><i></i></span>`;
}
