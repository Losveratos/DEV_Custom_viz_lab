# Demo-Report: Scatter byDatenWG in Power BI

Schritt-für-Schritt-Aufbau eines explorativen Reports mit dem Custom Visual
und den mitgelieferten Demo-Daten.

## 1. Visual importieren

Power BI Desktop → *Einfügen → Weitere Visuals → Aus einer Datei importieren*
→ `dist/scatterByDatenWG….pbiviz` auswählen.

## 2. Daten laden

`demo/country_data_15_indicators.csv` — 164 Länder mit 15 Indikatoren plus
Bevölkerung, Kontinent und ISO2-Code, kompiliert aus Gapminder (CC BY 4.0)
sowie RSF und Trading Economics (Details siehe `../QUELLEN.md`).

*Daten abrufen → Text/CSV* → Datei aus `demo/` auswählen. Im Vorschaudialog
auf **„Daten transformieren"** gehen und prüfen, dass `Dateiursprung` auf
**65001: Unicode (UTF-8)** und `Trennzeichen` auf **Komma** steht.

**Wichtig — Dezimaltrennzeichen:** Die CSV verwendet den **Punkt** als
Dezimaltrennzeichen (`7.34`, `68789.5`). Mit deutscher Kultur würde Power BI
den Punkt als Tausendertrennzeichen lesen und aus `68789.5` die Zahl 685895
machen — alle numerischen Spalten wären damit unbrauchbar. Beim
Typkonvertieren im Dialog *Datentyp ändern → Gebietsschema verwenden*
entsprechend **Englisch (USA)** wählen. Betroffen sind alle numerischen
Spalten: `life_satisfaction_0_10`, `gdp_per_capita_ppp`, `hdi`,
`life_expectancy`, `democracy_index_eiu`, `corruption_perceptions_index`,
`gini_index`, `unemployment_rate_pct`, `tax_revenue_pct_gdp`,
`suicide_rate_per_100k`, `urban_population_pct`, `internet_users_pct`,
`working_hours_per_week`, `top_income_tax_rate_pct`, `press_freedom_rsf_2025`,
`population`.

Alternativ direkt als Power-Query-Skript (*Leere Abfrage → Erweiterter
Editor*), das Codierung, Trennzeichen und Datentypen in einem Rutsch richtig
setzt:

```powerquery
let
    Quelle = Csv.Document(
        File.Contents("<Pfad>\country_data_15_indicators.csv"),
        [Delimiter = ",", Columns = 19, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    Kopfzeilen = Table.PromoteHeaders(Quelle, [PromoteAllScalars = true]),
    Typen = Table.TransformColumnTypes(Kopfzeilen, {
        {"country", type text}, {"region", type text}, {"iso2", type text},
        {"life_satisfaction_0_10", type number}, {"gdp_per_capita_ppp", type number},
        {"hdi", type number}, {"life_expectancy", type number},
        {"democracy_index_eiu", type number}, {"corruption_perceptions_index", type number},
        {"gini_index", type number}, {"unemployment_rate_pct", type number},
        {"tax_revenue_pct_gdp", type number}, {"suicide_rate_per_100k", type number},
        {"urban_population_pct", type number}, {"internet_users_pct", type number},
        {"working_hours_per_week", type number}, {"population", Int64.Type},
        {"top_income_tax_rate_pct", type number}, {"press_freedom_rsf_2025", type number}
    }, "en-US")
in
    Typen
```

Das `"en-US"` am Ende ist wichtig und **kein Versehen** — siehe Warnung oben.

## 3. Visual befüllen

| Feld-Bucket | Spalte |
|---|---|
| **Detail (z. B. Land)** | `country` |
| **Farbe (z. B. Kontinent)** | `region` |
| **Y-Achse (Basis-Measure)** | `life_satisfaction_0_10` (Durchschnitt) |
| **X-Achsen (je Measure eine Facette)** | beliebig viele weitere Indikatoren, z. B. `gdp_per_capita_ppp`, `hdi`, `life_expectancy`, `democracy_index_eiu`, `corruption_perceptions_index`, `gini_index`, `unemployment_rate_pct`, `suicide_rate_per_100k` … |
| **Größe (z. B. Bevölkerung)** | `population` (Durchschnitt) |
| **Quelle (Fußzeile)** | optional — Textspalte oder Measure; sonst greift der Fußzeilen-Text aus dem Formatbereich |

Jede Spalte kommt pro Land genau einmal vor — „Durchschnitt" (bzw. jede andere
Aggregation) ist daher **verlustfrei**, ein Umschalten auf „Nicht
zusammenfassen" ist hier — anders als bei Zeitreihen-Daten — nicht nötig.

## 4. Formatbereich (Kurzreferenz)

- **Darstellung**: Hell/Dunkel, Punktgröße, Größen-Measure verwenden (an/aus),
  Schriftskalierung (75–300 %), Legende anzeigen.
- **Facetten**: X-Achsen-Skala (Automatisch/Linear/Logarithmisch), nach
  Korrelationsstärke sortieren, lineare X-Achse bei 0 beginnen, Spaltenzahl
  (0 = automatisch nach Seitenverhältnis).
- **Regression**: Regressionsgerade (Keine / Eine Gerade je Facette / Je
  Farbgruppe), R² anzeigen.
- **Quellen-Fußzeile**: anzeigen (an/aus), Text (nur genutzt, wenn die
  Datenrolle „Quelle" nicht belegt ist — die Datenrolle hat Vorrang),
  Schriftgröße.

## 5. Interaktion

- **Hover** über einen Punkt = Crosshighlight desselben Landes in allen
  Facetten + Tooltip.
- **Klick** auf einen Punkt = Cross-Filter auf das Land (wirkt auf andere
  Visuals der Seite).
- **Klick auf einen Legenden-Chip** = filtert auf den zugehörigen Kontinent.
- **Klick ins Leere** = hebt Filter/Selektion wieder auf.
- **Rechtsklick** = Kontextmenü (Drillthrough usw.).

## 6. Empfohlene Seite

- **Y** = `life_satisfaction_0_10` gegen 6–8 **X**-Indikatoren gleichzeitig
  (z. B. `gdp_per_capita_ppp`, `hdi`, `life_expectancy`, `democracy_index_eiu`,
  `corruption_perceptions_index`, `gini_index`, `unemployment_rate_pct`,
  `suicide_rate_per_100k`) — das Visual baut daraus automatisch ein
  Small-Multiples-Raster, sortiert nach |Pearson r|.
- **Slicer `region`**: Kontinente ein-/ausblenden, Facetten, Regressionslinien
  und Sortierung rechnen sich live auf der gefilterten Auswahl neu.
- `gdp_per_capita_ppp` ist stark schief verteilt — die Skala „Automatisch"
  erkennt das und wählt eine logarithmische X-Achse für diese Facette.
