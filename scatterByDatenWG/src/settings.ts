"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const item = (value: string, displayName: string) => ({ value, displayName });

class KopfCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Kopfzeile anzeigen",
        value: true
    });

    title = new formattingSettings.TextInput({
        name: "title",
        displayName: "Titel",
        placeholder: "Titel…",
        value: ""
    });

    subtitle = new formattingSettings.TextInput({
        name: "subtitle",
        displayName: "Untertitel",
        placeholder: "Untertitel…",
        value: ""
    });

    name: string = "kopf";
    displayName: string = "Kopfzeile";
    slices: Array<FormattingSettingsSlice> = [this.show, this.title, this.subtitle];
}

class DarstellungCardSettings extends FormattingSettingsCard {
    theme = new formattingSettings.ItemDropdown({
        name: "theme",
        displayName: "Hintergrund",
        items: [item("light", "Hell"), item("dark", "Dunkel")],
        value: item("light", "Hell")
    });

    pointSize = new formattingSettings.NumUpDown({
        name: "pointSize",
        displayName: "Punktgröße",
        value: 4,
        options: {
            minValue: { type: 0, value: 2 },
            maxValue: { type: 1, value: 20 }
        }
    });

    sizeEnabled = new formattingSettings.ToggleSwitch({
        name: "sizeEnabled",
        displayName: "Größen-Measure verwenden",
        value: true
    });

    sizePreset = new formattingSettings.ItemDropdown({
        name: "sizePreset",
        displayName: "Größen-Preset (Zielauflösung)",
        items: [
            item("fhd", "Full HD (100 %)"),
            item("hd", "HD (85 %)"),
            item("uhd", "4K (180 %)"),
            item("custom", "Benutzerdefiniert (nur Schriftskalierung)")
        ],
        value: item("fhd", "Full HD (100 %)")
    });

    fontScale = new formattingSettings.NumUpDown({
        name: "fontScale",
        displayName: "Feinjustierung Schrift (%)",
        value: 100,
        options: {
            minValue: { type: 0, value: 75 },
            maxValue: { type: 1, value: 300 }
        }
    });

    showLegend = new formattingSettings.ToggleSwitch({
        name: "showLegend",
        displayName: "Legende anzeigen",
        value: true
    });

    name: string = "darstellung";
    displayName: string = "Darstellung";
    slices: Array<FormattingSettingsSlice> = [
        this.theme, this.pointSize, this.sizeEnabled, this.sizePreset, this.fontScale, this.showLegend
    ];
}

class FarbenCardSettings extends FormattingSettingsCard {
    // visual.ts füllt die Slices zur Laufzeit dynamisch: je Legendenwert wird ein
    // ColorPicker-Slice mit passendem Selector (Property "fill") an dieses Array angehängt.
    name: string = "datenfarben";
    displayName: string = "Datenfarben";
    slices: Array<FormattingSettingsSlice> = [];
}

class FacettenCardSettings extends FormattingSettingsCard {
    xScale = new formattingSettings.ItemDropdown({
        name: "xScale",
        displayName: "X-Achsen-Skala",
        items: [
            item("auto", "Automatisch (log bei schiefer Verteilung)"),
            item("linear", "Linear"),
            item("log", "Logarithmisch")
        ],
        value: item("auto", "Automatisch (log bei schiefer Verteilung)")
    });

    sortByR = new formattingSettings.ToggleSwitch({
        name: "sortByR",
        displayName: "Nach Korrelationsstärke sortieren",
        value: true
    });

    zeroBaseline = new formattingSettings.ToggleSwitch({
        name: "zeroBaseline",
        displayName: "Lineare X-Achse bei 0 beginnen",
        value: false
    });

    columns = new formattingSettings.NumUpDown({
        name: "columns",
        displayName: "Spalten (0 = automatisch)",
        value: 0,
        options: {
            minValue: { type: 0, value: 0 },
            maxValue: { type: 1, value: 8 }
        }
    });

    ySelector = new formattingSettings.ItemDropdown({
        name: "ySelector",
        displayName: "Y-Kennzahl-Auswahl im Visual",
        items: [
            item("none", "Keine Auswahl im Visual"),
            item("dropdown", "Dropdown im Kopf"),
            item("chips", "Chip-Leiste")
        ],
        value: item("dropdown", "Dropdown im Kopf")
    });

    // Hinweis: "yKey" (persistierte, im Visual gewählte Y-Kennzahl) ist bewusst kein
    // Slice hier – wird nur in capabilities.json definiert und von visual.ts per
    // persistProperties geschrieben/gelesen, taucht daher nicht im Formatbereich auf.

    name: string = "facetten";
    displayName: string = "Facetten";
    slices: Array<FormattingSettingsSlice> = [
        this.xScale, this.sortByR, this.zeroBaseline, this.columns, this.ySelector
    ];
}

class RegressionCardSettings extends FormattingSettingsCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "Regressionsgerade",
        items: [
            item("none", "Keine"),
            item("overall", "Eine Gerade je Facette"),
            item("byColor", "Je Farbgruppe")
        ],
        value: item("overall", "Eine Gerade je Facette")
    });

    showR2 = new formattingSettings.ToggleSwitch({
        name: "showR2",
        displayName: "R² anzeigen",
        value: true
    });

    name: string = "regression";
    displayName: string = "Regression";
    slices: Array<FormattingSettingsSlice> = [this.mode, this.showR2];
}

class PanelCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Side-Panel anzeigen",
        value: true
    });

    width = new formattingSettings.NumUpDown({
        name: "width",
        displayName: "Breite (px)",
        value: 250,
        options: {
            minValue: { type: 0, value: 180 },
            maxValue: { type: 1, value: 420 }
        }
    });

    detailCard = new formattingSettings.ToggleSwitch({
        name: "detailCard",
        displayName: "Detailkarte bei Hover",
        value: true
    });

    startCollapsed = new formattingSettings.ToggleSwitch({
        name: "startCollapsed",
        displayName: "Eingeklappt starten",
        value: false
    });

    name: string = "panel";
    displayName: string = "Side-Panel (Ranking)";
    slices: Array<FormattingSettingsSlice> = [
        this.show, this.width, this.detailCard, this.startCollapsed
    ];
}

class FusszeileCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Fußzeile anzeigen",
        value: true
    });

    text = new formattingSettings.TextInput({
        name: "text",
        displayName: "Text (Datenrolle 'Quelle' hat Vorrang)",
        placeholder: "Quelle: …",
        value: ""
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Schriftgröße",
        value: 9,
        options: {
            minValue: { type: 0, value: 7 },
            maxValue: { type: 1, value: 18 }
        }
    });

    name: string = "fusszeile";
    displayName: string = "Quellen-Fußzeile";
    slices: Array<FormattingSettingsSlice> = [this.show, this.text, this.fontSize];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    kopfCard = new KopfCardSettings();
    darstellungCard = new DarstellungCardSettings();
    farbenCard = new FarbenCardSettings();
    facettenCard = new FacettenCardSettings();
    regressionCard = new RegressionCardSettings();
    panelCard = new PanelCardSettings();
    fusszeileCard = new FusszeileCardSettings();

    cards = [
        this.kopfCard,
        this.darstellungCard,
        this.farbenCard,
        this.facettenCard,
        this.regressionCard,
        this.panelCard,
        this.fusszeileCard
    ];
}
