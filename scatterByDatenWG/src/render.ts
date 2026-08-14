"use strict";

/* Scatter byDatenWG — SVG-Renderer fuer Scatter Small Multiples.
 *
 * Ein Aufruf = ein vollstaendiger Rerender. Der Renderer besitzt seinen
 * DOM-Teilbaum unterhalb von `root` und raeumt ihn zu Beginn selbst ab
 * (removeChild-Schleife; innerHTML ist per Lint-Regel verboten).
 *
 * Aufbau:
 *   container
 *     header   (Legenden-Chips + "Y: <label>")
 *     grid     (CSS-Grid aus Facetten-Kacheln, je Kachel ein SVG)
 *     footer   (optional, max. 2 Zeilen)
 */

import {
    RenderInput, RenderOptions, RenderTokens, OlsFit, FacetStats
} from "./model";
import { computeFacetStats, niceTicksLinear, logTicks } from "./stats";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_STACK = "\"Segoe UI\", Helvetica, Arial, sans-serif";
const MINUS = "−";

const MIN_W = 200;
const MIN_H = 150;

const PAD = 8;          // Aussenabstand des Rasters
const GAP = 8;          // Abstand zwischen Kacheln
const TILE_PAD = 8;     // Innenabstand einer Kachel
const SCROLLBAR = 12;   // Reserve, wenn das Raster vertikal scrollt

/* Untergrenzen fuer eine noch lesbare Kachel (Basis + schriftskalierter Anteil,
 * da Kopfzeile und Achsenbeschriftung mit fontScale wachsen). Passen nicht alle
 * Facetten in die Flaeche, scrollt das Raster lieber, als flache Leerkacheln
 * zu zeichnen. */
const MIN_TILE_H_BASE = 60;
const MIN_TILE_W_AUTO_BASE = 80;   // automatische Spaltenzahl
const MIN_TILE_W_HARD_BASE = 46;   // ausdrueckliche Spaltenvorgabe des Nutzers
const MIN_TILE_FONT_PART = 28;

const EMPTY_HINT = "Y-Measure und mindestens ein X-Measure zuweisen.";

/* ------------------------------------------------------------------ *
 * kleine DOM-Helfer
 * ------------------------------------------------------------------ */

function clear(el: Node): void {
    while (el.firstChild) { el.removeChild(el.firstChild); }
}

function div(): HTMLDivElement {
    return document.createElement("div");
}

function svgEl(name: string): SVGElement {
    return document.createElementNS(SVG_NS, name) as SVGElement;
}

function attrs(el: Element, map: Record<string, string | number>): void {
    for (const k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
            el.setAttribute(k, String(map[k]));
        }
    }
}

function textNode(s: string): Text {
    return document.createTextNode(s);
}

/* ------------------------------------------------------------------ *
 * Zahlen / Text
 * ------------------------------------------------------------------ */

function deFixed(v: number, digits: number): string {
    if (typeof v !== "number" || !isFinite(v)) { return "–"; }
    const s = Math.abs(v).toFixed(digits).replace(".", ",");
    return (v < 0 ? MINUS : "") + s;
}

function deInt(v: number): string {
    const s = String(Math.round(Math.abs(v)));
    let out = "";
    let c = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        out = s.charAt(i) + out;
        c++;
        if (c % 3 === 0 && i > 0) { out = "." + out; }
    }
    return (v < 0 ? MINUS : "") + out;
}

/* ------------------------------------------------------------------ *
 * interne Typen
 * ------------------------------------------------------------------ */

interface Pt {
    row: number;
    tx: number;      // x im Skalenraum (log10(x) bei log)
    y: number;
    color: number;
}

interface FacetPlan {
    idx: number;             // Index in input.facets
    label: string;
    stats: FacetStats;
    pts: Pt[];
    txMin: number;
    txMax: number;
    ranges: Map<number, { lo: number; hi: number }>;
}

interface Mark {
    el: SVGCircleElement;
    facet: number;           // Position im Raster
    baseR: number;
    baseOpacity: number;
    baseStroke: string;
    baseStrokeW: number;
    cx: number;
    cy: number;
    label: string;
}

/* ------------------------------------------------------------------ *
 * Geometrie-Helfer
 * ------------------------------------------------------------------ */

/** Liang-Barsky auf ein horizontales Band [top, bottom]; null = ausserhalb. */
function clipToBand(
    x1: number, y1: number, x2: number, y2: number, top: number, bottom: number
): number[] | null {
    let t0 = 0;
    let t1 = 1;
    const dy = y2 - y1;
    const ps = [-dy, dy];
    const qs = [y1 - top, bottom - y1];
    for (let i = 0; i < 2; i++) {
        const p = ps[i];
        const q = qs[i];
        if (p === 0) {
            if (q < 0) { return null; }
        } else {
            const r = q / p;
            if (p < 0) {
                if (r > t1) { return null; }
                if (r > t0) { t0 = r; }
            } else {
                if (r < t0) { return null; }
                if (r < t1) { t1 = r; }
            }
        }
    }
    const dx = x2 - x1;
    return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/* ------------------------------------------------------------------ *
 * Hauptfunktion
 * ------------------------------------------------------------------ */

export function renderScatterMultiples(
    root: HTMLElement, input: RenderInput, opts: RenderOptions
): void {
    clear(root);
    if (!root || !opts) { return; }

    const tokens: RenderTokens = opts.tokens;
    const W = Math.max(0, Math.floor(opts.width));
    const H = Math.max(0, Math.floor(opts.height));
    const fs = opts.fontScale > 0 ? opts.fontScale : 1;

    const container = div();
    container.style.boxSizing = "border-box";
    container.style.width = W + "px";
    container.style.height = H + "px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.overflow = "hidden";
    container.style.background = tokens.surface;
    container.style.color = tokens.ink;
    container.style.fontFamily = FONT_STACK;
    container.style.userSelect = "none";
    container.style.setProperty("-webkit-user-select", "none");
    root.appendChild(container);

    container.addEventListener("contextmenu", function (ev: MouseEvent) {
        ev.preventDefault();
        const t = ev.target as Element;
        const a = t && t.getAttribute ? t.getAttribute("data-row") : null;
        const rowIdx = a === null || a === undefined ? null : parseInt(a, 10);
        if (opts.onContextMenu) {
            opts.onContextMenu(rowIdx, ev.clientX, ev.clientY, ev);
        }
    });

    /* --- Sonderfaelle -------------------------------------------------- */

    if (W < MIN_W || H < MIN_H) {
        appendHint(container, "Zu wenig Platz.", tokens, fs);
        return;
    }

    const rows = input && input.rows ? input.rows : [];
    const facetsIn = input && input.facets ? input.facets : [];
    const legend = input && input.legend ? input.legend : [];

    let hasY = false;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i] && typeof rows[i].y === "number" && isFinite(rows[i].y as number)) {
            hasY = true;
            break;
        }
    }
    if (rows.length === 0 || facetsIn.length === 0 || !hasY) {
        appendHint(container, EMPTY_HINT, tokens, fs);
        return;
    }

    container.addEventListener("click", function (ev: MouseEvent) {
        if (opts.onBackgroundClick) { opts.onBackgroundClick(ev); }
    });

    /* --- Kopfzeile ----------------------------------------------------- */

    const hdrFs = 11 * fs;
    const legendVisible = opts.showLegend !== false;
    const header = div();
    header.style.boxSizing = "border-box";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "6px";
    header.style.padding = "5px " + PAD + "px";
    header.style.flex = "0 0 auto";
    header.style.overflow = "hidden";
    header.style.whiteSpace = "nowrap";
    container.appendChild(header);

    if (legendVisible) {
        for (let i = 0; i < legend.length; i++) {
            header.appendChild(makeChip(legend[i].name, legend[i].color, i, tokens, hdrFs, opts));
        }
    }

    const yTag = div();
    yTag.style.marginLeft = "auto";
    yTag.style.color = tokens.muted;
    yTag.style.fontSize = hdrFs.toFixed(1) + "px";
    yTag.style.overflow = "hidden";
    yTag.style.textOverflow = "ellipsis";
    yTag.style.whiteSpace = "nowrap";
    yTag.style.paddingLeft = "8px";
    const yLabel = input.yLabel || "";
    yTag.appendChild(textNode("Y: " + yLabel));
    yTag.title = "Y: " + yLabel;
    header.appendChild(yTag);

    const headerH = Math.round(hdrFs * 1.5) + 16;

    /* --- Fusszeile (Hoehe vorab reservieren) ---------------------------- */

    const footerText = input.footer || "";
    const fFs = (opts.footerFontSize > 0 ? opts.footerFontSize : 10) * fs;
    let footerH = 0;
    let footerLines = 0;
    if (footerText.length > 0) {
        const perLine = Math.max(12, Math.floor(W / (fFs * 0.52)));
        footerLines = Math.min(2, Math.max(1, Math.ceil(footerText.length / perLine)));
        footerH = Math.round(footerLines * fFs * 1.35) + 11;
    }

    /* --- Raster --------------------------------------------------------- */

    const gridH = Math.max(40, H - headerH - footerH);

    const nF = facetsIn.length;
    const explicitCols = opts.columns && opts.columns > 0 ? true : false;

    // 1) Spaltenzahl: Vorgabe oder aus dem Seitenverhaeltnis, auf 1..8 geklemmt.
    let cols = explicitCols
        ? Math.round(opts.columns)
        : Math.round(Math.sqrt(nF * (gridH > 0 ? W / gridH : 1) / 1.15));
    if (!(cols >= 1)) { cols = 1; }
    if (cols > 8) { cols = 8; }
    if (cols > nF) { cols = nF; }

    // 2) Spalten reduzieren, bis eine Kachel noch lesbar breit ist. Eine
    //    ausdrueckliche Vorgabe wird dabei weiter respektiert (harte Grenze).
    const minTileW = Math.round(
        (explicitCols ? MIN_TILE_W_HARD_BASE : MIN_TILE_W_AUTO_BASE) + MIN_TILE_FONT_PART * fs);
    const minTileH = Math.round(MIN_TILE_H_BASE + MIN_TILE_FONT_PART * fs);
    const fitCols = function (start: number, reserve: number): number {
        let c = start;
        while (c > 1 && (W - 2 * PAD - reserve - (c - 1) * GAP) / c < minTileW) { c--; }
        return c;
    };
    cols = fitCols(cols, 0);

    // 3) Kachelhoehe. Unterschreitet sie das Minimum, scrollt das Raster
    //    vertikal, statt unlesbar flache Kacheln zu zeichnen.
    let rowsN = Math.ceil(nF / cols);
    let tileH = Math.floor((gridH - 2 * PAD - (rowsN - 1) * GAP) / rowsN);
    const scrollY = tileH < minTileH;
    if (scrollY) {
        tileH = minTileH;
        cols = fitCols(cols, SCROLLBAR);
        rowsN = Math.ceil(nF / cols);
    }
    const tileW = Math.max(40, Math.floor(
        (W - 2 * PAD - (scrollY ? SCROLLBAR : 0) - (cols - 1) * GAP) / cols));

    const grid = div();
    grid.style.boxSizing = "border-box";
    grid.style.flex = "1 1 auto";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(" + cols + ", " + tileW + "px)";
    grid.style.gridAutoRows = tileH + "px";
    grid.style.gap = GAP + "px";
    grid.style.padding = PAD + "px";
    grid.style.overflowX = "hidden";
    grid.style.overflowY = scrollY ? "auto" : "hidden";
    grid.style.alignContent = "start";
    container.appendChild(grid);

    /* --- Statistik / Reihenfolge ---------------------------------------- */

    const ys: (number | null)[] = new Array(rows.length);
    const colorIdx: number[] = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        ys[i] = r && typeof r.y === "number" && isFinite(r.y) ? r.y : null;
        colorIdx[i] = r && typeof r.colorIdx === "number" ? r.colorIdx : -1;
    }

    const plans: FacetPlan[] = [];
    for (let f = 0; f < facetsIn.length; f++) {
        const fin = facetsIn[f];
        const st = computeFacetStats(fin.x || [], ys, colorIdx, opts.xScale);
        const pts: Pt[] = [];
        const ranges = new Map<number, { lo: number; hi: number }>();
        let txMin = Infinity;
        let txMax = -Infinity;
        const xsRaw = fin.x || [];
        for (let i = 0; i < rows.length; i++) {
            const yv = ys[i];
            const xv = i < xsRaw.length ? xsRaw[i] : null;
            if (yv === null) { continue; }
            if (typeof xv !== "number" || !isFinite(xv)) { continue; }
            let tx = xv;
            if (st.scale === "log") {
                if (!(xv > 0)) { continue; }
                tx = Math.log10(xv);
            }
            const c = colorIdx[i];
            pts.push({ row: i, tx: tx, y: yv, color: c });
            if (tx < txMin) { txMin = tx; }
            if (tx > txMax) { txMax = tx; }
            const rg = ranges.get(c);
            if (!rg) { ranges.set(c, { lo: tx, hi: tx }); }
            else {
                if (tx < rg.lo) { rg.lo = tx; }
                if (tx > rg.hi) { rg.hi = tx; }
            }
        }
        plans.push({
            idx: f, label: fin.label || fin.key || "", stats: st, pts: pts,
            txMin: txMin, txMax: txMax, ranges: ranges
        });
    }

    if (opts.sortByR) {
        plans.sort(function (a, b) {
            const ra = a.stats.overall ? Math.abs(a.stats.overall.r) : -1;
            const rb = b.stats.overall ? Math.abs(b.stats.overall.r) : -1;
            if (rb !== ra) { return rb - ra; }
            return a.idx - b.idx;
        });
    }

    /* --- globale Y-Skala ------------------------------------------------ */

    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < ys.length; i++) {
        const v = ys[i];
        if (v === null) { continue; }
        if (v < yMin) { yMin = v; }
        if (v > yMax) { yMax = v; }
    }
    if (!isFinite(yMin) || !isFinite(yMax)) {
        appendHint(container, EMPTY_HINT, tokens, fs);
        return;
    }
    let ySpan = yMax - yMin;
    if (!(ySpan > 0)) { ySpan = Math.abs(yMax) > 0 ? Math.abs(yMax) * 0.1 : 1; }
    const yLo = yMin - ySpan * 0.05;
    const yHi = yMax + ySpan * 0.05;

    /* --- Punktgroessen -------------------------------------------------- */

    const basePointR = opts.pointSize > 0 ? opts.pointSize : 3;
    const rMax = Math.max(7, basePointR * 1.8);
    const rMin = 2.5;
    let sizeMax = 0;
    let sizeUsed = false;
    if (opts.sizeEnabled) {
        for (let i = 0; i < rows.length; i++) {
            const s = rows[i] ? rows[i].size : null;
            if (typeof s === "number" && isFinite(s) && s > 0) {
                sizeUsed = true;
                if (s > sizeMax) { sizeMax = s; }
            }
        }
    }

    function radiusFor(i: number): number {
        if (!sizeUsed || !(sizeMax > 0)) { return basePointR; }
        const s = rows[i] ? rows[i].size : null;
        if (typeof s !== "number" || !isFinite(s) || s <= 0) { return rMin; }
        return rMin + (rMax - rMin) * Math.sqrt(s / sizeMax);
    }

    function colorFor(c: number): string {
        if (c >= 0 && c < legend.length && legend[c] && legend[c].color) {
            return legend[c].color;
        }
        return tokens.muted;
    }

    /* --- Hervorhebung (Hover / Pin) ------------------------------------- */

    const marksByRow: Mark[][] = new Array(rows.length);
    const hoverLayers: SVGGElement[] = [];
    const labelFs = 10 * fs;

    let hoverRow: number | null = null;
    let hoverFacet: number | null = null;
    const pinRow: number | null =
        typeof opts.highlightRow === "number" && opts.highlightRow >= 0 &&
            opts.highlightRow < rows.length ? opts.highlightRow : null;
    let emphasized: number[] = [];

    function emphasizeRow(r: number): void {
        const list = marksByRow[r];
        if (!list) { return; }
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            attrs(m.el, {
                "r": (m.baseR + 2).toFixed(2),
                "stroke": tokens.ink,
                "stroke-width": "2",
                "fill-opacity": "1"
            });
        }
    }

    function restoreRow(r: number): void {
        const list = marksByRow[r];
        if (!list) { return; }
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            attrs(m.el, {
                "r": m.baseR.toFixed(2),
                "stroke": m.baseStroke,
                "stroke-width": String(m.baseStrokeW),
                "fill-opacity": String(m.baseOpacity)
            });
        }
    }

    function makeLabel(m: Mark, plotW: number): SVGElement {
        const t = svgEl("text");
        const right = m.cx + m.baseR + 5;
        const useLeft = right + m.label.length * labelFs * 0.55 > plotW;
        attrs(t, {
            "x": (useLeft ? m.cx - m.baseR - 5 : right).toFixed(1),
            "y": (m.cy + labelFs * 0.35).toFixed(1),
            "text-anchor": useLeft ? "end" : "start",
            "font-size": labelFs.toFixed(1),
            "fill": tokens.ink,
            "stroke": tokens.card,
            "stroke-width": "2",
            "paint-order": "stroke",
            "stroke-linejoin": "round",
            "pointer-events": "none"
        });
        t.appendChild(textNode(m.label));
        return t;
    }

    const plotRightByFacet: number[] = [];

    function paintLabels(): void {
        for (let i = 0; i < hoverLayers.length; i++) { clear(hoverLayers[i]); }
        // Pin: Label in JEDER Facette
        if (pinRow !== null && marksByRow[pinRow]) {
            const list = marksByRow[pinRow];
            for (let i = 0; i < list.length; i++) {
                const m = list[i];
                const layer = hoverLayers[m.facet];
                if (layer) { layer.appendChild(makeLabel(m, plotRightByFacet[m.facet] || 0)); }
            }
        }
        // Hover: Label nur in der gehoverten Facette
        if (hoverRow !== null && hoverRow !== pinRow && marksByRow[hoverRow]) {
            const list = marksByRow[hoverRow];
            for (let i = 0; i < list.length; i++) {
                const m = list[i];
                if (hoverFacet !== null && m.facet !== hoverFacet) { continue; }
                const layer = hoverLayers[m.facet];
                if (layer) { layer.appendChild(makeLabel(m, plotRightByFacet[m.facet] || 0)); }
            }
        }
    }

    function refreshEmphasis(): void {
        for (let i = 0; i < emphasized.length; i++) { restoreRow(emphasized[i]); }
        emphasized = [];
        if (pinRow !== null) { emphasized.push(pinRow); }
        if (hoverRow !== null && hoverRow !== pinRow) { emphasized.push(hoverRow); }
        for (let i = 0; i < emphasized.length; i++) { emphasizeRow(emphasized[i]); }
        paintLabels();
    }

    /* --- Facetten zeichnen ---------------------------------------------- */

    for (let p = 0; p < plans.length; p++) {
        const plan = plans[p];
        const col = p % cols;
        const tile = div();
        tile.style.boxSizing = "border-box";
        tile.style.width = tileW + "px";
        tile.style.height = tileH + "px";
        tile.style.background = tokens.card;
        tile.style.border = "1px solid " + tokens.border;
        tile.style.borderRadius = "8px";
        tile.style.padding = TILE_PAD + "px";
        tile.style.overflow = "hidden";
        tile.style.display = "flex";
        tile.style.flexDirection = "column";
        grid.appendChild(tile);

        // Kachelkopf
        const headFs = 11 * fs;
        const subFs = 10 * fs;
        const th = div();
        th.style.display = "flex";
        th.style.alignItems = "baseline";
        th.style.gap = "6px";
        th.style.flex = "0 0 auto";
        th.style.overflow = "hidden";
        tile.appendChild(th);

        const thName = div();
        thName.style.fontSize = headFs.toFixed(1) + "px";
        thName.style.fontWeight = "600";
        thName.style.color = tokens.ink;
        thName.style.overflow = "hidden";
        thName.style.textOverflow = "ellipsis";
        thName.style.whiteSpace = "nowrap";
        thName.style.flex = "1 1 auto";
        thName.style.minWidth = "0";
        thName.appendChild(textNode(plan.label));
        thName.title = plan.label;
        th.appendChild(thName);

        const fit: OlsFit | null = plan.stats.overall;
        let meta = "";
        if (fit) {
            meta = "r = " + deFixed(fit.r, 2) + " · n = " + deInt(fit.n);
        } else {
            meta = "n = " + deInt(plan.pts.length);
        }
        if (plan.stats.scale === "log") { meta += " · log"; }
        if (opts.showR2 && opts.regression === "overall" && fit) {
            meta += " · R² = " + deFixed(fit.r2, 2);
        }
        const thMeta = div();
        thMeta.style.fontSize = subFs.toFixed(1) + "px";
        thMeta.style.color = tokens.muted;
        thMeta.style.whiteSpace = "nowrap";
        thMeta.style.flex = "0 0 auto";
        thMeta.appendChild(textNode(meta));
        th.appendChild(thMeta);

        const headH = Math.round(headFs * 1.5) + 2;
        const innerW = tileW - 2 * TILE_PAD - 2;
        const innerH = tileH - 2 * TILE_PAD - 2 - headH;
        plotRightByFacet[p] = 0;
        if (innerW < 30 || innerH < 24) { continue; }

        const svg = svgEl("svg") as SVGSVGElement;
        attrs(svg, {
            "width": innerW,
            "height": innerH,
            "viewBox": "0 0 " + innerW + " " + innerH
        });
        svg.style.display = "block";
        svg.style.overflow = "visible";
        tile.appendChild(svg);

        const mL = col === 0 ? Math.round(34 * fs) : 4;
        const mR = 6;
        const mT = 4;
        const mB = Math.round(14 * fs);
        const plotW = innerW - mL - mR;
        const plotH = innerH - mT - mB;
        plotRightByFacet[p] = plotW + mL;
        if (plotW < 20 || plotH < 20) { continue; }

        const left = mL;
        const top = mT;
        const right = mL + plotW;
        const bottom = mT + plotH;

        const yScale = function (v: number): number {
            return bottom - (v - yLo) / (yHi - yLo) * plotH;
        };

        // X-Domain je Facette
        let xLo: number;
        let xHi: number;
        let xTickVals: number[] = [];
        const tickTarget = tileW < 190 ? 3 : 4;

        if (plan.pts.length === 0) {
            xLo = 0; xHi = 1;
        } else if (plan.stats.scale === "log") {
            const rawLo = Math.pow(10, plan.txMin);
            const rawHi = Math.pow(10, plan.txMax);
            let sLo = plan.txMin;
            let sHi = plan.txMax;
            if (sHi - sLo < 1e-9) { sLo -= 0.5; sHi += 0.5; }
            else { const padL = (sHi - sLo) * 0.04; sLo -= padL; sHi += padL; }
            xLo = sLo; xHi = sHi;
            const lt = logTicks(rawLo, rawHi);
            for (let i = 0; i < lt.length; i++) { xTickVals.push(Math.log10(lt[i])); }
            if (xTickVals.length === 0) { xTickVals = [plan.txMin, plan.txMax]; }
        } else {
            let lo = plan.txMin;
            let hi = plan.txMax;
            if (opts.zeroBaseline && lo > 0) { lo = 0; }
            if (opts.zeroBaseline && hi < 0) { hi = 0; }
            if (hi - lo < 1e-12) {
                const d = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1;
                lo -= d; hi += d;
            } else {
                const padL = (hi - lo) * 0.04;
                if (!(opts.zeroBaseline && lo === 0)) { lo -= padL; }
                hi += padL;
            }
            xLo = lo; xHi = hi;
            xTickVals = niceTicksLinear(xLo, xHi, tickTarget);
        }
        const xSpan = xHi - xLo || 1;
        const xScale = function (v: number): number {
            return left + (v - xLo) / xSpan * plotW;
        };

        const gGrid = svgEl("g");
        svg.appendChild(gGrid);

        // Y-Gridlines (+ Labels nur in Spalte 0)
        const yTicks = niceTicksLinear(yLo, yHi, 4);
        for (let i = 0; i < yTicks.length; i++) {
            const yv = yTicks[i];
            const py = yScale(yv);
            if (py < top - 0.5 || py > bottom + 0.5) { continue; }
            const line = svgEl("line");
            attrs(line, {
                "x1": left, "y1": py.toFixed(1), "x2": right, "y2": py.toFixed(1),
                "stroke": tokens.grid, "stroke-width": "1", "shape-rendering": "crispEdges"
            });
            gGrid.appendChild(line);
            if (col === 0) {
                const t = svgEl("text");
                attrs(t, {
                    "x": (left - 5).toFixed(1),
                    "y": (py + 3 * fs).toFixed(1),
                    "text-anchor": "end",
                    "font-size": (9 * fs).toFixed(1),
                    "fill": tokens.muted,
                    "data-axis": "y"
                });
                t.appendChild(textNode(opts.formatY ? opts.formatY(yv) : String(yv)));
                gGrid.appendChild(t);
            }
        }

        // X-Gridlines + Labels
        const facetKey = facetsIn[plan.idx] ? facetsIn[plan.idx].key : "";
        for (let i = 0; i < xTickVals.length; i++) {
            const tv = xTickVals[i];
            const px = xScale(tv);
            if (px < left - 0.5 || px > right + 0.5) { continue; }
            const line = svgEl("line");
            attrs(line, {
                "x1": px.toFixed(1), "y1": top, "x2": px.toFixed(1), "y2": bottom,
                "stroke": tokens.grid, "stroke-width": "1", "shape-rendering": "crispEdges"
            });
            gGrid.appendChild(line);
            const raw = plan.stats.scale === "log" ? Math.pow(10, tv) : tv;
            const t = svgEl("text");
            let anchor = "middle";
            if (px - left < 12) { anchor = "start"; }
            else if (right - px < 12) { anchor = "end"; }
            attrs(t, {
                "x": px.toFixed(1),
                "y": (bottom + 10 * fs).toFixed(1),
                "text-anchor": anchor,
                "font-size": (9 * fs).toFixed(1),
                "fill": tokens.muted,
                "data-axis": "x"
            });
            t.appendChild(textNode(opts.formatX ? opts.formatX(facetKey, raw) : String(raw)));
            gGrid.appendChild(t);
        }

        // Regression (unter den Punkten)
        const gReg = svgEl("g");
        svg.appendChild(gReg);
        if (opts.regression === "overall" && plan.stats.overall) {
            drawFit(gReg, plan.stats.overall, plan.txMin, plan.txMax,
                tokens.accent, 0.75, xLo, xHi, xScale, yScale, top, bottom, left, right);
        } else if (opts.regression === "byColor") {
            plan.stats.byColor.forEach(function (gf, key) {
                const rg = plan.ranges.get(key);
                if (!rg) { return; }
                drawFit(gReg, gf, rg.lo, rg.hi, colorFor(key), 0.8,
                    xLo, xHi, xScale, yScale, top, bottom, left, right);
            });
        }

        // Punkte
        const gPts = svgEl("g");
        svg.appendChild(gPts);
        for (let i = 0; i < plan.pts.length; i++) {
            const pt = plan.pts[i];
            const cx = xScale(pt.tx);
            const cy = yScale(pt.y);
            if (cx < left - 20 || cx > right + 20) { continue; }
            const dimmed = opts.dim ? opts.dim(pt.row) === true : false;
            const rad = radiusFor(pt.row);
            const c = svgEl("circle") as SVGCircleElement;
            const strokeCol = dimmed ? "none" : tokens.card;
            const strokeW = dimmed ? 0 : 1.5;
            const op = dimmed ? 0.15 : 0.85;
            attrs(c, {
                "cx": cx.toFixed(2),
                "cy": cy.toFixed(2),
                "r": rad.toFixed(2),
                "fill": colorFor(pt.color),
                "fill-opacity": String(op),
                "stroke": strokeCol,
                "stroke-width": String(strokeW),
                "data-row": String(pt.row)
            });
            c.style.cursor = "pointer";
            gPts.appendChild(c);

            const mark: Mark = {
                el: c, facet: p, baseR: rad, baseOpacity: op,
                baseStroke: strokeCol, baseStrokeW: strokeW,
                cx: cx, cy: cy,
                label: rows[pt.row] ? rows[pt.row].label : ""
            };
            if (!marksByRow[pt.row]) { marksByRow[pt.row] = []; }
            marksByRow[pt.row].push(mark);
        }

        // Label-Ebene ganz oben
        const gLabels = svgEl("g") as SVGGElement;
        attrs(gLabels, { "pointer-events": "none" });
        svg.appendChild(gLabels);
        hoverLayers[p] = gLabels;

        // Delegierte Zeiger-Ereignisse
        const facetPos = p;
        svg.addEventListener("pointerover", function (ev: Event) {
            const r = rowOf(ev.target);
            if (r === null) { return; }
            hoverRow = r;
            hoverFacet = facetPos;
            refreshEmphasis();
            if (opts.onHover) { opts.onHover(r, facetPos, ev as PointerEvent); }
        });
        svg.addEventListener("pointerout", function (ev: Event) {
            if (rowOf(ev.target) === null) { return; }
            hoverRow = null;
            hoverFacet = null;
            refreshEmphasis();
            if (opts.onHoverEnd) { opts.onHoverEnd(); }
        });
        svg.addEventListener("click", function (ev: MouseEvent) {
            const r = rowOf(ev.target);
            if (r === null) { return; }
            ev.stopPropagation();
            if (opts.onClick) { opts.onClick(r, ev); }
        });
    }

    refreshEmphasis();

    /* --- Fusszeile ------------------------------------------------------ */

    if (footerText.length > 0) {
        const foot = div();
        foot.style.boxSizing = "border-box";
        foot.style.flex = "0 0 auto";
        foot.style.borderTop = "1px solid " + tokens.border;
        foot.style.padding = "5px " + PAD + "px";
        foot.style.color = tokens.muted;
        foot.style.fontSize = fFs.toFixed(1) + "px";
        foot.style.lineHeight = "1.35";
        foot.style.overflow = "hidden";
        foot.style.display = "-webkit-box";
        foot.style.setProperty("-webkit-line-clamp", "2");
        foot.style.setProperty("-webkit-box-orient", "vertical");
        foot.style.maxHeight = Math.round(2 * fFs * 1.35) + "px";
        foot.appendChild(textNode(footerText));
        foot.title = footerText;
        container.appendChild(foot);
    }
}

/* ------------------------------------------------------------------ *
 * lokale Bausteine
 * ------------------------------------------------------------------ */

function rowOf(target: EventTarget | null): number | null {
    const t = target as Element;
    if (!t || typeof t.getAttribute !== "function") { return null; }
    const a = t.getAttribute("data-row");
    if (a === null || a === undefined || a === "") { return null; }
    const n = parseInt(a, 10);
    return isFinite(n) ? n : null;
}

function appendHint(host: HTMLElement, msg: string, tokens: RenderTokens, fs: number): void {
    const box = div();
    box.style.boxSizing = "border-box";
    box.style.width = "100%";
    box.style.height = "100%";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.textAlign = "center";
    box.style.padding = "12px";
    box.style.color = tokens.muted;
    box.style.fontSize = (11 * fs).toFixed(1) + "px";
    box.style.fontFamily = FONT_STACK;
    box.appendChild(textNode(msg));
    host.appendChild(box);
}

function makeChip(
    name: string, color: string, idx: number,
    tokens: RenderTokens, fontPx: number, opts: RenderOptions
): HTMLDivElement {
    const chip = div();
    chip.style.boxSizing = "border-box";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "5px";
    chip.style.padding = "2px 8px";
    chip.style.border = "1px solid " + tokens.border;
    chip.style.borderRadius = "999px";
    chip.style.background = tokens.card;
    chip.style.color = tokens.ink;
    chip.style.fontSize = fontPx.toFixed(1) + "px";
    chip.style.lineHeight = "1.5";
    chip.style.whiteSpace = "nowrap";
    chip.style.cursor = "pointer";
    chip.style.flex = "0 0 auto";
    chip.style.maxWidth = "160px";
    chip.style.overflow = "hidden";

    const dot = div();
    const d = Math.max(6, Math.round(fontPx * 0.72));
    dot.style.width = d + "px";
    dot.style.height = d + "px";
    dot.style.borderRadius = "50%";
    dot.style.background = color;
    dot.style.flex = "0 0 auto";
    chip.appendChild(dot);

    const txt = div();
    txt.style.overflow = "hidden";
    txt.style.textOverflow = "ellipsis";
    txt.style.whiteSpace = "nowrap";
    txt.appendChild(textNode(name));
    chip.appendChild(txt);
    chip.title = name;

    chip.addEventListener("click", function (ev: MouseEvent) {
        ev.stopPropagation();
        if (opts.onLegendClick) { opts.onLegendClick(idx, ev); }
    });
    return chip;
}

/** Zeichnet eine Fit-Gerade, geklemmt auf Datenbereich und Plotflaeche. */
function drawFit(
    host: SVGElement, fit: OlsFit, lo: number, hi: number,
    color: string, opacity: number,
    xLo: number, xHi: number,
    xScale: (v: number) => number, yScale: (v: number) => number,
    top: number, bottom: number, left: number, right: number
): void {
    if (!fit || !isFinite(lo) || !isFinite(hi)) { return; }
    let a = Math.max(lo, xLo);
    let b = Math.min(hi, xHi);
    if (!(b > a)) {
        if (!(hi > lo)) { return; }
        a = lo; b = hi;
    }
    const x1 = xScale(a);
    const x2 = xScale(b);
    const y1 = yScale(fit.slope * a + fit.intercept);
    const y2 = yScale(fit.slope * b + fit.intercept);
    const cl = clipToBand(x1, y1, x2, y2, top, bottom);
    if (!cl) { return; }
    const cx1 = Math.max(left, Math.min(right, cl[0]));
    const cx2 = Math.max(left, Math.min(right, cl[2]));
    const line = svgEl("line");
    attrs(line, {
        "x1": cx1.toFixed(2), "y1": cl[1].toFixed(2),
        "x2": cx2.toFixed(2), "y2": cl[3].toFixed(2),
        "stroke": color, "stroke-width": "2", "stroke-opacity": String(opacity),
        "stroke-linecap": "round", "pointer-events": "none"
    });
    host.appendChild(line);
}
