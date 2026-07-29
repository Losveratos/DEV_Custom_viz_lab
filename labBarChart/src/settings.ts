"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/** Categorical slot 1 (blue) of the validated reference palette. */
export const DEFAULT_BAR_COLOR = "#2a78d6";

class BarsCardSettings extends FormattingSettingsCard {
    defaultColor = new formattingSettings.ColorPicker({
        name: "defaultColor",
        displayName: "Bar color",
        value: { value: DEFAULT_BAR_COLOR }
    });

    name: string = "bars";
    displayName: string = "Bars";
    slices: Array<FormattingSettingsSlice> = [this.defaultColor];
}

class LabelsCardSettings extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Label the extreme value",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text size",
        value: 11
    });

    name: string = "labels";
    displayName: string = "Data label";
    slices: Array<FormattingSettingsSlice> = [this.show, this.fontSize];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    barsCard = new BarsCardSettings();
    labelsCard = new LabelsCardSettings();

    cards = [this.barsCard, this.labelsCard];
}
