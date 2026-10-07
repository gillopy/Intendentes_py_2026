# Feature: Public site redesign — "Intendentes PY 2026"

## Objective
Replace the 103 MB folium map with a fast, designed, dependency-free static site that
presents the 2026 Paraguayan municipal-election winners to the general public: an
interactive district choropleth, a national unit grid (one square per municipality), a
national donut with legend, and per-department 100%-stacked bars of districts won.

## Problem
The incumbent output (`output/mapa_intendentes_2026.html`, ~103 MB) embeds ~44 MB of raw
census geometry and a full folium/Leaflet runtime, so it is slow to load and heavy to
share. It also has no deliberate visual design. The user wants a complete redesign with
more design, a new bar chart by department (% of districts won per party), and real
performance.

## Authorized scope
- Frontend redesign of the published site (new `site/` root: HTML/CSS/vanilla JS, no
  framework, no bundler, no runtime dependency).
- Geometry simplification so the site ships small.
- New national summary views: unit grid + donut + legend (user-supplied reference design).
- New per-department 100%-stacked bars (% of districts won per category).
- Keep the Python/uv pipeline and the existing artifacts (PNG, CSV, enriched geojson).
- Update the GitHub Pages workflow and README to the new site.

## Out of scope
- Re-scraping the TSJE source (data is a fixed snapshot).
- JUNTA MUNICIPAL or other candidacies; historical elections.
- Pushing, opening a PR, or merging (user instruction: all local).

## Constraints
- Python via `uv`; Node is available but must not become a runtime dependency of the site.
- Site must work both on GitHub Pages and opened directly from disk (no `fetch()` of local
  JSON — data is shipped as a `<script>` payload).
- Party color truth from `colLista`: ANR `#FF0000`, PLRA `#002BC7`, Yo Creo `#FFA760`,
  Alianzas y otros neutral gray.
- Spanish (es-PY) content.

## Acceptance criteria
- `site/index.html` opens from disk and renders the map, unit grid, donut + legend, and
  per-department bars, with real data (263 districts).
- Total site payload (HTML + CSS + JS + data) is well under 2 MB and loads fast on mobile.
- The four categories reconcile to 263 (187 / 34 / 3 / 39).
- The map is interactive (hover/select a district → its details) and legible on mobile.
- `make_choropleth.py` regenerates the site data and still produces PNG + CSV + geojson.
- No push; work stays on the local branch.

## Tasks
- [x] T1 — Product + direction context: `PRODUCT.md`, surface brief with direction contract.
  Check: both files exist; the brief carries the six contract blocks. **Done** — direction
  is brief-pinned (user reference: unit grid + donut + legend), so the concept-seed roll is
  superseded per new-work.
- [x] T2 — Build pipeline: geometry simplification (Douglas-Peucker, adaptive tolerance) +
  `site/assets/data.js` generation in `make_choropleth.py`.
  Check: data.js holds 263 districts + geometry and is small. **Done** — `data.js` = 431 KB,
  20.572 geometry points (from 1.022.704 raw); join stays 263/263.
- [x] T3 — Design system + shell: `site/index.html`, `site/assets/styles.css` (editorial
  data-journalism system, vendored Archivo), responsive layout.
  Check: opens from disk; no console errors. **Done** — Archivo vendored (2 woff2, 68 KB);
  loads from `file://` and http; only a benign Chrome preload warning.
- [x] T4 — Views: choropleth (SVG + pan/zoom + search + card), unit grid, donut + legend,
  per-department stacked bars, and a 4-category / all-parties toggle.
  Check: each view renders real figures; 263 squares; department counts reconcile. **Done** —
  263 cells; every department's counts sum to its total; 42 parties in "all parties" mode.
- [x] T5 — Deploy + docs: `deploy-pages.yml` publishes `site/`; README updated; folium HTML
  and other dead artifacts removed.
  Check: workflow points at `site/`; README matches reality. **Done**.
- [x] T6 — Verification: batched desktop (1440) + mobile (390) rounds with Playwright, the
  Impeccable detector, and one fix batch.
  Check: no layout break; detector clean. **Done** — detector returns `[]`; no horizontal
  overflow at 390px.

## Progress / evidence
- Route per task: T2–T4 delegated boundary not needed — the work is a single cohesive
  frontend authored inline with Playwright verification; T6 used the detector + browser.
- Performance: replaced a ~103 MB folium HTML (44 MB embedded geometry) with a 431 KB data
  payload + ~40 KB HTML/CSS/JS + 68 KB fonts.
- Fixed in the verification batch: click selection (pointer capture swallowed the click),
  bars hidden when the observer never fired, low-contrast `--ink-3`, width-transition jank.
- Commits: work-unit commits on `feat/site-redesign` (see git log). No push to main, no PR.

## Delivery
- Work-unit commits on `feat/site-redesign`; pushed as a branch (user instruction).
- Forecast authored changed lines: ~700; delivered within that band.
- Delivery strategy: `ask-on-risk` — the branch is pushed whole; if a PR over ~400 lines is
  opened later, slice with `chained-pr`.
