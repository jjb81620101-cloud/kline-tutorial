// K線教學軟體 - 完整版（含進階指標）

// ── 狀態 ─────────────────────────────────────────────────
let currentPage = 'mainMenu';
let currentLessonIndex = 0;
let quizData = [];
let quizIndex = 0;
let correctAnswers = 0;
let totalAnswers = 0;
let selectedAnswer = null;

const STORAGE_KEY = 'klineProgress';

// ── SVG 輔助 ─────────────────────────────────────────────
function svgEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}

function drawPath(svg, pts, attrs = {}) {
    let d = '', on = false;
    pts.forEach(p => {
        if (!p) { on = false; return; }
        d += on
            ? ` L${(+p[0]).toFixed(1)},${(+p[1]).toFixed(1)}`
            : `M${(+p[0]).toFixed(1)},${(+p[1]).toFixed(1)}`;
        on = true;
    });
    if (d) svg.appendChild(svgEl('path', { d, fill: 'none', ...attrs }));
}

// ── 確定性隨機蠟燭生成 ───────────────────────────────────
function makeSeed(n) {
    let s = (n ^ 0xcafe) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

function genCandles(seed, count, start, trend = 0, vol = 2) {
    const r = makeSeed(seed);
    let p = start;
    return Array.from({ length: count }, () => {
        const d = trend + (r() - 0.5) * vol * 2;
        const o = p, c = Math.max(p * 0.5, p + d);
        const wick = vol * 0.5;
        const h = Math.max(o, c) + r() * wick;
        const l = Math.min(o, c) - r() * wick;
        const v = Math.floor(1500 + r() * 5000);
        p = c;
        return { open: +o.toFixed(1), high: +h.toFixed(1), low: +l.toFixed(1), close: +c.toFixed(1), vol: v };
    });
}

// ── 指標計算 ─────────────────────────────────────────────
function calcMA(data, period) {
    return data.map((_, i) => {
        if (i < period - 1) return null;
        return data.slice(i - period + 1, i + 1).reduce((s, c) => s + c.close, 0) / period;
    });
}

function calcEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = null;
    return data.map((c, i) => {
        if (i < period - 1) return null;
        if (i === period - 1) {
            ema = data.slice(0, period).reduce((s, x) => s + x.close, 0) / period;
        } else {
            ema = c.close * k + ema * (1 - k);
        }
        return ema;
    });
}

function calcBollinger(data, period = 20, mult = 2) {
    const ma = calcMA(data, period);
    return data.map((_, i) => {
        if (ma[i] === null) return null;
        const sl = data.slice(i - period + 1, i + 1);
        const std = Math.sqrt(sl.reduce((s, c) => s + (c.close - ma[i]) ** 2, 0) / period);
        return { upper: ma[i] + mult * std, mid: ma[i], lower: ma[i] - mult * std };
    });
}

function calcRSI(data, period = 14) {
    return data.map((_, i) => {
        if (i < period) return null;
        let g = 0, l = 0;
        for (let j = i - period + 1; j <= i; j++) {
            const d = data[j].close - data[j - 1].close;
            if (d > 0) g += d; else l -= d;
        }
        return 100 - 100 / (1 + g / (l || 0.0001));
    });
}

function calcKD(data, period = 9) {
    let K = 50, D = 50;
    return data.map((c, i) => {
        if (i < period - 1) return null;
        const sl = data.slice(i - period + 1, i + 1);
        const hh = Math.max(...sl.map(x => x.high));
        const ll = Math.min(...sl.map(x => x.low));
        const rsv = hh === ll ? 50 : (c.close - ll) / (hh - ll) * 100;
        K = K * 2 / 3 + rsv / 3;
        D = D * 2 / 3 + K / 3;
        return { K, D };
    });
}

function calcMACD(data, fast = 12, slow = 26, sig = 9) {
    const ef = calcEMA(data, fast);
    const es = calcEMA(data, slow);
    const macd = data.map((_, i) => ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null);
    const validM = macd.map((v, i) => ({ v, i })).filter(x => x.v !== null);
    const kk = 2 / (sig + 1);
    let sigEma = null;
    const sigMap = new Map();
    validM.forEach(({ v, i }, j) => {
        if (j < sig - 1) return;
        if (j === sig - 1) sigEma = validM.slice(0, sig).reduce((s, x) => s + x.v, 0) / sig;
        else sigEma = v * kk + sigEma * (1 - kk);
        sigMap.set(i, sigEma);
    });
    const signal = macd.map((_, i) => sigMap.has(i) ? sigMap.get(i) : null);
    const hist = macd.map((m, i) => m !== null && signal[i] !== null ? m - signal[i] : null);
    return { macd, signal, hist };
}

function calcOBV(data) {
    let obv = 0;
    return data.map((c, i) => {
        if (i === 0) return obv;
        const d = c.close - data[i - 1].close;
        if (d > 0) obv += (c.vol || 0);
        else if (d < 0) obv -= (c.vol || 0);
        return obv;
    });
}

// ── SVG K線圖繪製（含指標）───────────────────────────────
function renderKlineChart(candles, container, totalH = 200, opts = {}) {
    const W = 400;
    const hasVol = opts.volume && candles.some(c => c.vol !== undefined);
    const subType = opts.subChart || null;
    const hasSub = !!subType;
    const GAP = 4;

    const subH  = hasSub  ? Math.round(totalH * 0.30) : 0;
    const volH  = hasVol  ? Math.round((totalH - subH - (hasSub ? GAP : 0)) * 0.22) : 0;
    const mainH = totalH - subH - volH - (hasSub ? GAP : 0) - (hasVol ? GAP : 0);

    const pL = 5, pR = 5, pT = 12, pB = 5;
    const n = candles.length;
    const slot = (W - pL - pR) / n;
    const cW = Math.max(3, Math.min(slot * 0.65, 30));
    const xOf = i => pL + i * slot + slot / 2;

    const maxP  = Math.max(...candles.map(c => c.high));
    const minP  = Math.min(...candles.map(c => c.low));
    const pRange = maxP - minP || 1;
    const pTop  = maxP + pRange * 0.1;
    const pBot  = minP - pRange * 0.1;
    const pSpan = pTop - pBot;
    const yM = p => pT + (pTop - p) / pSpan * (mainH - pT - pB);

    const svg = svgEl('svg', { width: '100%', height: totalH, viewBox: `0 0 ${W} ${totalH}` });
    svg.appendChild(svgEl('rect', { width: W, height: totalH, fill: '#1a1a2e', rx: '8' }));

    // 主圖格線
    for (let i = 1; i <= 3; i++) {
        const gy = pT + (mainH - pT - pB) * i / 4;
        svg.appendChild(svgEl('line', { x1: pL, y1: gy, x2: W - pR, y2: gy, stroke: '#2a2a4e', 'stroke-width': '1' }));
    }

    // 布林通道
    if (opts.bollinger) {
        const boll = calcBollinger(candles);
        const valid = boll.map((b, i) => b ? { i, ...b } : null).filter(Boolean);
        if (valid.length > 1) {
            const upPath = valid.map((b, j) => `${j === 0 ? 'M' : 'L'}${xOf(b.i).toFixed(1)},${yM(b.upper).toFixed(1)}`).join(' ');
            const loPath = [...valid].reverse().map(b => `L${xOf(b.i).toFixed(1)},${yM(b.lower).toFixed(1)}`).join(' ');
            svg.appendChild(svgEl('path', { d: upPath + ' ' + loPath + ' Z', fill: 'rgba(121,134,203,0.12)', stroke: 'none' }));
        }
        drawPath(svg, boll.map((b, i) => b ? [xOf(i), yM(b.upper)] : null), { stroke: '#7986cb', 'stroke-width': '1.2' });
        drawPath(svg, boll.map((b, i) => b ? [xOf(i), yM(b.mid)]   : null), { stroke: '#9e9e9e', 'stroke-width': '1', 'stroke-dasharray': '3,3' });
        drawPath(svg, boll.map((b, i) => b ? [xOf(i), yM(b.lower)] : null), { stroke: '#7986cb', 'stroke-width': '1.2' });
    }

    // MA 線
    if (opts.ma) {
        const maColors = { 5: '#ffd700', 10: '#ff9800', 20: '#00bcd4', 60: '#ab47bc' };
        opts.ma.forEach(p => {
            const vals = calcMA(candles, p);
            drawPath(svg, vals.map((v, i) => v !== null ? [xOf(i), yM(v)] : null),
                { stroke: maColors[p] || '#aaa', 'stroke-width': '1.5' });
        });
    }

    // 蠟燭
    candles.forEach((c, i) => {
        const x = xOf(i), bull = c.close >= c.open;
        const col = bull ? '#ef5350' : '#26a69a';
        const sw = n === 1 ? '2.5' : '1.5';
        const hY = yM(c.high), lY = yM(c.low), oY = yM(c.open), cY = yM(c.close);
        const bT = Math.min(oY, cY), bB = Math.max(oY, cY), bH = Math.max(2, bB - bT);
        svg.appendChild(svgEl('line', { x1: x, y1: hY, x2: x, y2: bT, stroke: col, 'stroke-width': sw }));
        svg.appendChild(svgEl('line', { x1: x, y1: bB, x2: x, y2: lY, stroke: col, 'stroke-width': sw }));
        svg.appendChild(svgEl('rect', { x: x - cW / 2, y: bT, width: cW, height: bH, fill: col, rx: '1' }));
    });

    // 成交量
    if (hasVol) {
        const vY0 = mainH + GAP, vYB = vY0 + volH - pB;
        const maxV = Math.max(...candles.map(c => c.vol));
        svg.appendChild(svgEl('line', { x1: pL, y1: vY0, x2: W - pR, y2: vY0, stroke: '#2a2a4e', 'stroke-width': '1' }));
        const lbl = svgEl('text', { x: pL + 3, y: vY0 + 9, fill: '#555', 'font-size': '9', 'font-family': 'monospace' });
        lbl.textContent = 'VOL'; svg.appendChild(lbl);
        candles.forEach((c, i) => {
            const x = xOf(i), bull = c.close >= c.open;
            const vH = Math.max(2, (c.vol / maxV) * (vYB - vY0 - 5));
            svg.appendChild(svgEl('rect', { x: x - cW / 2, y: vYB - vH, width: cW, height: vH, fill: bull ? '#ef535066' : '#26a69a66' }));
        });
    }

    // 副圖
    if (hasSub) {
        const sY0 = mainH + volH + (hasVol ? GAP : 0) + GAP;
        const sH  = subH - pB;
        svg.appendChild(svgEl('line', { x1: pL, y1: sY0 - 2, x2: W - pR, y2: sY0 - 2, stroke: '#2a2a4e', 'stroke-width': '1' }));

        if (subType === 'RSI') {
            const rsi = calcRSI(candles);
            const ry = v => sY0 + (100 - v) / 100 * sH;
            svg.appendChild(svgEl('rect', { x: pL, y: sY0, width: W - pL - pR, height: ry(70) - sY0, fill: 'rgba(239,83,80,0.06)' }));
            svg.appendChild(svgEl('rect', { x: pL, y: ry(30), width: W - pL - pR, height: sY0 + sH - ry(30), fill: 'rgba(38,166,154,0.06)' }));
            [30, 70].forEach(lvl => svg.appendChild(svgEl('line', {
                x1: pL, y1: ry(lvl), x2: W - pR, y2: ry(lvl),
                stroke: lvl === 70 ? '#ef535050' : '#26a69a50', 'stroke-width': '1', 'stroke-dasharray': '3,3'
            })));
            const lbl = svgEl('text', { x: pL + 3, y: sY0 + 10, fill: '#ff9800', 'font-size': '10', 'font-family': 'monospace' });
            lbl.textContent = 'RSI'; svg.appendChild(lbl);
            drawPath(svg, rsi.map((v, i) => v !== null ? [xOf(i), ry(v)] : null), { stroke: '#ff9800', 'stroke-width': '1.5' });

        } else if (subType === 'KD') {
            const kd = calcKD(candles);
            const kdy = v => sY0 + (100 - v) / 100 * sH;
            svg.appendChild(svgEl('line', { x1: pL, y1: kdy(50), x2: W - pR, y2: kdy(50), stroke: '#ffffff20', 'stroke-width': '1', 'stroke-dasharray': '3,3' }));
            const lbl = svgEl('text', { x: pL + 3, y: sY0 + 10, fill: '#888', 'font-size': '10', 'font-family': 'monospace' });
            lbl.textContent = 'KD'; svg.appendChild(lbl);
            drawPath(svg, kd.map((v, i) => v ? [xOf(i), kdy(v.K)] : null), { stroke: '#ffd700', 'stroke-width': '1.5' });
            drawPath(svg, kd.map((v, i) => v ? [xOf(i), kdy(v.D)] : null), { stroke: '#ef5350', 'stroke-width': '1.5' });

        } else if (subType === 'MACD') {
            const { macd, signal, hist } = calcMACD(candles);
            const allV = [...macd, ...signal, ...hist].filter(v => v !== null);
            const maxV = allV.length ? Math.max(...allV.map(Math.abs)) || 1 : 1;
            const my = v => sY0 + sH / 2 * (1 - v / maxV);
            const z = my(0);
            svg.appendChild(svgEl('line', { x1: pL, y1: z, x2: W - pR, y2: z, stroke: '#ffffff30', 'stroke-width': '1' }));
            const lbl = svgEl('text', { x: pL + 3, y: sY0 + 10, fill: '#00bcd4', 'font-size': '10', 'font-family': 'monospace' });
            lbl.textContent = 'MACD'; svg.appendChild(lbl);
            hist.forEach((v, i) => {
                if (v === null) return;
                const x = xOf(i), y2 = my(v);
                svg.appendChild(svgEl('rect', { x: x - cW / 2, y: Math.min(z, y2), width: cW, height: Math.max(1, Math.abs(y2 - z)), fill: v >= 0 ? '#ef535066' : '#26a69a66' }));
            });
            drawPath(svg, macd.map((v, i) => v !== null ? [xOf(i), my(v)] : null), { stroke: '#00bcd4', 'stroke-width': '1.5' });
            drawPath(svg, signal.map((v, i) => v !== null ? [xOf(i), my(v)] : null), { stroke: '#ffd700', 'stroke-width': '1.5' });

        } else if (subType === 'OBV') {
            const obv = calcOBV(candles);
            const maxO = Math.max(...obv), minO = Math.min(...obv);
            const oSpan = maxO - minO || 1;
            const oy = v => sY0 + sH - ((v - minO) / oSpan) * sH;
            svg.appendChild(svgEl('line', { x1: pL, y1: sY0 + sH / 2, x2: W - pR, y2: sY0 + sH / 2, stroke: '#ffffff20', 'stroke-width': '1' }));
            const lbl = svgEl('text', { x: pL + 3, y: sY0 + 10, fill: '#4caf50', 'font-size': '10', 'font-family': 'monospace' });
            lbl.textContent = 'OBV'; svg.appendChild(lbl);
            drawPath(svg, obv.map((v, i) => [xOf(i), oy(v)]), { stroke: '#4caf50', 'stroke-width': '1.5' });
        }
    }

    // 斐波那契回撤線
    if (opts.fibonacci) {
        const fibHigh = Math.max(...candles.map(c => c.high));
        const fibLow  = Math.min(...candles.map(c => c.low));
        const fibRange = fibHigh - fibLow;
        const fibDefs = [
            { level: 0,     color: '#ffffff55', label: '0%' },
            { level: 0.236, color: '#ffd70077', label: '23.6%' },
            { level: 0.382, color: '#ff980099', label: '38.2%' },
            { level: 0.5,   color: '#ef535099', label: '50%' },
            { level: 0.618, color: '#ff980099', label: '61.8%' },
            { level: 0.786, color: '#ffd70077', label: '78.6%' },
            { level: 1,     color: '#ffffff55', label: '100%' },
        ];
        fibDefs.forEach(({ level, color, label }) => {
            const price = fibHigh - level * fibRange;
            const y = yM(price);
            svg.appendChild(svgEl('line', { x1: pL, y1: y, x2: W - pR, y2: y, stroke: color, 'stroke-width': '1', 'stroke-dasharray': '4,4' }));
            const t = svgEl('text', { x: W - pR - 3, y: y - 2, fill: color, 'font-size': '8', 'font-family': 'monospace', 'text-anchor': 'end' });
            t.textContent = label; svg.appendChild(t);
        });
    }

    // 標記線（進場/止損/止盈）
    if (opts.levels) {
        opts.levels.forEach(({ price, label, color }) => {
            const y = yM(price);
            svg.appendChild(svgEl('line', { x1: pL, y1: y, x2: W - pR, y2: y, stroke: color, 'stroke-width': '1.5', 'stroke-dasharray': '5,3' }));
            const t = svgEl('text', { x: pL + 5, y: y - 3, fill: color, 'font-size': '10', 'font-family': 'monospace' });
            t.textContent = label; svg.appendChild(t);
        });
    }

    container.innerHTML = '';
    container.appendChild(svg);
}

// ── 預計算教學用數據 ─────────────────────────────────────
const _D = {
    maTrend:  genCandles(42,   30, 100,  0.6,  1.5),
    bollData: genCandles(123,  30, 100,  0,    3.5),
    rsiUp:    genCandles(456,  28,  80,  2.2,  0.5),
    kdDown:   genCandles(789,  28, 120, -1.2,  2.0),
    macdData: genCandles(1234, 50, 100,  0.4,  2.0),
    volData:  genCandles(555,  20, 100,  0.3,  2.5),
    // 組合形態
    bullEngulf: [
        { open: 108, high: 113, low: 94, close: 97 },
        { open: 95,  high: 116, low: 92, close: 114 }
    ],
    bearEngulf: [
        { open: 97, high: 115, low: 95, close: 112 },
        { open: 113, high: 117, low: 92, close: 94 }
    ],
    morningStar: [
        { open: 112, high: 115, low: 100, close: 102 },
        { open: 101, high: 104, low: 97,  close: 101 },
        { open: 101, high: 116, low: 99,  close: 114 }
    ],
    eveningStar: [
        { open: 100, high: 115, low: 98, close: 113 },
        { open: 114, high: 118, low: 111, close: 113 },
        { open: 113, high: 115, low: 99,  close: 101 }
    ],
    threeWhite: [
        { open: 85, high: 95,  low: 83, close: 93  },
        { open: 93, high: 103, low: 91, close: 101 },
        { open: 101, high: 112, low: 99, close: 110 }
    ],
    threeCrows: [
        { open: 110, high: 112, low: 99, close: 101 },
        { open: 101, high: 103, low: 91, close: 93  },
        { open: 93,  high: 95,  low: 82, close: 84  }
    ],
    bullHarami: [
        { open: 112, high: 116, low: 88, close: 90 },
        { open: 96,  high: 104, low: 93, close: 102 }
    ],
    bearHarami: [
        { open: 90,  high: 115, low: 88, close: 112 },
        { open: 108, high: 113, low: 103, close: 107 }
    ],
    darkCloud: [
        { open: 90,  high: 112, low: 88, close: 110 },
        { open: 113, high: 116, low: 96, close: 97  }
    ],
    piercing: [
        { open: 110, high: 113, low: 87, close: 89  },
        { open: 86,  high: 106, low: 84, close: 105 }
    ],
    headShoulders: [
        { open: 100, high: 108, low: 98, close: 106 },
        { open: 106, high: 116, low: 104, close: 114 },
        { open: 114, high: 122, low: 112, close: 118 },
        { open: 118, high: 120, low: 108, close: 110 },
        { open: 110, high: 112, low: 104, close: 106 },
        { open: 106, high: 114, low: 104, close: 112 },
        { open: 112, high: 120, low: 110, close: 118 },
        { open: 118, high: 130, low: 116, close: 127 },
        { open: 127, high: 129, low: 116, close: 118 },
        { open: 118, high: 120, low: 109, close: 112 },
        { open: 112, high: 114, low: 105, close: 107 },
        { open: 107, high: 115, low: 105, close: 113 },
        { open: 113, high: 121, low: 111, close: 117 },
        { open: 117, high: 119, low: 108, close: 111 },
        { open: 111, high: 113, low: 101, close: 103 }
    ],
    invHS: [
        { open: 110, high: 112, low: 101, close: 103 },
        { open: 103, high: 105, low: 94,  close: 97  },
        { open: 97,  high: 104, low: 87,  close: 91  },
        { open: 91,  high: 100, low: 89,  close: 98  },
        { open: 98,  high: 105, low: 96,  close: 103 },
        { open: 103, high: 110, low: 100, close: 105 },
        { open: 105, high: 107, low: 90,  close: 93  },
        { open: 93,  high: 97,  low: 79,  close: 82  },
        { open: 82,  high: 94,  low: 80,  close: 92  },
        { open: 92,  high: 100, low: 90,  close: 98  },
        { open: 98,  high: 106, low: 96,  close: 104 },
        { open: 104, high: 112, low: 102, close: 110 },
        { open: 110, high: 118, low: 108, close: 113 },
        { open: 113, high: 121, low: 111, close: 119 },
        { open: 119, high: 128, low: 117, close: 126 }
    ],
    doubleTop: [
        { open: 98,  high: 108, low: 96,  close: 106 },
        { open: 106, high: 120, low: 104, close: 118 },
        { open: 118, high: 120, low: 107, close: 109 },
        { open: 109, high: 112, low: 102, close: 105 },
        { open: 105, high: 112, low: 103, close: 110 },
        { open: 110, high: 121, low: 108, close: 118 },
        { open: 118, high: 120, low: 107, close: 110 },
        { open: 110, high: 112, low: 99,  close: 101 },
        { open: 101, high: 103, low: 91,  close: 93  }
    ],
    doubleBottom: [
        { open: 115, high: 117, low: 105, close: 107 },
        { open: 107, high: 110, low: 95,  close: 97  },
        { open: 97,  high: 107, low: 95,  close: 105 },
        { open: 105, high: 113, low: 103, close: 109 },
        { open: 109, high: 111, low: 97,  close: 99  },
        { open: 99,  high: 102, low: 91,  close: 93  },
        { open: 93,  high: 103, low: 91,  close: 101 },
        { open: 101, high: 113, low: 99,  close: 111 },
        { open: 111, high: 121, low: 109, close: 119 }
    ],
    // 測驗用指標數據
    quizRSIHigh: genCandles(777, 20, 80,   3.0, 0.3),  // 強漲→RSI高
    quizRSILow:  genCandles(778, 20, 120, -3.0, 0.3),  // 強跌→RSI低
    quizMAGold:  [...genCandles(401, 15, 105, -0.9, 1.2), ...genCandles(402, 10, 90, 1.4, 1.0)],
    quizMADeath: [...genCandles(403, 15, 90,  0.9, 1.2), ...genCandles(404, 10, 105, -1.4, 1.0)],
    quizBoll:    genCandles(500, 30, 100, 0.5, 2.5),
    quizKD:      genCandles(600, 30, 100, -0.5, 3.0),
    quizMACD:    genCandles(700, 50, 100, 0.5, 2.0),
    quizVol1:    genCandles(800, 12, 100, 0.6, 1.5),  // 量增價漲
    quizVol2:    genCandles(801, 12, 100, 0.3, 2.0),  // 量縮
    // ── 進階型態 ──────────────────────────────────────────
    bullFlag: [
        { open: 78, high: 86, low: 76, close: 84, vol: 3000 },
        { open: 84, high: 95, low: 82, close: 93, vol: 4200 },
        { open: 93, high: 106, low: 91, close: 104, vol: 5800 }, // 旗桿
        { open: 104, high: 107, low: 99, close: 101, vol: 2200 },
        { open: 101, high: 105, low: 98, close: 103, vol: 2000 }, // 旗面
        { open: 103, high: 106, low: 98, close: 100, vol: 1900 },
        { open: 100, high: 105, low: 98, close: 103, vol: 2100 },
        { open: 103, high: 116, low: 101, close: 114, vol: 5200 }, // 突破
        { open: 114, high: 126, low: 112, close: 124, vol: 5600 },
    ],
    bearFlag: [
        { open: 122, high: 124, low: 114, close: 116, vol: 3000 },
        { open: 116, high: 118, low: 107, close: 108, vol: 4200 },
        { open: 108, high: 110, low: 97,  close: 98,  vol: 5800 }, // 旗桿
        { open: 98,  high: 104, low: 97,  close: 102, vol: 2200 },
        { open: 102, high: 105, low: 98,  close: 100, vol: 2000 }, // 旗面
        { open: 100, high: 104, low: 97,  close: 102, vol: 1900 },
        { open: 102, high: 104, low: 97,  close: 99,  vol: 2100 },
        { open: 99,  high: 100, low: 87,  close: 88,  vol: 5200 }, // 跌破
        { open: 88,  high: 90,  low: 76,  close: 77,  vol: 5600 },
    ],
    risingWedge: [
        { open: 90,  high: 100, low: 88,  close: 97  },
        { open: 97,  high: 108, low: 96,  close: 104 },
        { open: 104, high: 113, low: 103, close: 109 },
        { open: 109, high: 116, low: 108, close: 113 },
        { open: 113, high: 118, low: 112, close: 115 },
        { open: 115, high: 119, low: 114, close: 116 }, // 收斂
        { open: 116, high: 119, low: 113, close: 114 },
        { open: 114, high: 115, low: 106, close: 108 }, // 跌破
        { open: 108, high: 110, low: 97,  close: 99  },
    ],
    fallingWedge: [
        { open: 120, high: 122, low: 110, close: 112 },
        { open: 112, high: 114, low: 103, close: 106 },
        { open: 106, high: 108, low: 98,  close: 101 },
        { open: 101, high: 104, low: 95,  close: 97  },
        { open: 97,  high: 100, low: 93,  close: 95  },
        { open: 95,  high: 98,  low: 92,  close: 93  }, // 收斂
        { open: 93,  high: 97,  low: 91,  close: 93  },
        { open: 93,  high: 104, low: 91,  close: 103 }, // 突破
        { open: 103, high: 114, low: 101, close: 112 },
    ],
    symTriangle: [
        { open: 100, high: 118, low: 84,  close: 113 },
        { open: 113, high: 116, low: 89,  close: 91  },
        { open: 91,  high: 114, low: 89,  close: 110 },
        { open: 110, high: 112, low: 93,  close: 95  },
        { open: 95,  high: 110, low: 94,  close: 107 },
        { open: 107, high: 109, low: 96,  close: 98  }, // 收斂
        { open: 98,  high: 107, low: 97,  close: 105 },
        { open: 105, high: 107, low: 98,  close: 100 },
        { open: 100, high: 114, low: 99,  close: 112 }, // 向上突破
        { open: 112, high: 122, low: 110, close: 120 },
    ],
    ascTriangle: [
        { open: 95,  high: 112, low: 92,  close: 109 },
        { open: 109, high: 113, low: 99,  close: 101 }, // 碰到阻力約112
        { open: 101, high: 113, low: 100, close: 110 },
        { open: 110, high: 113, low: 103, close: 105 },
        { open: 105, high: 113, low: 104, close: 110 },
        { open: 110, high: 113, low: 106, close: 108 },
        { open: 108, high: 114, low: 107, close: 112 },
        { open: 112, high: 122, low: 110, close: 120 }, // 突破！
        { open: 120, high: 129, low: 118, close: 127 },
    ],
    descTriangle: [
        { open: 115, high: 128, low: 97,  close: 99  },
        { open: 99,  high: 118, low: 97,  close: 116 }, // 碰到支撐約97
        { open: 116, high: 118, low: 97,  close: 99  },
        { open: 99,  high: 114, low: 97,  close: 112 },
        { open: 112, high: 114, low: 97,  close: 99  },
        { open: 99,  high: 110, low: 97,  close: 108 },
        { open: 108, high: 110, low: 96,  close: 98  }, // 逼近支撐
        { open: 98,  high: 99,  low: 85,  close: 87  }, // 跌破！
        { open: 87,  high: 89,  low: 76,  close: 78  },
    ],
    fibData: [
        { open: 80,  high: 85,  low: 78,  close: 83  },
        { open: 83,  high: 93,  low: 81,  close: 91  },
        { open: 91,  high: 103, low: 89,  close: 101 },
        { open: 101, high: 115, low: 99,  close: 113 },
        { open: 113, high: 128, low: 111, close: 126 }, // 頂部
        { open: 126, high: 129, low: 115, close: 117 }, // 回撤開始
        { open: 117, high: 121, low: 108, close: 111 }, // ~38.2% 附近
        { open: 111, high: 115, low: 104, close: 107 },
        { open: 107, high: 113, low: 103, close: 109 }, // ~50% 撐住
        { open: 109, high: 120, low: 107, close: 118 }, // 回升
    ],
    multiMAData:  genCandles(333, 40, 100, 0.4, 2.0),
    obvData:      genCandles(444, 25, 100, 0.3, 2.5),
    convergData1: genCandles(551, 28,  80, 2.5, 0.5), // RSI 共振
    convergData2: genCandles(552, 50, 100, 0.6, 1.8), // MACD 共振
    stopLossData: genCandles(666, 12, 100, 0.6, 2.0),
    taiexCandles: [
        { open: 100, high: 100, low: 100, close: 100, vol: 5000 }, // 漲停
        { open: 100, high: 110, low: 98,  close: 110, vol: 8000 }, // 漲停
        { open: 110, high: 110, low: 102, close: 104, vol: 4000 }, // 開高走低
        { open: 104, high: 108, low: 97,  close: 97,  vol: 6000 }, // 跌停
        { open: 97,  high: 103, low: 94,  close: 101, vol: 5000 }, // 除權後反彈
    ],
};

// ── 教學內容（14 課）─────────────────────────────────────
const lessons = [
    // ─── 基礎 3 課 ───────────────────────────────────────
    {
        title: '第 1 課：什麼是 K線？',
        content: `<div class="lesson">
            <h3>K線的基本概念</h3>
            <p>K線（蠟燭圖）用四個價格表示一段時間的股價變化：<strong>開盤價、最高價、最低價、收盤價</strong></p>
            <h3>陽線 vs 陰線</h3>
            <p><strong style="color:#ef5350;">紅色／陽線</strong>：收盤 > 開盤（上漲）&nbsp;&nbsp;<strong style="color:#26a69a;">綠色／陰線</strong>：收盤 &lt; 開盤（下跌）</p>
            <div id="l1-compare" class="kline-chart-example"></div>
            <div class="lesson-example">
            <strong>實體</strong>：開盤價和收盤價之間的矩形<br>
            <strong>上影線</strong>：最高價至實體上方的細線<br>
            <strong>下影線</strong>：最低價至實體下方的細線
            </div></div>`,
        charts: [{ id: 'l1-compare', candles: [
            { open: 88, high: 115, low: 82, close: 110 },
            { open: 110, high: 116, low: 82, close: 88 }
        ], height: 200 }]
    },
    {
        title: '第 2 課：K線基本形態',
        content: `<div class="lesson">
            <h3>常見形態</h3>
            <p><strong>1. 陽線（紅）</strong>—收盤 > 開盤</p>
            <div id="l2-bull" class="kline-chart-example"></div>
            <p><strong>2. 陰線（綠）</strong>—收盤 &lt; 開盤</p>
            <div id="l2-bear" class="kline-chart-example"></div>
            <p><strong>3. 十字線</strong>—開盤 ≈ 收盤，買賣均衡</p>
            <div id="l2-doji" class="kline-chart-example"></div>
            <p><strong>4. 錘子線</strong>—下影線長，底部看漲信號</p>
            <div id="l2-hammer" class="kline-chart-example"></div>
            <p><strong>5. 倒錘子線</strong>—上影線長，頂部看跌信號</p>
            <div id="l2-invhammer" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l2-bull',      candles: [{ open: 85, high: 116, low: 82, close: 112 }], height: 160 },
            { id: 'l2-bear',      candles: [{ open: 112, high: 116, low: 82, close: 85 }], height: 160 },
            { id: 'l2-doji',      candles: [{ open: 100, high: 116, low: 84, close: 100 }], height: 160 },
            { id: 'l2-hammer',    candles: [{ open: 100, high: 104, low: 65, close: 101 }], height: 160 },
            { id: 'l2-invhammer', candles: [{ open: 100, high: 135, low: 96, close: 99 }], height: 160 },
        ]
    },
    {
        title: '第 3 課：K線與趨勢',
        content: `<div class="lesson">
            <h3>上升趨勢</h3><p>連續陽線，高點低點逐漸上升。買點在支撐位附近的陽線。</p>
            <div id="l3-up" class="kline-chart-example"></div>
            <h3>下降趨勢</h3><p>連續陰線，高點低點逐漸下降。賣點在阻力位附近的陰線。</p>
            <div id="l3-down" class="kline-chart-example"></div>
            <h3>震盪趨勢</h3><p>陰陽交替，在支撐和阻力間反覆。底部買、頂部賣。</p>
            <div id="l3-side" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l3-up',   candles: [{ open: 78, high: 88, low: 76, close: 86 }, { open: 86, high: 96, low: 84, close: 94 }, { open: 94, high: 104, low: 92, close: 102 }, { open: 102, high: 112, low: 100, close: 110 }, { open: 110, high: 121, low: 108, close: 119 }], height: 180 },
            { id: 'l3-down', candles: [{ open: 119, high: 121, low: 108, close: 110 }, { open: 110, high: 112, low: 100, close: 102 }, { open: 102, high: 104, low: 92, close: 94 }, { open: 94, high: 96, low: 84, close: 86 }, { open: 86, high: 88, low: 76, close: 78 }], height: 180 },
            { id: 'l3-side', candles: [{ open: 95, high: 108, low: 92, close: 105 }, { open: 105, high: 108, low: 93, close: 96 }, { open: 96, high: 109, low: 93, close: 106 }, { open: 106, high: 109, low: 93, close: 95 }, { open: 95, high: 109, low: 92, close: 107 }], height: 180 },
        ]
    },
    // ─── 多K線組合 ────────────────────────────────────────
    {
        title: '第 4 課：吞噬形態',
        content: `<div class="lesson">
            <h3>看漲吞噬（Bullish Engulfing）</h3>
            <p>下跌中，第二根陽線完全包住前一根陰線實體 → <strong style="color:#ef5350;">底部反轉看漲</strong></p>
            <div id="l4-bull" class="kline-chart-example"></div>
            <h3>看跌吞噬（Bearish Engulfing）</h3>
            <p>上漲中，第二根陰線完全包住前一根陽線實體 → <strong style="color:#26a69a;">頂部反轉看跌</strong></p>
            <div id="l4-bear" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l4-bull', candles: _D.bullEngulf, height: 180 },
            { id: 'l4-bear', candles: _D.bearEngulf, height: 180 },
        ]
    },
    {
        title: '第 5 課：晨星、暮星與三兵',
        content: `<div class="lesson">
            <h3>晨星（Morning Star）</h3>
            <p>大陰 + 小實體 + 大陽 → <strong style="color:#ef5350;">底部反轉</strong></p>
            <div id="l5-ms" class="kline-chart-example"></div>
            <h3>暮星（Evening Star）</h3>
            <p>大陽 + 小實體 + 大陰 → <strong style="color:#26a69a;">頂部反轉</strong></p>
            <div id="l5-es" class="kline-chart-example"></div>
            <h3>三白兵</h3>
            <p>連續 3 根大陽線，低開高走 → <strong style="color:#ef5350;">強勁上漲</strong></p>
            <div id="l5-tw" class="kline-chart-example"></div>
            <h3>三黑鴉</h3>
            <p>連續 3 根大陰線，高開低走 → <strong style="color:#26a69a;">強勁下跌</strong></p>
            <div id="l5-tc" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l5-ms', candles: _D.morningStar, height: 160 },
            { id: 'l5-es', candles: _D.eveningStar, height: 160 },
            { id: 'l5-tw', candles: _D.threeWhite,  height: 160 },
            { id: 'l5-tc', candles: _D.threeCrows,  height: 160 },
        ]
    },
    {
        title: '第 6 課：孕線、烏雲蓋頂與穿刺',
        content: `<div class="lesson">
            <h3>看漲孕線（Bullish Harami）</h3>
            <p>大陰線後出現小陽線，被前根包裹 → <strong style="color:#ef5350;">可能轉漲</strong></p>
            <div id="l6-bh" class="kline-chart-example"></div>
            <h3>看跌孕線（Bearish Harami）</h3>
            <p>大陽線後出現小陰線，被前根包裹 → <strong style="color:#26a69a;">可能轉跌</strong></p>
            <div id="l6-brh" class="kline-chart-example"></div>
            <h3>烏雲蓋頂（Dark Cloud Cover）</h3>
            <p>陽線後，陰線高開但收盤跌過前根中點 → <strong style="color:#26a69a;">頂部看跌</strong></p>
            <div id="l6-dc" class="kline-chart-example"></div>
            <h3>穿刺形態（Piercing Pattern）</h3>
            <p>陰線後，陽線低開但收盤漲過前根中點 → <strong style="color:#ef5350;">底部看漲</strong></p>
            <div id="l6-pp" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l6-bh',  candles: _D.bullHarami, height: 160 },
            { id: 'l6-brh', candles: _D.bearHarami, height: 160 },
            { id: 'l6-dc',  candles: _D.darkCloud,  height: 160 },
            { id: 'l6-pp',  candles: _D.piercing,   height: 160 },
        ]
    },
    // ─── 技術指標 ─────────────────────────────────────────
    {
        title: '第 7 課：移動平均線（MA）',
        content: `<div class="lesson">
            <h3>什麼是均線？</h3>
            <p>均線是一段時間收盤價的平均值，用來平滑價格波動、識別趨勢方向。</p>
            <div class="lesson-example">
            <strong style="color:#ffd700;">MA5（金）</strong>：5日均線，反應短期趨勢<br>
            <strong style="color:#00bcd4;">MA20（藍）</strong>：20日均線，反應中期趨勢
            </div>
            <div id="l7-ma" class="kline-chart-example"></div>
            <h3>黃金交叉與死亡交叉</h3>
            <div class="lesson-example">
            <strong style="color:#ef5350;">黃金交叉</strong>：MA5 由下穿越 MA20 → 買入信號<br>
            <strong style="color:#26a69a;">死亡交叉</strong>：MA5 由上跌破 MA20 → 賣出信號
            </div></div>`,
        charts: [{ id: 'l7-ma', candles: _D.maTrend, height: 220, opts: { ma: [5, 20] } }]
    },
    {
        title: '第 8 課：布林通道（Bollinger Bands）',
        content: `<div class="lesson">
            <h3>布林通道組成</h3>
            <div class="lesson-example">
            <strong style="color:#9e9e9e;">中軌</strong>：20日移動平均線<br>
            <strong style="color:#7986cb;">上軌</strong>：中軌 + 2倍標準差（壓力區）<br>
            <strong style="color:#7986cb;">下軌</strong>：中軌 − 2倍標準差（支撐區）
            </div>
            <div id="l8-boll" class="kline-chart-example"></div>
            <h3>布林通道的應用</h3>
            <div class="lesson-example">
            價格碰到<strong>上軌</strong> → 超買，可能回調<br>
            價格碰到<strong>下軌</strong> → 超賣，可能反彈<br>
            帶寬<strong>收縮</strong> → 波動降低，可能即將突破
            </div></div>`,
        charts: [{ id: 'l8-boll', candles: _D.bollData, height: 220, opts: { bollinger: true } }]
    },
    {
        title: '第 9 課：RSI 相對強弱指數',
        content: `<div class="lesson">
            <h3>RSI 的意義</h3>
            <p>RSI 衡量一段時間內上漲與下跌的相對強弱，數值 0–100。</p>
            <div class="lesson-example">
            <strong style="color:#ef5350;">RSI &gt; 70</strong>：超買區，可能回調<br>
            <strong style="color:#26a69a;">RSI &lt; 30</strong>：超賣區，可能反彈<br>
            RSI 50 為多空分界
            </div>
            <div id="l9-rsi" class="kline-chart-example"></div>
            <h3>注意</h3>
            <p>趨勢強烈時，RSI 可能長期停留在超買／超賣區，不能單看 RSI 一個指標操作。</p></div>`,
        charts: [{ id: 'l9-rsi', candles: _D.rsiUp, height: 280, opts: { subChart: 'RSI' } }]
    },
    {
        title: '第 10 課：KD 隨機指標',
        content: `<div class="lesson">
            <h3>KD 的組成</h3>
            <div class="lesson-example">
            <strong style="color:#ffd700;">K 線（快）</strong>：對價格反應較快<br>
            <strong style="color:#ef5350;">D 線（慢）</strong>：K 線的移動平均，較平滑
            </div>
            <div id="l10-kd" class="kline-chart-example"></div>
            <h3>使用方法</h3>
            <div class="lesson-example">
            K 由下穿越 D（KD &lt; 20）→ <strong style="color:#ef5350;">黃金交叉，買入</strong><br>
            K 由上跌破 D（KD &gt; 80）→ <strong style="color:#26a69a;">死亡交叉，賣出</strong>
            </div></div>`,
        charts: [{ id: 'l10-kd', candles: _D.kdDown, height: 280, opts: { subChart: 'KD' } }]
    },
    {
        title: '第 11 課：MACD 指標',
        content: `<div class="lesson">
            <h3>MACD 的組成</h3>
            <div class="lesson-example">
            <strong style="color:#00bcd4;">MACD 線</strong>（藍）：EMA12 − EMA26<br>
            <strong style="color:#ffd700;">信號線</strong>（金）：MACD 的 9 日 EMA<br>
            <strong>柱狀圖</strong>：MACD − 信號線（正紅負綠）
            </div>
            <div id="l11-macd" class="kline-chart-example"></div>
            <h3>使用方法</h3>
            <div class="lesson-example">
            MACD 線由下穿越信號線 → <strong style="color:#ef5350;">黃金交叉，買入</strong><br>
            MACD 線由上跌破信號線 → <strong style="color:#26a69a;">死亡交叉，賣出</strong><br>
            柱狀圖由負轉正 → 多方力量增強
            </div></div>`,
        charts: [{ id: 'l11-macd', candles: _D.macdData, height: 300, opts: { subChart: 'MACD' } }]
    },
    // ─── 型態分析 ─────────────────────────────────────────
    {
        title: '第 12 課：頭肩形態',
        content: `<div class="lesson">
            <h3>頭肩頂（Head &amp; Shoulders Top）</h3>
            <p>三個高點，中間最高（頭），兩側較低（肩）。頸線跌破 → <strong style="color:#26a69a;">強烈看跌反轉</strong></p>
            <div id="l12-hs" class="kline-chart-example"></div>
            <h3>頭肩底（Inverse H&amp;S）</h3>
            <p>三個低點，中間最低，兩側較高。頸線突破 → <strong style="color:#ef5350;">強烈看漲反轉</strong></p>
            <div id="l12-ihs" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l12-hs',  candles: _D.headShoulders, height: 220 },
            { id: 'l12-ihs', candles: _D.invHS,         height: 220 },
        ]
    },
    {
        title: '第 13 課：雙重頂與雙重底',
        content: `<div class="lesson">
            <h3>雙重頂（M頭）</h3>
            <p>兩個相近的高點，中間有回落。頸線跌破 → <strong style="color:#26a69a;">看跌反轉</strong></p>
            <div id="l13-dt" class="kline-chart-example"></div>
            <h3>雙重底（W底）</h3>
            <p>兩個相近的低點，中間有反彈。頸線突破 → <strong style="color:#ef5350;">看漲反轉</strong></p>
            <div id="l13-db" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l13-dt', candles: _D.doubleTop,    height: 200 },
            { id: 'l13-db', candles: _D.doubleBottom, height: 200 },
        ]
    },
    {
        title: '第 14 課：量價關係',
        content: `<div class="lesson">
            <h3>量價關係的重要性</h3>
            <p>成交量反映市場參與程度，配合 K 線可以驗證趨勢強度。</p>
            <div id="l14-vol" class="kline-chart-example"></div>
            <h3>四種基本型態</h3>
            <div class="lesson-example">
            <strong style="color:#ef5350;">量增價漲</strong>：趨勢強勁，確認上漲<br>
            <strong>量縮價漲</strong>：上漲動力不足，需謹慎<br>
            <strong style="color:#26a69a;">量增價跌</strong>：下跌加速，賣壓沉重<br>
            <strong>量縮價跌</strong>：跌勢趨緩，可能接近底部
            </div></div>`,
        charts: [{ id: 'l14-vol', candles: _D.volData, height: 260, opts: { volume: true } }]
    },
    // ─── 進階型態 ─────────────────────────────────────────
    {
        title: '第 15 課：旗形與楔形',
        content: `<div class="lesson">
            <h3>上升旗形（Bull Flag）</h3>
            <p>急速拉升（旗桿）後出現小幅整理（旗面），量縮後再放量突破 → <strong style="color:#ef5350;">強勢延續看漲</strong></p>
            <div id="l15-bf" class="kline-chart-example"></div>
            <h3>下降旗形（Bear Flag）</h3>
            <p>急速下跌後小幅反彈整理，再次放量跌破 → <strong style="color:#26a69a;">強勢延續看跌</strong></p>
            <div id="l15-bearf" class="kline-chart-example"></div>
            <h3>上升楔形（Rising Wedge）</h3>
            <p>上漲但漲幅收窄，高低點都在上升但逐漸靠近 → <strong style="color:#26a69a;">頂部看跌信號</strong></p>
            <div id="l15-rw" class="kline-chart-example"></div>
            <h3>下降楔形（Falling Wedge）</h3>
            <p>下跌但跌幅收窄，突破上軌 → <strong style="color:#ef5350;">底部看漲信號</strong></p>
            <div id="l15-fw" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l15-bf',   candles: _D.bullFlag,    height: 190 },
            { id: 'l15-bearf',candles: _D.bearFlag,    height: 190 },
            { id: 'l15-rw',   candles: _D.risingWedge, height: 190 },
            { id: 'l15-fw',   candles: _D.fallingWedge,height: 190 },
        ]
    },
    {
        title: '第 16 課：三角收斂形態',
        content: `<div class="lesson">
            <h3>對稱三角（Symmetrical Triangle）</h3>
            <p>高點逐漸降低、低點逐漸升高，形成收斂。方向不確定，待突破方向操作。</p>
            <div id="l16-sym" class="kline-chart-example"></div>
            <h3>上升三角（Ascending Triangle）</h3>
            <p>上方阻力水平，下方支撐逐步上移 → 偏向<strong style="color:#ef5350;">向上突破</strong></p>
            <div id="l16-asc" class="kline-chart-example"></div>
            <h3>下降三角（Descending Triangle）</h3>
            <p>下方支撐水平，上方壓力逐步下移 → 偏向<strong style="color:#26a69a;">向下跌破</strong></p>
            <div id="l16-desc" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l16-sym',  candles: _D.symTriangle,  height: 200 },
            { id: 'l16-asc',  candles: _D.ascTriangle,  height: 200 },
            { id: 'l16-desc', candles: _D.descTriangle, height: 200 },
        ]
    },
    {
        title: '第 17 課：斐波那契回撤',
        content: `<div class="lesson">
            <h3>什麼是斐波那契回撤？</h3>
            <p>利用黃金比例（0.618）衍生的價位，作為預測回撤後支撐/阻力的參考。</p>
            <div class="lesson-example">
            <strong style="color:#ef535099;">38.2%</strong>：淺度回撤，趨勢強勁<br>
            <strong style="color:#ef535099;">50%</strong>：中度回撤，最常見支撐<br>
            <strong style="color:#ff980099;">61.8%</strong>：深度回撤（黃金比例），若守住則趨勢延續<br>
            <strong>超過 78.6%</strong>：可能已反轉
            </div>
            <div id="l17-fib" class="kline-chart-example"></div></div>`,
        charts: [{ id: 'l17-fib', candles: _D.fibData, height: 240, opts: { fibonacci: true } }]
    },
    {
        title: '第 18 課：OBV 能量潮',
        content: `<div class="lesson">
            <h3>OBV 的概念</h3>
            <p>OBV（On Balance Volume）用成交量的累積方向來判斷資金流向。</p>
            <div class="lesson-example">
            上漲日：OBV <strong style="color:#ef5350;">+ 成交量</strong><br>
            下跌日：OBV <strong style="color:#26a69a;">− 成交量</strong>
            </div>
            <div id="l18-obv" class="kline-chart-example"></div>
            <h3>OBV 的應用</h3>
            <div class="lesson-example">
            OBV <strong style="color:#ef5350;">先於價格</strong>創新高 → 上漲動能強，看漲<br>
            OBV 無法跟上價格 → <strong style="color:#26a69a;">背離</strong>，趨勢可能減弱
            </div></div>`,
        charts: [{ id: 'l18-obv', candles: _D.obvData, height: 280, opts: { volume: true, subChart: 'OBV' } }]
    },
    {
        title: '第 19 課：均線多頭與空頭排列',
        content: `<div class="lesson">
            <h3>均線的顏色說明</h3>
            <div class="lesson-example">
            <strong style="color:#ffd700;">MA5（金）</strong> — 週線<br>
            <strong style="color:#ff9800;">MA10（橙）</strong> — 雙週線<br>
            <strong style="color:#00bcd4;">MA20（藍）</strong> — 月線<br>
            <strong style="color:#ab47bc;">MA60（紫）</strong> — 季線
            </div>
            <div id="l19-mma" class="kline-chart-example"></div>
            <h3>多頭排列 vs 空頭排列</h3>
            <div class="lesson-example">
            <strong style="color:#ef5350;">多頭排列</strong>：MA5 &gt; MA10 &gt; MA20 &gt; MA60，趨勢向上<br>
            <strong style="color:#26a69a;">空頭排列</strong>：MA5 &lt; MA10 &lt; MA20 &lt; MA60，趨勢向下<br>
            均線發散 → 趨勢強；均線收斂 → 趨勢轉換
            </div></div>`,
        charts: [{ id: 'l19-mma', candles: _D.multiMAData, height: 230, opts: { ma: [5, 10, 20, 60] } }]
    },
    {
        title: '第 20 課：多指標共振',
        content: `<div class="lesson">
            <h3>什麼是多指標共振？</h3>
            <p>同一個買賣點，多個指標同時給出相同方向的信號，可信度大幅提高。</p>
            <h3>共振買入條件示例</h3>
            <div class="lesson-example">
            ✅ K線出現看漲形態（錘子線、吞噬）<br>
            ✅ RSI 從超賣區（&lt;30）向上反彈<br>
            ✅ MACD 黃金交叉（柱狀圖由負轉正）<br>
            ✅ 成交量放大確認
            </div>
            <p><strong>RSI 共振示例（強勢回升）：</strong></p>
            <div id="l20-rsi" class="kline-chart-example"></div>
            <p><strong>MACD 共振示例（黃金交叉）：</strong></p>
            <div id="l20-macd" class="kline-chart-example"></div></div>`,
        charts: [
            { id: 'l20-rsi',  candles: _D.convergData1, height: 270, opts: { subChart: 'RSI' } },
            { id: 'l20-macd', candles: _D.convergData2, height: 280, opts: { subChart: 'MACD' } },
        ]
    },
    {
        title: '第 21 課：止損止盈設置',
        content: `<div class="lesson">
            <h3>為什麼要設止損？</h3>
            <p>保護資金是第一原則。每筆交易都可能虧損，止損確保虧損可控。</p>
            <h3>風報比（Risk-Reward Ratio）</h3>
            <div class="lesson-example">
            建議最低 <strong>1:2</strong>（虧 1 塊，目標賺 2 塊）<br>
            即使勝率 50%，長期依然盈利
            </div>
            <div id="l21-sl" class="kline-chart-example"></div>
            <h3>常見止損方法</h3>
            <div class="lesson-example">
            <strong>關鍵支撐止損</strong>：跌破前期低點下方 1-2%<br>
            <strong>固定比例止損</strong>：進場價 × 3–5%<br>
            <strong>ATR 止損</strong>：依照近期波動幅度設置
            </div></div>`,
        charts: [{
            id: 'l21-sl', candles: _D.stopLossData, height: 220,
            opts: { levels: [
                { price: 107, label: '進場', color: '#ffd700' },
                { price: 101, label: '止損 -5.6%', color: '#ef5350' },
                { price: 119, label: '止盈 +11.2%', color: '#26a69a' },
            ]}
        }]
    },
    {
        title: '第 22 課：台股特殊情況',
        content: `<div class="lesson">
            <h3>漲跌停板制度</h3>
            <div class="lesson-example">
            台股每日漲跌幅限制 <strong>±10%</strong><br>
            漲停板（+10%）：大量買盤，但需注意隔日是否打開<br>
            跌停板（−10%）：大量賣盤，流動性極差，難以脫手
            </div>
            <div id="l22-taiex" class="kline-chart-example"></div>
            <h3>除權息對K線的影響</h3>
            <div class="lesson-example">
            除息日：開盤價 = 前收盤 − 股息<br>
            除權日：開盤價按換股比例調整<br>
            K線會出現<strong>跳空缺口</strong>，但屬技術性調整，非真實跌勢
            </div>
            <h3>台指期貨基礎</h3>
            <div class="lesson-example">
            台指期（TX）：追蹤加權指數，可做多做空<br>
            到期日：每月第三個星期三<br>
            保證金制度：槓桿操作，虧損風險放大
            </div></div>`,
        charts: [{ id: 'l22-taiex', candles: _D.taiexCandles, height: 190 }]
    }
];

// ── 測驗題庫（38 題）─────────────────────────────────────
const quizBank = [
    // 基礎 10 題
    { type: 'basic', title: '基礎判讀 #1',
      candles: [{ open: 108, high: 115, low: 82, close: 88 }],
      question: '這根 K線代表什麼？',
      options: [{ text: '上漲（陽線）', correct: false }, { text: '下跌（陰線）', correct: true }, { text: '十字線', correct: false }, { text: '無法判斷', correct: false }] },

    { type: 'basic', title: '基礎判讀 #2',
      candles: [{ open: 88, high: 115, low: 82, close: 108 }],
      question: '這根 K線代表什麼？',
      options: [{ text: '上漲（陽線）', correct: true }, { text: '下跌（陰線）', correct: false }, { text: '十字線', correct: false }, { text: '下影線很長', correct: false }] },

    { type: 'basic', title: '形態識別 #1',
      candles: [{ open: 100, high: 104, low: 65, close: 101 }],
      question: '這種形態叫什麼？',
      options: [{ text: '陽線', correct: false }, { text: '陰線', correct: false }, { text: '錘子線（看漲信號）', correct: true }, { text: '倒錘子線', correct: false }] },

    { type: 'basic', title: '形態識別 #2',
      candles: [{ open: 100, high: 135, low: 96, close: 99 }],
      question: '這種形態叫什麼？',
      options: [{ text: '錘子線', correct: false }, { text: '倒錘子線（看跌信號）', correct: true }, { text: '十字線', correct: false }, { text: '陽線', correct: false }] },

    { type: 'trend', title: '趨勢判斷 #1',
      candles: [{ open: 78, high: 88, low: 76, close: 86 }, { open: 86, high: 96, low: 84, close: 94 }, { open: 94, high: 104, low: 92, close: 102 }, { open: 102, high: 112, low: 100, close: 110 }, { open: 110, high: 121, low: 108, close: 119 }],
      question: '這是什麼趨勢？',
      options: [{ text: '上升趨勢', correct: true }, { text: '下降趨勢', correct: false }, { text: '震盪趨勢', correct: false }, { text: '反轉信號', correct: false }] },

    { type: 'trend', title: '趨勢判斷 #2',
      candles: [{ open: 119, high: 121, low: 108, close: 110 }, { open: 110, high: 112, low: 100, close: 102 }, { open: 102, high: 104, low: 92, close: 94 }, { open: 94, high: 96, low: 84, close: 86 }, { open: 86, high: 88, low: 76, close: 78 }],
      question: '這是什麼趨勢？',
      options: [{ text: '上升趨勢', correct: false }, { text: '下降趨勢', correct: true }, { text: '震盪趨勢', correct: false }, { text: '反轉信號', correct: false }] },

    { type: 'trend', title: '趨勢判斷 #3',
      candles: [{ open: 95, high: 108, low: 92, close: 105 }, { open: 105, high: 108, low: 93, close: 96 }, { open: 96, high: 109, low: 93, close: 106 }, { open: 106, high: 109, low: 93, close: 95 }, { open: 95, high: 109, low: 92, close: 107 }],
      question: '這是什麼趨勢？',
      options: [{ text: '上升趨勢', correct: false }, { text: '下降趨勢', correct: false }, { text: '震盪趨勢', correct: true }, { text: '強勢上漲', correct: false }] },

    { type: 'signal', title: '買賣信號 #1',
      candles: [{ open: 78, high: 88, low: 76, close: 86 }, { open: 86, high: 96, low: 84, close: 94 }, { open: 94, high: 104, low: 92, close: 102 }, { open: 102, high: 112, low: 100, close: 110 }, { open: 110, high: 121, low: 108, close: 119 }],
      question: '在上升趨勢中，下一步應該怎麼做？',
      options: [{ text: '買入，期望繼續上漲', correct: true }, { text: '賣出，防止下跌', correct: false }, { text: '觀望，等待反轉', correct: false }, { text: '無法判斷', correct: false }] },

    { type: 'signal', title: '買賣信號 #2',
      candles: [{ open: 119, high: 121, low: 108, close: 110 }, { open: 110, high: 112, low: 100, close: 102 }, { open: 102, high: 104, low: 92, close: 94 }, { open: 94, high: 96, low: 84, close: 86 }, { open: 86, high: 88, low: 76, close: 78 }],
      question: '在下降趨勢中，下一步應該怎麼做？',
      options: [{ text: '買入，底部反彈', correct: false }, { text: '賣出或持幣，防止進一步下跌', correct: true }, { text: '加碼買入', correct: false }, { text: '等待買點', correct: false }] },

    { type: 'signal', title: '信號強度 #1',
      candles: [{ open: 95, high: 108, low: 92, close: 105 }, { open: 105, high: 108, low: 93, close: 96 }, { open: 96, high: 109, low: 93, close: 106 }, { open: 106, high: 109, low: 93, close: 95 }, { open: 95, high: 97, low: 88, close: 90 }],
      question: '在震盪趨勢末端出現陰線，這是什麼信號？',
      options: [{ text: '強烈買入信號', correct: false }, { text: '強烈賣出信號', correct: false }, { text: '回到支撐位，可考慮買入', correct: true }, { text: '應該清倉', correct: false }] },

    // 進階 20 題
    { type: 'pattern', title: '組合形態 #1',
      candles: _D.bullEngulf,
      question: '這兩根K線是什麼形態？意味著什麼？',
      options: [{ text: '看漲吞噬，底部反轉買入信號', correct: true }, { text: '看跌吞噬，頂部反轉賣出信號', correct: false }, { text: '孕線形態，趨勢延續', correct: false }, { text: '三白兵，強勢上漲', correct: false }] },

    { type: 'pattern', title: '組合形態 #2',
      candles: _D.bearEngulf,
      question: '這兩根K線是什麼形態？',
      options: [{ text: '看漲吞噬，買入信號', correct: false }, { text: '看跌吞噬，頂部反轉賣出信號', correct: true }, { text: '穿刺形態', correct: false }, { text: '晨星', correct: false }] },

    { type: 'pattern', title: '組合形態 #3',
      candles: _D.morningStar,
      question: '這三根K線組合叫什麼？',
      options: [{ text: '暮星，頂部反轉', correct: false }, { text: '晨星，底部反轉看漲', correct: true }, { text: '三白兵', correct: false }, { text: '孕線', correct: false }] },

    { type: 'pattern', title: '組合形態 #4',
      candles: _D.eveningStar,
      question: '這三根K線組合叫什麼？',
      options: [{ text: '晨星，底部反轉', correct: false }, { text: '暮星，頂部反轉看跌', correct: true }, { text: '三黑鴉', correct: false }, { text: '烏雲蓋頂', correct: false }] },

    { type: 'pattern', title: '組合形態 #5',
      candles: _D.threeWhite,
      question: '這三根連續陽線叫什麼形態？',
      options: [{ text: '三白兵，上漲趨勢強勁', correct: true }, { text: '三黑鴉，下跌趨勢強勁', correct: false }, { text: '晨星，底部反轉', correct: false }, { text: '看漲吞噬', correct: false }] },

    { type: 'pattern', title: '組合形態 #6',
      candles: _D.darkCloud,
      question: '陽線後出現高開低收的陰線，收盤跌過前根中點，這是什麼？',
      options: [{ text: '穿刺形態，看漲', correct: false }, { text: '烏雲蓋頂，看跌信號', correct: true }, { text: '看漲吞噬', correct: false }, { text: '晨星', correct: false }] },

    { type: 'pattern', title: '組合形態 #7',
      candles: _D.piercing,
      question: '陰線後出現低開高收的陽線，收盤超過前根中點，這是什麼？',
      options: [{ text: '穿刺形態，底部看漲信號', correct: true }, { text: '烏雲蓋頂，看跌', correct: false }, { text: '看跌吞噬', correct: false }, { text: '暮星', correct: false }] },

    { type: 'indicator', title: 'RSI 判讀 #1',
      candles: _D.quizRSIHigh, opts: { subChart: 'RSI' },
      question: '圖中 RSI 持續在 70 以上，這代表什麼？',
      options: [{ text: '超買區，注意可能回調', correct: true }, { text: '超賣區，準備買入', correct: false }, { text: 'RSI 無意義，忽略', correct: false }, { text: '確定會繼續上漲', correct: false }] },

    { type: 'indicator', title: 'RSI 判讀 #2',
      candles: _D.quizRSILow, opts: { subChart: 'RSI' },
      question: '圖中 RSI 持續在 30 以下，這代表什麼？',
      options: [{ text: '超買，應賣出', correct: false }, { text: '超賣區，可能出現反彈', correct: true }, { text: '趨勢非常強，繼續持有空單', correct: false }, { text: 'RSI 在 30 以下是正常的', correct: false }] },

    { type: 'indicator', title: 'MA 判讀 #1',
      candles: _D.quizMAGold, opts: { ma: [5, 20] },
      question: '圖中 MA5（金）由下方穿越 MA20（藍），這是什麼信號？',
      options: [{ text: '死亡交叉，賣出信號', correct: false }, { text: '黃金交叉，看漲買入信號', correct: true }, { text: '趨勢已結束，觀望', correct: false }, { text: '均線纏繞，無意義', correct: false }] },

    { type: 'indicator', title: 'MA 判讀 #2',
      candles: _D.quizMADeath, opts: { ma: [5, 20] },
      question: '圖中 MA5（金）由上方跌破 MA20（藍），這是什麼信號？',
      options: [{ text: '黃金交叉，買入', correct: false }, { text: '死亡交叉，看跌賣出信號', correct: true }, { text: '趨勢反轉，強力買入', correct: false }, { text: '短期震盪，無意義', correct: false }] },

    { type: 'indicator', title: '布林通道 #1',
      candles: _D.quizBoll, opts: { bollinger: true },
      question: '當K線接觸到布林上軌時，通常代表什麼？',
      options: [{ text: '突破上軌，強勢上漲買入', correct: false }, { text: '接近壓力區，超買，可能回調', correct: true }, { text: '應立即賣出清倉', correct: false }, { text: '布林通道上軌無意義', correct: false }] },

    { type: 'indicator', title: 'KD 判讀 #1',
      candles: _D.quizKD, opts: { subChart: 'KD' },
      question: 'KD 指標中，K線（金）從低位由下穿越D線（紅），這是什麼信號？',
      options: [{ text: '死亡交叉，賣出', correct: false }, { text: '黃金交叉，買入信號', correct: true }, { text: 'KD 在 80 以下均可買', correct: false }, { text: 'K 穿越 D 不重要', correct: false }] },

    { type: 'indicator', title: 'MACD 判讀 #1',
      candles: _D.quizMACD, opts: { subChart: 'MACD' },
      question: 'MACD 線（藍）由下方穿越信號線（金），柱狀圖由負轉正，這是什麼信號？',
      options: [{ text: '死亡交叉，賣出', correct: false }, { text: '黃金交叉，多方力量增強，看漲', correct: true }, { text: 'MACD 零軸以下不可信', correct: false }, { text: '假突破，等待確認', correct: false }] },

    { type: 'pattern', title: '型態分析 #1',
      candles: _D.headShoulders,
      question: '這個形態有三個高點，中間最高，兩側較低，叫什麼？',
      options: [{ text: '頭肩底，看漲', correct: false }, { text: '頭肩頂，看跌反轉信號', correct: true }, { text: '雙重頂（M頭）', correct: false }, { text: '三白兵', correct: false }] },

    { type: 'pattern', title: '型態分析 #2',
      candles: _D.doubleTop,
      question: '圖中出現兩個相近的高點，中間有回落，叫什麼型態？',
      options: [{ text: 'W底（雙重底），看漲', correct: false }, { text: 'M頭（雙重頂），看跌反轉', correct: true }, { text: '頭肩頂', correct: false }, { text: '震盪整理', correct: false }] },

    { type: 'pattern', title: '型態分析 #3',
      candles: _D.doubleBottom,
      question: '圖中出現兩個相近的低點，中間有反彈，叫什麼型態？',
      options: [{ text: 'M頭（雙重頂），看跌', correct: false }, { text: 'W底（雙重底），看漲反轉', correct: true }, { text: '頭肩底', correct: false }, { text: '震盪整理', correct: false }] },

    { type: 'volume', title: '量價關係 #1',
      candles: _D.quizVol1, opts: { volume: true },
      question: '圖中大陽線伴隨高成交量，這代表什麼？',
      options: [{ text: '量增價漲，上漲趨勢強勁', correct: true }, { text: '量增代表要反轉了', correct: false }, { text: '量越大越危險，應賣出', correct: false }, { text: '成交量和趨勢無關', correct: false }] },

    { type: 'volume', title: '量價關係 #2',
      candles: _D.quizVol2, opts: { volume: true },
      question: '關於量價關係，下列何者最正確？',
      options: [{ text: '量縮時必定要買入', correct: false }, { text: '量縮價漲不如量增價漲健康，需謹慎', correct: true }, { text: '量越小，漲幅越大', correct: false }, { text: '成交量不重要，只看K線', correct: false }] },

    // 進階型態 8 題
    { type: 'pattern', title: '旗形識別 #1',
      candles: _D.bullFlag, opts: { volume: true },
      question: '急漲後出現量縮橫盤整理，接著再度放量上攻，這是什麼形態？',
      options: [{ text: '下降旗形，看跌', correct: false }, { text: '上升旗形（Bull Flag），強勢延續看漲', correct: true }, { text: '頭肩頂，看跌反轉', correct: false }, { text: '對稱三角，方向不明', correct: false }] },

    { type: 'pattern', title: '楔形識別 #1',
      candles: _D.risingWedge,
      question: '這個形態高點低點都在上升，但逐漸收斂，最後跌破，這是什麼？',
      options: [{ text: '下降楔形，看漲', correct: false }, { text: '上升旗形，看漲', correct: false }, { text: '上升楔形，看跌反轉信號', correct: true }, { text: '對稱三角，待突破', correct: false }] },

    { type: 'pattern', title: '三角識別 #1',
      candles: _D.ascTriangle,
      question: '上方阻力水平不動，下方支撐逐步上移，最後向上突破，這是什麼形態？',
      options: [{ text: '下降三角，看跌', correct: false }, { text: '上升三角，偏向向上突破', correct: true }, { text: '對稱三角，方向不明', correct: false }, { text: '雙重頂，看跌', correct: false }] },

    { type: 'indicator', title: '斐波那契 #1',
      candles: _D.fibData, opts: { fibonacci: true },
      question: '圖中顯示斐波那契回撤，在哪個位置通常是最強的支撐參考？',
      options: [{ text: '23.6%（淺回撤）', correct: false }, { text: '61.8%（黃金比例）', correct: true }, { text: '100%（完全回撤）', correct: false }, { text: '斐波那契無實際意義', correct: false }] },

    { type: 'indicator', title: 'OBV 判讀 #1',
      candles: _D.obvData, opts: { volume: true, subChart: 'OBV' },
      question: 'OBV（能量潮）持續走高代表什麼？',
      options: [{ text: '成交量在縮小', correct: false }, { text: '資金持續流入，看漲', correct: true }, { text: 'OBV 高就應該賣出', correct: false }, { text: 'OBV 與趨勢無關', correct: false }] },

    { type: 'indicator', title: '均線排列 #1',
      candles: _D.multiMAData, opts: { ma: [5, 10, 20, 60] },
      question: '當 MA5 > MA10 > MA20 > MA60，均線向上發散，這代表什麼？',
      options: [{ text: '空頭排列，應做空', correct: false }, { text: '多頭排列，趨勢向上強勁', correct: true }, { text: '均線排列無意義', correct: false }, { text: '均線過多，訊號混亂', correct: false }] },

    { type: 'concept', title: '止損止盈 #1',
      candles: _D.stopLossData, opts: { levels: [
          { price: 107, label: '進場', color: '#ffd700' },
          { price: 101, label: '止損', color: '#ef5350' },
          { price: 119, label: '止盈', color: '#26a69a' },
      ]},
      question: '進場在 107，止損設在 101，止盈設在 119，這個交易的風報比（R:R）大約是多少？',
      options: [{ text: '1:1（風報比太低）', correct: false }, { text: '1:2（止盈是止損距離的 2 倍）', correct: true }, { text: '2:1（風大於報）', correct: false }, { text: '無法計算', correct: false }] },

    { type: 'concept', title: '多指標共振 #1',
      candles: _D.convergData1, opts: { subChart: 'RSI' },
      question: '同時出現：K線錘子線 + RSI 從低位反彈 + MACD 黃金交叉，這代表什麼？',
      options: [{ text: '訊號太多，互相矛盾', correct: false }, { text: '多指標共振，買入信號可信度高', correct: true }, { text: '只需要一個指標即可', correct: false }, { text: '共振代表即將下跌', correct: false }] },
];

// ── 頁面導航 ─────────────────────────────────────────────
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenName).classList.remove('hidden');
    currentPage = screenName;
}
function goBack() { showScreen('mainMenu'); }

// ── 教學 ─────────────────────────────────────────────────
function startLesson() {
    currentLessonIndex = 0;
    displayLesson();
    showScreen('lessonMode');
}

function displayLesson() {
    if (currentLessonIndex >= lessons.length) return;
    const lesson = lessons[currentLessonIndex];
    const content = document.getElementById('lessonContent');
    content.innerHTML = `<h2>${lesson.title}</h2>${lesson.content}`;
    if (lesson.charts) {
        lesson.charts.forEach(({ id, candles, height, opts = {} }) => {
            const el = document.getElementById(id);
            if (el) renderKlineChart(candles, el, height || 200, opts);
        });
    }
}

function nextLesson() {
    currentLessonIndex++;
    if (currentLessonIndex >= lessons.length) startQuiz();
    else displayLesson();
}

// ── 測驗 ─────────────────────────────────────────────────
function startQuiz() {
    quizData = [...quizBank].sort(() => Math.random() - 0.5).slice(0, 10);
    quizIndex = 0;
    correctAnswers = 0;
    totalAnswers = 0;
    selectedAnswer = null;
    showScreen('quizMode');
    displayQuiz();
}

function displayQuiz() {
    if (quizIndex >= quizData.length) { showCompletionScreen(); return; }

    const quiz = quizData[quizIndex];
    const progress = Math.round((quizIndex / quizData.length) * 100);
    const successRate = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

    document.getElementById('quizProgress').textContent = progress;
    document.getElementById('successRate').textContent = successRate;
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('quizQuestion').textContent = quiz.question;

    const klineDisplay = document.getElementById('klineDisplay');
    const opts = quiz.opts || {};
    const isSingle = quiz.candles.length === 1;
    const hasSubChart = !!opts.subChart;
    const hasVolume = !!opts.volume;
    const h = hasSubChart ? 300 : (hasVolume ? 260 : (isSingle ? 260 : 200));
    renderKlineChart(quiz.candles, klineDisplay, h, opts);

    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = quiz.options.map((opt, idx) => `
        <label class="option">
            <input type="radio" name="answer" value="${idx}" onchange="selectAnswer(${idx})">
            ${opt.text}
        </label>
    `).join('');

    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('submitBtn').classList.remove('hidden');
    document.getElementById('nextBtn').classList.add('hidden');
    selectedAnswer = null;
}

function selectAnswer(idx) {
    selectedAnswer = idx;
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.option')[idx].classList.add('selected');
}

function submitAnswer() {
    if (selectedAnswer === null) { alert('請選擇答案'); return; }

    const quiz = quizData[quizIndex];
    const isCorrect = quiz.options[selectedAnswer].correct;
    totalAnswers++;
    if (isCorrect) correctAnswers++;

    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden', 'correct', 'incorrect');
    if (isCorrect) {
        feedback.classList.add('correct');
        feedback.innerHTML = '✅ 正確！';
    } else {
        feedback.classList.add('incorrect');
        const ci = quiz.options.findIndex(o => o.correct);
        feedback.innerHTML = `❌ 錯誤！<br>正確答案是：<strong>${quiz.options[ci].text}</strong>`;
    }

    document.querySelectorAll('.option').forEach((opt, idx) => {
        opt.classList.remove('selected');
        if (idx === selectedAnswer) opt.classList.add(isCorrect ? 'correct' : 'incorrect');
        else if (idx === quiz.options.findIndex(o => o.correct)) opt.classList.add('correct');
    });

    document.getElementById('submitBtn').classList.add('hidden');
    document.getElementById('nextBtn').classList.remove('hidden');
}

function nextQuiz() {
    quizIndex++;
    selectedAnswer = null;
    if (quizIndex >= quizData.length) showCompletionScreen();
    else displayQuiz();
}

function showCompletionScreen() {
    const successRate = Math.round((correctAnswers / totalAnswers) * 100);
    document.getElementById('finalScore').textContent = successRate;
    const quizContainer = document.getElementById('quizContainer');
    const completeMessage = document.getElementById('completeMessage');

    if (successRate >= 80) {
        quizContainer.classList.add('hidden');
        completeMessage.classList.remove('hidden');
        saveProgress({ completed: true, finalScore: successRate, date: new Date().toLocaleString('zh-TW') });
    } else {
        completeMessage.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        alert(`你的成功率是 ${successRate}%，還需要提高 ${80 - successRate}%。\n讓我們重新開始！`);
        startQuiz();
    }
}

// ── 統計 ─────────────────────────────────────────────────
function viewStats() {
    const progress = loadProgress();
    const statsContent = document.getElementById('statsContent');
    if (!progress.completed) {
        statsContent.innerHTML = `<p>你還沒有完成課程。</p><p><a href="#" onclick="startLesson(); return false;">開始學習</a></p>`;
    } else {
        statsContent.innerHTML = `
            <div class="stat-item"><span class="stat-label">最終成績</span><span class="stat-value">${progress.finalScore}%</span></div>
            <div class="stat-item"><span class="stat-label">完成日期</span><span class="stat-value">${progress.date}</span></div>
            <div class="stat-item"><span class="stat-label">狀態</span><span class="stat-value">✅ 已完成</span></div>`;
    }
    showScreen('statsPage');
}

function resetProgress() {
    if (confirm('確定要重置所有進度嗎？')) {
        localStorage.removeItem(STORAGE_KEY);
        alert('進度已重置');
        goBack();
    }
}

function saveProgress(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function loadProgress() { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : { completed: false }; }

window.addEventListener('load', () => { showScreen('mainMenu'); });
