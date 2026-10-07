# Design

<!-- impeccable:design-schema 1 -->

The visual world for **Intendentes PY 2026**, the public site for the 2026 Paraguayan
municipal elections. Direction: **editorial data-journalism**, pinned by the user's
reference (unit grid + donut + legend). The direction contract lives in
`.impeccable/surfaces/site-index-html.md`.

## Principles

- The figures and the map carry equal weight: the page is an editorial graphic, not a map embed.
- Color is functional and comes only from the data; the chrome stays neutral.
- The reader's question leads — who governs each municipality, and the national picture.
- Nothing is invented: figures and colors come from the source (`colLista`, TSJE).

## Color

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#ffffff` | page ground |
| `--ground` | `#f5f5f2` | recessed surfaces (footer, bar tracks) |
| `--ink` | `#0c0c0d` | primary text, tooltips, chrome |
| `--ink-2` | `#55585f` | secondary text |
| `--ink-3` | `#6b6e75` | tertiary text and labels (≥4.5:1 on both grounds) |
| `--rule` | `#e6e6e2` | hairlines |
| `--rule-2` | `#cdcecb` | stronger hairlines |
| `--anr` | `#ff0000` | Partido Colorado (ANR) |
| `--plra` | `#002bc7` | PLRA |
| `--yocreo` | `#ffa760` | Yo Creo |
| `--otros` | `#9aa0a6` | Alianzas y otros |

The four data colors are the official source colors. In "all parties" mode each of the 42
parties uses its own `colLista` value, carried in `site/assets/data.js`.

## Type

One family: **Archivo** (self-hosted variable woff2, weights 400–900; latin + latin-ext).
A grotesque with editorial roots and heavy numerals.

- Display (masthead, section heads): 800–900, tracking −0.025 to −0.035em.
- Body: 400–500, 17px (16px at ≤620px), measure ≤62ch.
- Labels: 600–700, uppercase, tracking 0.07–0.1em.
- Numerals: tabular via `font-variant-numeric: tabular-nums`.

## Layout

- Content wrap ≤1180px with fluid inline padding.
- Sections separated by hairlines and generous vertical space (4.5rem desktop / 3rem mobile).
- Map section: two columns (map + 300px sidebar) on desktop, stacked on mobile.
- Components are the graphic forms of the trade — unit grid, donut, stacked bars, projected
  map. No cards, no decorative shadows, no gradients.

## Components

- **Choropleth** — inline SVG with its own Web-Mercator projection, pan/zoom via a viewBox
  transform, hover/select, a municipality search, and a district card led by the winning
  candidate.
- **Unit grid** — 263 squares, one per municipality, grouped by category or by party.
- **Donut** — proportional arcs around a "263 municipios" centre; hover cross-highlights the
  map and the grid.
- **Department bars** — 100%-stacked, sorted by Colorado share; hovering a segment isolates
  that department on the map.
- **Legend** — swatch, acronym, name, count and percentage; the map sidebar caps at ten with a
  "ver los 42 partidos" expander.
- **Tooltips** — a dark chip with place, department, candidate, party, votes and share.

## Motion

One authored moment: the unit grid pops in with a 2 ms-per-cell stagger, the donut arcs draw
once, and the bars grow with a transform (no layout thrash). Entrance motion is bounded and
honours `prefers-reduced-motion`.

## Accessibility

- Text meets WCAG AA on both grounds (`--ink-3` was darkened from 3.0:1 to pass).
- Every color-coded value carries a text label; color is never the only channel.
- Keyboard: the municipality search is a labelled combobox; focus rings are themed.
- The map exposes a text alternative; the department bars are fully textual.

## Provenance

- Type: Archivo (Google Fonts), self-hosted at `site/assets/fonts/archivo-*.woff2`.
- Favicon: inline SVG mark (four category squares).
- All figures derive from `data/raw_results.json` (TSJE) and `DISTRITOS_PY_CNPV2022.geojson`.
