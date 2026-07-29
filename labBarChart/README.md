# Lab Bar Chart — Power BI Custom Visual

Test custom visual: a single-series column chart built with the
`powerbi-visuals-tools` (pbiviz 7.x) toolchain and plain SVG (no d3).

## Design rules baked in

- Columns capped at **24px** thickness, **4px rounded data-end**, square at the
  baseline; negative values hang below the zero baseline with the rounded end down.
- **≥ 2px surface gap** between neighboring columns.
- **Selective direct label**: only the extreme value is labeled (toggle + text
  size under *Data label*); everything else is carried by the axis and tooltips.
- Recessive chrome: 1px hairline gridlines, muted tick ink, secondary category ink.
  Text never wears the series color.
- Default bar color `#2a78d6` (slot 1 of a CVD-validated categorical palette),
  overridable per report under *Bars → Bar color*.
- Single series → no legend (the visual title names it).

## Power BI integration

- Data roles: 1 grouping (**Category**) + 1 measure (**Value**).
- Cross-filtering via `ISelectionManager` (click, Ctrl/Cmd multi-select,
  background click clears), bookmark support via `registerOnSelectCallback`.
- Report/page/visual **context menu** on right-click.
- **Highlight** dimming (`supportsHighlight`), multi-visual selection.
- Host **tooltips** on hover with full-precision values.
- **High-contrast mode**: bars and ink switch to the host foreground/background.

## Build

```sh
npm install
npx pbiviz package   # emits dist/*.pbiviz
```

The packaged visual in `dist/` can be imported directly into Power BI
(*Insert → More visuals → Import a visual from a file*).

## Source layout

- `src/render.ts` — host-independent SVG renderer (pure DOM, testable outside Power BI)
- `src/visual.ts` — Power BI wiring: data view parsing, selection, tooltips, high contrast
- `src/settings.ts` — formatting pane model (Bars, Data label)
