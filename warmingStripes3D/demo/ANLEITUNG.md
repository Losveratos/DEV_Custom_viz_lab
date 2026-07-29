# Demo-Report: Wärmestreifen 3D in Power BI

Schritt-für-Schritt-Aufbau eines explorativen Reports mit dem Custom Visual
und den mitgelieferten Demo-Daten.

## 1. Visual importieren

Power BI Desktop → *Einfügen → Weitere Visuals → Aus einer Datei importieren*
→ `dist/warmingStripes3D….pbiviz` auswählen.

## 2. Demo-Daten laden

*Daten abrufen → Text/CSV* → `demo/waermestreifen_demo.csv` (UTF-8, Komma-getrennt).

| Spalte | Bedeutung |
|---|---|
| `Region` | `Europa` oder `Welt` (je 30 Städte) |
| `Ort`, `Land` | Stadtname, ISO-Länderkürzel |
| `Breitengrad`, `Laengengrad` | Koordinaten (für eigene Karten-Visuals) |
| `MittelC_1961_1990` | absolutes Jahresmittel der Stadt in der WMO-Referenz |
| `Jahr` | 1850–2025 |
| `AnomalieC` | Jahresanomalie in °C **gegen 1961–1990** |

Wichtig: `Jahr` als *Ganze Zahl* belassen und im Visual **„Nicht zusammenfassen"**
wählen. `AnomalieC` als Dezimalzahl.

**Hinweis zur Datenqualität:** Das 30-Städte-Feldmittel je Region folgt jahrgenau
der realen HadCRUT5-Reihe (Met Office; Europa: Nordhemisphäre ×1,45 skaliert,
Welt: global). Die Verteilung der einzelnen Städte um das Feldmittel ist
rekonstruiert — Einzelstadtwerte sind keine Stationsdaten. Für Publikationen
Stationsreihen (ECA&D, DWD-CDC, Berkeley Earth) einsetzen.

## 3. Visual befüllen

| Feld-Bucket | Spalte |
|---|---|
| **Jahr** | `Jahr` (Nicht zusammenfassen) |
| **Ort** | `Ort` |
| **Anomalie (°C)** | `AnomalieC` (Durchschnitt) |

Das Measure kommt pro Ort×Jahr genau einmal vor — „Durchschnitt" ist daher
verlustfrei und bleibt auch bei eigenen Aggregationen sinnvoll.

## 4. Explorativer Aufbau (empfohlene Seite)

- **Slicer `Region`** (Schaltflächen): Europa ↔ Welt umschalten — das Visual
  baut die Ortsachse automatisch neu auf.
- **Slicer `Ort`** (Mehrfachauswahl): Städte ein-/ausblenden.
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
