# Handoff: Homepage-Beitrag „Wärmestreifen 3D für Power BI"

Alles, was für einen Beitrag auf der Homepage gebraucht wird: Story, Fakten,
Medien, Links und die Pflicht-Attributionen. Stand: 30.07.2026, Visual-Version
1.5.0.0.

---

## 1. Titelvorschläge

- **175 Jahre Klimageschichte zum Anfassen — ein 3D-Custom-Visual für Power BI**
- Wärmestreifen in der dritten Dimension: 758 Wetterstationen, 1850 bis heute
- Von der Klima-Ikone zum interaktiven Datenraum: Warming Stripes 3D in Power BI

**Teaser (2 Sätze):** Die berühmten Warming Stripes von Ed Hawkins zeigen die
Erderwärmung als Farbcode — dieses Power-BI-Visual stellt sie in den Raum:
Zeit auf der einen Achse, 758 Wetterstationen auf der anderen, die Abweichung
als Höhe. Man kann hineinfliegen, filtern, vergleichen — und zusehen, wie das
Feld ab den 1980ern ins Rote kippt.

---

## 2. Elevator Pitch (für den Einstieg des Beitrags)

Jede Säule ist ein Jahr an einem Ort. Links beginnt 1850, rechts endet 2024;
nach hinten reihen sich Wetterstationen von Spitzbergen bis Melbourne. Blau
heißt kälter, Rot heißt wärmer als das Mittel von 1961–1990. Ein Jahrhundert
lang wogt das Feld richtungslos um die Nulllinie — dann hebt es sich als
Ganzes. Kein einzelner Ort erzählt diese Geschichte; erst die 758 Stationen
gemeinsam machen sie unübersehbar.

Das Ganze ist kein Video und keine Grafik, sondern ein **Custom Visual für
Microsoft Power BI**: Die Daten kommen aus dem normalen Datenmodell, jeder
Slicer wirkt sofort, jeder Klick ins 3D-Feld filtert die anderen Diagramme
der Berichtsseite mit.

---

## 3. Was das Visual kann (Feature-Liste für den Beitrag)

**Vier Darstellungsformen** desselben Datenraums:
- *Säulenfeld* — eine Säule pro Ort und Jahr
- *Relief* — durchgehende Landschaft, die Erwärmung als Geländestufe
- *Bänder* — pro Ort eine Wand von der Nulllinie zur Abweichung
- *Streifen-Tafeln* — die klassischen Warming Stripes, aufgestellt im Raum

**Interaktion:**
- Fünf kuratierte Kameraperspektiven mit animierten Kamerafahrten, dazu freie
  Orbit-Steuerung und echtes Hineinfliegen bis zwischen die Säulen (Mausrad,
  zieht zum Punkt unter dem Zeiger)
- Aufbau-Animation: das Feld wächst Jahr für Jahr von 1850 bis heute
- Auslesefeld beim Überfahren: Stationsname, die klassischen Warming Stripes
  dieser Station, Wert und Rang des Jahres („2018 · +1,87 °C · Rang 3 von 149")
- Klick = Cross-Filter auf alle anderen Visuals der Seite, Rechtsklick =
  Power-BI-Kontextmenü, Hover = Tooltip
- **Referenz-Kippschalter**: ein Klick wechselt die Nulllinie von 1961–1990
  (WMO) auf 1850–1900 (vorindustriell) — das gesamte Feld kippt sichtbar ins
  Rote. Der stärkste Moment des Visuals, im Beitrag unbedingt erwähnen.
- Kiosk-Modus für Wandmonitore: nach einstellbarer Inaktivität kreist die
  Kamera langsam, jede Berührung pausiert
- Analyse: Glättung (5/11/21-Jahres-Mittel), Sortierung der Ortsachse (u. a.
  nach Erwärmung), dynamische Referenzperiode frei wählbar
- Skalierung für 4K-Displays, freie Hintergrundfarbe, Hell/Dunkel

---

## 4. Die Daten (für den Faktenkasten)

| Kennzahl | Wert |
|---|---|
| Wetterstationen | 758 aus 70 Ländern |
| Zeitraum | 1850–2024 (175 Jahre) |
| Datenpunkte im Visual | bis zu ~71.500 Jahreswerte |
| Quelle | NOAA GHCN-Daily (public domain), tagesgenaue Rohmessungen |
| Aufbereitung | Tag → Monat → Jahr mit Qualitäts- und Vollständigkeitsregeln |
| Referenz | Anomalie gegen das stationseigene Mittel 1961–1990 |

**Der Befund in einer Zahl:** Über die 153 Stationen mit durchgehender Reihe
seit 1900 lagen die 1900er Jahre im Mittel 0,42 °C *unter* der Referenz
1961–1990 — die Jahre 2020–2024 liegen 1,60 °C *darüber*. Dazwischen liegt
keine gerade Linie, sondern die bekannte Kurve mit der Abkühlungsdelle der
1960er, die das Feld sichtbar reproduziert.

**Transparenz-Absatz (empfohlen, schafft Glaubwürdigkeit):** Die Reihen sind
unbereinigte Stationsmessungen — ohne Homogenisierung und ohne
Wärmeinsel-Korrektur; ein ungewichtetes Mittel über alle Stationen ist kein
Globalmittel, und Ozeane fehlen ganz. Wer belastbare Globalwerte braucht,
nimmt HadCRUT5 oder Berkeley Earth. Für das, was dieses Visual zeigt — die
Richtung und Gleichzeitigkeit der Veränderung über hunderte Orte — sind die
Rohreihen genau richtig.

---

## 5. Medien (liegen in `warmingStripes3D/media/`)

| Datei | Motiv | Einsatz |
|---|---|---|
| `01_saeulenfeld_demo_hell.png` | Säulenfeld ¾-Ansicht, heller Hintergrund, 30 Städte | Hero-Bild hell |
| `02_saeulenfeld_ghcn_dunkel.png` | Säulenfeld mit 175 echten GHCN-Stationen, dunkel | Hero-Bild dunkel |
| `03_relief_streiflicht.png` | Relief in flacher Perspektive — Erwärmung als Geländestufe | Im Fließtext |
| `04_streifen_aufsicht.png` | Klassische Warming Stripes von oben, Datenlücken sichtbar | Brücke zur Hawkins-Ikone |
| `05_baender_ortsprofil.png` | Bänder-Form im Ortsprofil, dunkel | Optional |
| `06_kamerafahrt_im_feld.png` | Kamera mitten im Feld (Zoom ~490 %) | Beleg für „hineinfliegen" |
| `waermestreifen_3d_demo.mp4` | 30 s, 1280×720, H.264: Aufbau → Relief → Rotation → Aufsicht | Video-Einbettung / Social |

Direkt verlinkbar (Branch-Stand):
`https://raw.githubusercontent.com/losveratos/dev_custom_viz_lab/refs/heads/claude/power-bi-custom-visual-r1r03e/warmingStripes3D/media/<dateiname>`

*(Nach Merge in `main` den Branchnamen in der URL ersetzen.)*

---

## 6. Entstehungsgeschichte (falls der Beitrag eine Making-of-Sektion bekommt)

1. Ausgangspunkt war ein interaktives Standalone-Artifact (WebGL/three.js) mit
   kuratierten 60 Städten.
2. Portierung als Power-BI-Custom-Visual: Die Daten kommen seitdem aus dem
   Datenmodell — Slicer, Cross-Filtering, Tooltips und Formatbereich inklusive.
   three.js wird gebündelt, das Visual lädt zur Laufzeit nichts nach.
3. Die Demo-Daten wurden durch echte Messreihen ersetzt: eine reproduzierbare
   Pipeline lädt NOAA GHCN-Daily (tägliche Rohwerte), aggregiert zu
   Jahresanomalien und filtert Stationsfehler heraus (`tools/fetch_ghcn.py`).
4. Die echten Daten (viermal mehr Orte, 33 % Lücken) deckten Grenzfälle im
   Renderer auf, die mit kuratierten Daten nie auftraten — u. a. mussten
   Nebel und Kameraeinpassung mit der Feldgröße skalieren und Datenlücken
   als Lücken sichtbar bleiben statt als Nullwerte.

Entwickelt wurde das Projekt im Pair mit **Claude (Anthropic)** — von der
Analyse des Original-Artifacts über die Portierung bis zur Datenpipeline.
*(Erwähnung optional; wenn KI-Beteiligung auf der Homepage ein Thema ist,
ist das ein ehrlicher und interessanter Nebenstrang.)*

---

## 7. Links für den Beitrag

- **Repository:** https://github.com/losveratos/dev_custom_viz_lab
  (Branch `claude/power-bi-custom-visual-r1r03e`, Ordner `warmingStripes3D/`)
- **Fertiges Visual (.pbiviz):** im Repo unter `warmingStripes3D/dist/`
- **Datensatz (CSV, 758 Stationen):** `warmingStripes3D/demo/waermestreifen_ghcn.csv`
- **Report-Anleitung:** `warmingStripes3D/demo/ANLEITUNG.md`
- **Quellen & Methodik im Detail:** `warmingStripes3D/QUELLEN.md`
- **Original Warming Stripes:** https://showyourstripes.info (Ed Hawkins)
- **Datenquelle:** https://registry.opendata.aws/noaa-ghcn/ (NOAA GHCN-Daily)

---

## 8. Pflicht-Attributionen für die Veröffentlichung

Diese drei Nennungen gehören in den Beitrag (Fußzeile oder Quellenblock):

1. **Ed Hawkins** als Urheber des Warming-Stripes-Konzepts:
   > Darstellung inspiriert von den „Warming Stripes" von Prof. Ed Hawkins,
   > University of Reading — showyourstripes.info
2. **NOAA GHCN-Daily** als Datenquelle:
   > Datengrundlage: NOAA Global Historical Climatology Network – Daily
   > (Menne et al. 2012, doi:10.7289/V5D21VHZ), aufbereitet zu Jahresanomalien
   > gegen 1961–1990; Aufbereitung siehe Projekt-Repository.
3. Bei Verwendung des kuratierten 60-Städte-Datensatzes zusätzlich der
   Hinweis, dass dessen Einzelstadtwerte **rekonstruiert** sind (Details in
   `QUELLEN.md`, Abschnitt 2). Empfehlung: für den Beitrag ausschließlich
   Screenshots aus den GHCN-Daten verwenden, dann entfällt das.

Alle Software-Bestandteile (three.js, Power-BI-SDK) sind MIT-lizenziert;
die GHCN-Daten sind gemeinfrei. Der Veröffentlichung auf einer Homepage
steht lizenzseitig nichts entgegen.

---

## 9. Was der Beitrag NICHT behaupten sollte

- Nicht: „zeigt die globale Mitteltemperatur" — es sind Landstationen ohne
  Flächengewichtung. Richtig: „zeigt 758 einzelne Messreihen gleichzeitig".
- Nicht: „alle Werte sind Messwerte" bei Screenshots aus dem
  60-Städte-Demo-Datensatz — dort ist nur das Feldmittel real.
- Nicht: „wissenschaftlich homogenisierte Daten" — bewusst Rohreihen, siehe
  Transparenz-Absatz in Abschnitt 4.

---

## 10. SEO / Schlagworte

Power BI Custom Visual · Warming Stripes · Wärmestreifen · 3D-Datenvisualisierung ·
WebGL · three.js · Klimadaten · NOAA GHCN · Klimawandel visualisieren ·
Data Storytelling · Open Data
