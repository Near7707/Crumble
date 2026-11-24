// 한국어 / English
// 화면 글씨는 L('한국어', 'English') 로 바로 옆에 두 벌을 같이 적는다.

import { ctx, SETTINGS_KEY } from './util.js';

let cached = null;

export function lang() {
    if (cached) return cached;
    let pref = 'auto';
    try { pref = ctx().extensionSettings?.[SETTINGS_KEY]?.lang || 'auto'; } catch { /* 아직 준비 전 */ }
    if (pref === 'ko' || pref === 'en') return (cached = pref);
    let loc = '';
    try { loc = ctx().getCurrentLocale?.() || ''; } catch { /* 없음 */ }
    if (!loc) { try { loc = localStorage.getItem('language') || ''; } catch { /* 없음 */ } }
    if (!loc) loc = navigator.language || 'en';
    return (cached = /^ko/i.test(loc) ? 'ko' : 'en');
}
export function resetLang() { cached = null; }

export const isKo = () => lang() === 'ko';
export const L = (ko, en) => (lang() === 'ko' ? ko : en);

/** {x} 자리 채우기 */
export function F(tpl, vars = {}) {
    return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

/** 돈 표시: 한국어는 "원", 영어는 1,000원 = $1 로 바꿔서 (0.3.0, 게임 안 숫자는 그대로) */
export function money(n, withUnit = true) {
    const neg = Math.round(n) < 0;
    const a = Math.abs(Math.round(n));
    let v;
    if (isKo()) v = a.toLocaleString('ko-KR');
    else { const d = a / 1000; v = d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 }); }
    if (!withUnit) return (neg ? '−' : '') + v;
    return (neg ? '−' : '') + (isKo() ? v + '원' : '$' + v);
}
export function signedMoney(n) {
    const s = n > 0 ? '+' : n < 0 ? '−' : '';
    return s + money(Math.abs(n));
}

export const AI_LANG = () => (isKo() ? 'Korean (한국어)' : 'English');
