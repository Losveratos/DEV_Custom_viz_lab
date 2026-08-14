# Quellen und Nachweise

Alle Datengrundlagen, Zitationen und übernommenen Fremdbestandteile dieses
Custom Visuals. Stand: 14.08.2026.

---

## 1. Demo-Datensatz — `demo/country_data_15_indicators.csv`

164 Länder, 15 Indikatoren plus Bevölkerung, Kontinent und ISO2-Code. Stammt
aus dem Standalone-Artifact „Country Indicator Explorer", das als Vorlage für
dieses Custom Visual diente. Vollständig zusammengeführt aus mehreren
öffentlichen Quellen:

**Primärquelle (kompiliert):** Gapminder — Lizenz **CC BY 4.0**
(https://www.gapminder.org). Gapminder harmonisiert und kompiliert dabei
selbst folgende Ursprungsquellen: World Happiness Report, World Bank, UNDP,
Economist Intelligence Unit (EIU), Transparency International, WHO, ILO, UN.

**Ergänzende Einzelquellen:**

- **Reporters Without Borders (RSF)** — World Press Freedom Index 2025
  (`press_freedom_rsf_2025`).
- **Trading Economics** — Spitzensteuersätze natürlicher Personen 2025/26
  (`top_income_tax_rate_pct`).

### Spaltenherkunft

| Spalte | Quelle | Stand |
|---|---|---|
| `country`, `region`, `iso2` | Gapminder | — |
| `life_satisfaction_0_10` | World Happiness Report via Gapminder | meist 2023 |
| `gdp_per_capita_ppp` | Gapminder (World Bank / Maddison) | 2024 |
| `hdi` | UNDP via Gapminder | 2023 |
| `life_expectancy` | Gapminder (UN WPP / IHME) | 2024 |
| `democracy_index_eiu` | EIU via Gapminder | aktuellster Wert ≤ 2024 |
| `corruption_perceptions_index` | Transparency International via Gapminder | 2023 |
| `gini_index` | World Bank / Gapminder | aktuellster Wert ≤ 2024 |
| `unemployment_rate_pct` | ILO / World Bank via Gapminder | aktuellster Wert ≤ 2024 |
| `tax_revenue_pct_gdp` | World Bank via Gapminder | aktuellster Wert ≤ 2024 (oft ~2018–2022) |
| `suicide_rate_per_100k` | WHO / IHME via Gapminder | aktuellster Wert ≤ 2024 |
| `urban_population_pct` | UN / World Bank via Gapminder | 2024 |
| `internet_users_pct` | ITU / World Bank via Gapminder | 2024 |
| `working_hours_per_week` | ILO via Gapminder | aktuellster Wert ≤ 2024 |
| `top_income_tax_rate_pct` | Trading Economics | 2025/26 |
| `press_freedom_rsf_2025` | Reporters Without Borders | 2025 |
| `population` | Gapminder | 2024 |

### Methodik-Notizen

- **„Aktuellster Wert"-Logik:** je Land und Indikator wird die jüngste
  Beobachtung bis 2024 verwendet, mit indikatorspezifischen Mindestjahren
  gegen veraltete Werte. Prognosen über 2024 hinaus sind ausgeschlossen.
- **Korrelationen:** Pearson r, berechnet auf den angezeigten Werten — BIP
  pro Kopf wird vor Korrelation und Regressionsgerade log10-transformiert
  (im Visual als log-Skala erkennbar/wählbar). r und n beziehen sich stets
  auf die aktuell aktive Filterauswahl.
- **Deskriptiv, nicht kausal:** Länder-Korrelationen sind deskriptiv, nicht
  kausal. Viele Indikatoren korrelieren wechselseitig mit Wohlstand (z. B.
  Internetnutzung, CPI, Pressefreiheit), sodass bivariate r-Werte teilweise
  denselben Wohlstandseffekt widerspiegeln. Da Gapminder mehrere Quellen
  harmonisiert, können Einzelwerte leicht von den Primärveröffentlichungen
  abweichen. Steuersätze von Trading Economics sind gesetzliche
  Spitzensätze und sagen nichts über die effektive Steuerlast aus.

### Lizenz/Nutzung

Gapminder-Daten stehen unter **CC BY 4.0** — Weiterverwendung mit Namensnennung
erlaubt. Für RSF- und Trading-Economics-Daten gilt die jeweilige Quellenangabe
bei Veröffentlichung als Erwartung. Empfohlene Zitation:

> Daten: Gapminder (CC BY 4.0; kompiliert aus World Happiness Report, World
> Bank, UNDP, EIU, Transparency International, WHO, ILO, UN) · Reporters
> Without Borders, World Press Freedom Index 2025 · Trading Economics,
> persönliche Einkommensteuersätze 2025/26.

---

## 2. Farbpalette

Die Standardpalette des Visuals ist **Blau `#2a78d6`**, **Orange `#eb6834`**,
**Aqua `#1baf7a`**, **Violett `#4a3aa7`** (Fortsetzung bei mehr als vier
Farbgruppen mit weiteren Tönen aus `DEFAULT_PALETTE` in `src/model.ts`).

Die Palette ist **CVD-validiert** (all-pairs-Prüfung, auch für Rot-Grün- und
Blau-Gelb-Farbfehlsichtigkeit): das schlechteste Farbpaar liegt bei ΔE 9,2
unter Farbfehlsichtigkeit bzw. ΔE 16,3 bei Normalsicht — beides über der
üblichen Unterscheidbarkeitsschwelle.

**Warum nicht die Gapminder-Originalfarben** (Asia `#e05c5c`, Europe
`#f2b843`, Africa `#4ea5d9`, Americas `#57b894`)? Sie wurden bewusst ersetzt,
weil zwei Paare an den Kontrollwerten scheitern:

- **Grün ↔ Hellblau** (`#57b894` ↔ `#4ea5d9`): ΔE 13,1 — unterhalb der
  15er-Grenze, die für Normalsichtige als sichere Unterscheidbarkeit gilt.
- **Rot ↔ Grün** (`#e05c5c` ↔ `#57b894`): bei Protanopie praktisch
  ununterscheidbar.

Die Ersatzpalette hält beide Kriterien mit deutlichem Abstand ein und bleibt
gleichzeitig warm/kühl differenziert genug, um Kontinente auf den ersten
Blick auseinanderzuhalten.

---

## 3. Fremdcode und Werkzeuge

| Bestandteil | Version | Lizenz | Zweck |
|---|---|---|---|
| `powerbi-visuals-api` | 5.11.1 | MIT | Power-BI-Schnittstelle |
| `powerbi-visuals-utils-formattingmodel` | 6.0.4 | MIT | Formatbereich-Modell |
| `powerbi-visuals-tools` (pbiviz) | 7.2.1 | MIT | Build/Packaging |

Kein d3, kein three.js — die Small-Multiples-Darstellung inklusive
OLS-Regression, Pearson-Korrelation und Achsenskalierung ist eigener,
handgeschriebener Code (`src/render.ts`, `src/stats.ts`). Alle Abhängigkeiten
werden **lokal gebündelt** — das Visual lädt zur Laufzeit keine externen
Ressourcen (Voraussetzung für die Power-BI-Sandbox und für zertifizierbare
Visuals).

---

## 4. Reproduktion

```sh
cd scatterByDatenWG
npm install && npx pbiviz package      # baut dist/*.pbiviz
```

---

## 5. Versionsverlauf des Visuals

| Version | Änderung |
|---|---|
| 1.0.0.0 | Erstversion: Scatter-Small-Multiples mit einem Basis-Measure auf Y und beliebig vielen X-Measures als Facetten, Detail-/Legenden-Kategorie, optionalem Größen-Measure, OLS-Regression (gesamt oder je Farbgruppe) mit R², Auto-Log-X-Skala, Sortierung nach Korrelationsstärke, Quellen-Fußzeile mit Datenrollen-Vorrang. |
| 1.1.0.0 | In-Visual-Kopfzeile mit Titel/Untertitel; Größen-Presets für Full HD, HD und 4K (plus benutzerdefinierte Feinjustierung der Schriftskalierung); Y-Kennzahl-Auswahl direkt im Visual als Dropdown im Kopf oder als Chip-Leiste (statt Feldparameter — alle Kennzahlen kommen in den X-Bucket, die aktive Y-Kennzahl wird persistiert); neues Side-Panel mit Ranking, Suche, Hover-Detailkarte inklusive Rang und Min-Max-Verteilungsbalken, ein-/ausklappbar; Datenfarben je Legendenwert individuell einstellbar inklusive bedingter Formatierung. |
