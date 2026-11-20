// 작은 도구 모음

export const EXT_NAME = 'Crumble';
export const SETTINGS_KEY = 'crumble';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const chance = p => Math.random() < p;
export const shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
export const uid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sleepRaw = ms => new Promise(r => setTimeout(r, ms));

export function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const won = n => Math.round(n).toLocaleString('ko-KR');
export const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));

/** 하루가 바뀌는 시각: 새벽 6시 */
export function dayKey(d = new Date()) {
    const t = new Date(d.getTime() - 6 * 3600 * 1000);
    const y = t.getFullYear(), m = String(t.getMonth() + 1).padStart(2, '0'), dd = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
export function daysBetween(a, b) {
    const pa = new Date(a + 'T12:00:00'), pb = new Date(b + 'T12:00:00');
    return Math.round((pb - pa) / 86400000);
}
export function addDays(key, n) {
    const d = new Date(key + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return dayKey(new Date(d.getTime() + 6 * 3600 * 1000));
}

export function ctx() {
    // eslint-disable-next-line no-undef
    return SillyTavern.getContext();
}

/** 확장 폴더 안 파일 주소 */
export const assetUrl = p => new URL('../' + p, import.meta.url).href;

/** 카드 그림 주소 */
export function avatarUrl(avatar) {
    if (!avatar) return '';
    return '/characters/' + encodeURIComponent(avatar);
}

/** 글에서 JSON 덩어리 꺼내기 */
export function parseJsonLoose(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    const body = t.slice(s, e + 1);
    try { return JSON.parse(body); } catch { /* 아래에서 한 번 더 */ }
    try {
        // 끝에 붙은 쉼표 등 흔한 실수 정리
        return JSON.parse(body.replace(/,\s*([}\]])/g, '$1'));
    } catch { return null; }
}

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v, a, b, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, a, b) : d;
};
