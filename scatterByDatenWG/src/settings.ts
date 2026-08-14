"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const item = (value: string, displayName: string) => ({ value, displayName });

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

    fontScale = new formattingSettings.NumUpDown({
        name: "fontScale",
        displayName: "Schriftskalierung (%)",
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
        this.theme, this.pointSize, this.sizeEnabled, this.fontScale, this.showLegend
    ];
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

    name: string = "facetten";
    displayName: string = "Facetten";
    slices: Array<FormattingSettingsSlice> = [
        this.xScale, this.sortByR, this.zeroBaseline, this.columns
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
    darstellungCard = new DarstellungCardSettings();
    facettenCard = new FacettenCardSettings();
    regressionCard = new RegressionCardSettings();
    fusszeileCard = new FusszeileCardSettings();

    cards = [this.darstellungCard, this.facettenCard, this.regressionCard, this.fusszeileCard];
}
