// 가게 배치 — 크기마다 칸 수와 가구 위치를 "설정값"으로 둔다.
// 가구는 하나씩 따로 된 조각: 차지하는 칸(cells) + 그림 종류(kind) + 일하는 칸(spot).
// 3단계(가게 넓히기·가구 사서 꾸미기)에서 이 목록만 바꾸면 되게.

export const LAYOUTS = {
    '11x9': {
        cols: 11, rows: 9, OX: 213, OY: 100, WW: 470, WH: 380, grassY: 190,
        windows: [[1.5, 3.3, '#F29A7C'], [7.6, 9.2, '#F7B6C6']],
        sign: [3.9, 6.8], door: 10, board: null,
        rug: [3.4, 4.4, 7.6, 7.6],
        crossCol: 3, frontRow: 3,
        queue: [[5, 3], [6, 3], [7, 3]],
        boxSpot: [9, 2],
        idle: [[1, 7], [2, 8], [9, 8]],
        lamps: [[5, 3], [1.5, 5.5], [8.5, 6.5], [6.5, 1]],
        furniture: [
            { kind: 'plant', c: 0, r: 0 }, { kind: 'plant', c: 10, r: 8 }, { kind: 'plant', c: 0, r: 8 },
            { kind: 'oven', c: 0, r: 1, w: 1, d: 2, spot: [1, 1] },
            { kind: 'display', c: 6, r: 0, w: 2, d: 1, spot: [7, 1] },
            { kind: 'counter', c: 4, r: 2, w: 3, d: 1, spot: [5, 1] },
            { kind: 'table', c: 1, r: 5, dot: '#FFFDF9' },
            { kind: 'table', c: 8, r: 6, dot: '#F7B6C6' },
            { kind: 'chair', c: 2, r: 5, chat: [2, 4] }, { kind: 'chair', c: 1, r: 4, chat: [2, 4] },
            { kind: 'chair', c: 9, r: 6, chat: [9, 5] }, { kind: 'chair', c: 8, r: 5, chat: [9, 5] },
            { kind: 'bucket', c: 0, r: 7 },
        ],
    },
    '13x10': {
        cols: 13, rows: 10, OX: 250, OY: 104, WW: 570, WH: 420, grassY: 205,
        windows: [[1.5, 3.3, '#F29A7C'], [9.4, 11.0, '#F7B6C6']],
        sign: [4.6, 7.5], door: 12, board: null,
        rug: [4.4, 4.6, 8.6, 7.6],
        crossCol: 4, frontRow: 3,
        queue: [[6, 3], [7, 3], [8, 3]],
        boxSpot: [11, 2],
        idle: [[1, 8], [2, 9], [11, 9]],
        lamps: [[6, 4], [2, 7], [10, 7], [7, 1], [6, 9]],
        furniture: [
            { kind: 'plant', c: 0, r: 0 }, { kind: 'plant', c: 12, r: 9 }, { kind: 'plant', c: 0, r: 9 },
            { kind: 'oven', c: 0, r: 1, w: 1, d: 2, spot: [1, 1] },
            { kind: 'display', c: 8, r: 0, w: 2, d: 1, spot: [9, 1] },
            { kind: 'counter', c: 5, r: 2, w: 3, d: 1, spot: [6, 1] },
            { kind: 'table', c: 2, r: 6, dot: '#FFFDF9' },
            { kind: 'table', c: 10, r: 6, dot: '#F7B6C6' },
            { kind: 'table', c: 6, r: 8, dot: '#FBE29A' },
            { kind: 'chair', c: 3, r: 6, chat: [3, 5] }, { kind: 'chair', c: 2, r: 5, chat: [3, 5] },
            { kind: 'chair', c: 11, r: 6, chat: [11, 5] }, { kind: 'chair', c: 10, r: 5, chat: [11, 5] },
            { kind: 'chair', c: 7, r: 8, chat: [7, 7] }, { kind: 'chair', c: 6, r: 7, chat: [7, 7] },
            { kind: 'bucket', c: 0, r: 8 },
        ],
    },
    '15x12': {
        cols: 15, rows: 12, OX: 310, OY: 110, WW: 690, WH: 470, grassY: 225,
        windows: [[1.5, 3.3, '#F29A7C'], [10.4, 12.2, '#F7B6C6']],
        sign: [4.6, 7.5], door: 14, board: [8.6, 10.8],
        rug: [4.4, 5.4, 9.6, 8.6],
        crossCol: 4, frontRow: 3,
        queue: [[6, 3], [7, 3], [8, 3]],
        boxSpot: [13, 2],
        idle: [[1, 10], [2, 11], [12, 11]],
        lamps: [[7, 4], [2, 8], [12, 8], [8, 1], [7, 10], [1, 2]],
        furniture: [
            { kind: 'plant', c: 0, r: 0 }, { kind: 'plant', c: 0, r: 11 }, { kind: 'plant', c: 14, r: 11 },
            { kind: 'oven', c: 0, r: 1, w: 1, d: 2, spot: [1, 1] },
            { kind: 'display', c: 8, r: 0, w: 2, d: 1, spot: [9, 1] },
            { kind: 'counter', c: 5, r: 2, w: 3, d: 1, spot: [6, 1] },
            { kind: 'table', c: 2, r: 7, dot: '#FFFDF9' },
            { kind: 'table', c: 11, r: 7, dot: '#F7B6C6' },
            { kind: 'table', c: 6, r: 10, dot: '#FBE29A' },
            { kind: 'chair', c: 3, r: 7, chat: [3, 6] }, { kind: 'chair', c: 2, r: 6, chat: [3, 6] },
            { kind: 'chair', c: 12, r: 7, chat: [12, 6] }, { kind: 'chair', c: 11, r: 6, chat: [12, 6] },
            { kind: 'chair', c: 7, r: 10, chat: [7, 9] }, { kind: 'chair', c: 6, r: 9, chat: [7, 9] },
            { kind: 'bucket', c: 0, r: 10 },
        ],
    },
};

/** 가구가 차지하는 칸 */
export function cellsOf(f) {
    const out = [];
    const w = f.w || 1, d = f.d || 1;
    for (let c = f.c; c < f.c + w; c++) for (let r = f.r; r < f.r + d; r++) out.push([c, r]);
    return out;
}

export function layoutFor(size) {
    const L = LAYOUTS[size] || LAYOUTS['11x9'];
    if (!L._built) {
        L.blocked = new Set();
        for (const f of L.furniture) for (const [c, r] of cellsOf(f)) L.blocked.add(c + ',' + r);
        L.spots = {};
        for (const f of L.furniture) if (f.spot) L.spots[f.kind] = f.spot;
        L.seats = L.furniture.filter(f => f.kind === 'chair').map(f => ({ c: f.c, r: f.r, chat: f.chat }));
        L.free = [];
        for (let c = 1; c < L.cols; c++) for (let r = L.frontRow + 1; r < L.rows; r++) if (!L.blocked.has(c + ',' + r)) L.free.push([c, r]);
        L._built = true;
    }
    return L;
}
