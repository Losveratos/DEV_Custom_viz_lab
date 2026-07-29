"use strict";

/**
 * Host-independent SVG column chart renderer.
 *
 * Mark spec: columns <= 24px thick, 4px rounded data-end, square at the
 * baseline, >= 2px surface gap between neighbors, hairline gridlines,
 * one selective direct label on the extreme value. Text never wears the
 * series color.
 */

export interface BarDatum {
    category: string;
    value: number;
    color: string;
    /** null when the dataset carries no highlights at all */
    highlighted: boolean | null;
    selected: boolean;
}

export interface RenderTokens {
    surface: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridline: string;
    baseline: string;
}

export interface RenderOptions {
    width: number;
    height: number;
    tokens: RenderTokens;
    showLabel: boolean;
    labelFontSize: number;
    hasSelection: boolean;
    formatValue: (v: number) => string;
    formatCompact: (v: number) => string;
    onBarPointerOver?: (d: BarDatum, index: number, ev: PointerEvent) => void;
    onBarPointerMove?: (d: BarDatum, index: number, ev: PointerEvent) => void;
    onBarPointerOut?: (d: BarDatum, index: number, ev: PointerEvent) => void;
    onBarClick?: (d: BarDatum, index: number, ev: MouseEvent) => void;
    onBarContextMenu?: (d: BarDatum, index: number, ev: MouseEvent) => void;
    onBackgroundClick?: (ev: MouseEvent) => void;
    onBackgroundContextMenu?: (ev: MouseEvent) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MAX_BAR_WIDTH = 24;
const END_RADIUS = 4;
const MIN_GAP = 2;

let measureCtx: CanvasRenderingContext2D | null = null;

function textWidth(text: string, fontSize: number, weight: string = "400"): number {
    if (!measureCtx) {
        measureCtx = document.createElement("canvas").getContext("2d");
    }
    if (!measureCtx) {
        return text.length * fontSize * 0.6;
    }
    measureCtx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
    return measureCtx.measureText(text).width;
}

function truncate(text: string, fontSize: number, maxWidth: number): string {
    if (textWidth(text, fontSize) <= maxWidth) {
        return text;
    }
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (textWidth(text.slice(0, mid) + "…", fontSize) <= maxWidth) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo === 0 ? "" : text.slice(0, lo) + "…";
}

function el<K extends keyof SVGElementTagNameMap>(
    parent: Element,
    tag: K,
    attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const key of Object.keys(attrs)) {
        node.setAttribute(key, String(attrs[key]));
    }
    parent.appendChild(node);
    return node;
}

/** Clean tick steps: 1/2/2.5/5 x 10^k, aiming for ~targetCount intervals. */
export function niceTicks(min: number, max: number, targetCount: number): number[] {
    const span = max - min;
    if (span <= 0) {
        return [min];
    }
    const rawStep = span / targetCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const start = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= max + step * 1e-6; v += step) {
        ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    }
    return ticks;
}

/** Column path: 4px rounded corners at the data end, square at the baseline. */
function columnPath(x: number, w: number, yBase: number, yEnd: number): string {
    const up = yEnd < yBase;
    const h = Math.abs(yBase - yEnd);
    const r = Math.min(END_RADIUS, w / 2, h);
    if (r <= 0.25) {
        return `M${x},${yBase} L${x},${yEnd} L${x + w},${yEnd} L${x + w},${yBase} Z`;
    }
    const sign = up ? 1 : -1;
    return [
        `M${x},${yBase}`,
        `L${x},${yEnd + sign * r}`,
        `Q${x},${yEnd} ${x + r},${yEnd}`,
        `L${x + w - r},${yEnd}`,
        `Q${x + w},${yEnd} ${x + w},${yEnd + sign * r}`,
        `L${x + w},${yBase}`,
        "Z"
    ].join(" ");
}

export function renderBarChart(svg: SVGSVGElement, data: BarDatum[], opts: RenderOptions): void {
    const { width, height, tokens } = opts;

    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.fontFamily = FONT_STACK;
    svg.style.display = "block";

    const background = el(svg, "rect", { x: 0, y: 0, width, height, fill: tokens.surface });
    background.addEventListener("click", (ev: MouseEvent) => opts.onBackgroundClick?.(ev));
    background.addEventListener("contextmenu", (ev: MouseEvent) => opts.onBackgroundContextMenu?.(ev));

    if (!data.length || width < 60 || height < 60) {
        return;
    }

    const tickFontSize = 10;
    const catFontSize = 11;
    const labelFontSize = opts.labelFontSize;

    const minV = Math.min(0, ...data.map((d) => d.value));
    const maxV = Math.max(0, ...data.map((d) => d.value));
    const ticks = niceTicks(minV, maxV, 4);
    const domainMin = Math.min(minV, ticks[0]);
    const domainMax = Math.max(maxV, ticks[ticks.length - 1]);

    const tickLabels = ticks.map((t) => opts.formatValue(t));
    const axisWidth = Math.ceil(Math.max(...tickLabels.map((t) => textWidth(t, tickFontSize))));

    const margin = {
        top: opts.showLabel ? labelFontSize + 10 : 8,
        right: 8,
        bottom: catFontSize + 12,
        left: axisWidth + 10
    };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    if (plotW < 20 || plotH < 20) {
        return;
    }

    const yScale = (v: number): number =>
        margin.top + plotH - ((v - domainMin) / (domainMax - domainMin)) * plotH;
    const yZero = yScale(0);

    // Recessive chrome: hairline gridlines, muted tick labels.
    for (let i = 0; i < ticks.length; i++) {
        const y = yScale(ticks[i]);
        if (ticks[i] !== 0) {
            el(svg, "line", {
                x1: margin.left, x2: width - margin.right, y1: y, y2: y,
                stroke: tokens.gridline, "stroke-width": 1, "shape-rendering": "crispEdges"
            });
        }
        el(svg, "text", {
            x: margin.left - 6, y: y + tickFontSize * 0.35,
            "text-anchor": "end", "font-size": tickFontSize, fill: tokens.textMuted
        }).textContent = tickLabels[i];
    }
    el(svg, "line", {
        x1: margin.left, x2: width - margin.right, y1: yZero, y2: yZero,
        stroke: tokens.baseline, "stroke-width": 1, "shape-rendering": "crispEdges"
    });

    const n = data.length;
    const slot = plotW / n;
    const gap = Math.max(MIN_GAP, slot * 0.25);
    const barW = Math.max(1, Math.min(MAX_BAR_WIDTH, slot - gap));

    const hasHighlights = data.some((d) => d.highlighted !== null);
    let extremeIndex = 0;
    for (let i = 1; i < n; i++) {
        if (Math.abs(data[i].value) > Math.abs(data[extremeIndex].value)) {
            extremeIndex = i;
        }
    }

    data.forEach((d, i) => {
        const x = margin.left + slot * i + (slot - barW) / 2;
        const yEnd = yScale(d.value);

        const dimmed =
            (opts.hasSelection && !d.selected) ||
            (hasHighlights && d.highlighted === false);

        if (d.value !== 0) {
            el(svg, "path", {
                d: columnPath(x, barW, yZero, yEnd),
                fill: d.color,
                "fill-opacity": dimmed ? 0.3 : 1
            });
        }

        // Selective direct label: only the extreme value, in text ink.
        if (opts.showLabel && i === extremeIndex && d.value !== 0) {
            const label = opts.formatCompact(d.value);
            if (textWidth(label, labelFontSize, "600") <= slot + gap) {
                const up = d.value > 0;
                el(svg, "text", {
                    x: x + barW / 2,
                    y: up ? yEnd - 5 : yEnd + labelFontSize + 3,
                    "text-anchor": "middle",
                    "font-size": labelFontSize,
                    "font-weight": 600,
                    fill: tokens.textPrimary
                }).textContent = label;
            }
        }

        const catLabel = truncate(d.category, catFontSize, slot - 4);
        if (catLabel) {
            el(svg, "text", {
                x: margin.left + slot * i + slot / 2,
                y: height - margin.bottom + catFontSize + 5,
                "text-anchor": "middle",
                "font-size": catFontSize,
                fill: tokens.textSecondary
            }).textContent = catLabel;
        }

        // Hit target: the whole slot, taller than the mark itself.
        const hit = el(svg, "rect", {
            x: margin.left + slot * i, y: margin.top, width: slot, height: plotH,
            fill: "transparent"
        });
        hit.style.cursor = "pointer";
        hit.addEventListener("pointerover", (ev: PointerEvent) => opts.onBarPointerOver?.(d, i, ev));
        hit.addEventListener("pointermove", (ev: PointerEvent) => opts.onBarPointerMove?.(d, i, ev));
        hit.addEventListener("pointerout", (ev: PointerEvent) => opts.onBarPointerOut?.(d, i, ev));
        hit.addEventListener("click", (ev: MouseEvent) => {
            ev.stopPropagation();
            opts.onBarClick?.(d, i, ev);
        });
        hit.addEventListener("contextmenu", (ev: MouseEvent) => {
            ev.stopPropagation();
            opts.onBarContextMenu?.(d, i, ev);
        });
    });
}
