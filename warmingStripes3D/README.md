# Wärmestreifen 3D — Power BI Custom Visual

Port des Standalone-Artifacts „Wärmestreifen 3D" (WebGL/Three.js) als
Power-BI-Custom-Visual: **X = Zeit, Z = Ort, Y = Temperaturabweichung**.

![Formen](demo/) — Demo-Daten und Report-Anleitung unter `demo/`.

## Darstellungsformen

- **Säulenfeld** — eine Säule pro Ort×Jahr, Höhe und Farbe = Anomalie
- **Relief** — durchgehende Fläche über dem Raster
- **Bänder** — pro Ort eine Wand von der Nulllinie zur Abweichung
- **Streifen-Tafeln** — klassische Warming Stripes als aufgestellte Platten

Dazu fünf kuratierte Kameraperspektiven (¾-Übersicht, Aufsicht, Zeitachse,
Ortsprofil, Streiflicht) mit animierten Kamerafahrten, freie Orbit-Steuerung
(Ziehen/Rad/Umschalt+Ziehen) und eine Aufbau-Animation entlang der Zeitachse.

## Power-BI-Integration

- **Data Roles:** Jahr (Grouping), Ort (Series-Grouping), Anomalie (Measure) —
  das kartesische 176×30-Feld entsteht aus einem normalen Long-Format-Modell,
  Slicer auf Region/Ort/Jahr wirken direkt auf das Visual.
- **Hover** → Power-BI-Tooltip (Ort, Jahr, Abweichung).
- **Klick** → Cross-Filtering (Selektion Ort×Jahr), Klick auf denselben Punkt
  hebt auf; **Rechtsklick** → Kontextmenü. Highlight-Daten anderer Visuals
  dimmen die nicht getroffenen Punkte im 3D-Feld.
- **Formatbereich:** Darstellungsform, Farbschema (Wärmestreifen/Stahl/Mono),
  Hell/Dunkel, Höhenskala, Raster, Beschriftung, Bedienleiste, Legende,
  Kamera-Preset, **dynamische Referenzperiode** (Nulllinie wird pro Ort aus den
  geladenen Daten re-referenziert), Glättung (5/11/21 Jahre), Sortierung der
  Ortsachse, Animationsdauer.
- In-Visual-Bedienleiste (abschaltbar) für Form/Perspektive/Aufbau-Animation;
  die Auswahl wird per `persistProperties` in den Formatbereich zurückgeschrieben.

## Abweichungen vom Original-Artifact

- three.js wird **gebündelt** (npm `three@0.160`) statt vom CDN geladen —
  Custom Visuals laufen in einer Sandbox ohne externe Ressourcen.
- Die Jahresachse ist ein explizites Array: Power BI darf gefilterte/verschobene
  Zeiträume liefern.
- Baseline-Offsets werden **live aus den Daten** gerechnet (Formatbereich →
  Referenzperiode) statt aus vorberechneten Werten.
- React-UI (Seitenleiste, Tour, Vergleich, Detailpanel) ersetzt durch
  Power-BI-Mechanik: Slicer, Tooltips, Cross-Filtering, Formatbereich.
- Schrift: System-Sans statt Barlow Condensed (keine Font-Einbettung nötig).

## Build

```sh
npm install
npx pbiviz package   # erzeugt dist/*.pbiviz
```

Fertiges Paket: `dist/warmingStripes3D….pbiviz` → in Power BI importieren
(*Einfügen → Weitere Visuals → Aus einer Datei importieren*).

## Quelltext-Layout

- `src/viz3d.ts` — host-unabhängiger WebGL-Renderer (Szene, 4 Formen, Orbit,
  Presets, Picking, DOM-Labels, Reveal-Clipping)
- `src/visual.ts` — Power-BI-Wiring: DataView-Parsing (grouped categorical),
  Selektion/Highlights, Tooltips, Kontextmenü, Toolbar, Legende, Animation
- `src/settings.ts` — Formatbereich-Modell
- `demo/` — Datensätze + Report-Anleitung:
  `waermestreifen_ghcn.csv` (758 echte Wetterstationen aus 70 Ländern,
  1850–2024, aus NOAA GHCN-Daily) und `waermestreifen_demo.csv`
  (60 kuratierte Städte, HadCRUT5-kalibriertes Feldmittel)
- `tools/fetch_ghcn.py` — reproduzierbare Datenpipeline: lädt GHCN-Daily von
  S3, wählt Stationen aus, rechnet Jahresmittel und Anomalien, schreibt die CSV
- `QUELLEN.md` — Datenquellen, Zitationen, Lizenzen, Methodik und die Grenzen
  der Aufbereitung

## Daten direkt aus GitHub laden

Statt die CSV herunterzuladen, kann Power BI sie per *Daten abrufen → Web*
direkt ziehen:

```
https://raw.githubusercontent.com/losveratos/dev_custom_viz_lab/refs/heads/claude/power-bi-custom-visual-r1r03e/warmingStripes3D/demo/waermestreifen_ghcn.csv
```

Fertiges Power-Query-Skript mit korrekter Codierung und Datentypen:
siehe `demo/ANLEITUNG.md`, Abschnitt 2.
