"use strict";

/* Wärmestreifen 3D — WebGL-Renderer (Port des Standalone-Artifacts für Power BI).
 * Vier Darstellungsformen über einem Raster: X = Zeit, Z = Ort, Y = Abweichung.
 * Eigene Orbit-Steuerung, damit animierte Kamerafahrten zu den kuratierten
 * Perspektiven nicht mit der Nutzereingabe kollidieren.
 * Änderungen gegenüber dem Original: three.js statisch gebündelt statt vom CDN,
 * Jahresachse als explizites Array (Power BI liefert ggf. gefilterte Bereiche),
 * Baseline-Offsets werden vom Host gerechnet und als Array übergeben, Dimming-
 * Callback für Cross-Filtering, Kontextmenü-Hook.
 */

import * as THREE from "three";

const CW = 0.60;   // Breite pro Jahr
const CD = 2.20;   // Tiefe pro Ort
const YU = 3.10;   // Welteinheiten pro °C
const PLATE_H = 13;

export interface VizCity { n: string; a: (number | null)[]; }
export interface VizData { years: number[]; cities: VizCity[]; }

export interface VizState {
    form: "bars" | "terrain" | "curtain" | "stripes";
    scheme: string;
    vScale: number;
    smooth: number;
    order: number[];
    grid: boolean;
    reveal: number;
    focus: number | null;
    labels: "min" | "axes";
    theme: "light" | "dark";
    offsets: number[];
    dim: ((ci: number, i: number) => boolean) | null;
}

export interface VizHover {
    k: number; i: number; ci: number;
    year: number; value: number; city: VizCity;
    clientX: number; clientY: number;
}

type RGB = [number, number, number];

const RAMPS: Record<string, [number, string][]> = {
    stripes: [[-3, "#08306b"], [-2, "#2166ac"], [-1, "#4393c3"], [-0.5, "#92c5de"], [-0.15, "#d1e5f0"],
              [0, "#f7f7f7"], [0.15, "#fddbc7"], [0.5, "#f4a582"], [1, "#d6604d"], [2, "#b2182b"], [3.2, "#67001f"]],
    steel:   [[-3, "#10263a"], [-2, "#1d2d3d"], [-1.2, "#41617f"], [-0.5, "#749dc4"], [-0.15, "#b5d9fd"],
              [0, "#e9e9ea"], [0.15, "#f0d3bd"], [0.6, "#dda17a"], [1.3, "#c5713f"], [2.2, "#9e4526"], [3.2, "#6b2415"]],
    mono:    [[-3, "#f5f5f8"], [-1.5, "#dfe6ee"], [-0.4, "#b8c6d4"], [0, "#94aabe"], [0.5, "#6f89a3"],
              [1.2, "#4c6580"], [2.2, "#2c455d"], [3.2, "#14202c"]],
};
function hexRGB(h: string): RGB { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const RAMP_CACHE: Record<string, (v: number) => RGB> = {};
function rampFn(name: string): (v: number) => RGB {
    if (RAMP_CACHE[name]) return RAMP_CACHE[name];
    const stops: [number, RGB][] = (RAMPS[name] || RAMPS.stripes).map(([v, h]) => [v, hexRGB(h)] as [number, RGB]);
    const f = (v: number): RGB => {
        if (v <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) {
            if (v <= stops[i][0]) {
                const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (v - a) / (b - a);
                return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
            }
        }
        return stops[stops.length - 1][1];
    };
    RAMP_CACHE[name] = f; return f;
}
export function rampCss(name: string, v: number): string {
    const [r, g, b] = rampFn(name)(v);
    return "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
}
export const RAMP_NAMES = Object.keys(RAMPS);

const PRESETS: Record<string, { theta: number; phi: number; zoom: number }> = {
    /* Thetas so gewählt, dass die Zeit im Bild von links (Start) nach rechts (heute) läuft. */
    iso:    { theta: 0.92, phi: 1.02, zoom: 1.06 },
    top:    { theta: Math.PI / 2 - 0.0001, phi: 0.055, zoom: 1.02 },
    time:   { theta: Math.PI / 2, phi: Math.PI / 2 - 0.02, zoom: 1.04 },
    place:  { theta: Math.PI - 0.0001, phi: Math.PI / 2 - 0.03, zoom: 1.10 },
    graze:  { theta: 1.42, phi: 1.40, zoom: 1.02 },
};
export const PRESET_KEYS = Object.keys(PRESETS);

const THEMES = {
    light: { bg: "#f2f2f3", ink: "#1d1f20", accent: "#5980a6" },
    dark:  { bg: "#11161c", ink: "#e6eaee", accent: "#7fa6cc" },
};

export interface Viz {
    setState(patch: Partial<VizState>): void;
    setPreset(name: string): void;
    render(): void;
    onHover(f: (h: VizHover | null) => void): void;
    onPick(f: (h: VizHover) => void): void;
    onPickMiss(f: () => void): void;
    onContext(f: (h: VizHover | null, x: number, y: number) => void): void;
    onZoom(f: (percent: number) => void): void;
    setHighlight(ci: number | null): void;
    resize(): void;
    readonly state: VizState;
    dispose(): void;
}

export function createViz(container: HTMLElement, data: VizData, initial: Partial<VizState>): Viz {
    const years = data.years;
    const nY = years.length;

    const state: VizState = Object.assign({
        form: "bars", scheme: "stripes", vScale: 1, smooth: 0,
        order: [], grid: true, reveal: 1, focus: null, labels: "axes", theme: "light",
        offsets: [], dim: null,
    } as VizState, initial || {});

    /* ---------- Szene ---------- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color().setStyle(THEMES.light.bg);
    const fog = new THREE.Fog(new THREE.Color().setStyle(THEMES.light.bg), 190, 430);
    scene.fog = fog;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    const canvas = renderer.domElement;
    Object.assign(canvas.style, { display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "grab" });
    container.appendChild(canvas);

    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    container.appendChild(overlay);

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.40); d1.position.set(40, 110, 34); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.16); d2.position.set(-60, 36, -80); scene.add(d2);

    const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e5);
    const dataRoot = new THREE.Group(); scene.add(dataRoot);
    const chrome = new THREE.Group(); scene.add(chrome);

    /* ---------- Layout ---------- */
    let order = state.order.length ? state.order.slice() : data.cities.map((_, i) => i);
    const xOf = (i: number) => (i - (nY - 1) / 2) * CW;
    const zOf = (k: number) => (k - (order.length - 1) / 2) * CD;
    const yOf = (v: number) => v * YU * state.vScale;
    const off = (ci: number) => state.offsets[ci] || 0;
    /* Datenlücken: Stationsreihen decken selten den ganzen Zeitraum ab.
       has() entscheidet, ob eine Marke überhaupt gezeichnet wird; raw()
       hält für die Flächenformen den nächstgelegenen bekannten Wert, damit
       keine künstlichen Kältesprünge auf 0 entstehen. */
    const has = (ci: number, i: number) => {
        const v = data.cities[ci].a[i];
        return v !== null && v !== undefined && isFinite(v);
    };
    const nearest: (number[] | null)[] = data.cities.map(() => null);
    const raw = (ci: number, i: number): number => {
        const a = data.cities[ci].a;
        if (has(ci, i)) return a[i] as number;
        let map = nearest[ci];
        if (!map) {
            // je Index den nächstgelegenen belegten Jahrgang vormerken
            map = new Array(nY).fill(-1);
            let last = -1;
            for (let k = 0; k < nY; k++) { if (has(ci, k)) last = k; map[k] = last; }
            let next = -1;
            for (let k = nY - 1; k >= 0; k--) {
                if (has(ci, k)) next = k;
                else if (map[k] < 0 || (next >= 0 && next - k < k - map[k])) map[k] = next;
            }
            nearest[ci] = map;
        }
        const j = map[i];
        return j < 0 ? 0 : (a[j] as number);
    };
    const val = (ci: number, i: number) => {
        const o = off(ci), w = state.smooth | 0;
        if (!w) return raw(ci, i) - o;
        let s = 0, n = 0;
        for (let k = i - w; k <= i + w; k++) { s += raw(ci, Math.max(0, Math.min(nY - 1, k))); n++; }
        return s / n - o;
    };
    const X0 = xOf(0) - CW / 2, X1 = xOf(nY - 1) + CW / 2;
    let Z0 = 0, Z1 = 0;
    function zBounds() {
        if (!order.length) { Z0 = -CD / 2; Z1 = CD / 2; return; }
        Z0 = zOf(0) - CD / 2; Z1 = zOf(order.length - 1) + CD / 2;
    }
    zBounds();

    /* ---------- Materialien ---------- */
    const matSolid = new THREE.MeshLambertMaterial({ color: 0xffffff, clippingPlanes: [clip] });
    const matVerts = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [clip] });
    const matLine = new THREE.LineBasicMaterial({ color: new THREE.Color().setStyle("#1d1f20"), transparent: true, opacity: 0.20 });
    const matLineF = new THREE.LineBasicMaterial({ color: new THREE.Color().setStyle("#1d1f20"), transparent: true, opacity: 0.42 });

    const theme = () => THEMES[state.theme] || THEMES.light;
    function applyTheme() {
        const T = theme();
        (scene.background as THREE.Color).setStyle(T.bg); scene.fog.color.setStyle(T.bg);
        matLine.color.setStyle(T.ink); matLineF.color.setStyle(T.ink);
        if (frontEdge) (frontEdge.material as THREE.MeshBasicMaterial).color.setStyle(T.accent);
        if (focusMark) (focusMark.material as THREE.MeshBasicMaterial).color.setStyle(T.ink);
        if (rowMark) (rowMark.material as THREE.MeshBasicMaterial).color.setStyle(T.accent);
    }

    /* Cross-Filter-Dimmung: nicht selektierte Werte Richtung Hintergrund mischen. */
    function shade(ci: number, i: number, c: RGB): RGB {
        if (!state.dim || !state.dim(ci, i)) return c;
        const bg = hexRGB(theme().bg), t = 0.78;
        return [c[0] + (bg[0] - c[0]) * t, c[1] + (bg[1] - c[1]) * t, c[2] + (bg[2] - c[2]) * t];
    }

    let bars: THREE.InstancedMesh | null = null, surface: THREE.Mesh | null = null;
    let curtains: THREE.Group | null = null, plates: THREE.Group | null = null;
    let activeObj: THREE.Object3D | null = null;
    const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion();
    const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();

    function clearData() {
        dataRoot.clear();
        [bars, surface, curtains, plates].forEach(o => {
            if (o) o.traverse((n: any) => { if (n.geometry) n.geometry.dispose(); });
        });
        bars = surface = curtains = plates = null;
    }

    function buildBars() {
        const g = new THREE.BoxGeometry(CW * 0.92, 1, CD * 0.86);
        g.translate(0, 0.5, 0);
        bars = new THREE.InstancedMesh(g, matSolid, order.length * nY);
        bars.frustumCulled = false;
        dataRoot.add(bars); activeObj = bars;
    }
    function fillBars() {
        const ramp = rampFn(state.scheme);
        let n = 0;
        for (let k = 0; k < order.length; k++) {
            const ci = order[k], z = zOf(k);
            for (let i = 0; i < nY; i++) {
                const v = val(ci, i), h = yOf(v);
                tmpP.set(xOf(i), 0, z);
                tmpS.set(1, Math.abs(h) < 0.05 ? 0.05 : Math.abs(h), 1);
                if (h < 0) tmpS.y = -tmpS.y;
                if (!has(ci, i)) tmpS.set(0, 0, 0);   // Lücke: keine Marke
                bars.setMatrixAt(n, tmpM.compose(tmpP, tmpQ.identity(), tmpS));
                const c = shade(ci, i, ramp(v));
                tmpC.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
                bars.setColorAt(n, tmpC);
                n++;
            }
        }
        bars.count = n;
        bars.instanceMatrix.needsUpdate = true;
        if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    }

    function buildSurface() {
        const nz = order.length, pos = new Float32Array(nY * nz * 3), col = new Float32Array(nY * nz * 3);
        const idx: number[] = [];
        for (let k = 0; k < nz; k++) for (let i = 0; i < nY; i++) {
            if (k < nz - 1 && i < nY - 1) {
                const a = k * nY + i, b = a + 1, c = (k + 1) * nY + i, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        g.setIndex(idx);
        surface = new THREE.Mesh(g, matVerts);
        surface.frustumCulled = false;
        dataRoot.add(surface); activeObj = surface;
    }
    function fillSurface() {
        const ramp = rampFn(state.scheme), g = surface.geometry;
        const pos = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
        const col = (g.attributes.color as THREE.BufferAttribute).array as Float32Array;
        let p = 0;
        for (let k = 0; k < order.length; k++) {
            const ci = order[k], z = zOf(k);
            for (let i = 0; i < nY; i++) {
                const v = val(ci, i);
                pos[p] = xOf(i); pos[p + 1] = yOf(v); pos[p + 2] = z;
                const c = shade(ci, i, ramp(v));
                tmpC.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
                col[p] = tmpC.r; col[p + 1] = tmpC.g; col[p + 2] = tmpC.b;
                p += 3;
            }
        }
        (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        g.computeVertexNormals();
    }

    /* Kurven-Bänder: pro Ort eine Wand von y=0 zur Abweichung, mit Deckfläche. */
    function buildCurtains() {
        curtains = new THREE.Group();
        for (let k = 0; k < order.length; k++) {
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nY * 6 * 3), 3));
            g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(nY * 6 * 3), 3));
            const idx: number[] = [];
            for (let i = 0; i < nY - 1; i++) {
                const f0 = i * 2, f1 = f0 + 1, f2 = (i + 1) * 2, f3 = f2 + 1;
                idx.push(f0, f2, f1, f1, f2, f3);
                const B = nY * 2, b0 = B + i * 2, b1 = b0 + 1, b2 = B + (i + 1) * 2, b3 = b2 + 1;
                idx.push(b0, b1, b2, b1, b3, b2);
                const T = nY * 4, t0 = T + i * 2, t1 = t0 + 1, t2 = T + (i + 1) * 2, t3 = t2 + 1;
                idx.push(t0, t2, t1, t1, t2, t3);
            }
            g.setIndex(idx);
            const m = new THREE.Mesh(g, matVerts);
            m.frustumCulled = false;
            m.userData.k = k;
            curtains.add(m);
        }
        dataRoot.add(curtains); activeObj = curtains;
    }
    function fillCurtains() {
        const ramp = rampFn(state.scheme), t = CD * 0.24;
        curtains.children.forEach((m: any, k: number) => {
            const ci = order[k], z = zOf(k), g = m.geometry;
            const pos = g.attributes.position.array, col = g.attributes.color.array;
            const put = (n: number, x: number, y: number, zz: number, c: RGB) => {
                pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = zz;
                tmpC.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
                col[n * 3] = tmpC.r; col[n * 3 + 1] = tmpC.g; col[n * 3 + 2] = tmpC.b;
            };
            for (let i = 0; i < nY; i++) {
                const v = val(ci, i), y = yOf(v), c = shade(ci, i, ramp(v)), x = xOf(i);
                put(i * 2, x, 0, z - t, c); put(i * 2 + 1, x, y, z - t, c);
                put(nY * 2 + i * 2, x, 0, z + t, c); put(nY * 2 + i * 2 + 1, x, y, z + t, c);
                put(nY * 4 + i * 2, x, y, z - t, c); put(nY * 4 + i * 2 + 1, x, y, z + t, c);
            }
            g.attributes.position.needsUpdate = true;
            g.attributes.color.needsUpdate = true;
            g.computeVertexNormals();
        });
    }

    /* Streifen-Tafeln: klassische Warming Stripes als aufgestellte Platten. */
    function buildPlates() {
        plates = new THREE.Group();
        for (let k = 0; k < order.length; k++) {
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nY * 4 * 3), 3));
            g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(nY * 4 * 3), 3));
            const idx: number[] = []; for (let i = 0; i < nY; i++) { const a = i * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
            g.setIndex(idx);
            const m = new THREE.Mesh(g, matVerts); m.frustumCulled = false; m.userData.k = k;
            plates.add(m);
        }
        dataRoot.add(plates); activeObj = plates;
    }
    function fillPlates() {
        const ramp = rampFn(state.scheme);
        plates.children.forEach((m: any, k: number) => {
            const ci = order[k], z = zOf(k), g = m.geometry;
            const pos = g.attributes.position.array, col = g.attributes.color.array;
            const H = PLATE_H * state.vScale;
            for (let i = 0; i < nY; i++) {
                const v = val(ci, i), c = shade(ci, i, ramp(v)), a = i * 4;
                const gap = !has(ci, i);   // Lücke: entartete Fläche, nichts sichtbar
                const x0 = gap ? 0 : xOf(i) - CW / 2, x1 = gap ? 0 : xOf(i) + CW / 2;
                const q = [[x0, 0], [x1, 0], [x1, gap ? 0 : H], [x0, gap ? 0 : H]];
                for (let j = 0; j < 4; j++) {
                    pos[(a + j) * 3] = q[j][0]; pos[(a + j) * 3 + 1] = q[j][1]; pos[(a + j) * 3 + 2] = z;
                    tmpC.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
                    col[(a + j) * 3] = tmpC.r; col[(a + j) * 3 + 1] = tmpC.g; col[(a + j) * 3 + 2] = tmpC.b;
                }
            }
            g.attributes.position.needsUpdate = true;
            g.attributes.color.needsUpdate = true;
            g.computeVertexNormals();
        });
    }

    function rebuild() {
        clearData(); zBounds();
        if (state.form === "bars") { buildBars(); fillBars(); }
        else if (state.form === "terrain") { buildSurface(); fillSurface(); }
        else if (state.form === "curtain") { buildCurtains(); fillCurtains(); }
        else { buildPlates(); fillPlates(); }
        buildChrome(); syncLabels();
    }
    function refill() {
        if (state.form === "bars") fillBars();
        else if (state.form === "terrain") fillSurface();
        else if (state.form === "curtain") fillCurtains();
        else fillPlates();
    }

    /* ---------- Raster / Achsenkäfig ---------- */
    let frontEdge: THREE.Mesh | null = null, focusMark: THREE.Mesh | null = null;
    let rowMark: THREE.Mesh | null = null, highlightCi: number | null = null;
    function buildChrome() {
        chrome.clear();
        if (frontEdge) frontEdge.geometry.dispose();
        frontEdge = null; focusMark = null;
        if (!state.grid) { addMarkers(); return; }
        const pts: number[] = [], fpts: number[] = [];
        // Bodenraster
        for (let i = 0; i < nY; i++) {
            const y = years[i];
            if (y % 10 === 0) { const x = xOf(i) - CW / 2; (y % 50 === 0 ? fpts : pts).push(x, 0, Z0, x, 0, Z1); }
        }
        for (let k = 0; k <= order.length; k++) { if (k % 5 === 0 || k === order.length) { const z = zOf(k) - CD / 2; pts.push(X0, 0, z, X1, 0, z); } }
        fpts.push(X0, 0, Z0, X1, 0, Z0, X1, 0, Z0, X1, 0, Z1, X1, 0, Z1, X0, 0, Z1, X0, 0, Z1, X0, 0, Z0);
        // Rückwand: Höhenlinien in °C
        const span = state.form === "stripes" ? [0, PLATE_H / YU] : [-3, 4];
        const lo = Math.ceil(span[0]), hi = Math.floor(span[1]);
        for (let v = lo; v <= hi; v++) {
            const y = state.form === "stripes" ? v * YU * state.vScale : yOf(v);
            (v === 0 ? fpts : pts).push(X0, y, Z1, X1, y, Z1);
            (v === 0 ? fpts : pts).push(X0, y, Z0, X0, y, Z1);
        }
        for (let i = 0; i < nY; i++) if (years[i] % 25 === 0) {
            const x = xOf(i) - CW / 2;
            pts.push(x, yOf(lo), Z1, x, yOf(hi), Z1);
        }
        const mk = (arr: number[], mat: THREE.LineBasicMaterial) => {
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
            chrome.add(new THREE.LineSegments(g, mat));
        };
        mk(pts, matLine); mk(fpts, matLineF);
        addMarkers();
    }
    function addMarkers() {
        frontEdge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
            color: new THREE.Color().setStyle(theme().accent), transparent: true, opacity: 0.30, side: THREE.DoubleSide }));
        frontEdge.rotation.y = Math.PI / 2; frontEdge.visible = false;
        chrome.add(frontEdge);
        focusMark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
            color: new THREE.Color().setStyle(theme().ink), transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
        focusMark.rotation.y = Math.PI / 2; focusMark.visible = false;
        chrome.add(focusMark);
        rowMark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
            color: new THREE.Color().setStyle(theme().accent), transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false }));
        rowMark.rotation.x = -Math.PI / 2; rowMark.visible = false;
        chrome.add(rowMark);
        applyHighlight();
    }

    /* ---------- Beschriftung (DOM, projiziert) ---------- */
    const labelStore: { city: any[]; year: any[]; tick: any[] } = { city: [], year: [], tick: [] };
    const mkLabel = (txt: string, kind: string) => {
        const el = document.createElement("div");
        el.textContent = txt;
        Object.assign(el.style, {
            position: "absolute", whiteSpace: "nowrap", pointerEvents: "none",
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: theme().ink,
            transform: "translate(-50%,-50%)", willChange: "transform,opacity",
        });
        if (kind === "city") { Object.assign(el.style, { fontSize: "12px", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: "600" }); el.style.textAlign = "center"; }
        if (kind === "year") { Object.assign(el.style, { fontSize: "12px", letterSpacing: "0.06em", opacity: "0.62", fontVariantNumeric: "tabular-nums" }); }
        if (kind === "tick") { Object.assign(el.style, { fontSize: "11px", letterSpacing: "0.06em", opacity: "0.55", fontVariantNumeric: "tabular-nums" }); }
        overlay.appendChild(el); return el;
    };
    function syncLabels() {
        Object.values(labelStore).forEach(a => a.forEach((o: any) => o.el.remove()));
        labelStore.city = []; labelStore.year = []; labelStore.tick = [];
        if (state.labels === "min") return;
        order.forEach((ci, k) => {
            labelStore.city.push({ el: mkLabel(data.cities[ci].n, "city"), k });
        });
        for (let i = 0; i < nY; i++) if (years[i] % 25 === 0 || i === nY - 1 || i === 0) {
            labelStore.year.push({ el: mkLabel(String(years[i]), "year"), i });
        }
        if (state.form !== "stripes") for (let v = -3; v <= 4; v++) {
            if (v === 0) continue;
            labelStore.tick.push({ el: mkLabel((v > 0 ? "+" : "−") + Math.abs(v) + " °C", "tick"), v });
        }
    }
    const proj = new THREE.Vector3(), viewDir = new THREE.Vector3(), anchor = new THREE.Vector3();
    const scr = (x: number, y: number, z: number, w: number, h: number) => {
        anchor.set(x, y, z); proj.copy(anchor).project(camera);
        return { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h, z: proj.z };
    };
    function placeLabels() {
        const w = container.clientWidth, h = container.clientHeight;
        camera.updateMatrixWorld();
        viewDir.copy(camera.position).sub(cam.target).normalize();
        const hideCity = Math.abs(viewDir.z) > 0.93;
        const hideYear = Math.abs(viewDir.x) > 0.93;
        /* Beschriftung immer an die zur Kamera nähere Kante legen. */
        const zMid = (Z0 + Z1) / 2, xMid = (X0 + X1) / 2, cp = camera.position;
        const near = (a: number, b: number, y: number, axis: string) => {
            const da = axis === "x" ? Math.hypot(cp.x - a, cp.y - y, cp.z - zMid) : Math.hypot(cp.x - xMid, cp.y - y, cp.z - a);
            const db = axis === "x" ? Math.hypot(cp.x - b, cp.y - y, cp.z - zMid) : Math.hypot(cp.x - xMid, cp.y - y, cp.z - b);
            return da <= db ? [a, b] : [b, a];
        };
        const [xNear] = near(X1 + 2.4, X0 - 2.4, 0, "x");
        const [zNear, zFar] = near(Z1 + 2.8, Z0 - 2.8, 0, "z");
        const cityX = xNear > 0 ? X1 + 4.2 : X0 - 4.2;
        const xFar2 = near(X1 + 2.4, X0 - 2.4, 0, "x")[1];
        const tickX = xFar2 > 0 ? X1 + 4.2 : X0 - 4.2;
        const tickZ = zFar > 0 ? Z1 + 4.0 : Z0 - 4.0;
        const put = (o: any, x: number, y: number, z: number, hidden: boolean) => {
            const p = scr(x, y, z, w, h);
            o.hidden = hidden || p.z >= 1;
            o.sx = p.x; o.sy = p.y;
            o.el.style.transform = "translate(-50%,-50%) translate(" + p.x + "px," + p.y + "px)";
        };
        labelStore.city.forEach(o => put(o, cityX, 0.4, zOf(o.k), hideCity));
        labelStore.year.forEach(o => put(o, xOf(o.i), 0.3, zNear, hideYear));
        labelStore.tick.forEach(o => put(o, tickX, yOf(o.v), tickZ, false));
        /* Ausdünnen per Mindestabstand auf dem Bildschirm statt festem Raster:
           beim Hineinfahren spreizen sich nahe Labels, ferne stauchen sich —
           gierig von oben nach unten behalten, was 13px Luft hat. */
        const cl = labelStore.city.filter((o: any) => !o.hidden).sort((a: any, b: any) => a.sy - b.sy);
        let lastKept = -1e9;
        for (const o of cl) {
            if (o.sy - lastKept < 13) o.hidden = true;
            else lastKept = o.sy;
        }
        Object.values(labelStore).forEach(list => list.forEach((o: any) => { o.el.style.opacity = o.hidden ? "0" : ""; }));
    }

    /* ---------- Kamera ---------- */
    const cam = { theta: PRESETS.iso.theta, phi: PRESETS.iso.phi, dist: 140, target: new THREE.Vector3() };
    const goal = { theta: cam.theta, phi: cam.phi, dist: cam.dist, target: new THREE.Vector3() };
    let tweening = false, presetName = "iso", userZoom = false;

    function yRange(): [number, number] {
        if (state.form === "stripes") return [0, PLATE_H * state.vScale];
        let lo = 0, hi = 0;
        for (let k = 0; k < order.length; k++) {
            const ci = order[k];
            for (let i = 0; i < nY; i++) { const v = val(ci, i); if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        return [yOf(lo), yOf(hi)];
    }
    /* Abstand exakt auf die projizierte Ausdehnung der Datenbox rechnen, damit
       jede Perspektive das Feld füllt statt es anzuschneiden. */
    function fitDist(theta: number, phi: number, zoom: number) {
        const [yLo, yHi] = yRange();
        const cx = (X0 + X1) / 2, cy = (yLo + yHi) / 2, cz = (Z0 + Z1) / 2;
        const sp = Math.sin(phi);
        const dir = new THREE.Vector3(sp * Math.cos(theta), Math.cos(phi), sp * Math.sin(theta));
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, dir).normalize();
        if (!isFinite(right.x) || right.lengthSq() < 1e-6) right.set(1, 0, 0);
        const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
        const vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.2));
        const tanH = Math.tan(hFov / 2), tanV = Math.tan(vFov / 2);
        /* Pro Ecke exakt lösen statt nur gegen die Mittelebene: bei einem tiefen
           Feld projizieren die kameranahen Ecken deutlich größer und liefen
           sonst aus dem Bild. Kamera sitzt bei p = dist*dir, also ist die
           Tiefe einer Ecke (dist − p·dir); daraus folgt die Mindestdistanz. */
        let d = 0;
        for (const sx of [X0, X1]) for (const sy of [yLo, yHi]) for (const sz of [Z0, Z1]) {
            const p = new THREE.Vector3(sx - cx, sy - cy, sz - cz);
            const along = p.dot(dir);
            d = Math.max(d, along + Math.abs(p.dot(right)) / tanH,
                            along + Math.abs(p.dot(camUp)) / tanV);
        }
        return Math.max(24, d * 1.12 * (zoom || 1));
    }
    function centreTarget(v: THREE.Vector3) {
        const [yLo, yHi] = yRange();
        v.set((X0 + X1) / 2, (yLo + yHi) / 2, (Z0 + Z1) / 2);
    }
    /* Nebel und Rückebene an die tatsächliche Feldgröße koppeln. Feste Werte
       verschlucken bei vielen Orten das halbe Feld: der Abstand wächst mit der
       Ausdehnung, die Staffelung muss mitwachsen. */
    function boundingRadius() {
        const [yLo, yHi] = yRange();
        return Math.hypot((X1 - X0) / 2, (yHi - yLo) / 2, (Z1 - Z0) / 2);
    }
    function updateDepth() {
        const R = boundingRadius();
        fog.near = cam.dist + R * 0.75;
        fog.far = cam.dist + R * 4.5;
        const far = cam.dist + R * 5;
        if (Math.abs(camera.far - far) > 1) { camera.far = far; camera.updateProjectionMatrix(); }
    }
    function applyCam() {
        const sp = Math.sin(cam.phi);
        camera.position.set(
            cam.target.x + cam.dist * sp * Math.cos(cam.theta),
            cam.target.y + cam.dist * Math.cos(cam.phi),
            cam.target.z + cam.dist * sp * Math.sin(cam.theta));
        camera.lookAt(cam.target);
        updateDepth();
    }
    function setPreset(name: string) {
        presetName = PRESETS[name] ? name : "iso";
        const p = PRESETS[presetName];
        userZoom = false;
        goal.theta = p.theta; goal.phi = p.phi;
        centreTarget(goal.target);
        goal.dist = fitDist(p.theta, p.phi, p.zoom);
        tweening = true;
        emitZoom();
    }
    /* Nach Struktur-/Größenänderungen neu einpassen — aber eine manuell
       gefahrene Kameraposition nicht zurückspringen lassen. */
    function refit() {
        if (userZoom) return;
        const p = PRESETS[presetName];
        goal.dist = fitDist(goal.theta, goal.phi, p.zoom);
        if (!tweening) cam.dist = goal.dist;
    }
    function emitZoom() {
        const base = fitDist(goal.theta, goal.phi, PRESETS[presetName].zoom);
        cbs.zoom.forEach(f => f(Math.round((base / goal.dist) * 100)));
    }

    /* ---------- Interaktion ---------- */
    let drag: any = null;
    const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, pan: e.shiftKey || e.button === 2 };
        tweening = false; canvas.style.cursor = drag.pan ? "move" : "grabbing";
    };
    const onMove = (e: PointerEvent) => {
        if (drag) {
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            drag.x = e.clientX; drag.y = e.clientY;
            if (drag.pan) {
                const s = cam.dist * 0.0016;
                const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
                const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
                cam.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
                goal.target.copy(cam.target);
            } else {
                goal.theta = cam.theta - dx * 0.006;
                goal.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.008, cam.phi - dy * 0.005));
                cam.theta = goal.theta; cam.phi = goal.phi;
            }
        } else pick(e);
    };
    const onUp = (e: PointerEvent) => {
        const click = drag && !drag.pan && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6;
        drag = null; canvas.style.cursor = "grab";
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* schon gelöst */ }
        if (click) {
            pick(e);
            if (hover) cbs.pick.forEach(f => f(hover));
            else cbs.pickMiss.forEach(f => f());
        }
    };
    /* Echter Dolly statt gedeckeltem Fit-Zoom: das Rad fährt die Kamera bis
       in das Feld hinein und beim Hineinfahren zieht das Ziel sanft zum
       Punkt unter dem Zeiger — so lässt sich eine einzelne Station
       „anfliegen". Ein Preset-Klick setzt alles zurück. */
    const onWheel = (e: WheelEvent) => {
        e.preventDefault(); tweening = false;
        userZoom = true;
        const zoomIn = e.deltaY < 0;
        const f = zoomIn ? 1 / 1.12 : 1.12;
        const base = fitDist(cam.theta, cam.phi, PRESETS[presetName].zoom);
        const d = Math.max(CD * 1.5, Math.min(base * 4, cam.dist * f));
        if (zoomIn) {
            pick(e);
            if (hover) {
                tmpP.set(xOf(hover.i), yOf(hover.value) / 2, zOf(hover.k));
                cam.target.lerp(tmpP, 0.22);
                goal.target.copy(cam.target);
            }
        }
        cam.dist = goal.dist = d;
        emitZoom();
    };
    const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        pick(e as PointerEvent);
        cbs.context.forEach(f => f(hover, e.clientX, e.clientY));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", () => { if (!drag) emitHover(null); });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hover: VizHover | null = null;
    const cbs: {
        hover: ((h: VizHover | null) => void)[];
        pick: ((h: VizHover) => void)[];
        pickMiss: (() => void)[];
        context: ((h: VizHover | null, x: number, y: number) => void)[];
        zoom: ((percent: number) => void)[];
    } = { hover: [], pick: [], pickMiss: [], context: [], zoom: [] };
    function emitHover(h: VizHover | null) {
        const key = h ? h.k + ":" + h.i : null, prev = hover ? hover.k + ":" + hover.i : null;
        if (key === prev) return;
        hover = h; cbs.hover.forEach(f => f(h));
    }
    function pick(e: PointerEvent | MouseEvent) {
        if (!activeObj) return;
        const r = canvas.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObject(activeObj, true);
        if (!hits.length) { emitHover(null); return; }
        const p = hits[0].point;
        if (p.x > clip.constant + CW) { emitHover(null); return; }
        const i = Math.max(0, Math.min(nY - 1, Math.round(p.x / CW + (nY - 1) / 2)));
        let k: number;
        if (hits[0].object.userData.k !== undefined) k = hits[0].object.userData.k;
        else k = Math.max(0, Math.min(order.length - 1, Math.round(p.z / CD + (order.length - 1) / 2)));
        const ci = order[k];
        emitHover({ k, i, ci, year: years[i], value: val(ci, i), city: data.cities[ci], clientX: e.clientX, clientY: e.clientY });
    }

    /* ---------- Loop ---------- */
    let raf = 0, alive = true, frames = 0;
    function frame() {
        if (!alive) return;
        raf = requestAnimationFrame(frame);
        frames++;
        if (tweening) {
            const e = 0.10;
            cam.theta += (goal.theta - cam.theta) * e;
            cam.phi += (goal.phi - cam.phi) * e;
            cam.dist += (goal.dist - cam.dist) * e;
            cam.target.lerp(goal.target, e);
            if (Math.abs(goal.theta - cam.theta) < 1e-4 && Math.abs(goal.phi - cam.phi) < 1e-4 &&
                Math.abs(goal.dist - cam.dist) < 0.05 && cam.target.distanceTo(goal.target) < 0.02) tweening = false;
        } else {
            cam.dist += (goal.dist - cam.dist) * 0.16;
        }
        applyCam();
        try { placeLabels(); } catch (e) { /* Layout-Rennen beim Resize — nächster Frame korrigiert */ }
        renderer.render(scene, camera);
    }

    /* Sofort zeichnen: in gedrosselten Kontexten feuert requestAnimationFrame
       nicht zuverlässig, Zustandswechsel wären sonst unsichtbar. */
    function renderNow() {
        applyCam();
        try { placeLabels(); } catch (e) { /* siehe oben */ }
        renderer.render(scene, camera);
        frames++;
    }

    function applyReveal() {
        const t = Math.max(0, Math.min(1, state.reveal));
        const idx = t >= 1 ? nY - 1 : t * (nY - 1);
        clip.constant = t >= 1 ? 1e5 : xOf(idx) + CW / 2;
        if (frontEdge) {
            const show = t < 1;
            frontEdge.visible = show;
            if (show) {
                const hi = state.form === "stripes" ? PLATE_H * state.vScale : yOf(4.2);
                const lo = state.form === "stripes" ? 0 : yOf(-3.2);
                frontEdge.position.set(clip.constant, (hi + lo) / 2, (Z0 + Z1) / 2);
                frontEdge.scale.set(Z1 - Z0, hi - lo, 1);
            }
        }
        if (focusMark) {
            const f = state.focus;
            focusMark.visible = f != null;
            if (f != null) {
                const hi = state.form === "stripes" ? PLATE_H * state.vScale : yOf(4.2);
                const lo = state.form === "stripes" ? 0 : yOf(-3.2);
                focusMark.position.set(xOf(f), (hi + lo) / 2, (Z0 + Z1) / 2);
                focusMark.scale.set(Z1 - Z0, hi - lo, 1);
            }
        }
    }

    function applyHighlight() {
        if (!rowMark) return;
        const k = highlightCi == null ? -1 : order.indexOf(highlightCi);
        rowMark.visible = k >= 0;
        if (k >= 0) {
            rowMark.position.set((X0 + X1) / 2, 0.07, zOf(k));
            rowMark.scale.set(X1 - X0, CD * 0.95, 1);
        }
    }
    function resize() {
        const w = container.clientWidth || 1, h = container.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        refit();
        if (frames) renderNow();
    }
    const ro = new ResizeObserver(resize); ro.observe(container);

    rebuild(); applyTheme(); applyReveal(); resize(); setPreset("iso"); cam.dist = goal.dist;
    cam.target.copy(goal.target); tweening = false; applyCam(); frame();

    return {
        setState(patch: Partial<VizState>) {
            const structural = ("form" in patch && patch.form !== state.form) ||
                ("order" in patch && String(patch.order) !== String(order)) ||
                ("grid" in patch && patch.grid !== state.grid) ||
                ("labels" in patch && patch.labels !== state.labels);
            const needsFill = ("offsets" in patch) || ("dim" in patch) ||
                ("scheme" in patch && patch.scheme !== state.scheme) ||
                ("smooth" in patch && patch.smooth !== state.smooth) ||
                ("vScale" in patch && patch.vScale !== state.vScale);
            if ("order" in patch) order = patch.order.slice();
            const themed = "theme" in patch && patch.theme !== state.theme;
            Object.assign(state, patch);
            if (themed) { applyTheme(); syncLabels(); }
            if (structural) rebuild(); else if (needsFill) { refill(); buildChrome(); syncLabels(); }
            applyReveal();
            if (structural || (needsFill && !("dim" in patch))) { centreTarget(goal.target); refit(); tweening = true; }
            renderNow();
        },
        setPreset(name: string) { setPreset(name); renderNow(); },
        render: renderNow,
        onHover(f) { cbs.hover.push(f); },
        onPick(f) { cbs.pick.push(f); },
        onPickMiss(f) { cbs.pickMiss.push(f); },
        onContext(f) { cbs.context.push(f); },
        onZoom(f) { cbs.zoom.push(f); },
        setHighlight(ci) { highlightCi = ci; applyHighlight(); renderNow(); },
        resize,
        get state() { return state; },
        dispose() {
            alive = false; cancelAnimationFrame(raf); ro.disconnect();
            clearData(); chrome.clear(); overlay.remove();
            renderer.dispose(); canvas.remove();
        },
    };
}
