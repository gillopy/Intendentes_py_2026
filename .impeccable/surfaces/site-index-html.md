---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

# Surface: Intendentes PY 2026 — public results site

- **Scope:** the published single-page site at `site/index.html` and its assets.
- **Visitor mode:** Operate.
- **Audience:** the general public in Paraguay, mobile-first, after the 2026 municipal elections.
- **Job:** understand the national outcome and find who won in a given municipality.
- **Content:** 263 districts across 18 departments; four categories (ANR / PLRA / Yo Creo / Alianzas y otros).
- **Constraints:** static, dependency-free, opens from disk and on GitHub Pages; under 2 MB; Spanish (es-PY).
- **Memorable moment:** the 263-square unit grid — one square per municipality — as the signature tally.

## Direction contract

THESIS: The national tally is the argument. One square per municipality, and a country map that
collapses 40+ parties into four readable powers. It refuses the category default of a bare
embossed map with a generic legend: the figures and the map carry equal weight, set as an
editorial graphic a reader can screenshot and share.

OWN-WORLD: Editorial data-journalism. A crisp white ground, near-black ink, hairline rules, and
Archivo — a grotesque running from 900 display numerals down to 600 tracked labels. Color is
functional and comes only from the data: Colorado red, PLRA blue, Yo Creo orange, neutral gray
for alliances; chrome stays neutral. Components are the graphic forms of the trade — unit grid,
donut, stacked bars, a clean projected choropleth — never cards, shadows, or gradients.

STORY: A visitor lands, reads the lede ("El Partido Colorado ganó 187 de los 263 municipios"),
sees the country at a glance, finds their department in the bars, and hovers or taps the map to
read their municipality's winner, candidate, votes and margin. Then shares a screenshot.

FIRST VIEWPORT: A masthead sets the title "Intendentes PY 2026" at display scale over a one-line
lede, with the TSJE source and snapshot time as a provenance rule. Immediately below, the map
fills the viewport as the thesis — the whole country in four colors — with a compact four-row
legend (swatch, acronym, count, %) anchored to it. The map is the first thing that moves.

FORM: Pinned by the user's reference — an editorial data-journalism infographic (unit grid +
donut + legend) extended into a full Operate surface. Seed key: brief-pinned (the concept-seed
roll is superseded because the user supplied the direction).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.
