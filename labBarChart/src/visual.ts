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

import { VisualFormattingSettingsModel, DEFAULT_BAR_COLOR } from "./settings";
import { renderBarChart, BarDatum, RenderTokens } from "./render";

interface VisualDatum extends BarDatum {
    selectionId: ISelectionId;
}

/** Light-mode ink & chrome tokens from the validated reference palette. */
const LIGHT_TOKENS: RenderTokens = {
    surface: "transparent",
    textPrimary: "#0b0b0b",
    textSecondary: "#52514e",
    textMuted: "#898781",
    gridline: "#e1e0d9",
    baseline: "#c3c2b7"
};

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private svg: SVGSVGElement;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private lastOptions: VisualUpdateOptions | null = null;
    private allowInteractions: boolean;
    private formatFull: Intl.NumberFormat;
    private formatShort: Intl.NumberFormat;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.allowInteractions = this.host.hostCapabilities?.allowInteractions ?? true;
        this.selectionManager.registerOnSelectCallback(() => this.redraw());

        const locale = this.host.locale || "en-US";
        this.formatFull = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
        this.formatShort = new Intl.NumberFormat(locale, {
            notation: "compact",
            maximumSignificantDigits: 3
        });

        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        options.element.appendChild(this.svg);
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                options.dataViews?.[0]
            );
            this.lastOptions = options;
            this.redraw();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    private redraw(): void {
        const options = this.lastOptions;
        if (!options) {
            return;
        }

        const data = this.buildData(options.dataViews?.[0]);
        const tokens = this.resolveTokens();

        renderBarChart(this.svg, data, {
            width: options.viewport.width,
            height: options.viewport.height,
            tokens,
            showLabel: this.formattingSettings.labelsCard.show.value,
            labelFontSize: this.formattingSettings.labelsCard.fontSize.value,
            hasSelection: this.selectionManager.hasSelection(),
            formatValue: (v) => this.formatFull.format(v),
            formatCompact: (v) => this.formatShort.format(v),
            onBarPointerOver: (d, i, ev) => this.showTooltip(data[i], ev, false),
            onBarPointerMove: (d, i, ev) => this.showTooltip(data[i], ev, true),
            onBarPointerOut: () => this.host.tooltipService.hide({ immediately: false, isTouchEvent: false }),
            onBarClick: (d, i, ev) => {
                if (!this.allowInteractions) {
                    return;
                }
                this.selectionManager
                    .select(data[i].selectionId, ev.ctrlKey || ev.metaKey)
                    .then(() => this.redraw());
            },
            onBarContextMenu: (d, i, ev) => {
                ev.preventDefault();
                this.selectionManager.showContextMenu(data[i].selectionId, {
                    x: ev.clientX,
                    y: ev.clientY
                });
            },
            onBackgroundClick: () => {
                this.selectionManager.clear().then(() => this.redraw());
            },
            onBackgroundContextMenu: (ev) => {
                ev.preventDefault();
                this.selectionManager.showContextMenu(null, { x: ev.clientX, y: ev.clientY });
            }
        });
    }

    private buildData(dataView: DataView | undefined): VisualDatum[] {
        const categorical = dataView?.categorical;
        const category = categorical?.categories?.[0];
        const values = categorical?.values?.[0];
        if (!category || !values) {
            return [];
        }

        const highlights = values.highlights;
        const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
        const palette = this.host.colorPalette;
        const barColor = palette.isHighContrast
            ? palette.foreground.value
            : this.formattingSettings.barsCard.defaultColor.value.value || DEFAULT_BAR_COLOR;

        return category.values.map((cat, i) => {
            const selectionId = this.host
                .createSelectionIdBuilder()
                .withCategory(category, i)
                .createSelectionId();
            return {
                category: cat === null || cat === undefined ? "(Blank)" : String(cat),
                value: Number(values.values[i]) || 0,
                color: barColor,
                highlighted: highlights ? highlights[i] !== null : null,
                selected: selectedIds.some((s) => s.equals(selectionId)),
                selectionId
            };
        });
    }

    private resolveTokens(): RenderTokens {
        const palette = this.host.colorPalette;
        if (palette.isHighContrast) {
            const fg = palette.foreground.value;
            return {
                surface: palette.background.value,
                textPrimary: fg,
                textSecondary: fg,
                textMuted: fg,
                gridline: fg,
                baseline: fg
            };
        }
        return LIGHT_TOKENS;
    }

    private showTooltip(d: VisualDatum, ev: PointerEvent, isMove: boolean): void {
        const args = {
            dataItems: [
                { displayName: "Category", value: d.category },
                { displayName: "Value", value: this.formatFull.format(d.value) }
            ],
            identities: [d.selectionId],
            coordinates: [ev.clientX, ev.clientY],
            isTouchEvent: false
        };
        if (isMove) {
            this.host.tooltipService.move(args);
        } else {
            this.host.tooltipService.show(args);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
