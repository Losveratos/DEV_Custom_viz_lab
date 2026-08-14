"use strict";

/* Scatter byDatenWG — Statistik-Kern (pure, kein DOM).
 *
 * Alles hier ist seiteneffektfrei und testbar: OLS/Pearson, Tick-Generatoren
 * fuer lineare und logarithmische Achsen, Log-Erkennung und die deutsche
 * Kompaktformatierung fuer Achsenbeschriftungen.
 */

import { OlsFit, FacetStats, XScaleMode } from "./model";

/* ------------------------------------------------------------------ *
 * Hilfsfunktionen
 * ------------------------------------------------------------------ */

/** true fuer echte, endliche Zahlen (null/undefined/NaN/Infinity -> false) */
export function isNum(v: number | null | undefined): boolean {
    return typeof v === "number" && isFinite(v);
}

/** Perzentil auf einem AUFSTEIGEND sortierten Array, linear interpoliert. */
export function percentileSorted(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 0) { return NaN; }
    if (n === 1) { return sorted[0]; }
    const q = p < 0 ? 0 : (p > 1 ? 1 : p);
    const idx = (n - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) { return sorted[lo]; }
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/* ------------------------------------------------------------------ *
 * Korrelation und Regression
 * ------------------------------------------------------------------ */

/**
 * Pearson-Korrelationskoeffizient.
 * Gibt NaN zurueck bei n < 2 oder wenn eine der beiden Reihen Varianz 0 hat.
 */
export function pearson(xs: number[], ys: number[]): number {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) { return NaN; }
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) { return NaN; }
    const r = sxy / Math.sqrt(sxx * syy);
    return r > 1 ? 1 : (r < -1 ? -1 : r);
}

/**
 * Kleinste-Quadrate-Gerade y = slope * x + intercept plus Pearson r / R².
 * null bei n < 3 oder wenn x- bzw. y-Varianz 0 ist.
 */
export function olsFit(xs: number[], ys: number[]): OlsFit | null {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) { return null; }
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < n; i++) {
        if (!isNum(xs[i]) || !isNum(ys[i])) { return null; }
        sx += xs[i];
        sy += ys[i];
    }
    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) { return null; }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    let r = sxy / Math.sqrt(sxx * syy);
    if (r > 1) { r = 1; }
    if (r < -1) { r = -1; }
    return { slope: slope, intercept: intercept, r: r, r2: r * r, n: n };
}

/* ------------------------------------------------------------------ *
 * Achsen-Ticks
 * ------------------------------------------------------------------ */

/** Anzahl Nachkommastellen, die ein Schritt braucht (fuer sauberes Runden). */
function decimalsForStep(step: number): number {
    if (!(step > 0)) { return 0; }
    const d = Math.ceil(-Math.log10(step)) + 1;
    return d < 0 ? 0 : (d > 12 ? 12 : d);
}

/** Rundet auf die Schrittweite, damit 0.30000000000000004 nicht entsteht. */
function snap(v: number, step: number): number {
    const d = decimalsForStep(step);
    const f = Math.pow(10, d);
    const out = Math.round(v * f) / f;
    return out === 0 ? 0 : out;
}

/**
 * "Schoene" lineare Ticks mit Schritten 1 / 2 / 2.5 / 5 * 10^k.
 * Liefert alle Ticks im geschlossenen Intervall [min, max].
 */
export function niceTicksLinear(min: number, max: number, targetCount: number): number[] {
    if (!isNum(min) || !isNum(max)) { return []; }
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (lo === hi) {
        // Degenerierte Domain: ein einzelner Tick auf dem Wert.
        return [lo];
    }
    const want = targetCount && targetCount > 0 ? targetCount : 4;
    const raw = (hi - lo) / want;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    // Schwellen liegen zwischen den erlaubten Schritten, damit die Tick-Anzahl
    // moeglichst nah an targetCount landet (statt sie immer nach unten zu ziehen).
    let mult: number;
    if (norm < 1.5) { mult = 1; }
    else if (norm < 2.25) { mult = 2; }
    else if (norm < 3.5) { mult = 2.5; }
    else if (norm < 7.5) { mult = 5; }
    else { mult = 10; }
    const step = mult * mag;
    if (!(step > 0)) { return [lo]; }

    const eps = step * 1e-9;
    const out: number[] = [];
    let t = Math.ceil((lo - eps) / step) * step;
    // Sicherheitsnetz gegen Endlosschleifen bei extremen Werten.
    let guard = 0;
    while (t <= hi + eps && guard < 1000) {
        out.push(snap(t, step));
        t += step;
        guard++;
    }
    if (out.length === 0) { out.push(snap(lo, step)); }
    return out;
}

/**
 * 1-2-5-Ticks auf log10-Basis: ... 500, 1000, 2000, 5000, 10000 ...
 * min muss > 0 sein, sonst leeres Array.
 */
export function logTicks(min: number, max: number): number[] {
    if (!isNum(min) || !isNum(max)) { return []; }
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (!(lo > 0)) { return []; }
    if (lo === hi) { return [lo]; }

    const kLo = Math.floor(Math.log10(lo));
    const kHi = Math.ceil(Math.log10(hi));
    const mults = [1, 2, 5];
    const out: number[] = [];
    for (let k = kLo; k <= kHi; k++) {
        const base = Math.pow(10, k);
        for (let m = 0; m < mults.length; m++) {
            const v = mults[m] * base;
            // relative Toleranz gegen Fliesskomma-Rauschen
            if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) {
                out.push(v);
            }
        }
    }
    if (out.length === 0) { out.push(lo, hi); }
    return out;
}

/**
 * Log-Skala sinnvoll? true wenn ALLE Werte > 0 sind UND das Verhaeltnis
 * p95/p5 (linear interpolierte Perzentile) groesser als 20 ist.
 */
export function detectLogScale(values: number[]): boolean {
    if (!values || values.length === 0) { return false; }
    const vals: number[] = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (!isNum(v)) { continue; }
        if (v <= 0) { return false; }
        vals.push(v);
    }
    if (vals.length < 3) { return false; }
    vals.sort(function (a, b) { return a - b; });
    const p5 = percentileSorted(vals, 0.05);
    const p95 = percentileSorted(vals, 0.95);
    if (!(p5 > 0) || !isNum(p95)) { return false; }
    return p95 / p5 > 20;
}

/* ------------------------------------------------------------------ *
 * Facetten-Statistik
 * ------------------------------------------------------------------ */

/**
 * Statistik einer Facette: Skalenwahl, Gesamt-Fit und Fits je Farbgruppe.
 *
 * Bei Log-Skala werden x <= 0 verworfen und log10(x) fuer Fit und r benutzt
 * ("r on log values" wie im Original-Artefakt).
 */
export function computeFacetStats(
    xs: (number | null)[],
    ys: (number | null)[],
    colorIdx: number[],
    mode: XScaleMode
): FacetStats {
    const n = Math.min(xs ? xs.length : 0, ys ? ys.length : 0);

    // 1) gueltige Paare sammeln
    const vx: number[] = [];
    const vy: number[] = [];
    const vc: number[] = [];
    for (let i = 0; i < n; i++) {
        const x = xs[i];
        const y = ys[i];
        if (!isNum(x) || !isNum(y)) { continue; }
        vx.push(x as number);
        vy.push(y as number);
        vc.push(colorIdx && colorIdx.length > i && isNum(colorIdx[i]) ? colorIdx[i] : -1);
    }

    // 2) Skala bestimmen
    let scale: "linear" | "log";
    if (mode === "log") { scale = "log"; }
    else if (mode === "linear") { scale = "linear"; }
    else { scale = detectLogScale(vx) ? "log" : "linear"; }

    // 3) transformieren (bei log: x <= 0 raus, log10 anwenden)
    const tx: number[] = [];
    const ty: number[] = [];
    const tc: number[] = [];
    for (let i = 0; i < vx.length; i++) {
        if (scale === "log") {
            if (!(vx[i] > 0)) { continue; }
            tx.push(Math.log10(vx[i]));
        } else {
            tx.push(vx[i]);
        }
        ty.push(vy[i]);
        tc.push(vc[i]);
    }

    // 4) Fits
    const overall = olsFit(tx, ty);

    const groups = new Map<number, { x: number[]; y: number[] }>();
    for (let i = 0; i < tx.length; i++) {
        const key = tc[i];
        let g = groups.get(key);
        if (!g) { g = { x: [], y: [] }; groups.set(key, g); }
        g.x.push(tx[i]);
        g.y.push(ty[i]);
    }
    const byColor = new Map<number, OlsFit>();
    groups.forEach(function (g, key) {
        if (g.x.length < 3) { return; }
        const fit = olsFit(g.x, g.y);
        if (fit) { byColor.set(key, fit); }
    });

    return { scale: scale, overall: overall, byColor: byColor };
}

/* ------------------------------------------------------------------ *
 * Zahlenformat (deutsch)
 * ------------------------------------------------------------------ */

const MINUS = "−"; // typografisches Minus U+2212

function groupThousands(intDigits: string): string {
    let out = "";
    let c = 0;
    for (let i = intDigits.length - 1; i >= 0; i--) {
        out = intDigits.charAt(i) + out;
        c++;
        if (c % 3 === 0 && i > 0) { out = "." + out; }
    }
    return out;
}

/** Feste Nachkommastellen, deutsch, mit Tausenderpunkt; Nullen bleiben. */
function deFixed(abs: number, digits: number): string {
    const s = abs.toFixed(digits);
    const dot = s.indexOf(".");
    const ip = dot < 0 ? s : s.substring(0, dot);
    const fp = dot < 0 ? "" : s.substring(dot + 1);
    return fp.length > 0 ? groupThousands(ip) + "," + fp : groupThousands(ip);
}

/** Nachkommastellen kuerzen (Trailing-Nullen weg), deutsch. */
function deTrim(abs: number, digits: number): string {
    let s = abs.toFixed(digits);
    if (s.indexOf(".") >= 0) {
        s = s.replace(/0+$/, "");
        s = s.replace(/\.$/, "");
    }
    const dot = s.indexOf(".");
    const ip = dot < 0 ? s : s.substring(0, dot);
    const fp = dot < 0 ? "" : s.substring(dot + 1);
    return fp.length > 0 ? groupThousands(ip) + "," + fp : groupThousands(ip);
}

/** Nachkommastellen fuer einen skalierten Wert (1,45 / 12,9 / 125). */
function digitsFor(scaled: number): number {
    if (scaled < 10) { return 2; }
    if (scaled < 100) { return 1; }
    return 0;
}

/**
 * Kompakte deutsche Zahl fuer Achsenticks:
 * 1.284 · 12,9k · 4,2M · 1,45 Mrd · 0,496 · 68,81
 */
export function formatCompact(v: number): string {
    if (!isNum(v)) { return ""; }
    if (v === 0) { return "0"; }
    const sign = v < 0 ? MINUS : "";
    const a = Math.abs(v);

    if (a >= 1e12) { return sign + deTrim(a / 1e12, digitsFor(a / 1e12)) + " Bio"; }
    if (a >= 1e9) { return sign + deTrim(a / 1e9, digitsFor(a / 1e9)) + " Mrd"; }
    if (a >= 1e6) { return sign + deTrim(a / 1e6, digitsFor(a / 1e6)) + "M"; }
    if (a >= 1e4) { return sign + deTrim(a / 1e3, digitsFor(a / 1e3)) + "k"; }
    if (a >= 1000) { return sign + deTrim(a, 0); }
    if (a >= 100) { return sign + deTrim(a, 1); }
    if (a >= 1) { return sign + deTrim(a, 2); }
    if (a >= 0.001) { return sign + deTrim(a, 3); }
    // sehr kleine Werte: 2 signifikante Stellen
    const exp = Math.floor(Math.log10(a));
    const dig = Math.min(12, Math.max(0, -exp + 1));
    return sign + deTrim(a, dig);
}

/** Wie formatCompact, aber mit fester Stellenzahl (fuer r, R²). */
export function formatFixedDe(v: number, digits: number): string {
    if (!isNum(v)) { return "–"; }
    return (v < 0 ? MINUS : "") + deFixed(Math.abs(v), digits);
}
