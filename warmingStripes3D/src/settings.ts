"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const item = (value: string, displayName: string) => ({ value, displayName });

class AnsichtCardSettings extends FormattingSettingsCard {
    form = new formattingSettings.ItemDropdown({
        name: "form",
        displayName: "Darstellungsform",
        items: [
            item("bars", "Säulenfeld"),
            item("terrain", "Relief"),
            item("curtain", "Bänder"),
            item("stripes", "Streifen-Tafeln")
        ],
        value: item("bars", "Säulenfeld")
    });

    scheme = new formattingSettings.ItemDropdown({
        name: "scheme",
        displayName: "Farbschema",
        items: [
            item("stripes", "Wärmestreifen (blau-rot)"),
            item("steel", "Stahl"),
            item("mono", "Monochrom")
        ],
        value: item("stripes", "Wärmestreifen (blau-rot)")
    });

    theme = new formattingSettings.ItemDropdown({
        name: "theme",
        displayName: "Hintergrund",
        items: [item("light", "Hell"), item("dark", "Dunkel")],
        value: item("light", "Hell")
    });

    vScale = new formattingSettings.NumUpDown({
        name: "vScale",
        displayName: "Höhenskala",
        value: 1,
        options: {
            minValue: { type: 0, value: 0.4 },
            maxValue: { type: 1, value: 2.2 }
        }
    });

    grid = new formattingSettings.ToggleSwitch({
        name: "grid",
        displayName: "Raster & Achsenkäfig",
        value: true
    });

    labels = new formattingSettings.ItemDropdown({
        name: "labels",
        displayName: "Beschriftung",
        items: [item("axes", "Achsen"), item("min", "Ohne")],
        value: item("axes", "Achsen")
    });

    toolbar = new formattingSettings.ToggleSwitch({
        name: "toolbar",
        displayName: "Bedienleiste im Visual",
        value: true
    });

    legend = new formattingSettings.ToggleSwitch({
        name: "legend",
        displayName: "Farblegende",
        value: true
    });

    readout = new formattingSettings.ToggleSwitch({
        name: "readout",
        displayName: "Auslesefeld (Hover-Details)",
        value: true
    });

    bgColor = new formattingSettings.ColorPicker({
        name: "bgColor",
        displayName: "Hintergrundfarbe (leer = Thema)",
        value: { value: "" }
    });

    name: string = "ansicht";
    displayName: string = "Darstellung";
    slices: Array<FormattingSettingsSlice> = [
        this.form, this.scheme, this.theme, this.bgColor, this.vScale,
        this.grid, this.labels, this.toolbar, this.legend, this.readout
    ];
}

class PerspektiveCardSettings extends FormattingSettingsCard {
    preset = new formattingSettings.ItemDropdown({
        name: "preset",
        displayName: "Kamera-Voreinstellung",
        items: [
            item("iso", "Übersicht ¾"),
            item("top", "Aufsicht — klassische Streifen"),
            item("time", "Zeitachse"),
            item("place", "Ortsprofil"),
            item("graze", "Streiflicht")
        ],
        value: item("iso", "Übersicht ¾")
    });

    name: string = "perspektive";
    displayName: string = "Perspektive";
    slices: Array<FormattingSettingsSlice> = [this.preset];
}

class ReferenzCardSettings extends FormattingSettingsCard {
    modus = new formattingSettings.ItemDropdown({
        name: "modus",
        displayName: "Nulllinie",
        items: [
            item("asis", "Werte wie geliefert"),
            item("periode", "Auf Periode re-referenzieren")
        ],
        value: item("asis", "Werte wie geliefert")
    });

    von = new formattingSettings.NumUpDown({
        name: "von",
        displayName: "Periode von (Jahr)",
        value: 1961
    });

    bis = new formattingSettings.NumUpDown({
        name: "bis",
        displayName: "Periode bis (Jahr)",
        value: 1990
    });

    name: string = "referenz";
    displayName: string = "Referenzperiode";
    slices: Array<FormattingSettingsSlice> = [this.modus, this.von, this.bis];
}

class AnalyseCardSettings extends FormattingSettingsCard {
    smooth = new formattingSettings.ItemDropdown({
        name: "smooth",
        displayName: "Zeitliche Glättung",
        items: [
            item("0", "Rohdaten · Einzeljahre"),
            item("2", "5-jähriges Mittel"),
            item("5", "11-jähriges Mittel"),
            item("10", "21-jähriges Mittel")
        ],
        value: item("0", "Rohdaten · Einzeljahre")
    });

    sort = new formattingSettings.ItemDropdown({
        name: "sort",
        displayName: "Reihenfolge der Ortsachse",
        items: [
            item("data", "Datenreihenfolge"),
            item("name", "Alphabetisch"),
            item("last", "Letztes Jahr · warm → kalt"),
            item("avg5", "Mittel letzte 5 Jahre · warm → kalt"),
            item("trend", "Erwärmung gesamt · stark → schwach")
        ],
        value: item("data", "Datenreihenfolge")
    });

    name: string = "analyse";
    displayName: string = "Analyse";
    slices: Array<FormattingSettingsSlice> = [this.smooth, this.sort];
}

class AnimationCardSettings extends FormattingSettingsCard {
    seconds = new formattingSettings.NumUpDown({
        name: "seconds",
        displayName: "Aufbau-Dauer (Sekunden)",
        value: 14,
        options: {
            minValue: { type: 0, value: 3 },
            maxValue: { type: 1, value: 60 }
        }
    });

    name: string = "animation";
    displayName: string = "Animation";
    slices: Array<FormattingSettingsSlice> = [this.seconds];
}

class SkalaCardSettings extends FormattingSettingsCard {
    uiScale = new formattingSettings.NumUpDown({
        name: "uiScale",
        displayName: "Bedienelemente & Auslesefeld (%)",
        value: 100,
        options: {
            minValue: { type: 0, value: 75 },
            maxValue: { type: 1, value: 300 }
        }
    });

    labelSize = new formattingSettings.NumUpDown({
        name: "labelSize",
        displayName: "3D-Beschriftung (Punkt)",
        value: 12,
        options: {
            minValue: { type: 0, value: 8 },
            maxValue: { type: 1, value: 40 }
        }
    });

    name: string = "skala";
    displayName: string = "Größe & Skalierung";
    slices: Array<FormattingSettingsSlice> = [this.uiScale, this.labelSize];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    ansichtCard = new AnsichtCardSettings();
    skalaCard = new SkalaCardSettings();
    perspektiveCard = new PerspektiveCardSettings();
    referenzCard = new ReferenzCardSettings();
    analyseCard = new AnalyseCardSettings();
    animationCard = new AnimationCardSettings();

    cards = [this.ansichtCard, this.skalaCard, this.perspektiveCard, this.referenzCard, this.analyseCard, this.animationCard];
}
