/* Asunción 2021 -> 2026 analysis section.
   Renders window.ASUNCION (bundled by make_asuncion.py) into the
   `.asuntabs` container. Self-contained IIFE: own tooltip, own tab state,
   shared filter state and a shared aspect-correct map projector.
   No dependencies, no network. */
(function () {
  "use strict";

  var DATA = window.ASUNCION;
  if (!DATA) {
    console.warn("[asuncion] window.ASUNCION is missing; section not rendered.");
    return;
  }

  var root = document.getElementById("asuntabs");
  if (!root) return;

  /* ------------------------------------------------------------ constants */

  var MINUS = "\u2212";
  var SVGNS = "http://www.w3.org/2000/svg";
  var ANR = "var(--anr)";
  var JA = "var(--plra)";

  /* Full labels for the force siglas (Change 1). Code identifiers stay ANR/JA.
     JA is year-dependent: in 2021 the Asunción opposition ran as "Juntos x
     Asunción", but in 2026 the alliance is categorized as "Alianzas y otros".
     When no year is given, the 2026 label is used (the section's frame). */
  var FORCE_LABELS = {
    ANR: "Partido Colorado",
    PDC: "Partido Demócrata Cristiano",
    OTROS: "Otros partidos",
    "B/N": "Blancos y nulos",
    APT: "APT",
  };
  var JA_2021 = "Juntos x Asunción";
  var JA_2026 = "Alianzas y otros";
  var FORCE_TITLES = { APT: "Sigla del reporte original (APT)" };

  function forceLabel(sigla, year) {
    if (sigla === "JA") return year === 2021 ? JA_2021 : JA_2026;
    return FORCE_LABELS[sigla] || sigla;
  }

  /* ---------------------------------------------------------- formatting */

  var nfInt = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

  function n1(x) {
    return Number(x).toLocaleString("es-PY", {
      minimumFractionDigits: 1, maximumFractionDigits: 1,
    });
  }
  function nf(x) {
    if (x == null) return "s/d";
    return nfInt.format(x);
  }
  function pct1(x) {
    if (x == null) return "s/d";
    return n1(x * 100) + " %";
  }
  function pp1(x) {
    if (x == null) return "s/d";
    return (x < 0 ? MINUS : "+") + n1(Math.abs(x)) + " pp";
  }
  function r2(x) {
    return Number(x).toLocaleString("es-PY", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }
  function cleanNarr(s) {
    return String(s)
      .replace(/\s*·\s*/g, " · ")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/-\s*(?=\d)/g, MINUS)
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Title-case proper names coming from TSJE (uppercase source). */
  var LOWERCASE_PARTICLES = {
    de: 1, del: 1, la: 1, las: 1, los: 1, y: 1, e: 1, por: 1, al: 1, el: 1, en: 1,
  };
  function titleCase(s) {
    return String(s).toLowerCase().split(" ").map(function (w, i) {
      if (i > 0 && LOWERCASE_PARTICLES[w]) return w;
      return w.replace(/^([a-záéíóúñü])/, function (m) { return m.toUpperCase(); });
    }).join(" ");
  }
  function partyNice(p) {
    var u = String(p).toUpperCase();
    if (u.indexOf("JUNTOS") >= 0) return forceLabel("JA", 2026);
    if (u.indexOf("COLORADO") >= 0) return forceLabel("ANR");
    if (u.indexOf("DEMOCRATA") >= 0) return forceLabel("PDC");
    return titleCase(p);
  }

  /* Diverging scale: positive -> ANR red, negative -> JA blue,
     intensity proportional to min(|v|, cap) / cap, blended from white.
     `floor` keeps small values faintly tinted (legibility floor). */
  function divColor(v, cap, floor) {
    if (v == null) return "var(--rule)";
    cap = cap || 50;
    floor = floor == null ? 0 : floor;
    var t = floor + (1 - floor) * Math.min(Math.abs(v), cap) / cap;
    var base = v >= 0 ? [255, 0, 0] : [0, 43, 199];
    var r = Math.round(255 + (base[0] - 255) * t);
    var g = Math.round(255 + (base[1] - 255) * t);
    var b = Math.round(255 + (base[2] - 255) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function winColor(w) {
    return w === "JA" ? JA : w === "ANR" ? ANR : "var(--otros)";
  }
  function winCell(w, year) {
    if (!isWinner(w)) return '<span class="asun-w">' + (w || "s/d") + "</span>";
    var cls = w === "JA" ? "asun-w--ja" : "asun-w--anr";
    /* Compact tag in dense cells; the full year-specific force name goes in
       the title so the 2021/2026 distinction stays available. */
    var compact = forceLabel(w, 2026);
    var full = forceLabel(w, year) + " (" + year + ")";
    return '<span class="asun-w ' + cls + '" title="' + full + '">' + compact + "</span>";
  }
  function isWinner(v) { return v === "ANR" || v === "JA"; }

  /* ------------------------------------------------------------- DOM utils */

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function elT(tag, cls, text) {
    var n = el(tag, cls);
    if (text != null) n.textContent = text;
    return n;
  }
  function elH(tag, cls, html) {
    var n = el(tag, cls);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
      }
    }
    return n;
  }
  function svgText(attrs, text) {
    var n = svg("text", attrs);
    n.textContent = text;
    return n;
  }
  function maxOf(arr, fn) {
    var m = -Infinity;
    for (var i = 0; i < arr.length; i++) {
      var v = fn(arr[i]);
      if (v != null && v > m) m = v;
    }
    return m;
  }
  function minOf(arr, fn) {
    var m = Infinity;
    for (var i = 0; i < arr.length; i++) {
      var v = fn(arr[i]);
      if (v != null && v < m) m = v;
    }
    return m;
  }
  function byGiroAsc(a, b) { return a.giro - b.giro; }

  function makeTable(headers, rows) {
    var wrap = el("div", "asun-tablewrap");
    var t = el("table", "asun-table");
    var thead = el("thead");
    var htr = el("tr");
    headers.forEach(function (h) {
      htr.appendChild(elH("th", (h.cls || "") + (h.text ? " is-text" : ""), h.label));
    });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el("tbody");
    rows.forEach(function (row) {
      var tr = el("tr", row.cls || "");
      row.cells.forEach(function (c, i) {
        var cls = (c && c.cls) || "";
        if (headers[i] && headers[i].text) cls += " is-text";
        var td = el("td", cls);
        if (c && c.html != null) td.innerHTML = c.html;
        else td.textContent = String(c);
        tr.appendChild(td);
      });
      if (row.onClick) attachRowClick(tr, row.onClick);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }

  function attachRowClick(tr, handler) {
    tr.classList.add("is-clickable");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.addEventListener("click", handler);
    tr.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  }

  /* ---------------------------------------------------------- tooltip (own) */

  var tip = null;
  function ensureTip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }
  function placeTip(x, y) {
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function tipLine(cls, text) {
    var s = document.createElement("span");
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  }

  /* ------------------------------------------------- indices / geo lookup */

  var BY_BARRIO = {};
  DATA.barrios.forEach(function (b) { BY_BARRIO[b.barrio] = b; });

  var BY_ZONA = {};
  DATA.zonas.forEach(function (z) { BY_ZONA[z.zona] = z; });

  var GEO = (DATA.geo && DATA.geo.barrios && DATA.geo.barrios.length) ? DATA.geo : null;
  var GEO_BARRIOS = {};
  if (GEO) {
    GEO.barrios.forEach(function (f) { if (f.barrio) GEO_BARRIOS[f.barrio] = true; });
  }

  /* ----------------------------------------- shared map projector (Change 3)
     Equirectangular with a cos(lat0) factor on longitude, fitted to a fixed
     viewBox while preserving aspect ratio. Bbox = union of geo.bbox and the
     locales' extents. Used by BOTH the barrios choropleths and the locales map
     so points sit correctly over the polygons. */
  var MAP_W = 900, MAP_H = 560, MAP_PAD = 28;

  function computeBounds() {
    var b;
    if (GEO && GEO.bbox) {
      b = GEO.bbox.slice();
    } else {
      b = [Infinity, Infinity, -Infinity, -Infinity];
    }
    DATA.locales.forEach(function (l) {
      if (l.lon < b[0]) b[0] = l.lon;
      if (l.lat < b[1]) b[1] = l.lat;
      if (l.lon > b[2]) b[2] = l.lon;
      if (l.lat > b[3]) b[3] = l.lat;
    });
    return b;
  }

  function buildProjector() {
    var b = computeBounds();
    var minLon = b[0], minLat = b[1], maxLon = b[2], maxLat = b[3];
    var lat0 = (minLat + maxLat) / 2;
    var kx = Math.cos(lat0 * Math.PI / 180);
    var worldW = (maxLon - minLon) * kx || 1e-9;
    var worldH = (maxLat - minLat) || 1e-9;
    var s = Math.min((MAP_W - 2 * MAP_PAD) / worldW, (MAP_H - 2 * MAP_PAD) / worldH);
    var usedW = worldW * s, usedH = worldH * s;
    var offX = (MAP_W - usedW) / 2, offY = (MAP_H - usedH) / 2;
    return {
      W: MAP_W, H: MAP_H,
      x: function (lon) { return offX + (lon - minLon) * kx * s; },
      y: function (lat) { return offY + (maxLat - lat) * s; },
    };
  }

  var PROJECTOR = buildProjector();

  /* Build one SVG path `d` from a polys structure: array of polygons, each an
     array of rings, each a list of [lon,lat] points. Used both for the barrio
     features (f.polys) and for the district outline (geo.distrito). */
  function polysPath(polys, p) {
    var d = [];
    (polys || []).forEach(function (poly) {
      (poly || []).forEach(function (ring) {
        if (!ring || !ring.length) return;
        d.push("M" + p.x(ring[0][0]).toFixed(1) + " " + p.y(ring[0][1]).toFixed(1));
        for (var i = 1; i < ring.length; i++) {
          d.push("L" + p.x(ring[i][0]).toFixed(1) + " " + p.y(ring[i][1]).toFixed(1));
        }
        d.push("Z");
      });
    });
    return d.join(" ");
  }

  /* ------------------------------------------- shared filter state (Change 4) */

  var filter = { zona: null, barrio: null };
  var applying = false;
  var renderers = [];

  function registerRenderer(fn) { renderers.push(fn); return fn; }

  function applyFilter() {
    if (applying) return;
    applying = true;
    try {
      renderers.forEach(function (fn) {
        try { fn(); } catch (err) { console.warn("[asuncion] render failed", err); }
      });
      updateChip();
    } finally {
      applying = false;
    }
  }

  function toggleZona(zona) {
    if (filter.zona === zona) filter.zona = null;
    else filter.zona = zona;
    filter.barrio = null;
    applyFilter();
  }

  function setBarrio(barrio, zona) {
    if (filter.barrio === barrio) {
      filter.barrio = null;
    } else {
      filter.barrio = barrio;
      filter.zona = zona || (BY_BARRIO[barrio] && BY_BARRIO[barrio].zona) || filter.zona;
    }
    applyFilter();
  }

  function clearFilter() {
    filter.zona = null;
    filter.barrio = null;
    applyFilter();
  }

  function scopedBarrios() {
    return DATA.barrios.filter(function (b) {
      if (b.win26 == null || !isWinner(b.win21) || !isWinner(b.win26)) return false;
      if (filter.zona && b.zona !== filter.zona) return false;
      return true;
    }).sort(byGiroAsc);
  }

  function scopedLocales() {
    return DATA.locales.filter(function (l) {
      if (filter.zona && l.zona !== filter.zona) return false;
      if (filter.barrio && l.barrio !== filter.barrio) return false;
      return true;
    });
  }

  function scopedScatterPts() {
    return DATA.barrios.filter(function (b) {
      return b.pobreza != null && b.ja26 != null && b.votos26 != null &&
        (!filter.zona || b.zona === filter.zona);
    });
  }

  /* ---------------------------------------------------------------- tabs */

  var TABS = [
    { id: "resumen", label: "Resumen", build: buildResumen },
    { id: "zonas", label: "Zonas", build: buildZonas },
    { id: "barrios", label: "Barrios", build: buildBarrios },
    { id: "locales", label: "Locales", build: buildLocales },
    { id: "correlaciones", label: "Correlaciones", build: buildCorrelaciones },
  ];

  var bar = el("div", "asuntabs-bar");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Secciones del análisis de Asunción");
  var buttons = [];
  var panels = [];

  TABS.forEach(function (tab, i) {
    var btn = elT("button", "asuntab", tab.label);
    btn.type = "button";
    btn.id = "asuntab-" + tab.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", "asunpanel-" + tab.id);
    btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
    btn.addEventListener("click", function () { select(i); });
    bar.appendChild(btn);
    buttons.push(btn);

    var panel = el("div", "asuntab-panel");
    panel.id = "asunpanel-" + tab.id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", btn.id);
    panel.tabIndex = 0;
    if (i !== 0) panel.hidden = true;
    panels.push(panel);
  });

  var chip = el("div", "asun-filterchip");
  chip.hidden = true;

  root.appendChild(bar);
  root.appendChild(chip);
  panels.forEach(function (p) { root.appendChild(p); });

  function updateChip() {
    if (!filter.zona && !filter.barrio) { chip.hidden = true; return; }
    chip.hidden = false;
    clear(chip);
    var what = filter.barrio || filter.zona;
    chip.appendChild(elT("span", "asun-filterchip-label", "Filtro: " + what));
    var btn = elT("button", "asun-filterchip-btn", "Limpiar filtro ✕");
    btn.type = "button";
    btn.addEventListener("click", clearFilter);
    chip.appendChild(btn);
  }

  bar.addEventListener("keydown", function (e) {
    var idx = buttons.indexOf(document.activeElement);
    if (idx < 0) return;
    var n = buttons.length;
    var next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % n;
    else if (e.key === "ArrowLeft") next = (idx - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next >= 0) { e.preventDefault(); buttons[next].focus(); select(next); }
  });

  var built = {};
  function select(i) {
    buttons.forEach(function (b, j) {
      var on = i === j;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      panels[j].hidden = !on;
    });
    if (!built[i]) {
      try {
        TABS[i].build(panels[i]);
        built[i] = true;
      } catch (err) {
        console.error("[asuncion] failed to build tab " + TABS[i].id, err);
        panels[i].appendChild(elT("p", "asun-cap", "No se pudo construir esta vista."));
        built[i] = true;
      }
    }
  }
  try { select(0); } catch (err) { console.error("[asuncion] init failed", err); }

  /* ------------------------------------------------------------- 1. Resumen */

  function kpiCard(label, value, cls, sub) {
    var c = el("div", "asun-kpi");
    c.appendChild(elT("p", "asun-kpi-label", label));
    c.appendChild(elT("p", "asun-kpi-value" + (cls ? " " + cls : ""), value));
    if (sub) c.appendChild(elT("p", "asun-kpi-sub", sub));
    return c;
  }

  function renderKpis(host) {
    clear(host);
    var z = filter.zona ? BY_ZONA[filter.zona] : null;
    var k = DATA.kpis;
    var anr = forceLabel("ANR");
    var ja26 = forceLabel("JA", 2026);
    /* Baseline comment for the JA/opposition card: 2021 ran as Juntos x Asunción. */
    function jaBase(v) {
      return "2021: " + pct1(v) + " " + forceLabel("JA", 2021);
    }
    if (z) {
      host.appendChild(kpiCard(anr + " · % de votos 2026", pct1(z.anr26), "is-anr", "Zona: " + z.zona));
      host.appendChild(kpiCard(ja26 + " · % de votos 2026", pct1(z.ja26), "is-ja",
        "Zona: " + z.zona + " · " + jaBase(z.ja21)));
      host.appendChild(kpiCard(
        "Margen " + anr + " " + MINUS + " " + ja26 + " 2026",
        pp1(z.margen26), z.margen26 < 0 ? "is-ja" : "is-anr",
        "Zona: " + z.zona + " · 2021: " + pp1(z.margen21)
      ));
      host.appendChild(kpiCard(
        "Participación 2026", pct1(z.part26), "", "Zona: " + z.zona
      ));
    } else {
      host.appendChild(kpiCard(anr + " · % de votos 2026", pct1(k.anr2026), "is-anr", cleanNarr(DATA.narrativa.anr)));
      host.appendChild(kpiCard(ja26 + " · % de votos 2026", pct1(k.ja2026), "is-ja", jaBase(k.ja2021)));
      host.appendChild(kpiCard(
        "Margen " + anr + " " + MINUS + " " + ja26 + " 2026",
        pp1(k.margen2026), k.margen2026 < 0 ? "is-ja" : "is-anr", "2021: " + pp1(k.margen2021)
      ));
      host.appendChild(kpiCard("Participación 2026", pct1(k.part2026), "", cleanNarr(DATA.narrativa.part)));
    }
  }

  function fuerzaBar(tag, v, max, color, long) {
    var row = el("div", "asun-fbar" + (long ? " is-long-tag" : ""));
    row.appendChild(elT("span", "asun-fbar-tag", tag));
    var track = el("div", "asun-fbar-track");
    var fill = el("span", "asun-fbar-fill");
    fill.style.background = color;
    fill.style.width = v == null ? "0" : Math.max(v / max, 0.012) * 100 + "%";
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(elT("span", "asun-fbar-val", v == null ? "s/d" : pct1(v)));
    if (v == null) row.classList.add("is-na");
    return row;
  }

  function buildFuerzas() {
    var list = DATA.fuerzas.slice();
    var max = 0;
    list.forEach(function (f) {
      if (f.p21 != null) max = Math.max(max, f.p21);
      if (f.p26 != null) max = Math.max(max, f.p26);
    });
    max = max || 1;

    var box = el("div", "asun-block");
    box.appendChild(elT("p", "asun-subhead", "% de votos por fuerza política"));
    var grid = el("div", "asun-fuerzas");
    list.forEach(function (f) {
      var row = el("div", "asun-fuerza");
      var name = elT("div", "asun-fuerza-name", forceLabel(f.sigla));
      if (FORCE_TITLES[f.sigla]) name.title = FORCE_TITLES[f.sigla];
      row.appendChild(name);
      var plot = el("div", "asun-fuerza-plot");
      /* JA changed name across years: tag each of its bars with the
         year-specific force name instead of a bare year. */
      var isJA = f.sigla === "JA";
      plot.appendChild(fuerzaBar(
        isJA ? "2021 · " + forceLabel("JA", 2021) : "2021", f.p21, max, "var(--otros)", isJA));
      plot.appendChild(fuerzaBar(
        isJA ? "2026 · " + forceLabel("JA", 2026) : "2026", f.p26, max, "var(--ink)", isJA));
      row.appendChild(plot);
      grid.appendChild(row);
    });
    box.appendChild(grid);
    box.appendChild(elT("p", "asun-cap", "Gris = 2021 · Negro = 2026. Sin barra en 2026 = fuerza sin datos ese año."));
    return box;
  }

  /* Change 2: real 2026 TSJE result for the Capital. Hidden if absent. */
  function buildResultado2026() {
    var r = DATA.resultado2026;
    if (!r || !r.winner) return null;
    var w = r.winner;
    var total = r.totalVotos || 1;

    var box = el("div", "asun-block asun-resultado");
    box.appendChild(elT("p", "asun-subhead", "Intendencia 2026 — resultado oficial"));

    var line = el("p", "asun-result-winner");
    line.appendChild(elT("b", "", "Intendenta electa 2026: "));
    line.appendChild(elT("span", "asun-result-name", titleCase(w.nomCandidato)));
    line.appendChild(elT("span", "asun-result-party", " (" + partyNice(w.desPartido) + ")"));
    line.appendChild(elT("span", "asun-result-votes",
      " · " + nf(w.votos) + " votos (" + pct1(w.votos / total) + ")"));
    box.appendChild(line);

    if (r.candidatos && r.candidatos.length) {
      var list = el("div", "asun-result-cands");
      r.candidatos.slice().sort(function (a, b) { return b.votos - a.votos; }).forEach(function (c) {
        var row = el("div", "asun-rcand");
        var sw = el("span", "asun-rcand-sw");
        if (c.color) sw.style.background = "rgb(" + c.color + ")";
        row.appendChild(sw);
        row.appendChild(elT("span", "asun-rcand-name", titleCase(c.nombre)));
        row.appendChild(elT("span", "asun-rcand-party", partyNice(c.partido)));
        row.appendChild(elT("span", "asun-rcand-votes", nf(c.votos) + " votos"));
        row.appendChild(elT("span", "asun-rcand-pct", pct1(c.pct != null ? c.pct : c.votos / total)));
        list.appendChild(row);
      });
      box.appendChild(list);
    }
    return box;
  }

  function buildResumen(panel) {
    var kpisHost = el("div", "asun-kpis");
    panel.appendChild(kpisHost);
    registerRenderer(function () { renderKpis(kpisHost); });
    renderKpis(kpisHost);

    var resultado = buildResultado2026();
    if (resultado) panel.appendChild(resultado);

    panel.appendChild(buildFuerzas());

    var ja21 = DATA.barrios.filter(function (b) { return b.win21 === "JA"; }).length;
    var stat = el("p", "asun-stat");
    stat.innerHTML = "Barrios donde ganó " + forceLabel("JA", 2026) + " en 2026: <b>" +
      nf(DATA.kpis.barriosJA2026) + "</b> · donde ganó " + forceLabel("JA", 2021) +
      " en 2021: <b>" + nf(ja21) + "</b>";
    panel.appendChild(stat);

    var q = el("div", "asun-ql");
    q.appendChild(elT("p", "asun-ql-title", "Qué pasó"));
    var ul = el("ul");
    [
      [forceLabel("ANR"), DATA.narrativa.anr],
      [forceLabel("JA", 2026), DATA.narrativa.ja],
      ["Margen " + forceLabel("ANR") + " " + MINUS + " " + forceLabel("JA", 2026), DATA.narrativa.margen],
      ["Participación", DATA.narrativa.part],
      ["Barrios con " + forceLabel("JA", 2026), DATA.narrativa.barriosJA],
    ].forEach(function (pair) {
      var li = el("li");
      li.appendChild(elT("b", "", pair[0]));
      li.appendChild(elT("span", "", cleanNarr(pair[1])));
      ul.appendChild(li);
    });
    q.appendChild(ul);
    panel.appendChild(q);
  }

  /* --------------------------------------------------------------- 2. Zonas */

  function dbar(tag, value, scale) {
    var row = el("div", "asun-dbar");
    row.appendChild(elT("span", "asun-dbar-tag", tag));
    var track = el("div", "asun-dbar-track");
    track.appendChild(el("span", "asun-dbar-zero"));
    var fill = el("span", "asun-dbar-fill");
    var w = value == null ? 0 : Math.min(Math.abs(value), scale) / scale * 50;
    if (value == null) {
      fill.style.width = "0";
    } else if (value >= 0) {
      fill.style.left = "50%";
      fill.style.width = Math.max(w, 0.4) + "%";
      fill.style.background = ANR;
    } else {
      fill.style.right = "50%";
      fill.style.width = Math.max(w, 0.4) + "%";
      fill.style.background = JA;
    }
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(elT("span", "asun-dbar-val", value == null ? "s/d" : pp1(value)));
    return row;
  }

  function renderZoneBars(host) {
    clear(host);
    var zonas = DATA.zonas.slice().sort(byGiroAsc);
    var scale = Math.max(
      maxOf(zonas, function (z) { return Math.abs(z.margen21); }),
      maxOf(zonas, function (z) { return Math.abs(z.margen26); })
    ) || 1;

    zonas.forEach(function (z) {
      var row = el("div", "asun-zonebar is-clickable" +
        (filter.zona === z.zona ? " is-selected" : ""));
      row.appendChild(elT("div", "asun-zonebar-name", z.zona));
      var plot = el("div", "asun-zonebar-plot");
      plot.appendChild(dbar("2021", z.margen21, scale));
      plot.appendChild(dbar("2026", z.margen26, scale));
      row.appendChild(plot);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.addEventListener("click", function () { toggleZona(z.zona); });
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleZona(z.zona); }
      });
      host.appendChild(row);
    });
  }

  function renderZonasTable(host) {
    clear(host);
    var zonas = DATA.zonas.slice().sort(byGiroAsc);
    var anr = forceLabel("ANR");
    var ja21 = forceLabel("JA", 2021), ja26 = forceLabel("JA", 2026);
    var rows = zonas.map(function (z) {
      return {
        cls: "asun-zone-row" + (filter.zona === z.zona ? " is-selected" : ""),
        onClick: function () { toggleZona(z.zona); },
        cells: [
          z.zona,
          pct1(z.anr21), pct1(z.anr26),
          pct1(z.ja21), pct1(z.ja26),
          pct1(z.part21), pct1(z.part26),
          pp1(z.giro),
        ],
      };
    });
    host.appendChild(makeTable([
      { label: "Zona", text: true },
      { label: anr + " 2021" }, { label: anr + " 2026" },
      { label: ja21 + " 2021" }, { label: ja26 + " 2026" },
      { label: "Particip. 2021" }, { label: "Particip. 2026" },
      { label: "Giro (pp)" },
    ], rows));
  }

  function buildZonas(panel) {
    var box = el("div", "asun-block");
    box.appendChild(elT("p", "asun-subhead",
      "Margen " + forceLabel("ANR") + " " + MINUS + " " + forceLabel("JA", 2026) + " por zona (pp)"));
    var barsHost = el("div", "asun-zonebars");
    box.appendChild(barsHost);
    box.appendChild(elT("p", "asun-cap",
      "Tocá una zona para filtrar. Rojo = ventaja " + forceLabel("ANR") +
      " · Azul = ventaja " + forceLabel("JA", 2026) + ". La línea central es empate."));
    panel.appendChild(box);

    var tableHost = el("div");
    panel.appendChild(tableHost);

    registerRenderer(function () { renderZoneBars(barsHost); });
    registerRenderer(function () { renderZonasTable(tableHost); });
    renderZoneBars(barsHost);
    renderZonasTable(tableHost);
  }

  /* ------------------------------------------------------------- 3. Barrios */

  function barrioMap(year) {
    var s = svg("svg", {
      viewBox: "0 0 " + MAP_W + " " + MAP_H,
      role: "img",
      "aria-label": "Mapa de barrios de Asunción según el ganador de " + year +
        " para intendente; el color indica la fuerza y la intensidad el margen.",
    });
    if (!GEO) return s;

    GEO.barrios.forEach(function (f) {
      if (!f.barrio) return;
      var rec = BY_BARRIO[f.barrio];
      if (!rec) return;
      if (filter.zona && rec.zona !== filter.zona) return;
      var w = year === 2021 ? rec.win21 : rec.win26;
      var m = year === 2021 ? rec.margen21 : rec.margen26;
      if (!isWinner(w) || m == null) return;

      var path = svg("path", {
        d: polysPath(f.polys, PROJECTOR), "fill-rule": "evenodd", class: "asun-poly",
      });
      /* Intensity by min(|margen|, 50) / 50. */
      path.style.fill = divColor(m, 50, 0);
      path.setAttribute("role", "button");
      path.setAttribute("tabindex", "0");
      var t = svg("title");
      t.textContent = rec.barrio + " · " + forceLabel(w, year) + " · margen " + pp1(m);
      path.appendChild(t);
      if (filter.barrio === rec.barrio) path.classList.add("is-selected");
      path.addEventListener("click", function () { setBarrio(rec.barrio, rec.zona); });
      path.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBarrio(rec.barrio, rec.zona); }
      });
      s.appendChild(path);
    });
    return s;
  }

  function countMissingPoly(rows) {
    var n = 0;
    rows.forEach(function (b) { if (!GEO_BARRIOS[b.barrio]) n++; });
    return n;
  }

  function renderBarrioMaps(col21, col26, note) {
    clear(col21);
    clear(col26);
    col21.appendChild(elT("h3", "asun-winner-h", "Ganó en 2021"));
    col21.appendChild(barrioMap(2021));
    col26.appendChild(elT("h3", "asun-winner-h", "Ganó en 2026"));
    col26.appendChild(barrioMap(2026));

    /* Small note: how many of our (scoped) barrios lack a polygon, and how
       many lack a winner for one of the two years. */
    var scoped = scopedBarrios();
    var noPoly = countMissingPoly(scoped);
    var noData = DATA.barrios.filter(function (b) {
      if (filter.zona && b.zona !== filter.zona) return false;
      return !isWinner(b.win21) || !isWinner(b.win26);
    }).length;
    var parts = [];
    if (noPoly) parts.push(noPoly + (noPoly === 1 ? " barrio sin polígono" : " barrios sin polígono"));
    if (noData) parts.push(noData + (noData === 1 ? " barrio sin datos" : " barrios sin datos"));
    note.textContent = parts.join(" · ");
    note.hidden = !parts.length;
  }

  function renderBarriosTable(host) {
    clear(host);
    var rows = scopedBarrios();
    var tableRows = rows.map(function (b) {
      var flip = b.win21 !== b.win26;
      return {
        cls: "asun-barrio-row" + (flip ? " is-flip" : "") +
          (filter.barrio === b.barrio ? " is-selected" : ""),
        onClick: function () { setBarrio(b.barrio, b.zona); },
        cells: [
          b.zona,
          { html: b.barrio + (flip ? ' <span class="asun-flip-badge">cambió</span>' : "") },
          { html: winCell(b.win21, 2021) },
          { html: winCell(b.win26, 2026) },
          pp1(b.margen21), pp1(b.margen26), pp1(b.giro), nf(b.votos26),
        ],
      };
    });
    host.appendChild(makeTable([
      { label: "Zona", text: true }, { label: "Barrio", text: true },
      { label: "Ganó 2021" }, { label: "Ganó 2026" },
      { label: "Margen 2021" }, { label: "Margen 2026" },
      { label: "Giro (pp)" }, { label: "Votos 2026" },
    ], tableRows));
  }

  function buildBarrios(panel) {
    var box = el("div", "asun-block");
    box.appendChild(elT("p", "asun-subhead", "Quién ganó cada barrio"));
    var winners = el("div", "asun-winners");
    var col21 = el("div", "asun-winner-col");
    var col26 = el("div", "asun-winner-col");
    winners.appendChild(col21);
    winners.appendChild(col26);
    box.appendChild(winners);
    box.appendChild(elT("p", "asun-cap",
      "Rojo = " + forceLabel("ANR") + " · Azul = " + forceLabel("JA", 2021) +
      " (2021) / " + forceLabel("JA", 2026) +
      " (2026). Intensidad según |margen| (tope 50 pp). Tocá un barrio para filtrar."));
    var note = el("p", "asun-cap asun-map-note");
    box.appendChild(note);
    panel.appendChild(box);

    var tableHost = el("div");
    panel.appendChild(tableHost);

    registerRenderer(function () { renderBarrioMaps(col21, col26, note); });
    registerRenderer(function () { renderBarriosTable(tableHost); });
    renderBarrioMaps(col21, col26, note);
    renderBarriosTable(tableHost);
  }

  /* ------------------------------------------------------------- 4. Locales */

  function localTip(l) {
    var t = ensureTip();
    t.textContent = "";
    var b = document.createElement("b");
    b.textContent = l.local;
    t.appendChild(b);
    t.appendChild(tipLine("tip-sub", l.barrio + " · " + l.zona));
    t.appendChild(tipLine("tip-meta", "Votos 2026: " + nf(l.votos26)));
    t.appendChild(tipLine("tip-meta",
      forceLabel("ANR") + " " + pct1(l.anr26) + " · " + forceLabel("JA", 2026) + " " + pct1(l.ja26)));
    t.appendChild(tipLine("tip-meta", "Giro: " + pp1(l.giro)));
  }

  function renderLocalesMap(host) {
    clear(host);
    var locales = scopedLocales();
    var map = svg("svg", {
      viewBox: "0 0 " + MAP_W + " " + MAP_H,
      role: "img",
      "aria-label": "Mapa de locales de votación de Asunción sobre los barrios; " +
        "color según el giro 2021-2026 y tamaño según votos 2026.",
    });

    /* Light barrio basemap + district outline so points gain geographic
       context. The district is drawn as a filled-none outline on top of the
       barrios, and both sit UNDER the locale points. */
    if (GEO) {
      GEO.barrios.forEach(function (f) {
        map.appendChild(svg("path", {
          d: polysPath(f.polys, PROJECTOR), "fill-rule": "evenodd", class: "asun-base",
        }));
      });
      map.appendChild(svg("path", {
        d: polysPath(GEO.distrito, PROJECTOR), "fill-rule": "evenodd", class: "asun-district",
      }));
    }

    var vmax = maxOf(locales, function (l) { return l.votos26; }) || 1;
    var vmin = minOf(locales, function (l) { return l.votos26; });
    var ordered = locales.slice().sort(function (a, b) { return b.votos26 - a.votos26; });
    ordered.forEach(function (l) {
      var c = svg("circle", {
        cx: PROJECTOR.x(l.lon).toFixed(1),
        cy: PROJECTOR.y(l.lat).toFixed(1),
        r: (3.5 + 10 * Math.sqrt(l.votos26 / vmax)).toFixed(2),
        class: "asun-dot",
      });
      c.style.fill = divColor(l.giro, 20, 0.12);
      if (filter.barrio === l.barrio) c.classList.add("is-selected");
      c.setAttribute("role", "button");
      c.setAttribute("tabindex", "0");
      var t = svg("title");
      t.textContent = l.local + " · " + l.barrio + " · " + pp1(l.giro);
      c.appendChild(t);
      c.addEventListener("pointerenter", function (e) { localTip(l); placeTip(e.clientX, e.clientY); tip.hidden = false; });
      c.addEventListener("pointermove", function (e) { if (tip && !tip.hidden) placeTip(e.clientX, e.clientY); });
      c.addEventListener("pointerleave", hideTip);
      c.addEventListener("click", function () { setBarrio(l.barrio, l.zona); });
      c.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBarrio(l.barrio, l.zona); }
      });
      map.appendChild(c);
    });
    host.appendChild(map);

    var legend = el("div", "asun-map-legend");
    var range = locales.length
      ? nf(vmin) + "–" + nf(vmax)
      : "sin locales en el filtro";
    legend.appendChild(elH("span", "asun-lg",
      '<span class="asun-dotkey" style="background:' + JA + '"></span>' +
      "Giro hacia " + forceLabel("JA", 2026)));
    legend.appendChild(elH("span", "asun-lg",
      '<span class="asun-dotkey" style="background:' + ANR + '"></span>' +
      "Giro hacia " + forceLabel("ANR")));
    legend.appendChild(elT("span", "", "El tamaño del círculo indica votos 2026 (" + range + ")."));
    host.appendChild(legend);
  }

  function renderLocalesTable(host) {
    clear(host);
    var locales = scopedLocales().slice().sort(byGiroAsc);
    var anr = forceLabel("ANR");
    var ja21 = forceLabel("JA", 2021), ja26 = forceLabel("JA", 2026);
    var rows = locales.map(function (l) {
      return {
        cls: "asun-local-row" + (filter.barrio === l.barrio ? " is-selected" : ""),
        onClick: function () { setBarrio(l.barrio, l.zona); },
        cells: [
          l.zona, l.barrio, l.local,
          nf(l.votos21), nf(l.votos26),
          pct1(l.anr21), pct1(l.anr26),
          pct1(l.ja21), pct1(l.ja26),
          pp1(l.giro),
        ],
      };
    });
    host.appendChild(makeTable([
      { label: "Zona", text: true }, { label: "Barrio", text: true }, { label: "Local", text: true },
      { label: "Votos 2021" }, { label: "Votos 2026" },
      { label: anr + " 2021" }, { label: anr + " 2026" },
      { label: ja21 + " 2021" }, { label: ja26 + " 2026" },
      { label: "Giro (pp)" },
    ], rows));
  }

  function buildLocales(panel) {
    var box = el("div", "asun-block");
    box.appendChild(elT("p", "asun-subhead", "Mapa de locales de votación"));
    var mapHost = el("div", "asun-map");
    box.appendChild(mapHost);
    panel.appendChild(box);

    var tableHost = el("div");
    panel.appendChild(tableHost);

    registerRenderer(function () { renderLocalesMap(mapHost); });
    registerRenderer(function () { renderLocalesTable(tableHost); });
    renderLocalesMap(mapHost);
    renderLocalesTable(tableHost);
  }

  /* ------------------------------------------------------- 5. Correlaciones */

  function buildScatter(cfg) {
    var W = 720, H = 440, L = 58, R = 18, T = 18, B = 46;
    var iw = W - L - R;
    var ih = H - T - B;
    var x0 = cfg.x0, x1 = cfg.x1, y0 = cfg.y0, y1 = cfg.y1;
    var sx = function (x) { return L + (x - x0) / (x1 - x0) * iw; };
    var sy = function (y) { return T + (y1 - y) / (y1 - y0) * ih; };

    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": cfg.aria });
    s.appendChild(svg("rect", { x: L, y: T, width: iw, height: ih, fill: "none", stroke: "#e6e6e2" }));

    var i, nx = cfg.nx || 5, ny = cfg.ny || 4;
    for (i = 0; i <= nx; i++) {
      var xv = x0 + (x1 - x0) * i / nx;
      var xx = sx(xv);
      s.appendChild(svg("line", { x1: xx, y1: T, x2: xx, y2: T + ih, stroke: "#f0f0ee" }));
      s.appendChild(svgText({ x: xx.toFixed(1), y: T + ih + 18, "text-anchor": "middle", class: "asun-axis-label" }, cfg.fx(xv)));
    }
    for (i = 0; i <= ny; i++) {
      var yv = y0 + (y1 - y0) * i / ny;
      var yy = sy(yv);
      s.appendChild(svg("line", { x1: L, y1: yy, x2: L + iw, y2: yy, stroke: "#f0f0ee" }));
      s.appendChild(svgText({ x: L - 8, y: (yy + 4).toFixed(1), "text-anchor": "end", class: "asun-axis-label" }, cfg.fy(yv)));
    }
    if (cfg.zero && y0 < 0 && y1 > 0) {
      s.appendChild(svg("line", { x1: L, y1: sy(0), x2: L + iw, y2: sy(0), class: "asun-zero" }));
    }

    cfg.points.forEach(function (p) {
      var c = svg("circle", { cx: sx(p.x).toFixed(1), cy: sy(p.y).toFixed(1), r: p.r.toFixed(2), class: "asun-bubble" });
      c.style.fill = p.fill;
      var title = svg("title");
      title.textContent = p.title;
      c.appendChild(title);
      s.appendChild(c);
    });

    s.appendChild(svgText({ x: L + iw / 2, y: H - 6, "text-anchor": "middle", class: "asun-axis-title" }, cfg.xLabel));
    s.appendChild(svgText({
      x: 14, y: T + ih / 2, "text-anchor": "middle",
      transform: "rotate(-90 14 " + (T + ih / 2) + ")", class: "asun-axis-title",
    }, cfg.yLabel));
    return s;
  }

  function renderScatters(host1, host2, note1, note2) {
    clear(host1);
    clear(host2);
    var pts = scopedScatterPts();
    if (!pts.length) {
      host1.appendChild(elT("p", "asun-note", "Sin barrios con datos para la zona seleccionada."));
      note1.textContent = "";
      note2.textContent = "";
      return;
    }
    var maxP = maxOf(pts, function (b) { return b.pobreza; }) || 1;
    var maxJA = maxOf(pts, function (b) { return b.ja26; }) || 1;
    var vmax = maxOf(pts, function (b) { return b.votos26; }) || 1;

    var m = DATA.correlacion.m;
    var vars = DATA.correlacion.vars;
    var rPair = m[vars.indexOf("% Pobreza")][vars.indexOf("% JA Intendencia 2026")];

    var sc1 = buildScatter({
      aria: "Dispersión de pobreza y voto a " + forceLabel("JA", 2026) + " 2026 por barrio.",
      x0: 0, x1: maxP * 1.08, y0: 0, y1: maxJA * 1.08,
      xLabel: "% Pobreza", yLabel: "% " + forceLabel("JA", 2026) + " 2026",
      fx: function (v) { return n1(v * 100) + "%"; },
      fy: function (v) { return n1(v * 100) + "%"; },
      points: pts.map(function (b) {
        return {
          x: b.pobreza, y: b.ja26,
          r: 3 + 10 * Math.sqrt(b.votos26 / vmax),
          fill: winColor(b.win26),
          title: b.barrio + " · " + b.zona + " — Pobreza " + pct1(b.pobreza) +
            ", " + forceLabel("JA", 2026) + " " + pct1(b.ja26) + ", " + nf(b.votos26) + " votos",
        };
      }),
    });
    var w1 = el("div", "asun-scatter");
    w1.appendChild(sc1);
    host1.appendChild(w1);
    note1.textContent = "r = " + r2(rPair) + " para pobreza y voto " + forceLabel("JA", 2026) +
      " 2026. Correlación no implica causalidad.";

    var gy0 = Math.min(0, minOf(pts, function (b) { return b.giro; })) - 2;
    var gy1 = Math.max(0, maxOf(pts, function (b) { return b.giro; })) + 2;
    var sc2 = buildScatter({
      aria: "Dispersión de pobreza y giro 2021-2026 por barrio.",
      x0: 0, x1: maxP * 1.08, y0: gy0, y1: gy1, zero: true,
      xLabel: "% Pobreza", yLabel: "Giro (pp)",
      fx: function (v) { return n1(v * 100) + "%"; },
      fy: function (v) { return n1(v) + ""; },
      points: pts.map(function (b) {
        return {
          x: b.pobreza, y: b.giro,
          r: 3 + 10 * Math.sqrt(b.votos26 / vmax),
          fill: divColor(b.giro, 20, 0.12),
          title: b.barrio + " · " + b.zona + " — Pobreza " + pct1(b.pobreza) +
            ", giro " + pp1(b.giro),
        };
      }),
    });
    var w2 = el("div", "asun-scatter");
    w2.appendChild(sc2);
    host2.appendChild(w2);
    note2.textContent =
      "La línea discontinua marca giro = 0. Giro negativo = el margen se movió hacia " + forceLabel("JA", 2026) + ".";
  }

  function buildCorrelaciones(panel) {
    var vars = DATA.correlacion.vars;
    var m = DATA.correlacion.m;
    var full = ["% Pobreza", "Brecha participación H-M", "% Lote fiscal o municipal",
      "Índice de envejecimiento", "% JA Intendencia 2026"];
    var short = ["Pobreza", "Brecha H-M", "Lote fiscal", "Envejecimiento", "JA 2026"];
    var idx = full.map(function (l) { return vars.indexOf(l); });

    panel.appendChild(elT("p", "asun-subhead", "Correlación de Pearson entre indicadores (por barrio)"));

    var heatWrap = el("div", "asun-heat");
    var t = el("table", "asun-heat-table");
    var thead = el("thead");
    var htr = el("tr");
    htr.appendChild(elH("th", "asun-heat-corner", "&nbsp;"));
    short.forEach(function (s) { htr.appendChild(elH("th", "asun-heat-ch", s)); });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el("tbody");
    idx.forEach(function (ri, i) {
      var tr = el("tr");
      tr.appendChild(elH("th", "asun-heat-rh", short[i]));
      idx.forEach(function (ci, j) {
        var v = m[ri][ci];
        var td = el("td", "asun-heat-cell");
        if (i === j) {
          td.classList.add("asun-heat-diag");
        } else {
          td.style.background = divColor(v, 1, 0);
          td.style.color = Math.min(Math.abs(v), 1) > 0.6 ? "#fff" : "var(--ink)";
        }
        td.textContent = r2(v);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    heatWrap.appendChild(t);
    panel.appendChild(heatWrap);
    panel.appendChild(elT("p", "asun-note",
      "Rojo = correlación positiva · Azul = correlación negativa. La intensidad sigue |r|. Cada celda es el coeficiente entre dos indicadores."));

    panel.appendChild(elT("p", "asun-subhead", "% Pobreza vs % " + forceLabel("JA", 2026) + " 2026"));
    var host1 = el("div");
    panel.appendChild(host1);
    var note1 = el("p", "asun-note");
    panel.appendChild(note1);

    panel.appendChild(elT("p", "asun-subhead", "% Pobreza vs Giro (pp)"));
    var host2 = el("div");
    panel.appendChild(host2);
    var note2 = el("p", "asun-note");
    panel.appendChild(note2);

    registerRenderer(function () { renderScatters(host1, host2, note1, note2); });
    renderScatters(host1, host2, note1, note2);
  }
})();
