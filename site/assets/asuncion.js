/* Asunción 2021 -> 2026 analysis section.
   Renders window.ASUNCION (bundled by make_asuncion.py) into the
   `.asuntabs` container. Self-contained IIFE: own tooltip, own tab state.
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

  /* Diverging scale: positive -> ANR red, negative -> JA blue,
     intensity proportional to min(|v|, cap) / cap, blended from white.
     `floor` keeps small values faintly tinted (used for winner grids). */
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
  function winCell(w) {
    var cls = w === "JA" ? "asun-w--ja" : w === "ANR" ? "asun-w--anr" : "";
    return '<span class="asun-w ' + cls + '">' + (w || "s/d") + "</span>";
  }
  function isWinner(v) { return v === "ANR" || v === "JA"; }

  /* ------------------------------------------------------------- DOM utils */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
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
      htr.appendChild(el("th", (h.cls || "") + (h.text ? " is-text" : ""), h.label));
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
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
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
    var btn = el("button", "asuntab", tab.label);
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

  root.appendChild(bar);
  panels.forEach(function (p) { root.appendChild(p); });

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
    if (!built[i]) { TABS[i].build(panels[i]); built[i] = true; }
  }
  select(0);

  /* ------------------------------------------------------------- 1. Resumen */

  function kpiCard(label, value, cls, sub) {
    var c = el("div", "asun-kpi");
    c.appendChild(el("p", "asun-kpi-label", label));
    c.appendChild(el("p", "asun-kpi-value" + (cls ? " " + cls : ""), value));
    if (sub) c.appendChild(el("p", "asun-kpi-sub", sub));
    return c;
  }

  function fuerzaBar(tag, v, max, color) {
    var row = el("div", "asun-fbar");
    row.appendChild(el("span", "asun-fbar-tag", tag));
    var track = el("div", "asun-fbar-track");
    var fill = el("span", "asun-fbar-fill");
    fill.style.background = color;
    fill.style.width = v == null ? "0" : Math.max(v / max, 0.012) * 100 + "%";
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "asun-fbar-val", v == null ? "s/d" : pct1(v)));
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
    box.appendChild(el("p", "asun-subhead", "% de votos por fuerza política"));
    var grid = el("div", "asun-fuerzas");
    list.forEach(function (f) {
      var row = el("div", "asun-fuerza");
      row.appendChild(el("div", "asun-fuerza-name", f.sigla));
      var plot = el("div", "asun-fuerza-plot");
      plot.appendChild(fuerzaBar("2021", f.p21, max, "var(--otros)"));
      plot.appendChild(fuerzaBar("2026", f.p26, max, "var(--ink)"));
      row.appendChild(plot);
      grid.appendChild(row);
    });
    box.appendChild(grid);
    box.appendChild(el("p", "asun-cap", "Gris = 2021 · Negro = 2026. Sin barra en 2026 = fuerza sin datos ese año."));
    return box;
  }

  function buildResumen(panel) {
    var k = DATA.kpis;

    var kpis = el("div", "asun-kpis");
    kpis.appendChild(kpiCard("ANR · % de votos 2026", pct1(k.anr2026), "is-anr", cleanNarr(DATA.narrativa.anr)));
    kpis.appendChild(kpiCard("Juntos por Asunción · % de votos 2026", pct1(k.ja2026), "is-ja", cleanNarr(DATA.narrativa.ja)));
    kpis.appendChild(kpiCard("Margen ANR" + MINUS + "JA 2026", pp1(k.margen2026), k.margen2026 < 0 ? "is-ja" : "is-anr", "2021: " + pp1(k.margen2021)));
    kpis.appendChild(kpiCard("Participación 2026", pct1(k.part2026), "", cleanNarr(DATA.narrativa.part)));
    panel.appendChild(kpis);

    panel.appendChild(buildFuerzas());

    var ja21 = DATA.barrios.filter(function (b) { return b.win21 === "JA"; }).length;
    var stat = el("p", "asun-stat");
    stat.innerHTML = "Barrios donde ganó Juntos por Asunción en 2026: <b>" +
      nf(k.barriosJA2026) + "</b> · en 2021: <b>" + nf(ja21) + "</b>";
    panel.appendChild(stat);

    var q = el("div", "asun-ql");
    q.appendChild(el("p", "asun-ql-title", "Qué pasó"));
    var ul = el("ul");
    [
      ["ANR", DATA.narrativa.anr],
      ["Juntos por Asunción", DATA.narrativa.ja],
      ["Margen ANR" + MINUS + "JA", DATA.narrativa.margen],
      ["Participación", DATA.narrativa.part],
      ["Barrios con JA", DATA.narrativa.barriosJA],
    ].forEach(function (pair) {
      var li = el("li");
      li.appendChild(el("b", "", pair[0]));
      li.appendChild(el("span", "", cleanNarr(pair[1])));
      ul.appendChild(li);
    });
    q.appendChild(ul);
    panel.appendChild(q);
  }

  /* --------------------------------------------------------------- 2. Zonas */

  function dbar(tag, value, scale) {
    var row = el("div", "asun-dbar");
    row.appendChild(el("span", "asun-dbar-tag", tag));
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
    row.appendChild(el("span", "asun-dbar-val", value == null ? "s/d" : pp1(value)));
    return row;
  }

  function buildZonas(panel) {
    var zonas = DATA.zonas.slice().sort(byGiroAsc);
    var scale = Math.max(
      maxOf(zonas, function (z) { return Math.abs(z.margen21); }),
      maxOf(zonas, function (z) { return Math.abs(z.margen26); })
    ) || 1;

    var box = el("div", "asun-block");
    box.appendChild(el("p", "asun-subhead", "Margen ANR" + MINUS + "JA por zona (pp)"));
    var list = el("div", "asun-zonebars");
    zonas.forEach(function (z) {
      var row = el("div", "asun-zonebar");
      row.appendChild(el("div", "asun-zonebar-name", z.zona));
      var plot = el("div", "asun-zonebar-plot");
      plot.appendChild(dbar("2021", z.margen21, scale));
      plot.appendChild(dbar("2026", z.margen26, scale));
      row.appendChild(plot);
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(el("p", "asun-cap", "Rojo = ventaja ANR · Azul = ventaja JA. La línea central es empate."));
    panel.appendChild(box);

    var rows = zonas.map(function (z) {
      return {
        cells: [
          z.zona,
          pct1(z.anr21), pct1(z.anr26),
          pct1(z.ja21), pct1(z.ja26),
          pct1(z.part21), pct1(z.part26),
          pp1(z.giro),
        ],
      };
    });
    panel.appendChild(makeTable([
      { label: "Zona", text: true },
      { label: "ANR 2021" }, { label: "ANR 2026" },
      { label: "JA 2021" }, { label: "JA 2026" },
      { label: "Particip. 2021" }, { label: "Particip. 2026" },
      { label: "Giro (pp)" },
    ], rows));
  }

  /* ------------------------------------------------------------- 3. Barrios */

  function groupByZona(list) {
    var order = DATA.zonas.map(function (z) { return z.zona; });
    var groups = {};
    list.forEach(function (b) { (groups[b.zona] = groups[b.zona] || []).push(b); });
    return order.filter(function (z) { return groups[z]; }).map(function (z) {
      return { zona: z, items: groups[z] };
    });
  }

  function winnerGrid(barrios, year) {
    var col = el("div", "asun-winner-col");
    col.appendChild(el("h3", "asun-winner-h", year === 2021 ? "Ganó en 2021" : "Ganó en 2026"));
    groupByZona(barrios).forEach(function (g) {
      col.appendChild(el("p", "asun-grid-zona", g.zona));
      var cells = el("div", "asun-cells");
      g.items.forEach(function (b) {
        var m = year === 2021 ? b.margen21 : b.margen26;
        var w = year === 2021 ? b.win21 : b.win26;
        var c = el("span", "asun-cell");
        c.style.background = divColor(m, 50, 0.18);
        c.title = b.barrio + " · " + w + " " + pp1(m);
        c.setAttribute("aria-label", c.title);
        cells.appendChild(c);
      });
      col.appendChild(cells);
    });
    return col;
  }

  function buildBarrios(panel) {
    var rows = DATA.barrios.filter(function (b) {
      return b.win26 != null && isWinner(b.win21) && isWinner(b.win26);
    }).sort(byGiroAsc);

    var box = el("div", "asun-block");
    box.appendChild(el("p", "asun-subhead", "Quién ganó cada barrio"));
    var winners = el("div", "asun-winners");
    winners.appendChild(winnerGrid(rows, 2021));
    winners.appendChild(winnerGrid(rows, 2026));
    box.appendChild(winners);
    box.appendChild(el("p", "asun-cap",
      "Un cuadro por barrio. Rojo = ganó ANR · Azul = ganó JA. Intensidad según el margen."));
    panel.appendChild(box);

    var tableRows = rows.map(function (b) {
      var flip = b.win21 !== b.win26;
      return {
        cls: flip ? "is-flip" : "",
        cells: [
          b.zona,
          { html: b.barrio + (flip ? ' <span class="asun-flip-badge">cambió</span>' : "") },
          { html: winCell(b.win21) },
          { html: winCell(b.win26) },
          pp1(b.margen21), pp1(b.margen26), pp1(b.giro), nf(b.votos26),
        ],
      };
    });
    panel.appendChild(makeTable([
      { label: "Zona", text: true }, { label: "Barrio", text: true },
      { label: "Ganó 2021" }, { label: "Ganó 2026" },
      { label: "Margen 2021" }, { label: "Margen 2026" },
      { label: "Giro (pp)" }, { label: "Votos 2026" },
    ], tableRows));
  }

  /* ------------------------------------------------------------- 4. Locales */

  function buildLocales(panel) {
    var locales = DATA.locales.slice();
    var W = 900, H = 560, pad = 34;
    var minLon = minOf(locales, function (l) { return l.lon; });
    var maxLon = maxOf(locales, function (l) { return l.lon; });
    var minLat = minOf(locales, function (l) { return l.lat; });
    var maxLat = maxOf(locales, function (l) { return l.lat; });
    var dLon = (maxLon - minLon) || 1;
    var dLat = (maxLat - minLat) || 1;
    var vmax = maxOf(locales, function (l) { return l.votos26; }) || 1;

    var map = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Mapa de locales de votación de Asunción; color según el giro 2021-2026 y tamaño según votos 2026.",
    });
    var ordered = locales.slice().sort(function (a, b) { return b.votos26 - a.votos26; });
    ordered.forEach(function (l) {
      var x = pad + (l.lon - minLon) / dLon * (W - 2 * pad);
      var y = pad + (maxLat - l.lat) / dLat * (H - 2 * pad);
      var r = 3.5 + 10 * Math.sqrt(l.votos26 / vmax);
      var c = svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(2), class: "asun-dot" });
      c.style.fill = divColor(l.giro, 20, 0.12);
      c.addEventListener("pointerenter", function (e) { localTip(l); placeTip(e.clientX, e.clientY); tip.hidden = false; });
      c.addEventListener("pointermove", function (e) { if (tip && !tip.hidden) placeTip(e.clientX, e.clientY); });
      c.addEventListener("pointerleave", hideTip);
      map.appendChild(c);
    });

    var box = el("div", "asun-block");
    box.appendChild(el("p", "asun-subhead", "Mapa de locales de votación"));
    var mapWrap = el("div", "asun-map");
    mapWrap.appendChild(map);
    box.appendChild(mapWrap);

    var legend = el("div", "asun-map-legend");
    legend.innerHTML =
      '<span class="asun-lg"><span class="asun-dotkey" style="background:' + JA + '"></span>Giro hacia Juntos por Asunción</span>' +
      '<span class="asun-lg"><span class="asun-dotkey" style="background:' + ANR + '"></span>Giro hacia ANR</span>' +
      '<span>El tamaño del círculo indica votos 2026 (' + nf(minOf(locales, function (l) { return l.votos26; })) + "–" + nf(vmax) + ").</span>";
    box.appendChild(legend);
    panel.appendChild(box);

    var rows = locales.slice().sort(byGiroAsc).map(function (l) {
      return {
        cells: [
          l.zona, l.barrio, l.local,
          nf(l.votos21), nf(l.votos26),
          pct1(l.anr21), pct1(l.anr26),
          pct1(l.ja21), pct1(l.ja26),
          pp1(l.giro),
        ],
      };
    });
    panel.appendChild(makeTable([
      { label: "Zona", text: true }, { label: "Barrio", text: true }, { label: "Local", text: true },
      { label: "Votos 2021" }, { label: "Votos 2026" },
      { label: "ANR 2021" }, { label: "ANR 2026" },
      { label: "JA 2021" }, { label: "JA 2026" },
      { label: "Giro (pp)" },
    ], rows));
  }

  function localTip(l) {
    var t = ensureTip();
    t.textContent = "";
    var b = document.createElement("b");
    b.textContent = l.local;
    t.appendChild(b);
    t.appendChild(tipLine("tip-sub", l.barrio + " · " + l.zona));
    t.appendChild(tipLine("tip-meta", "Votos 2026: " + nf(l.votos26)));
    t.appendChild(tipLine("tip-meta", "ANR " + pct1(l.anr26) + " · JA " + pct1(l.ja26)));
    t.appendChild(tipLine("tip-meta", "Giro: " + pp1(l.giro)));
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

  function buildCorrelaciones(panel) {
    var vars = DATA.correlacion.vars;
    var m = DATA.correlacion.m;
    var full = ["% Pobreza", "Brecha participación H-M", "% Lote fiscal o municipal",
      "Índice de envejecimiento", "% JA Intendencia 2026"];
    var short = ["Pobreza", "Brecha H-M", "Lote fiscal", "Envejecimiento", "JA 2026"];
    var idx = full.map(function (l) { return vars.indexOf(l); });

    panel.appendChild(el("p", "asun-subhead", "Correlación de Pearson entre indicadores (por barrio)"));

    var heatWrap = el("div", "asun-heat");
    var t = el("table", "asun-heat-table");
    var thead = el("thead");
    var htr = el("tr");
    htr.appendChild(el("th", "asun-heat-corner", "&nbsp;"));
    short.forEach(function (s) { htr.appendChild(el("th", "asun-heat-ch", s)); });
    thead.appendChild(htr);
    t.appendChild(thead);
    var tb = el("tbody");
    idx.forEach(function (ri, i) {
      var tr = el("tr");
      tr.appendChild(el("th", "asun-heat-rh", short[i]));
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
    panel.appendChild(el("p", "asun-note",
      "Rojo = correlación positiva · Azul = correlación negativa. La intensidad sigue |r|. Cada celda es el coeficiente entre dos indicadores."));

    var pts = DATA.barrios.filter(function (b) {
      return b.pobreza != null && b.ja26 != null && b.votos26 != null;
    });
    var maxP = maxOf(pts, function (b) { return b.pobreza; }) || 1;
    var maxJA = maxOf(pts, function (b) { return b.ja26; }) || 1;
    var vmax = maxOf(pts, function (b) { return b.votos26; }) || 1;

    var rPair = m[idx[0]][idx[4]];

    panel.appendChild(el("p", "asun-subhead", "% Pobreza vs % JA 2026"));
    var sc1 = buildScatter({
      aria: "Dispersión de pobreza y voto a Juntos por Asunción 2026 por barrio.",
      x0: 0, x1: maxP * 1.08, y0: 0, y1: maxJA * 1.08,
      xLabel: "% Pobreza", yLabel: "% JA 2026",
      fx: function (v) { return n1(v * 100) + "%"; },
      fy: function (v) { return n1(v * 100) + "%"; },
      points: pts.map(function (b) {
        return {
          x: b.pobreza, y: b.ja26,
          r: 3 + 10 * Math.sqrt(b.votos26 / vmax),
          fill: winColor(b.win26),
          title: b.barrio + " · " + b.zona + " — Pobreza " + pct1(b.pobreza) +
            ", JA " + pct1(b.ja26) + ", " + nf(b.votos26) + " votos",
        };
      }),
    });
    var sc1wrap = el("div", "asun-scatter");
    sc1wrap.appendChild(sc1);
    panel.appendChild(sc1wrap);
    panel.appendChild(el("p", "asun-note", "r = " + r2(rPair) + " para pobreza y voto JA 2026. Correlación no implica causalidad."));

    panel.appendChild(el("p", "asun-subhead", "% Pobreza vs Giro (pp)"));
    var giros = pts.map(function (b) { return b.giro; });
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
    var sc2wrap = el("div", "asun-scatter");
    sc2wrap.appendChild(sc2);
    panel.appendChild(sc2wrap);
    panel.appendChild(el("p", "asun-note",
      "La línea discontinua marca giro = 0. Giro negativo = el margen se movió hacia Juntos por Asunción."));
  }
})();
