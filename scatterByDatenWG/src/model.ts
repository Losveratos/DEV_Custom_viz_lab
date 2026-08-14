"use strict";

/* Scatter byDatenWG — gemeinsamer Vertrag zwischen DataView-Parsing (visual.ts),
 * Statistik (stats.ts) und Renderer (render.ts).
 *
 * Konzept: ein Basis-Measure auf Y; jedes weitere Measure wird eine Facette
 * (Small Multiple) mit eigener X-Achse. Punkte = Detail-Kategorie (z. B. Land),
 * Farbe = Legenden-Kategorie (z. B. Kontinent), Punktgröße = optionales
 * Größen-Measure (z. B. Bevölkerung). Y-Skala ist über alle Facetten identisch
 * (gleiches Measure), X-Skala pro Facette.
 */

export interface LegendItem {
    name: string;
    color: string;
}

export interface FacetInput {
    /** stabiler Schlüssel (Measure-QueryName) */
    key: string;
    /** Anzeigename des Measures */
    label: string;
    /** x-Wert je Zeile, Index parallel zu rows */
    x: (number | null)[];
}

export interface RowInput {
    /** Anzeigename des Detail-Werts (Land) */
    label: string;
    y: number | null;
    /** Rohwert des Größen-Measures (null = ohne) */
    size: number | null;
    /** Index in legend[]; -1 wenn keine Legende belegt */
    colorIdx: number;
}

export interface MeasureOption {
    key: string;
    label: string;
}

export interface RenderInput {
    yLabel: string;
    rows: RowInput[];
    facets: FacetInput[];
    legend: LegendItem[];
    /** fertiger Fußzeilentext; "" = Fußzeile ausblenden */
    footer: string;
    /** alle Kennzahlen für die In-Visual-Y-Auswahl (inkl. der aktuellen Y);
     *  leer = Y ist fest über die Datenrolle vorgegeben */
    measures: MeasureOption[];
    /** key der aktuell als Y verwendeten Kennzahl (aus measures) */
    yKey: string;
}

export type XScaleMode = "auto" | "linear" | "log";
export type RegressionMode = "none" | "overall" | "byColor";

export interface RenderTokens {
    surface: string;   // Seitenhintergrund
    card: string;      // Facetten-Kachel
    ink: string;       // Primärtext
    muted: string;     // Sekundärtext (Ticks, r/n)
    border: string;    // Kachelrand (Haarlinie)
    grid: string;      // Gitterlinien
    accent: string;    // Regression gesamt / Hervorhebungen
}

export interface RenderOptions {
    width: number;
    height: number;
    tokens: RenderTokens;

    regression: RegressionMode;
    /** R² im Facettenkopf anzeigen (nur bei regression === "overall") */
    showR2: boolean;
    xScale: XScaleMode;
    /** Facetten nach |Pearson r| absteigend sortieren, sonst Datenreihenfolge */
    sortByR: boolean;
    /** lineare X-Achsen bei 0 beginnen lassen */
    zeroBaseline: boolean;
    /** 0 = automatisch nach Seitenverhältnis */
    columns: number;

    /** Basisradius in px, wenn kein Größen-Measure belegt ist */
    pointSize: number;
    /** Größen-Measure verwenden (wenn belegt): Fläche ~ Wert, sqrt-skaliert */
    sizeEnabled: boolean;
    /** Skalierung aller Schriften (1 = Basis) */
    fontScale: number;
    footerFontSize: number;
    /** Legenden-Chips in der Kopfzeile anzeigen (default true) */
    showLegend?: boolean;

    /** In-Visual-Header (unabhängig vom Power-BI-Titel); title "" = ausblenden */
    header: { title: string; subtitle: string };
    /** Bedienung der Y-Kennzahl-Auswahl; "none" = keine Auswahl anzeigen */
    ySelector: "none" | "dropdown" | "chips";
    onYSelect(key: string, ev: Event): void;

    /** X-Facetten im Visual ein-/ausblenden: Chip-Zeile mit allen
     *  X-Kennzahlen; hidden=true wird gedimmt/durchgestrichen gezeigt.
     *  input.facets enthält bereits NUR die sichtbaren Facetten — der
     *  Renderer plottet unverändert, die Chips sind reine Bedienung.
     *  Leeres Array oder xSelector "none" = Zeile weglassen. */
    xSelector: "none" | "chips";
    xToggles: { key: string; label: string; hidden: boolean }[];
    onXToggle(key: string, ev: Event): void;

    /** Side-Panel: Ranking nach Y (absteigend) + Suche + Detailkarte.
     *  Hover auf Zeile = Cross-Highlight in allen Facetten (engine-intern),
     *  Klick = onClick(row). Detailkarte: alle Kennzahlen des Landes mit
     *  Rang und Min-Max-Verteilungsbalken. collapsed wird engine-intern
     *  getoggelt (Pfeil-Button), initialCollapsed nur als Startwert. */
    panel: { show: boolean; widthPx: number; showDetailCard: boolean; initialCollapsed: boolean };

    /** Zeilen abdunkeln (Cross-Filter/Highlight von außen); null = nichts dimmen */
    dim: ((row: number) => boolean) | null;
    /** dauerhaft markierte Zeile (Pin) — Ring + Label in jeder Facette */
    highlightRow: number | null;

    formatY(v: number): string;
    formatX(facetKey: string, v: number): string;

    onHover(row: number, facetIdx: number, ev: PointerEvent): void;
    onHoverEnd(): void;
    onClick(row: number, ev: MouseEvent): void;
    onLegendClick(colorIdx: number, ev: MouseEvent): void;
    onBackgroundClick(ev: MouseEvent): void;
    onContextMenu(row: number | null, x: number, y: number, ev: MouseEvent): void;
}

/* ---------- Statistik (stats.ts) ---------- */

export interface OlsFit {
    slope: number;
    intercept: number;
    r: number;       // Pearson r
    r2: number;
    n: number;
}

export interface FacetStats {
    /** verwendete Skala nach Auto-Erkennung */
    scale: "linear" | "log";
    /** Fit über alle Punkte der Facette (x ggf. log10-transformiert) */
    overall: OlsFit | null;
    /** Fits je colorIdx (nur Gruppen mit n >= 3) */
    byColor: Map<number, OlsFit>;
}

/* Validierte Standard-Palette (dataviz-Check bestanden, all-pairs, heller
 * Hintergrund): Blau, Orange, Aqua, Violett; danach Wiederverwendung mit
 * hellerem Ton ist Sache des Hosts. Bewusst NICHT die Gapminder-Farben
 * (Rot/Gelb/Hellblau/Grün): deren Paare scheitern an CVD- und
 * Normalsicht-Abständen (siehe QUELLEN.md). */
export const DEFAULT_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7",
    "#e87ba4", "#eda100", "#008300", "#e34948"];

export const LIGHT_TOKENS: RenderTokens = {
    surface: "#fafbfc",
    card: "#ffffff",
    ink: "#333333",
    muted: "#8a93a2",
    border: "#e4e7ec",
    grid: "#eef0f4",
    accent: "#445060",
};

export const DARK_TOKENS: RenderTokens = {
    surface: "#15181d",
    card: "#1d2127",
    ink: "#e6eaee",
    muted: "#96a0ae",
    border: "#2c313a",
    grid: "#262b33",
    accent: "#aeb9c9",
};
