"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataViewValueColumnGroup = powerbi.DataViewValueColumnGroup;

import { VisualFormattingSettingsModel } from "./settings";
import { createViz, rampCss, Viz, VizHover } from "./viz3d";

interface ParsedCity {
    name: string;
    a: (number | null)[];
    group: DataViewValueColumnGroup;
    highlights: (number | null)[] | null;
}

interface Parsed {
    years: number[];
    cities: ParsedCity[];
    signature: string;
    yearColumn: powerbi.DataViewCategoryColumn;
    valueColumns: powerbi.DataViewValueColumns;
    hasHighlights: boolean;
}

const THEME_UI = {
    light: { ink: "#1d1f20", chip: "rgba(255,255,255,0.82)", chipOn: "#1d1f20", chipOnInk: "#f2f2f3", border: "rgba(29,31,32,0.18)" },
    dark:  { ink: "#e6eaee", chip: "rgba(17,22,28,0.82)", chipOn: "#e6eaee", chipOnInk: "#11161c", border: "rgba(230,234,238,0.22)" },
};

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private root: HTMLElement;
    private stage: HTMLElement;
    private toolbar: HTMLElement;
    private legend: HTMLElement;
    private legendCanvas: HTMLCanvasElement;
    private hint: HTMLElement;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private viz: Viz | null = null;
    private parsed: Parsed | null = null;
    private selectedKeys: Set<string> = new Set();
    private playRaf = 0;
    private playing = false;
    private playBtn: HTMLButtonElement | null = null;
    private panel: HTMLElement;
    private zoomChip: HTMLElement;
    private zoomChipTimer = 0;
    private pinned: { ci: number; i: number } | null = null;
    private lastOffsets: number[] = [];

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            if (!ids || !ids.length) { this.selectedKeys.clear(); this.pushDim(); }
        });

        this.root = options.element;
        this.root.style.position = "relative";
        this.root.style.overflow = "hidden";

        this.stage = document.createElement("div");
        Object.assign(this.stage.style, { position: "absolute", inset: "0" });
        this.root.appendChild(this.stage);

        this.hint = document.createElement("div");
        this.hint.className = "ws3d-hint";
        this.hint.textContent = "Felder belegen: Jahr, Ort und Anomalie (°C) — z. B. aus waermestreifen_demo.csv.";
        this.root.appendChild(this.hint);

        this.toolbar = document.createElement("div");
        this.toolbar.className = "ws3d-toolbar";
        this.root.appendChild(this.toolbar);

        this.legend = document.createElement("div");
        this.legend.className = "ws3d-legend";
        this.legendCanvas = document.createElement("canvas");
        this.legendCanvas.width = 180; this.legendCanvas.height = 10;
        this.root.appendChild(this.legend);

        this.panel = document.createElement("div");
        this.panel.className = "ws3d-panel";
        this.root.appendChild(this.panel);

        this.zoomChip = document.createElement("div");
        this.zoomChip.className = "ws3d-zoom";
        this.root.appendChild(this.zoomChip);
    }

    /* ---------- Datenaufbereitung ---------- */

    private parse(dataView: DataView | undefined): Parsed | null {
        const cat = dataView?.categorical;
        const yearCol = cat?.categories?.[0];
        const groups = cat?.values?.grouped?.();
        if (!yearCol || !groups || !groups.length) return null;

        // Jahresachse: numerisch, aufsteigend, dedupliziert.
        const yearOf = (v: powerbi.PrimitiveValue): number => {
            if (v instanceof Date) return v.getFullYear();
            const n = Number(v);
            return isFinite(n) ? n : NaN;
        };
        const idx: { y: number; i: number }[] = [];
        yearCol.values.forEach((v, i) => {
            const y = yearOf(v);
            if (isFinite(y)) idx.push({ y, i });
        });
        idx.sort((a, b) => a.y - b.y);
        if (idx.length < 2) return null;
        const years = idx.map(e => e.y);

        let hasHighlights = false;
        const cities: ParsedCity[] = groups.map(g => {
            const col = g.values[0];
            const a = idx.map(e => {
                const v = col.values[e.i];
                const n = Number(v);
                return v === null || v === undefined || !isFinite(n) ? null : n;
            });
            let highlights: (number | null)[] | null = null;
            if (col.highlights) {
                hasHighlights = true;
                highlights = idx.map(e => {
                    const v = col.highlights[e.i];
                    const n = Number(v);
                    return v === null || v === undefined || !isFinite(n) ? null : n;
                });
            }
            return { name: g.name === null || g.name === undefined ? "(Leer)" : String(g.name), a, group: g, highlights };
        });

        const signature = years[0] + ":" + years[years.length - 1] + ":" + years.length + "|" +
            cities.map(c => c.name).join("");
        return { years, cities, signature, yearColumn: yearCol, valueColumns: cat.values, hasHighlights };
    }

    private offsets(): number[] {
        const p = this.parsed;
        const r = this.formattingSettings.referenzCard;
        if (!p || r.modus.value.value !== "periode") return p ? p.cities.map(() => 0) : [];
        const von = Number(r.von.value), bis = Number(r.bis.value);
        return p.cities.map(c => {
            let s = 0, n = 0;
            p.years.forEach((y, i) => {
                const v = c.a[i];
                if (y >= von && y <= bis && v !== null) { s += v; n++; }
            });
            return n ? s / n : 0;
        });
    }

    private order(offsets: number[]): number[] {
        const p = this.parsed;
        if (!p) return [];
        const mode = String(this.formattingSettings.analyseCard.sort.value.value);
        const ids = p.cities.map((_, i) => i);
        const nY = p.years.length;
        const at = (ci: number, i: number) => { const v = p.cities[ci].a[i]; return v === null ? 0 : v; };
        const avgTail = (ci: number, count: number) => {
            let s = 0, n = 0;
            for (let i = Math.max(0, nY - count); i < nY; i++) { s += at(ci, i); n++; }
            return n ? s / n : 0;
        };
        const avgHead = (ci: number, count: number) => {
            let s = 0, n = 0;
            for (let i = 0; i < Math.min(count, nY); i++) { s += at(ci, i); n++; }
            return n ? s / n : 0;
        };
        if (mode === "name") ids.sort((a, b) => p.cities[a].name.localeCompare(p.cities[b].name, "de"));
        else if (mode === "last") ids.sort((a, b) => (at(b, nY - 1) - offsets[b]) - (at(a, nY - 1) - offsets[a]));
        else if (mode === "avg5") ids.sort((a, b) => (avgTail(b, 5) - offsets[b]) - (avgTail(a, 5) - offsets[a]));
        else if (mode === "trend") ids.sort((a, b) =>
            (avgTail(b, 30) - avgHead(b, 50)) - (avgTail(a, 30) - avgHead(a, 50)));
        return ids;
    }

    private dimFn(): ((ci: number, i: number) => boolean) | null {
        const p = this.parsed;
        if (!p) return null;
        if (p.hasHighlights) {
            return (ci, i) => {
                const h = p.cities[ci].highlights;
                return !h || h[i] === null;
            };
        }
        if (this.selectedKeys.size) {
            const keys = this.selectedKeys;
            return (ci, i) => !keys.has(ci + ":" + i);
        }
        return null;
    }

    private selectionIdFor(ci: number, i: number): ISelectionId {
        const p = this.parsed;
        // Kategorie-Index im Original-DataView (Jahre wurden sortiert).
        const yearOf = (v: powerbi.PrimitiveValue): number => (v instanceof Date) ? v.getFullYear() : Number(v);
        let catIndex = -1;
        const y = p.years[i];
        p.yearColumn.values.some((v, k) => { if (yearOf(v) === y) { catIndex = k; return true; } return false; });
        const b = this.host.createSelectionIdBuilder().withSeries(p.valueColumns, p.cities[ci].group);
        if (catIndex >= 0) b.withCategory(p.yearColumn, catIndex);
        return b.createSelectionId();
    }

    /* ---------- Update ---------- */

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView
            );

            /* Power BI liefert große Datenmengen in Segmenten. Ohne dieses
               Nachfordern meldet der Bericht „Es werden nicht alle Werte
               angezeigt" und das Feld bliebe unvollständig. aggregateSegments
               sammelt die Segmente im selben DataView auf. */
            const moreComing = dataView?.metadata?.segment
                ? this.host.fetchMoreData(true) : false;

            /* Jedes Segment neu aufzubauen hieße, den WebGL-Kontext mehrfach
               zu verwerfen und neu anzulegen — Browser begrenzen die Zahl
               paralleler Kontexte. Also: erstes Segment sofort zeigen, damit
               etwas zu sehen ist, Zwischenstände überspringen, den
               vollständigen Stand einmal sauber zeichnen. */
            if (moreComing && this.viz) {
                this.events.renderingFinished(options);
                return;
            }

            const parsed = this.parse(dataView);
            const structural = !parsed || !this.parsed || !this.viz || parsed.signature !== this.parsed.signature;
            this.parsed = parsed;

            if (!parsed) {
                this.disposeViz();
                this.hint.style.display = "block";
                this.toolbar.style.display = "none";
                this.legend.style.display = "none";
                this.events.renderingFinished(options);
                return;
            }
            this.hint.style.display = "none";

            const s = this.formattingSettings;
            const offsets = this.offsets();
            const order = this.order(offsets);
            const state = {
                form: String(s.ansichtCard.form.value.value) as "bars" | "terrain" | "curtain" | "stripes",
                scheme: String(s.ansichtCard.scheme.value.value),
                theme: String(s.ansichtCard.theme.value.value) as "light" | "dark",
                bg: s.ansichtCard.bgColor.value.value || null,
                labelScale: Math.max(0.5, (Number(s.skalaCard.labelSize.value) || 12) / 12),
                vScale: Number(s.ansichtCard.vScale.value) || 1,
                grid: !!s.ansichtCard.grid.value,
                labels: String(s.ansichtCard.labels.value.value) as "min" | "axes",
                smooth: Number(s.analyseCard.smooth.value.value) || 0,
                offsets, order,
                dim: this.dimFn(),
            };

            this.lastOffsets = offsets;
            if (structural) {
                this.stopPlay();
                this.disposeViz();
                this.selectedKeys.clear();
                this.pinned = null;
                state.dim = this.dimFn();
                this.viz = createViz(this.stage, {
                    years: parsed.years,
                    cities: parsed.cities.map(c => ({ n: c.name, a: c.a })),
                }, Object.assign({ reveal: 1, focus: null }, state));
                this.viz.onHover(h => this.onHover(h));
                this.viz.onPick(h => this.onPick(h));
                this.viz.onPickMiss(() => this.onPickMiss());
                this.viz.onContext((h, x, y) => this.onContext(h, x, y));
                this.viz.onZoom(p => this.showZoom(p));
                this.viz.setPreset(String(s.perspektiveCard.preset.value.value));
            } else {
                this.viz.setState(state);
                this.viz.setPreset(String(s.perspektiveCard.preset.value.value));
            }

            this.viz.setKiosk(
                !!s.animationCard.kiosk.value,
                (Number(s.animationCard.kioskDelay.value) || 20) * 1000,
                360 / Math.max(12, Number(s.animationCard.kioskPeriod.value) || 90)
            );

            this.renderToolbar();
            this.renderLegend();
            this.renderPanel(null);
            this.applyUiScale();
            this.root.style.background = state.bg || (state.theme === "dark" ? "#11161c" : "#f2f2f3");

            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    private disposeViz() {
        if (this.viz) { this.viz.dispose(); this.viz = null; }
    }

    private pushDim() {
        if (this.viz) this.viz.setState({ dim: this.dimFn() });
    }

    /* ---------- Interaktion ---------- */

    private onHover(h: VizHover | null) {
        this.renderPanel(h);
        if (!h) {
            this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
            return;
        }
        const fmt = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
        this.host.tooltipService.show({
            dataItems: [
                { displayName: "Ort", value: h.city.n },
                { displayName: "Jahr", value: String(h.year) },
                { displayName: "Abweichung", value: fmt(h.value) + " °C" }
            ],
            identities: [this.selectionIdFor(h.ci, h.i)],
            coordinates: [h.clientX, h.clientY],
            isTouchEvent: false
        });
    }

    private onPick(h: VizHover) {
        const allow = this.host.hostCapabilities?.allowInteractions ?? true;
        if (!allow) return;
        const key = h.ci + ":" + h.i;
        if (this.selectedKeys.has(key) && this.selectedKeys.size === 1) {
            this.selectedKeys.clear();
            this.pinned = null;
            this.selectionManager.clear().then(() => this.pushDim());
            this.renderPanel(h);
            return;
        }
        this.selectedKeys = new Set([key]);
        this.pinned = { ci: h.ci, i: h.i };
        this.selectionManager.select(this.selectionIdFor(h.ci, h.i), false).then(() => this.pushDim());
        this.renderPanel(h);
    }

    private onPickMiss() {
        this.pinned = null;
        if (this.selectedKeys.size) {
            this.selectedKeys.clear();
            this.selectionManager.clear().then(() => this.pushDim());
        }
        this.renderPanel(null);
    }

    private showZoom(percent: number) {
        this.zoomChip.textContent = "Zoom " + percent + " %";
        this.zoomChip.style.opacity = "1";
        window.clearTimeout(this.zoomChipTimer);
        this.zoomChipTimer = window.setTimeout(() => { this.zoomChip.style.opacity = "0"; }, 1100);
    }

    private onContext(h: VizHover | null, x: number, y: number) {
        const id = h ? this.selectionIdFor(h.ci, h.i) : null;
        this.selectionManager.showContextMenu(id, { x, y });
    }

    /* ---------- Aufbau-Animation ---------- */

    private togglePlay() {
        if (this.playing) { this.stopPlay(); return; }
        if (!this.viz || !this.parsed) return;
        const nY = this.parsed.years.length;
        const secs = Math.max(3, Number(this.formattingSettings.animationCard.seconds.value) || 14);
        const t0 = performance.now();
        this.playing = true;
        this.updatePlayBtn();
        const step = () => {
            if (!this.playing || !this.viz) return;
            const t = Math.min(1, (performance.now() - t0) / (secs * 1000));
            const idx = Math.round(t * (nY - 1));
            this.viz.setState({ reveal: t, focus: t >= 1 ? null : idx });
            if (t >= 1) { this.playing = false; this.updatePlayBtn(); return; }
            this.playRaf = requestAnimationFrame(step);
        };
        this.playRaf = requestAnimationFrame(step);
    }

    private stopPlay() {
        cancelAnimationFrame(this.playRaf);
        this.playing = false;
        if (this.viz) this.viz.setState({ reveal: 1, focus: null });
        this.updatePlayBtn();
    }

    private updatePlayBtn() {
        if (this.playBtn) this.playBtn.textContent = this.playing ? "❚❚" : "▸";
    }

    /* ---------- Overlay-UI ---------- */

    /* Skalierung der Overlays (Toolbar, Auslesefeld, Legende, Zoom-Chip) für
       hochauflösende Displays: CSS-Transform mit dem jeweils passenden
       Ankerpunkt, damit jedes Element an seiner Ecke verankert bleibt. */
    private applyUiScale() {
        const f = Math.max(0.5, (Number(this.formattingSettings.skalaCard.uiScale.value) || 100) / 100);
        const set = (el: HTMLElement, origin: string) => {
            el.style.transform = f === 1 ? "" : "scale(" + f + ")";
            el.style.transformOrigin = origin;
        };
        set(this.toolbar, "top left");
        set(this.panel, "top right");
        set(this.legend, "bottom right");
        set(this.zoomChip, "bottom left");
        set(this.hint, "center");
    }

    private persist(objectName: string, propertyName: string, value: powerbi.PrimitiveValue) {
        this.host.persistProperties({
            merge: [{ objectName, selector: null, properties: { [propertyName]: value } }]
        });
    }

    private renderToolbar() {
        const s = this.formattingSettings;
        const show = !!s.ansichtCard.toolbar.value;
        this.toolbar.style.display = show ? "flex" : "none";
        if (!show) return;
        const T = THEME_UI[String(s.ansichtCard.theme.value.value) === "dark" ? "dark" : "light"];
        while (this.toolbar.firstChild) this.toolbar.removeChild(this.toolbar.firstChild);
        this.toolbar.style.color = T.ink;

        const mkGroup = () => {
            const g = document.createElement("div");
            g.className = "ws3d-group";
            g.style.borderColor = T.border;
            g.style.background = T.chip;
            this.toolbar.appendChild(g);
            return g;
        };
        const mkBtn = (parent: HTMLElement, label: string, title: string, active: boolean, onClick: () => void) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.title = title;
            b.style.color = active ? T.chipOnInk : T.ink;
            b.style.background = active ? T.chipOn : "transparent";
            b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
            parent.appendChild(b);
            return b;
        };

        const forms: [string, string, string][] = [
            ["bars", "▦", "Säulenfeld"], ["terrain", "◮", "Relief"],
            ["curtain", "▤", "Bänder"], ["stripes", "▥", "Streifen-Tafeln"]
        ];
        const gForm = mkGroup();
        const curForm = String(s.ansichtCard.form.value.value);
        forms.forEach(([v, icon, title]) =>
            mkBtn(gForm, icon, title, curForm === v, () => this.persist("ansicht", "form", v)));

        const presets: [string, string, string][] = [
            ["iso", "¾", "Übersicht ¾"], ["top", "⊤", "Aufsicht — klassische Streifen"],
            ["time", "⌛", "Zeitachse"], ["place", "⌖", "Ortsprofil"], ["graze", "◢", "Streiflicht"]
        ];
        const gPreset = mkGroup();
        const curPreset = String(s.perspektiveCard.preset.value.value);
        presets.forEach(([v, icon, title]) =>
            mkBtn(gPreset, icon, title, curPreset === v, () => this.persist("perspektive", "preset", v)));

        /* Referenz-Kippschalter: Nulllinie zwischen WMO-Standard und
           vorindustriell umschalten — der „Alles-wird-rot"-Moment. */
        const r = this.formattingSettings.referenzCard;
        const isPeriode = String(r.modus.value.value) === "periode";
        const von = Number(r.von.value), bis = Number(r.bis.value);
        const isWMO = isPeriode && von === 1961 && bis === 1990;
        const isPre = isPeriode && von === 1850 && bis === 1900;
        const gRef = mkGroup();
        mkBtn(gRef, "1961–90", "Nulllinie: Referenz 1961–1990 (WMO-Standard)", isWMO, () =>
            this.host.persistProperties({ merge: [{ objectName: "referenz", selector: null,
                properties: { modus: "periode", von: 1961, bis: 1990 } }] }));
        mkBtn(gRef, "vorind.", "Nulllinie: vorindustriell 1850–1900 — zeigt die volle Erwärmung", isPre, () =>
            this.host.persistProperties({ merge: [{ objectName: "referenz", selector: null,
                properties: { modus: "periode", von: 1850, bis: 1900 } }] }));

        const gPlay = mkGroup();
        this.playBtn = mkBtn(gPlay, this.playing ? "❚❚" : "▸", "Zeitlichen Aufbau abspielen", false, () => this.togglePlay());
        const kioskOn = !!this.formattingSettings.animationCard.kiosk.value;
        mkBtn(gPlay, "↻", "Kiosk-Rotation: dreht nach Inaktivität langsam weiter", kioskOn, () =>
            this.persist("animation", "kiosk", !kioskOn));
    }

    /* Auslesefeld: Stationsname, klassische Warming Stripes der Station über
       alle Jahre (Marker am aktiven Jahr) und die Werte dieses Jahres.
       Hover aktualisiert transient; ein Klick pinnt Station+Jahr, bis ins
       Leere geklickt oder die Selektion gelöst wird. */
    private renderPanel(h: VizHover | null) {
        const s = this.formattingSettings;
        const p = this.parsed;
        const show = !!s.ansichtCard.readout.value && !!p;
        const active = h ? { ci: h.ci, i: h.i } : this.pinned;
        this.panel.style.display = show && active ? "block" : "none";
        if (!show || !active || !p) return;

        const dark = String(s.ansichtCard.theme.value.value) === "dark";
        const scheme = String(s.ansichtCard.scheme.value.value);
        const ink = dark ? "#e6eaee" : "#1d1f20";
        this.panel.style.color = ink;
        this.panel.style.background = dark ? "rgba(17,22,28,0.88)" : "rgba(255,255,255,0.90)";
        this.panel.style.borderColor = dark ? "rgba(230,234,238,0.22)" : "rgba(29,31,32,0.18)";

        const city = p.cities[active.ci];
        const off = this.lastOffsets[active.ci] || 0;
        const nY = p.years.length;
        const vAt = (i: number): number | null => {
            const v = city.a[i];
            return v === null || v === undefined ? null : v - off;
        };
        const cur = vAt(active.i);
        const fmt = (v: number) => ((v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2)).replace(".", ",");

        while (this.panel.firstChild) this.panel.removeChild(this.panel.firstChild);
        const line = (cls: string, text: string) => {
            const el = document.createElement("div");
            el.className = cls;
            el.textContent = text;
            this.panel.appendChild(el);
            return el;
        };

        line("ws3d-p-name", city.name + (this.pinned && !h ? " · fixiert" : ""));

        // Klassische Streifen der Station über alle Jahre, Lücken bleiben leer.
        const cv = document.createElement("canvas");
        cv.width = 248; cv.height = 30;
        cv.className = "ws3d-p-stripes";
        const ctx = cv.getContext("2d");
        if (ctx) {
            const w = cv.width / nY;
            for (let i = 0; i < nY; i++) {
                const v = vAt(i);
                if (v === null) continue;
                ctx.fillStyle = rampCss(scheme, v);
                ctx.fillRect(i * w, 0, Math.ceil(w) + 0.5, cv.height);
            }
            ctx.fillStyle = ink;
            ctx.fillRect(active.i * w - 0.5, 0, 2, cv.height);
        }
        this.panel.appendChild(cv);

        // Werte des aktiven Jahres: Anomalie + Rang unter allen gültigen Jahren.
        if (cur !== null) {
            let rank = 1, valid = 0;
            for (let i = 0; i < nY; i++) {
                const v = vAt(i);
                if (v === null) continue;
                valid++;
                if (v > cur) rank++;
            }
            line("ws3d-p-value", p.years[active.i] + " · " + fmt(cur) + " °C · Rang " + rank + " von " + valid);
        } else {
            line("ws3d-p-value", p.years[active.i] + " · keine Daten");
        }

        // Reihen-Statistik: Zeitraum, Mittel der letzten 5 Jahre, wärmstes Jahr.
        let first = -1, last = -1, maxI = -1;
        let tail = 0, tailN = 0;
        for (let i = 0; i < nY; i++) {
            const v = vAt(i);
            if (v === null) continue;
            if (first < 0) first = i;
            last = i;
            if (maxI < 0 || v > (vAt(maxI) as number)) maxI = i;
        }
        for (let i = nY - 1; i >= 0 && tailN < 5; i--) {
            const v = vAt(i);
            if (v !== null) { tail += v; tailN++; }
        }
        if (first >= 0) {
            line("ws3d-p-meta",
                p.years[first] + "–" + p.years[last] +
                " · Ø letzte 5: " + fmt(tail / Math.max(1, tailN)) + " °C" +
                " · Max: " + p.years[maxI] + " (" + fmt(vAt(maxI) as number) + " °C)");
        }
    }

    private renderLegend() {
        const s = this.formattingSettings;
        const show = !!s.ansichtCard.legend.value && String(s.ansichtCard.labels.value.value) !== "min";
        this.legend.style.display = show ? "flex" : "none";
        if (!show) return;
        const scheme = String(s.ansichtCard.scheme.value.value);
        const dark = String(s.ansichtCard.theme.value.value) === "dark";
        while (this.legend.firstChild) this.legend.removeChild(this.legend.firstChild);
        this.legend.style.color = dark ? "#e6eaee" : "#1d1f20";

        const lo = document.createElement("span"); lo.textContent = "−3 °C";
        const hi = document.createElement("span"); hi.textContent = "+4 °C";
        const cv = this.legendCanvas;
        const ctx = cv.getContext("2d");
        if (ctx) {
            for (let x = 0; x < cv.width; x++) {
                ctx.fillStyle = rampCss(scheme, -3 + (x / (cv.width - 1)) * 7);
                ctx.fillRect(x, 0, 1, cv.height);
            }
        }
        this.legend.appendChild(lo);
        this.legend.appendChild(cv);
        this.legend.appendChild(hi);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.stopPlay();
        this.disposeViz();
    }
}
