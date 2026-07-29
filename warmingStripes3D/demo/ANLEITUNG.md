# Demo-Report: Wärmestreifen 3D in Power BI

Schritt-für-Schritt-Aufbau eines explorativen Reports mit dem Custom Visual
und den mitgelieferten Demo-Daten.

## 1. Visual importieren

Power BI Desktop → *Einfügen → Weitere Visuals → Aus einer Datei importieren*
→ `dist/warmingStripes3D….pbiviz` auswählen.

## 2. Daten laden

Es liegen **zwei** Datensätze bei — beide im identischen Spaltenschema, also
gegeneinander austauschbar:

### `waermestreifen_ghcn.csv` — echte Messdaten (empfohlen)

758 Wetterstationen aus 70 Ländern, 1850–2024, direkt aus **NOAA GHCN-Daily**
aggregiert (public domain). Jede Zeile ist ein gemessener Stationswert, keine
Rekonstruktion. Reproduzierbar mit `tools/fetch_ghcn.py` (lädt selbst von S3).

### `waermestreifen_demo.csv` — kuratierte 60 Städte

Europa + Welt mit je 30 bekannten Städten, 1850–2025. Das Feldmittel folgt
jahrgenau HadCRUT5 (Met Office), die Verteilung der einzelnen Städte um dieses
Mittel ist jedoch **rekonstruiert** — Einzelstadtwerte sind hier keine
Stationsdaten. Vorteil: übersichtliche, bekannte Ortsnamen für Präsentationen.

### Spaltenschema (beide Dateien)

*Daten abrufen → Text/CSV*, UTF-8, Komma-getrennt.

| Spalte | Bedeutung |
|---|---|
| `Region` | GHCN: Kontinent · Demo: `Europa`/`Welt` |
| `Ort`, `Land` | Stations-/Stadtname, ISO-Länderkürzel |
| `Breitengrad`, `Laengengrad` | Koordinaten (für eigene Karten-Visuals) |
| `MittelC_1961_1990` | absolutes Jahresmittel des Orts in der WMO-Referenz |
| `Jahr` | GHCN: 1850–2024 · Demo: 1850–2025 |
| `AnomalieC` | Jahresanomalie in °C **gegen 1961–1990** |

Wichtig: `Jahr` als *Ganze Zahl* belassen und im Visual **„Nicht zusammenfassen"**
wählen. `AnomalieC` als Dezimalzahl.

### Methodik der GHCN-Aufbereitung

- Tageswerte mit gesetztem Qualitätsflag werden verworfen.
- Monatsmittel = (TMAX+TMIN)/2 bei je ≥20 Messtagen, sonst TAVG bei ≥20 Tagen.
- Jahresmittel: ≥11 Monate vorhanden; ein einzelner Fehlmonat wird mit der
  Monats-Klimatologie 1961–1990 der Station gefüllt (verhindert saisonale
  Verzerrung durch fehlende Winter- oder Sommermonate).
- Verworfen werden: Einzeljahr-Ausreißer (>4 °C gegen den Median der ±5
  Nachbarjahre) sowie nicht-polare Stationen mit mehrjährigen Sprüngen
  >4,2 °C — das sind praktisch immer Stationsumzüge, keine Klimasignale.
- Stationsfilter: ≥25 Basisjahre in 1961–1990, ≥60 Jahre gesamt, ≥3 Jahre
  in 2020–2024, Reihenbeginn ≤1957.

**Plausibilitätsprüfung:** Über die 153 durchgehenden Reihen seit 1900 ergeben
sich als Dekadenmittel −0,42 °C (1900er), −0,15 °C (1940er), −0,22 °C (1960er),
+0,12 °C (1980er), +0,89 °C (2000er), +1,60 °C (2020–24). Das reproduziert die
bekannte Kurve inklusive der Abkühlungsdelle der 1960er. Landstationen erwärmen
sich schneller als der globale Land-See-Mittelwert — der höhere Endwert
gegenüber HadCRUT5 ist also erwartet, kein Fehler.

**Stationen je Region:** Asien 342, Europa 172, Nordamerika 96, Ozeanien 43,
Afrika 22, Südamerika 3, Antarktis 1. Die Schieflage spiegelt die reale
Verfügbarkeit langer, frei zugänglicher Reihen — Südamerika und Afrika sind in
GHCN-Daily für lange Zeiträume dünn besetzt. Für eine ausgewogene Weltkarte
daher eher nach `Region` filtern als alles gleichzeitig zeigen.

## 3. Visual befüllen

| Feld-Bucket | Spalte |
|---|---|
| **Jahr** | `Jahr` (Nicht zusammenfassen) |
| **Ort** | `Ort` |
| **Anomalie (°C)** | `AnomalieC` (Durchschnitt) |

Das Measure kommt pro Ort×Jahr genau einmal vor — „Durchschnitt" ist daher
verlustfrei und bleibt auch bei eigenen Aggregationen sinnvoll.

## 4. Explorativer Aufbau (empfohlene Seite)

- **Slicer `Region`** (Schaltflächen): Kontinent bzw. Europa ↔ Welt umschalten —
  das Visual baut die Ortsachse automatisch neu auf. Beim GHCN-Datensatz ist das
  der wichtigste Slicer: 758 Stationen gleichzeitig sind zwar darstellbar, eine
  einzelne Region liest sich aber deutlich besser.
- **Slicer `Land`** (Mehrfachauswahl, nur GHCN sinnvoll): 70 Länder zur Auswahl.
- **Slicer `Ort`** (Mehrfachauswahl): Stationen/Städte ein-/ausblenden.
- **Slicer `Jahr`** (Bereich): Zeitfenster einschränken — Achsen, Kamera und
  Raster passen sich an.
- Interaktion im Visual: **Ziehen** = drehen, **Rad** = zoomen,
  **Umschalt+Ziehen** = verschieben, **Klick** auf einen Datenpunkt =
  Cross-Filter (Ort×Jahr) auf andere Visuals, **Rechtsklick** = Kontextmenü
  (Drillthrough usw.), **Hover** = Tooltip mit Ort/Jahr/Abweichung.
- Bedienleiste links oben im Visual: Darstellungsform, Perspektive,
  Aufbau-Animation ▸ (Dauer im Formatbereich unter *Animation*).

## 5. Formatbereich (Auswahl)

- **Darstellung**: Säulenfeld / Relief / Bänder / Streifen-Tafeln, Farbschema,
  Hell/Dunkel, Höhenskala, Raster, Beschriftung, Bedienleiste, Legende.
- **Perspektive**: Übersicht ¾, Aufsicht (klassische Streifen), Zeitachse,
  Ortsprofil, Streiflicht.
- **Referenzperiode**: „Auf Periode re-referenzieren" verschiebt die Nulllinie
  pro Ort auf ein frei wählbares Periodenmittel (z. B. 1850–1900 für die
  vorindustrielle Sicht) — die Offsets werden live aus den geladenen Daten
  gerechnet. `demo/baseline_offsets.csv` enthält die Referenz-Offsets des
  Original-Artifacts zum Gegenprüfen.
- **Analyse**: Glättung (5/11/21-jähriges Mittel), Sortierung der Ortsachse
  (u. a. „Mittel letzte 5 Jahre" und „Erwärmung gesamt").

## 6. Ideen für weitere Seiten

- Karte (`Breitengrad`/`Laengengrad`) neben dem 3D-Visual: Klick auf eine Stadt
  filtert das Streifenfeld.
- Liniendiagramm des Feldmittels (`AnomalieC` über `Jahr`) als 2D-Kontrolle.
- Zwei Seiten „Europa" / „Welt" mit vorgefilterter Region und unterschiedlicher
  Standard-Perspektive (¾-Übersicht vs. Aufsicht).
