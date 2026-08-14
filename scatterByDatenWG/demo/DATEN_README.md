# Country Indicator Explorer

An interactive, fully self-contained data visualization exploring how **life satisfaction** relates to economic, institutional and social indicators across **164 countries** — and how all of these indicators relate to each other.

Built as a single static HTML file with zero external dependencies (no CDN, no frameworks, no build step). Drop it on any static host and it works.

---

## Files

| File | Description |
|---|---|
| `indicator_explorer.html` | The complete interactive app (data embedded inline, ~110 KB) |
| `country_data_15_indicators.csv` | The underlying merged dataset (164 countries × 15 indicators + population, region, ISO2 code) |

## Features

- **Lead variable selector** — pick any indicator as the Y-axis; every other indicator is plotted against it in a grid of scatter plots
- **Panels sorted by correlation strength** (|Pearson's r|, strongest first); each panel shows n, r and an OLS trendline
- **Indicator toggles** — show/hide individual panels via chips
- **Continent filter** — click region chips (Asia, Europe, Africa, Americas); r, trendlines, panel order and the ranking all recompute on the filtered subset
- **Country ranking list** (right sidebar) — sorted by the lead variable, best first (direction-aware: lowest first for Gini and unemployment); with live **search**
- **Hover card** — flag, region, population, all 15 values with rank and a min–max distribution bar, grouped into four thematic sections; bars tinted **blue** (higher = better), **red** (higher = worse) or **grey** (neutral)
- **Cross-highlighting** — hovering a country in the list enlarges and highlights its dot in every plot; click a list row **or a dot** to pin it
- **Reference country** — keep one country permanently ringed and labelled in all plots as an anchor point
- **Population bubbles** — dot area scales with population (√-scaled; toggleable)
- **Axis options** — proper 1-2-5 log ticks for GDP; optional zero-baseline for linear axes
- Pure SVG rendering, responsive layout, tooltips on every dot

## Data dictionary (`country_data_15_indicators.csv`)

| Column | Description | Source | Vintage |
|---|---|---|---|
| `country` | Country name (Gapminder naming) | Gapminder | — |
| `region` | Continent (Gapminder world_4region) | Gapminder | — |
| `iso2` | ISO 3166-1 alpha-2 code | Gapminder | — |
| `life_satisfaction_0_10` | Cantril-ladder life evaluation (0–10) | World Happiness Report via Gapminder | latest per country, mostly 2023 |
| `gdp_per_capita_ppp` | GDP per capita, PPP, inflation-adjusted | Gapminder (World Bank / Maddison) | 2024 |
| `hdi` | Human Development Index | UNDP via Gapminder | 2023 |
| `life_expectancy` | Life expectancy at birth (years) | Gapminder (UN WPP / IHME) | 2024 |
| `democracy_index_eiu` | EIU Democracy Index (0–10) | Economist Intelligence Unit via Gapminder | latest ≤ 2024 |
| `corruption_perceptions_index` | CPI, 0 = highly corrupt … 100 = very clean | Transparency International via Gapminder | 2023 |
| `gini_index` | Income Gini (0–100) | World Bank / Gapminder | latest ≤ 2024 |
| `unemployment_rate_pct` | Unemployment, age 15+ (%) | ILO / World Bank via Gapminder | latest ≤ 2024 |
| `tax_revenue_pct_gdp` | Tax revenue (% of GDP) | World Bank via Gapminder | latest ≤ 2024 (often ~2018–2022) |
| `suicide_rate_per_100k` | Suicides per 100,000 people | WHO / IHME via Gapminder | latest ≤ 2024 |
| `urban_population_pct` | Urban population (% of total) | UN / World Bank via Gapminder | 2024 |
| `internet_users_pct` | Internet users (% of population) | ITU / World Bank via Gapminder | 2024 |
| `working_hours_per_week` | Avg. weekly working hours (employed) | ILO via Gapminder | latest ≤ 2024 |
| `top_income_tax_rate_pct` | Top statutory personal income tax rate (%) | Trading Economics | 2025/26 |
| `press_freedom_rsf_2025` | RSF World Press Freedom Index score (0–100, higher = freer) | Reporters Without Borders | 2025 |
| `population` | Total population | Gapminder | 2024 |

## Methodology notes

- **"Latest value" logic:** for each country and indicator, the most recent observation up to 2024 is used (with indicator-specific minimum years to avoid stale data). Projections beyond 2024 are excluded.
- **Correlations:** Pearson's r, computed on the values as displayed — GDP per capita is log₁₀-transformed before correlation and trendline fitting (marked "(on log values)" in the UI). r and n always refer to the currently active continent filter.
- **Ranking direction:** "best first" is direction-aware — highest first for satisfaction, GDP, HDI, life expectancy, democracy, CPI, press freedom, internet use; lowest first for Gini and unemployment; neutral indicators (tax rates, tax revenue, urbanization, working hours) are sorted by value.
- **Distribution bars** in the hover card show the country's position between the min and max of the currently filtered set (by value, not by "goodness").
- **Caveats:** country-level correlations are descriptive, not causal; many indicators are mutually correlated with income (e.g. internet use, CPI, press freedom), so bivariate r values partly reflect the same prosperity effect. Gapminder harmonizes multiple sources, so individual values can differ slightly from the primary publishers. Tax rates from Trading Economics are top *statutory* rates and say nothing about effective tax burdens.

## Deployment

The app is a single static file — no server-side code, no build step, no external requests:

- **Any static host:** upload `indicator_explorer.html` (rename to `index.html` if you want it at the root).
- **GitHub Pages:** commit the file to a repo, enable Pages, done.
- **Embed in an existing site:** `<iframe src="indicator_explorer.html" style="width:100%;height:100vh;border:0"></iframe>`

The CSV is not required at runtime (data is embedded in the HTML) — ship it alongside if you want to offer a raw-data download.

## Attribution

Please credit when publishing:

> Data: Gapminder (CC BY 4.0; compiling World Happiness Report, World Bank, UNDP, EIU, Transparency International, WHO, ILO, UN) · Reporters Without Borders, World Press Freedom Index 2025 · Trading Economics, personal income tax rates 2025/26. Visualization: custom SVG/JavaScript, 2026.

## How it was built

1. Indicator time series were pulled from the open Gapminder data repositories (`ddf--gapminder--fasttrack` and `ddf--gapminder--systema_globalis` on GitHub) and reduced to the latest observation per country.
2. Top personal income tax rates (Trading Economics) and RSF 2025 press freedom scores were collected from the web and matched to Gapminder country names (manual mapping for cases like USA/UK/UAE, Congo Rep./Dem. Rep., Slovak Republic, Lao, Cape Verde).
3. Everything was merged into one CSV keyed on country name, with region and ISO2 metadata.
4. The explorer renders the embedded JSON with hand-written SVG/vanilla-JS: scales and 1-2-5/log tick generation, OLS fits, Pearson correlations, cross-panel highlighting and the ranking sidebar — all recomputed client-side on every filter change.
