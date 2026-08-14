"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService, formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";
import {
    RenderInput, RenderOptions, RowInput, FacetInput, LegendItem, MeasureOption,
    DEFAULT_PALETTE, LIGHT_TOKENS, DARK_TOKENS, XScaleMode, RegressionMode
} from "./model";
import { renderScatterMultiples } from "./render";

interface Parsed {
    input: RenderInput;
    detailCol: DataViewCategoryColumn;
    legendCol: DataViewCategoryColumn | null;
    legendFirstRow: number[];
    yCol: DataViewValueColumn | null;
    facetCols: DataViewValueColumn[];
    sizeCol: DataViewValueColumn | null;
    highlights: boolean;
    xToggles: { key: string; label: string; hidden: boolean }[];
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private root: HTMLElement;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private parsed: Parsed | null = null;
    private lastOptions: VisualUpdateOptions | null = null;
    /* Y-Wahl lokal halten: persistProperties wird in der Leseansicht des
       Service verworfen (kein Update-Zyklus) — der Selector muss deshalb
       ohne Persistenz sofort funktionieren. Die Persistenz bleibt als
       Bonus für Desktop/Bearbeitungsmodus. */
    private localYKey: string | null = null;
    /* dito für ausgeblendete X-Facetten (null = noch nichts lokal getoggelt,
       dann gilt der persistierte Stand) */
    private localHiddenX: Set<string> | null = null;
    private lastDataView: DataView | undefined;
    private selectedRows: Set<number> = new Set();
    private legendSel: number | null = null;
    private fmt: Intl.NumberFormat;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            if (!ids || !ids.length) {
                this.selectedRows.clear();
                this.legendSel = null;
                this.redraw();
            }
        });
        this.root = options.element;
        this.root.classList.add("sbdw-root");
        const locale = this.host.locale || "de-DE";
        this.fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    }

    /* ---------- Parsing ---------- */

    private num(v: powerbi.PrimitiveValue): number | null {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
    }

    private parse(dataView: DataView | undefined): Parsed | null {
        const cat = dataView?.categorical;
        if (!cat?.categories?.length || !cat.values?.length) return null;
        const detailCol = cat.categories.find(c => c.source.roles?.detail);
        if (!detailCol) return null;
        const legendCol = cat.categories.find(c => c.source.roles?.legend) || null;

        let yCol: DataViewValueColumn | null = null;
        let sizeCol: DataViewValueColumn | null = null;
        let sourceCol: DataViewValueColumn | null = null;
        const xCols: DataViewValueColumn[] = [];
        for (const col of cat.values) {
            const roles = col.source.roles || {};
            if (roles.y && !yCol) yCol = col;
            else if (roles.size && !sizeCol) sizeCol = col;
            else if (roles.source && !sourceCol) sourceCol = col;
            else if (roles.x) xCols.push(col);
        }

        /* Y-Kennzahl bestimmen: Y-Rolle belegt → fest (keine Auswahl im
           Visual). Sonst wird die im Visual gewählte Kennzahl (persistiert
           in facetten.yKey) aus den X-Kennzahlen genommen; die übrigen
           bilden die Facetten. */
        const keyOf = (c: DataViewValueColumn) => c.source.queryName || c.source.displayName;
        let measures: MeasureOption[] = [];
        let facetCols: DataViewValueColumn[];
        if (!yCol) {
            if (xCols.length < 2) return null;
            const persisted = String(
                (dataView.metadata.objects?.facetten as { yKey?: string } | undefined)?.yKey || "");
            yCol = (this.localYKey ? xCols.find(c => keyOf(c) === this.localYKey) : undefined)
                || xCols.find(c => keyOf(c) === persisted)
                || xCols[0];
            facetCols = xCols.filter(c => c !== yCol);
            measures = xCols.map(c => ({ key: keyOf(c), label: c.source.displayName }));
        } else {
            facetCols = xCols;
        }
        if (!facetCols.length) return null;

        /* X-Facetten ein-/ausblenden: lokaler Stand vor persistiertem. */
        const persistedHidden = String(
            (dataView.metadata.objects?.facetten as { hiddenX?: string } | undefined)?.hiddenX || "");
        const hiddenX = this.localHiddenX !== null
            ? this.localHiddenX
            : new Set(persistedHidden.split("|").filter(k => k));
        const xToggles = facetCols.map(c => ({
            key: keyOf(c), label: c.source.displayName, hidden: hiddenX.has(keyOf(c))
        }));
        const visibleFacetCols = facetCols.filter(c => !hiddenX.has(keyOf(c)));

        const n = detailCol.values.length;
        const legendNames: string[] = [];
        const legendIndex = new Map<string, number>();
        const legendFirstRow: number[] = [];
        const rows: RowInput[] = [];
        let highlights = false;
        if (yCol.highlights) highlights = true;

        for (let i = 0; i < n; i++) {
            let colorIdx = -1;
            if (legendCol) {
                const lv = legendCol.values[i];
                const name = lv === null || lv === undefined ? "(Leer)" : String(lv);
                if (!legendIndex.has(name)) {
                    legendIndex.set(name, legendNames.length);
                    legendNames.push(name);
                    legendFirstRow.push(i);
                }
                colorIdx = legendIndex.get(name);
            }
            const dv = detailCol.values[i];
            rows.push({
                label: dv === null || dv === undefined ? "(Leer)" : String(dv),
                y: this.num(yCol.values[i]),
                size: sizeCol ? this.num(sizeCol.values[i]) : null,
                colorIdx
            });
        }

        /* Datenfarben: per Formatbereich/Fx gesetzte Farbe je Legendenwert
           (category.objects) schlägt die validierte Standard-Palette. */
        const legend: LegendItem[] = legendNames.map((name, k) => {
            let color = DEFAULT_PALETTE[k % DEFAULT_PALETTE.length];
            const obj = legendCol?.objects?.[legendFirstRow[k]] as
                { datenfarben?: { fill?: powerbi.Fill } } | undefined;
            const custom = obj?.datenfarben?.fill?.solid?.color;
            if (custom) color = custom;
            return { name, color };
        });

        const facets: FacetInput[] = visibleFacetCols.map(col => ({
            key: col.source.queryName || col.source.displayName,
            label: col.source.displayName,
            x: Array.from({ length: n }, (_, i) => this.num(col.values[i]))
        }));

        // Fußzeile: Datenrolle gewinnt vor statischem Text.
        let footer = "";
        if (sourceCol) {
            const v = sourceCol.values.find(x => x !== null && x !== undefined && String(x).trim() !== "");
            if (v !== undefined) footer = String(v);
        }
        if (!footer) footer = String(this.formattingSettings.fusszeileCard.text.value || "");
        if (!this.formattingSettings.fusszeileCard.show.value) footer = "";

        return {
            input: {
                yLabel: yCol.source.displayName,
                rows, facets, legend, footer,
                measures, yKey: keyOf(yCol)
            },
            detailCol, legendCol, legendFirstRow,
            yCol, facetCols, sizeCol, highlights, xToggles
        };
    }

    /* ---------- Update / Render ---------- */

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                options.dataViews?.[0]
            );
            this.lastOptions = options;
            this.lastDataView = options.dataViews?.[0];
            this.parsed = this.parse(this.lastDataView);
            // Fremd-Selektion (Highlights) macht lokale Auswahl obsolet.
            if (this.parsed?.highlights) { this.selectedRows.clear(); this.legendSel = null; }
            this.redraw();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    private dimFn(): ((row: number) => boolean) | null {
        const p = this.parsed;
        if (!p) return null;
        if (p.highlights && p.yCol?.highlights) {
            const h = p.yCol.highlights;
            return (row) => h[row] === null || h[row] === undefined;
        }
        const legendSel = this.legendSel;
        const sel = this.selectedRows;
        if (legendSel === null && !sel.size) return null;
        return (row) => {
            if (legendSel !== null && p.input.rows[row].colorIdx !== legendSel) return true;
            if (sel.size && !sel.has(row)) return true;
            return false;
        };
    }

    private redraw() {
        const options = this.lastOptions;
        if (!options) return;
        const s = this.formattingSettings;
        const dark = String(s.darstellungCard.theme.value.value) === "dark";
        const tokens = dark ? DARK_TOKENS : LIGHT_TOKENS;
        this.root.style.background = tokens.surface;

        const input: RenderInput = this.parsed ? this.parsed.input :
            { yLabel: "", rows: [], facets: [], legend: [], footer: "", measures: [], yKey: "" };

        this.populateColorSlices();

        /* Größen-Preset: skaliert Schrift UND Punktgrößen; Feinjustierung
           multipliziert darauf. */
        const preset = String(s.darstellungCard.sizePreset.value.value);
        const presetFactor = preset === "hd" ? 0.85 : preset === "uhd" ? 1.8 : 1.0;

        const opts: RenderOptions = {
            width: options.viewport.width,
            height: options.viewport.height,
            tokens,
            regression: String(s.regressionCard.mode.value.value) as RegressionMode,
            showR2: !!s.regressionCard.showR2.value,
            xScale: String(s.facettenCard.xScale.value.value) as XScaleMode,
            sortByR: !!s.facettenCard.sortByR.value,
            zeroBaseline: !!s.facettenCard.zeroBaseline.value,
            columns: Number(s.facettenCard.columns.value) || 0,
            pointSize: (Number(s.darstellungCard.pointSize.value) || 4) * presetFactor,
            sizeEnabled: !!s.darstellungCard.sizeEnabled.value,
            fontScale: Math.max(0.5, (Number(s.darstellungCard.fontScale.value) || 100) / 100) * presetFactor,
            footerFontSize: Number(s.fusszeileCard.fontSize.value) || 9,
            showLegend: !!s.darstellungCard.showLegend.value,
            header: {
                title: s.kopfCard.show.value ? String(s.kopfCard.title.value || "") : "",
                subtitle: String(s.kopfCard.subtitle.value || "")
            },
            ySelector: input.measures.length > 1
                ? String(s.facettenCard.ySelector.value.value) as "none" | "dropdown" | "chips"
                : "none",
            onYSelect: (key) => {
                // Sofort lokal umschalten (funktioniert auch in der
                // Leseansicht), Persistenz best effort hinterher.
                this.localYKey = key;
                this.parsed = this.parse(this.lastDataView);
                this.redraw();
                try {
                    this.host.persistProperties({
                        merge: [{ objectName: "facetten", selector: null, properties: { yKey: key } }]
                    });
                } catch (e) { /* Leseansicht: Persistenz nicht erlaubt — lokal reicht */ }
            },
            xSelector: String(s.facettenCard.xSelector.value.value) as "none" | "chips",
            xToggles: this.parsed ? this.parsed.xToggles : [],
            onXToggle: (key) => {
                const cur = this.localHiddenX !== null
                    ? this.localHiddenX
                    : new Set((this.parsed?.xToggles || []).filter(t => t.hidden).map(t => t.key));
                if (cur.has(key)) cur.delete(key); else cur.add(key);
                this.localHiddenX = cur;
                this.parsed = this.parse(this.lastDataView);
                this.redraw();
                try {
                    this.host.persistProperties({
                        merge: [{ objectName: "facetten", selector: null,
                            properties: { hiddenX: [...cur].join("|") } }]
                    });
                } catch (e) { /* Leseansicht: Persistenz nicht erlaubt — lokal reicht */ }
            },
            panel: {
                show: !!s.panelCard.show.value,
                widthPx: Number(s.panelCard.width.value) || 250,
                showDetailCard: !!s.panelCard.detailCard.value,
                initialCollapsed: !!s.panelCard.startCollapsed.value
            },
            dim: this.dimFn(),
            highlightRow: this.selectedRows.size === 1 ? [...this.selectedRows][0] : null,
            formatY: (v) => this.fmt.format(v),
            formatX: (_k, v) => this.fmt.format(v),
            onHover: (row, facetIdx, ev) => this.showTooltip(row, facetIdx, ev),
            onHoverEnd: () => this.host.tooltipService.hide({ immediately: false, isTouchEvent: false }),
            onClick: (row, ev) => this.onRowClick(row, ev),
            onLegendClick: (colorIdx, ev) => this.onLegendClick(colorIdx, ev),
            onBackgroundClick: () => this.clearSelection(),
            onContextMenu: (row, x, y) => {
                const id = row !== null && this.parsed
                    ? this.rowSelectionId(row) : null;
                this.selectionManager.showContextMenu(id, { x, y });
            }
        };
        renderScatterMultiples(this.root, input, opts);
    }

    /* Formatbereich „Datenfarben": je Legendenwert ein ColorPicker mit
       Selector auf den Kategoriewert — Power BI blendet dafür auch die
       bedingte Formatierung (Fx) ein. */
    private populateColorSlices() {
        const card = this.formattingSettings.farbenCard;
        card.slices = [];
        const p = this.parsed;
        if (!p || !p.legendCol) return;
        p.input.legend.forEach((item, k) => {
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(p.legendCol, p.legendFirstRow[k])
                .createSelectionId();
            const slice = new formattingSettings.ColorPicker({
                name: "fill",
                displayName: item.name,
                value: { value: item.color }
            });
            (slice as unknown as { selector: powerbi.data.Selector }).selector = selectionId.getSelector();
            card.slices.push(slice);
        });
    }

    /* ---------- Interaktion ---------- */

    private rowSelectionId(row: number): ISelectionId {
        return this.host.createSelectionIdBuilder()
            .withCategory(this.parsed.detailCol, row)
            .createSelectionId();
    }

    private allowed(): boolean {
        return this.host.hostCapabilities?.allowInteractions ?? true;
    }

    private onRowClick(row: number, ev: MouseEvent) {
        if (!this.allowed() || !this.parsed) return;
        const multi = ev.ctrlKey || ev.metaKey;
        if (this.selectedRows.has(row) && (this.selectedRows.size === 1 || multi)) {
            if (multi) this.selectedRows.delete(row); else this.selectedRows.clear();
        } else {
            if (!multi) this.selectedRows.clear();
            this.selectedRows.add(row);
        }
        this.legendSel = null;
        if (!this.selectedRows.size) {
            this.selectionManager.clear().then(() => this.redraw());
            return;
        }
        const ids = [...this.selectedRows].map(r => this.rowSelectionId(r));
        this.selectionManager.select(ids, false).then(() => this.redraw());
    }

    private onLegendClick(colorIdx: number, _ev: MouseEvent) {
        if (!this.allowed() || !this.parsed || !this.parsed.legendCol) return;
        this.selectedRows.clear();
        if (this.legendSel === colorIdx) {
            this.legendSel = null;
            this.selectionManager.clear().then(() => this.redraw());
            return;
        }
        this.legendSel = colorIdx;
        const id = this.host.createSelectionIdBuilder()
            .withCategory(this.parsed.legendCol, this.parsed.legendFirstRow[colorIdx])
            .createSelectionId();
        this.selectionManager.select(id, false).then(() => this.redraw());
    }

    private clearSelection() {
        if (!this.selectedRows.size && this.legendSel === null) return;
        this.selectedRows.clear();
        this.legendSel = null;
        this.selectionManager.clear().then(() => this.redraw());
    }

    private showTooltip(row: number, facetIdx: number, ev: PointerEvent) {
        const p = this.parsed;
        if (!p) return;
        const r = p.input.rows[row];
        const facet = p.input.facets[facetIdx];
        const items: powerbi.extensibility.VisualTooltipDataItem[] = [
            { displayName: p.detailCol.source.displayName, value: r.label }
        ];
        if (r.colorIdx >= 0 && p.legendCol) {
            items.push({
                displayName: p.legendCol.source.displayName,
                value: p.input.legend[r.colorIdx].name,
                color: p.input.legend[r.colorIdx].color
            });
        }
        if (r.y !== null) items.push({ displayName: p.input.yLabel, value: this.fmt.format(r.y) });
        if (facet) {
            const x = facet.x[row];
            if (x !== null) items.push({ displayName: facet.label, value: this.fmt.format(x) });
        }
        if (p.sizeCol && r.size !== null) {
            items.push({ displayName: p.sizeCol.source.displayName, value: this.fmt.format(r.size) });
        }
        this.host.tooltipService.show({
            dataItems: items,
            identities: [this.rowSelectionId(row)],
            coordinates: [ev.clientX, ev.clientY],
            isTouchEvent: false
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
