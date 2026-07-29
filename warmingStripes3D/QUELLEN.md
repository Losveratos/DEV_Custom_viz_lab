# Quellen und Nachweise

Alle Datengrundlagen, Zitationen und übernommenen Fremdbestandteile dieses
Custom Visuals. Stand: 29.07.2026.

---

## 1. Primäre Datenquelle — `demo/waermestreifen_ghcn.csv`

**NOAA GHCN-Daily (Global Historical Climatology Network – Daily), Version 3.34**

Bezogen über den öffentlichen AWS-Open-Data-Bucket:
`https://noaa-ghcn-pds.s3.amazonaws.com` (Registry:
https://registry.opendata.aws/noaa-ghcn/). Verwendete Dateien:
`ghcnd-stations.txt`, `ghcnd-inventory.txt` und `csv.gz/by_station/<ID>.csv.gz`.
Abrufdatum: 29.07.2026.

**Zitation (Methodik/Übersicht):**

> Menne, M.J., I. Durre, R.S. Vose, B.E. Gleason, and T.G. Houston, 2012:
> An overview of the Global Historical Climatology Network-Daily Database.
> *Journal of Atmospheric and Oceanic Technology*, 29, 897–910.
> doi:10.1175/JTECH-D-11-00103.1

**Zitation (Datensatz):**

> Menne, M.J., I. Durre, B. Korzeniewski, S. McNeill, K. Thomas, X. Yin,
> S. Anthony, R. Ray, R.S. Vose, B.E. Gleason, and T.G. Houston, 2012:
> Global Historical Climatology Network – Daily (GHCN-Daily), Version 3.34.
> NOAA National Climatic Data Center. http://doi.org/10.7289/V5D21VHZ
> (abgerufen am 29.07.2026).

**Lizenz/Nutzung:** Werk der US-Bundesregierung, gemeinfrei (public domain).
Der AWS-Open-Data-Bucket ist ohne Registrierung oder API-Schlüssel zugänglich.
Für die Weiterverwendung wird die obige Zitation erwartet, keine Genehmigung.

**Verwendete Messgrößen:** `TMAX`, `TMIN`, `TAVG` (Tageswerte in Zehntel °C).

### Eigene Aufbereitungsschritte

Vollständig reproduzierbar über `tools/fetch_ghcn.py`. Die abgeleiteten Werte
in der CSV sind **keine** Originalwerte des NOAA-Datensatzes, sondern daraus
berechnete Jahresmittel und Anomalien:

1. Tageswerte mit gesetztem Qualitätsflag (Spalte `QFLAG`) verworfen;
   physikalisch unplausible Werte (< −90 °C, > 65 °C) verworfen.
2. Monatsmittel = (TMAX + TMIN) / 2 bei je ≥ 20 gültigen Messtagen,
   ersatzweise TAVG bei ≥ 20 Tagen.
3. Jahresmittel aus ≥ 11 Monaten; ein einzelner Fehlmonat wird mit der
   Monats-Klimatologie 1961–1990 derselben Station ersetzt, damit ein
   fehlender Winter- oder Sommermonat das Jahr nicht verzerrt.
4. Einzeljahr-Ausreißer verworfen (> 4 °C Abstand zum Median der ±5
   Nachbarjahre).
5. Anomalie = Jahresmittel − Stationsmittel 1961–1990 (WMO-Referenzperiode).
6. Stationsfilter: ≥ 25 Basisjahre in 1961–1990, ≥ 60 Jahre gesamt, ≥ 3 Jahre
   in 2020–2024, Reihenbeginn ≤ 1957. Nicht-polare Stationen mit ≥ 2 Jahren
   |Anomalie| > 4,2 °C gelten als inhomogen (typischerweise Stationsumzug)
   und werden ausgeschlossen.
7. Stationsauswahl: lange Reihen weltweit (Beginn ≤ 1930, Ende ≥ 2024) mit
   40-km-Mindestabstand, US-Stationen auf 140 gedeckelt (180-km-Abstand,
   sonst dominieren sie den Datensatz); zusätzlich eine Coverage-Stufe für
   Kontinente außerhalb Europa/Nordamerika (Beginn ≤ 1955, 60-km-Abstand).

**Ergebnis:** 758 Stationen, 70 Länder, Jahre 1850–2024, 71 568 Zeilen.

### Grenzen dieser Aufbereitung

- **Keine Homogenisierung.** Der Datensatz nutzt die *unbereinigten*
  GHCN-Daily-Reihen. Stationsumzüge, Messzeitwechsel und Gerätewechsel sind
  nur durch die groben Filter (Schritt 4 und 6) abgefangen, nicht durch ein
  statistisches Homogenisierungsverfahren. Für wissenschaftliche Aussagen
  sind die homogenisierten Produkte GHCN-Monthly v4, Berkeley Earth oder
  HadCRUT5 vorzuziehen.
- **Kein Wärmeinsel-Korrektiv.** Stadtnahe Stationen können einen
  Urbanisierungstrend enthalten.
- **Ungleiche räumliche Verteilung.** Asien 342, Europa 172, Nordamerika 96,
  Ozeanien 43, Afrika 22, Südamerika 3, Antarktis 1 Station. Das ist die
  reale Verfügbarkeit langer, frei zugänglicher Reihen. Ein ungewichteter
  Mittelwert über alle Stationen ist daher **kein** Globalmittel.
- **Landstationen only.** Ozeane fehlen vollständig; Landflächen erwärmen
  sich schneller als der globale Land-See-Mittelwert. Ein Vergleich mit
  HadCRUT5-Globalwerten ist deshalb nicht 1:1 möglich.

### Plausibilitätsprüfung

Über die 153 durchgehenden Reihen seit 1900 ergeben sich als Dekadenmittel
(Anomalie gegen 1961–1990): 1900er −0,42 °C · 1920er −0,23 °C ·
1940er −0,15 °C · 1960er −0,22 °C · 1980er +0,12 °C · 2000er +0,89 °C ·
2020–2024 +1,60 °C. Das reproduziert den bekannten Verlauf einschließlich
der Abkühlungsphase der 1960er Jahre.

---

## 2. Kuratierter Datensatz — `demo/waermestreifen_demo.csv`

60 Städte (30 Europa, 30 weltweit), 1850–2025. Stammt aus dem
Standalone-Artifact „Wärmestreifen 3D", das dieser Portierung zugrunde liegt.

**Wichtige Einschränkung:** Nur das **Feldmittel** der jeweils 30 Städte ist
an eine reale Reihe gekoppelt — jahrgenau an HadCRUT5 (Europa: Nordhemisphäre,
per Regression mit Faktor 1,45 auf das Niveau des Städtefelds skaliert; Welt:
globale Reihe). Die **Verteilung der einzelnen Städte um dieses Mittel ist
rekonstruiert**. Einzelstadtwerte sind daher *keine Stationsmessungen* und
dürfen nicht als solche zitiert werden. Der Datensatz liegt bei, weil 60
bekannte Städtenamen für Präsentationen oft lesbarer sind als 758
Stationskürzel — für inhaltliche Aussagen ist `waermestreifen_ghcn.csv` zu
verwenden.

Referenzreihe der Kalibrierung:

> Morice, C.P., J.J. Kennedy, N.A. Rayner, J.P. Winn, E. Hogan, R.E. Killick,
> R.J.H. Dunn, T.J. Osborn, P.D. Jones, and I.R. Simpson, 2021: An updated
> assessment of near-surface temperature change from 1850: the HadCRUT5 data
> set. *Journal of Geophysical Research: Atmospheres*, 126, e2019JD032361.
> doi:10.1029/2019JD032361
> (HadCRUT.5.0.2.0 analysis, summary series annual; © Crown Copyright,
> Met Office / Climatic Research Unit, University of East Anglia)

`demo/baseline_offsets.csv` enthält die im Artifact hinterlegten
Referenz-Offsets je Stadt und Periode — nützlich zum Gegenprüfen der
Re-Referenzierungsfunktion des Visuals.

---

## 3. Darstellungskonzept

Die Farbstreifen-Darstellung geht auf die **„Warming Stripes"** von
**Ed Hawkins** (National Centre for Atmospheric Science, University of
Reading, 2018) zurück — siehe #ShowYourStripes, https://showyourstripes.info.
Die hier verwendete blau-rote Rampe folgt dieser Konvention. Die räumliche
Erweiterung (Zeit auf X, Ort auf Z, Abweichung auf Y) sowie die vier
Darstellungsformen und Kameraperspektiven sind eine eigene Weiterentwicklung.

Die verwendeten Farbstopps der Rampe `stripes` entsprechen dem
ColorBrewer-Schema **RdBu** (divergierend, 11-stufig):

> Brewer, C.A., G.W. Hatchard, and M.A. Harrower, 2003: ColorBrewer in Print:
> A Catalog of Color Schemes for Maps. *Cartography and Geographic Information
> Science*, 30(1), 5–32. — https://colorbrewer2.org (Apache-2.0-Lizenz)

---

## 4. Fremdcode und Werkzeuge

| Bestandteil | Version | Lizenz | Zweck |
|---|---|---|---|
| [three.js](https://threejs.org) | 0.160.0 | MIT | WebGL-Renderer (gebündelt) |
| `powerbi-visuals-api` | 5.11.1 | MIT | Power-BI-Schnittstelle |
| `powerbi-visuals-utils-formattingmodel` | 6.0.4 | MIT | Formatbereich-Modell |
| `powerbi-visuals-tools` (pbiviz) | 7.2.1 | MIT | Build/Packaging |

Alle Abhängigkeiten werden **lokal gebündelt** — das Visual lädt zur Laufzeit
keine externen Ressourcen (Voraussetzung für die Power-BI-Sandbox und für
zertifizierbare Visuals).

---

## 5. Reproduktion

```sh
cd warmingStripes3D
python3 tools/fetch_ghcn.py            # lädt GHCN-Daily neu, schreibt demo/waermestreifen_ghcn.csv
npm install && npx pbiviz package      # baut dist/*.pbiviz
```

Das Skript benötigt nur die Python-Standardbibliothek und rund 550 MB
Cache-Speicher für die Rohdaten. Ein erneuter Lauf zu einem späteren Zeitpunkt
liefert aktualisierte Jahre; die Stationsauswahl kann sich dabei leicht ändern,
da sie vom aktuellen Inventar abhängt.

---

## 6. Versionsverlauf des Visuals

| Version | Änderung |
|---|---|
| 1.0.0.0 | Erstportierung des Standalone-Artifacts: vier Darstellungsformen, fünf Kameraperspektiven, Orbit-Steuerung, Aufbau-Animation, Tooltips, Cross-Filtering, Formatbereich, dynamische Referenzperiode. |
| 1.1.0.0 | Korrekturen für große und lückenhafte Datensätze (sichtbar geworden mit den 758 GHCN-Stationen): Nebel- und Rückebene skalieren mit der Feldgröße statt fester Werte; Kameraeinpassung löst pro Ecke statt gegen die Mittelebene; fehlende Jahre zeichnen keine Marke mehr statt eines Nullwerts, Flächenformen halten den nächsten bekannten Wert; Ausdünnung der Ortsbeschriftung skaliert mit der Ortszahl. |
| 1.2.0.0 | Datenreduktion behoben: Die Ortsachse war auf 100 Serien gedeckelt, wodurch Power BI bei größeren Datensätzen „Es werden nicht alle Werte angezeigt“ meldete. Grenze auf 1000 Orte angehoben und segmentiertes Nachladen (`fetchMoreData`) ergänzt; Zwischensegmente werden übersprungen, damit der WebGL-Kontext nicht wiederholt neu aufgebaut wird. |
| 1.3.0.0 | Kamera-Hineinfahren: Das Mausrad ist ein echter Dolly bis in das Feld hinein und zieht beim Hineinfahren zum Punkt unter dem Zeiger; eine Zoom-Anzeige blendet den aktuellen Faktor ein, Preset-Klick setzt zurück. Neues Auslesefeld (abschaltbar unter Darstellung): Stationsname, klassische Warming Stripes der Station über alle Jahre mit Jahresmarker, Wert und Rang des Jahres, Reihen-Statistik; Klick pinnt Station und Jahr, Klick ins Leere löst Pin und Selektion. Ortsbeschriftung wird per Bildschirm-Mindestabstand ausgedünnt (stabil auch beim Hineinfahren). |
| 1.4.0.0 | Anpassbarkeit für hochauflösende Displays: neue Formatkarte „Größe & Skalierung“ mit Skalierung der Bedienelemente/Auslesefeld/Legende/Zoom-Anzeige (75–300 %) und einstellbarer 3D-Beschriftungsgröße (8–40 pt); freie Hintergrundfarbe zusätzlich zu Hell/Dunkel (Tinte folgt weiter dem Thema); Label-Ausdünnung (Orte, Jahre, °C-Ticks) skaliert mit der Schriftgröße. |
| 1.5.0.0 | Referenz-Kippschalter in der Bedienleiste: Nulllinie per Klick zwischen 1961–1990 (WMO) und 1850–1900 (vorindustriell) umschalten — wird in den Formatbereich persistiert. Kiosk-Rotation: nach einstellbarer Inaktivität dreht die Kamera bildratenunabhängig weiter (Umlaufdauer einstellbar), jede Nutzereingabe pausiert sie; zuschaltbar per ↻-Knopf im Visual oder im Formatbereich unter Animation. |
