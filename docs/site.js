/* Live comparison viewer. Both demo pages are same-origin iframes; every number below is measured from their DOM. */
(function () {
  "use strict";
  var GRAY = "#8c959f", ACCENT = "#7c6fb0", TINT = "rgba(124, 111, 176, 0.10)";
  var CAPTIONS = {
    chip: ["Badge on the title baseline.", "Without the skill, the \u201c3 plans active\u201d chip sits off the heading's baseline. With it, the chip shares the heading's baseline exactly."],
    wrapped: ["Numbers next to a wrapped name.", "Without the skill, vertically centered cells push the numbers below the first line of a two-line team name. With it, top-aligned cells keep the numbers on the first line."],
    gaps: ["Form gaps on the scale.", "Without the skill, label to field and field to message are 6px, off the 4px scale. With it, both gaps are 4px, a --space-* token."],
    lineheight: ["Line-heights on the grid.", "Without the skill, a unitless 1.55 gives the intro 21.7px lines that drift off the 4px grid. With it, the intro is 16px/24px and every line lands on the grid."],
    popover: ["Popover offset.", "Without the skill, the filter menu opens 6px below its trigger, off the 4px scale. With it, the menu opens 8px below, the --popover-offset token."],
    terms: ["Paired terminals.", "Without the skill, a wrapped label starts the right-hand terminal 30px lower than its partner, and the two end 7px apart. With it, both terminals share top and bottom."],
    orphan: ["No stub last line.", "Without the skill, a wrapped sentence leaves a last line only 4.1em wide, a couple of words. With it, the same paragraph ends on a 15.7em line."],
    inset: ["One text-left.", "Without the skill, table text starts 11.7px left of the text in the boxes beside it. With it, tables, lists, boxes and terminals all start text on the same 24px inset."],
    scale: ["A type scale.", "Without the skill, the guide sets text in 9 sizes (12.7px, 15.3px, 16px, 16.7px, 17.3px, 19.3px and more) with steps from 1.03x to 1.40x. With it, five sizes on the 4px grid, each step 1.20x to 1.33x."],
    palette: ["A restrained palette.", "Without the skill, the guide draws on 25 colours, including amber, which is outside the palette. With it, 19 colours in four hue families: a brand blue, grey, and red and green that only mean fail and pass."]
  };
  var CASES = {
    web: { width: 1280, spot: "chip", src: ["demo/without/index.html", "demo/with/index.html"], titles: ["Demo page built without the skill", "Demo page built with the skill"] },
    print: { width: 794, spot: "terms", src: ["demo/print/without/index.html", "demo/print/with/index.html"], titles: ["A4 print guide built without the skill", "A4 print guide built with the skill"] }
  };
  var state = { kind: "web", width: 1280, overlay: true, spot: "chip", zoom: false, termsIdx: null, orphanIdx: null };
  var frames = [].slice.call(document.querySelectorAll("[data-qa=frame]")).map(function (fig) {
    return { fig: fig, side: fig.getAttribute("data-side"), box: fig.querySelector(".viewport"), iframe: fig.querySelector("iframe"), tags: fig.querySelector(".tags"), scale: 1, ready: false };
  });

  /* ---------- measuring inside a frame ---------- */
  function api(f) {
    var doc = f.iframe.contentDocument, win = f.iframe.contentWindow;
    var q = function (s, i) { return doc.querySelectorAll("[data-qa=" + s + "]")[i || 0]; };
    var rect = function (el) { var b = el.getBoundingClientRect(); return { x: b.left + win.scrollX, y: b.top + win.scrollY, w: b.width, h: b.height, r: b.right + win.scrollX, b: b.bottom + win.scrollY }; };
    var ranges = function (el) { var r = doc.createRange(); r.selectNodeContents(el); return [].slice.call(r.getClientRects()); };
    var baseline = function (el) { var m = doc.createElement("span"); m.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"; el.insertBefore(m, el.firstChild); var y = m.getBoundingClientRect().top + win.scrollY; m.remove(); return y; };
    return { doc: doc, win: win, q: q, rect: rect, ranges: ranges, baseline: baseline, side: f.side };
  }
  var fmt = function (d) { return (d > 0 ? "+" : "") + d.toFixed(1) + "px"; };
  var kindOf = function (good) { return good ? "ok" : "off"; };
  var box = function (rs, pad) { var x = Math.min.apply(null, rs.map(function (r) { return r.x; })), y = Math.min.apply(null, rs.map(function (r) { return r.y; })), r = Math.max.apply(null, rs.map(function (r) { return r.r; })), b = Math.max.apply(null, rs.map(function (r) { return r.b; })); return { x: x - pad, y: y - pad, w: r - x + 2 * pad, h: b - y + 2 * pad }; };

  var SPOTS = {
    chip: function (a) {
      var t = a.q("page-title"), c = a.q("title-count"); var tr = a.rect(t), cr = a.rect(c);
      var tb = a.baseline(t), cb = a.baseline(c), d = cb - tb;
      return { region: box([tr, cr], 8), lines: [
        { k: "ref", x1: tr.x - 8, x2: cr.r + 12, y: tb, label: "title baseline" },
        { k: kindOf(Math.abs(d) < 0.5), x1: cr.x - 4, x2: cr.r + 12, y: cb, label: "chip baseline " + fmt(d) }] };
    },
    wrapped: function (a) {
      var teams = [].slice.call(a.doc.querySelectorAll("[data-qa=td-team]"));
      var i = teams.findIndex(function (e) { var tops = {}; a.ranges(e).forEach(function (r) { tops[Math.round(r.top)] = 1; }); return Object.keys(tops).length > 1; });
      if (i < 0) i = 0;
      var t = a.ranges(teams[i])[0], s = a.ranges(a.q("td-seats", i))[0];
      var ty = t.top + a.win.scrollY, sy = s.top + a.win.scrollY, d = sy - ty;
      var row = a.rect(teams[i].closest("tr") || teams[i]), sr = s.right + a.win.scrollX;
      return { region: { x: row.x, y: row.y, w: row.w, h: row.h }, focusX: sr - 120, lines: [
        { k: "ref", x1: row.x, x2: row.r, y: ty, label: "first line of name" },
        { k: kindOf(Math.abs(d) < 0.5), x1: sr - 110, x2: sr + 24, y: Math.abs(d) < 0.5 ? ty + 0.01 : sy, label: "numbers " + fmt(d) }] };
    },
    gaps: function (a) {
      var l = a.rect(a.q("label-email")), i = a.rect(a.q("input-email")), e = a.rect(a.q("error-email")), h = a.rect(a.q("help-email"));
      var g1 = i.y - l.b, g2 = e.y - i.b, X = i.x + Math.min(i.w, 300);
      return { region: box([l, i, e, h], 8), lines: [
        { k: kindOf(g1 % 4 === 0), x1: X - 40, x2: X + 8, y: l.b }, { k: kindOf(g1 % 4 === 0), x1: X - 40, x2: X + 8, y: i.y, label: "label to field " + g1.toFixed(0) + "px" },
        { k: kindOf(g2 % 4 === 0), x1: X - 40, x2: X + 8, y: i.b }, { k: kindOf(g2 % 4 === 0), x1: X - 40, x2: X + 8, y: e.y, label: "field to message " + g2.toFixed(0) + "px" }] };
    },
    lineheight: function (a) {
      var el = a.q("page-lead"), r = a.rect(el), lh = parseFloat(a.win.getComputedStyle(el).lineHeight), n = Math.round(r.h / lh), lines = [];
      for (var k = 0; k <= n; k++) { var off = (lh * k) % 4; lines.push({ k: kindOf(off < 0.01 || 4 - off < 0.01), x1: r.x - 8, x2: r.r + 8, y: r.y + k * lh }); }
      lines[0].label = "line-height " + (+lh.toFixed(1)) + "px"; lines[0].k = kindOf(lh % 4 === 0);
      lines[0].kLine = kindOf(true);
      return { region: box([r], 8), lines: lines };
    },
    popover: function (a) {
      var trig = a.q("filter-trigger"), pop = a.q("popover");
      if (pop.hidden || pop.hasAttribute("hidden")) trig.click();
      var tr = a.rect(trig), po = a.rect(pop), g = po.y - tr.b;
      return { region: box([tr, po], 8), lines: [
        { k: "ref", x1: tr.x - 30, x2: tr.r + 30, y: tr.b, label: "trigger bottom" },
        { k: kindOf(g === 8), x1: tr.x - 30, x2: tr.r + 30, y: po.y, label: "gap " + g.toFixed(1) + "px" }] };
    }
  };

  /* ---------- spots of the A4 print guide ---------- */
  function textLines(a, el) { // the text of el as visual lines: [{l, r, t, b}]
    var rs = [], w = a.doc.createTreeWalker(el, 4, null), n;
    while ((n = w.nextNode())) {
      if (!n.textContent.trim()) continue;
      var r = a.doc.createRange(); r.selectNodeContents(n);
      [].slice.call(r.getClientRects()).forEach(function (q) { if (q.width >= 1 && q.height >= 1) rs.push({ l: q.left + a.win.scrollX, r: q.right + a.win.scrollX, t: q.top + a.win.scrollY, b: q.bottom + a.win.scrollY }); });
    }
    rs.sort(function (p, q) { return (p.t + p.b) - (q.t + q.b); });
    var ls = [];
    rs.forEach(function (q) {
      var c = (q.t + q.b) / 2, h = q.b - q.t, L = ls[ls.length - 1];
      if (L && Math.abs(c - L.c) < Math.min(h, L.h) * 0.5) { L.l = Math.min(L.l, q.l); L.r = Math.max(L.r, q.r); L.b = Math.max(L.b, q.b); } else ls.push({ c: c, h: h, l: q.l, r: q.r, t: q.t, b: q.b });
    });
    return ls;
  }
  function firstCharLeft(a, el) {
    var w = a.doc.createTreeWalker(el, 4, null), n;
    while ((n = w.nextNode())) {
      var i = n.textContent.search(/\S/); if (i < 0) continue;
      var r = a.doc.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      var q = r.getClientRects()[0]; if (q) return q.left + a.win.scrollX;
    }
    return null;
  }
  var hasOwnText = function (el) { return [].slice.call(el.childNodes).some(function (n) { return n.nodeType === 3 && n.textContent.trim(); }); };
  var pageBox = function (a, i, h) { var r = a.rect(a.doc.querySelectorAll("[data-qa=page]")[i]); return { x: r.x, y: r.y, w: r.w, h: h }; };

  var PSPOTS = {
    terms: function (a) {
      var rows = [].slice.call(a.doc.querySelectorAll("[data-qa=two]")).map(function (t) {
        var ts = t.querySelectorAll("[data-qa=term]"); if (ts.length < 2) return null;
        var p = a.rect(ts[0]), q = a.rect(ts[1]); return { p: p, q: q, d: Math.abs(q.y - p.y) + Math.abs(q.h - p.h) };
      });
      if (state.termsIdx == null || a.side === "without") { var best = 0; rows.forEach(function (r, i) { if (r && (!rows[best] || r.d > rows[best].d)) best = i; }); state.termsIdx = best; }
      var g = rows[state.termsIdx], dy = g.q.y - g.p.y, db = g.q.b - g.p.b;
      return { region: box([g.p, g.q], 8), lines: [
        { k: "ref", x1: g.p.x - 8, x2: g.q.r + 8, y: g.p.y, label: "left terminal top" },
        { k: kindOf(Math.abs(dy) < 0.5), x1: g.q.x - 8, x2: g.q.r + 8, y: Math.abs(dy) < 0.5 ? g.p.y + 0.01 : g.q.y, label: "right top " + fmt(dy) },
        { k: "ref", x1: g.p.x - 8, x2: g.q.r + 8, y: g.p.b },
        { k: kindOf(Math.abs(db) < 0.5), x1: g.q.x - 8, x2: g.q.r + 8, y: Math.abs(db) < 0.5 ? g.p.b + 0.01 : g.q.b, label: "right bottom " + fmt(db) }] };
    },
    orphan: function (a) {
      // the paragraph whose wrapped last line is shortest on the "without" page; the "with" page shows the same paragraph
      var info = [].slice.call(a.doc.querySelectorAll("[data-qa=page] > p, [data-qa=two] p")).map(function (p) {
        var r = a.rect(p), fs = parseFloat(a.win.getComputedStyle(p).fontSize), ls = textLines(a, p), last = ls[ls.length - 1], prev = ls[ls.length - 2];
        var wrapped = !!prev && r.r - prev.r <= fs * 1.5;
        return { r: r, last: last, em: (last.r - last.l) / fs, wrapped: wrapped, score: wrapped ? (last.r - last.l) / fs : 99 };
      });
      if (state.orphanIdx == null || a.side === "without") { var best = 0; info.forEach(function (x, i) { if (x.score < info[best].score) best = i; }); state.orphanIdx = best; }
      var it = info[state.orphanIdx], stub = it.wrapped && it.em < 6;
      return { region: box([it.r], 8), lines: [
        { k: "ref", x1: it.r.x, x2: it.r.r, y: it.last.b, label: "paragraph width" },
        { k: kindOf(!stub), x1: it.last.l, x2: it.last.r, y: it.last.b + (stub ? 0 : 0.01), label: it.wrapped ? "last line " + it.em.toFixed(1) + "em" : "one line, no stub" }] };
    },
    inset: function (a) {
      var ts = a.doc.querySelectorAll("[data-qa=table]"), t = ts[ts.length - 1], tr = a.rect(t), cell = t.querySelector("tr:nth-child(2) td") || t.querySelector("td");
      var bx = [].slice.call(a.doc.querySelectorAll("[data-qa=callout]")).filter(function (e) { return a.rect(e).y > tr.y; })[0], cr = a.rect(bx);
      var cx = firstCharLeft(a, bx), tx = firstCharLeft(a, cell), d = tx - cx;
      return { region: box([tr, cr], 8), lines: [
        { k: "ref", v: true, x: cx, y1: tr.y - 8, y2: cr.b + 8, label: "box text-left" },
        { k: kindOf(Math.abs(d) < 0.5), v: true, x: Math.abs(d) < 0.5 ? cx + 0.01 : tx, y1: tr.y, y2: tr.b, label: "table text " + fmt(d) }] };
    },
    scale: function (a) {
      var seen = {};
      [].slice.call(a.doc.body.querySelectorAll("*")).forEach(function (el) { if (el instanceof a.win.SVGElement || !hasOwnText(el)) return; seen[Math.round(parseFloat(a.win.getComputedStyle(el).fontSize) * 100) / 100] = 1; });
      var sizes = Object.keys(seen).map(Number).sort(function (p, q) { return p - q; }), steps = sizes.slice(1).map(function (v, i) { return v / sizes[i]; });
      var lo = Math.min.apply(null, steps), hi = Math.max.apply(null, steps), good = sizes.length <= 6 && lo >= 1.2 - 0.001 && hi <= 1.34 + 0.001;
      return { region: pageBox(a, 0, 520), lines: [], tags: [
        { k: kindOf(sizes.length <= 6), label: sizes.length + " font sizes" },
        { k: kindOf(good), label: "steps " + lo.toFixed(2) + "x to " + hi.toFixed(2) + "x" }] };
    },
    palette: function (a) {
      var used = {}, SH = { rect: 1, circle: 1, ellipse: 1, path: 1, polygon: 1, polyline: 1, line: 1 };
      var add = function (c) {
        var m = (c || "").match(/rgba?\(([^)]+)\)/); if (!m) return;
        var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); if ((p[3] === undefined ? 1 : p[3]) === 0) return;
        used["#" + [p[0], p[1], p[2]].map(function (v) { return Math.round(v).toString(16).padStart(2, "0"); }).join("")] = p;
      };
      [].slice.call(a.doc.body.querySelectorAll("*")).forEach(function (el) {
        var cs = a.win.getComputedStyle(el), svg = el instanceof a.win.SVGElement;
        if (!svg) {
          add(cs.backgroundColor);
          ["Top", "Right", "Bottom", "Left"].forEach(function (s) { if (parseFloat(cs["border" + s + "Width"]) > 0 && cs["border" + s + "Style"] !== "none") add(cs["border" + s + "Color"]); });
          if (cs.backgroundImage !== "none") (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).forEach(add);
        } else if (SH[el.tagName.toLowerCase()]) { if (cs.fill !== "none") add(cs.fill); if (cs.stroke !== "none") add(cs.stroke); }
        if (hasOwnText(el)) add(svg ? cs.fill : cs.color);
      });
      var fam = {}, ALLOWED = { blue: 1, gray: 1, red: 1, green: 1 }; // one brand hue, a neutral scale, and red/green that only mean fail/pass
      Object.keys(used).forEach(function (k) {
        var p = used[k], r = p[0] / 255, g = p[1] / 255, b = p[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0, name;
        if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
        name = s < 0.06 ? "gray" : h >= 195 && h < 250 ? "blue" : h >= 80 && h < 170 ? "green" : h >= 340 || h < 20 ? "red" : h >= 20 && h < 80 ? "amber" : h >= 170 && h < 195 ? "teal" : "purple";
        fam[name] = 1;
      });
      var n = Object.keys(used).length, outside = Object.keys(fam).filter(function (x) { return !ALLOWED[x]; });
      return { region: pageBox(a, 1, 600), lines: [], tags: [
        { k: "ref", label: n + " colours" },
        { k: kindOf(!outside.length), label: outside.length ? "outside the palette: " + outside.join(", ") : "every hue is in the palette" }] };
    }
  };

  /* ---------- drawing inside a frame ---------- */
  function stroke(k, w) { return w + "px " + (k === "off" ? "solid " + ACCENT : k === "ok" ? "dashed " + ACCENT : "dashed " + GRAY); }
  function clear(a) { [].slice.call(a.doc.querySelectorAll(".isee-ov")).forEach(function (e) { e.remove(); }); }
  function add(a, css) { var d = a.doc.createElement("div"); d.className = "isee-ov"; d.style.cssText = "position:absolute;z-index:2147483647;pointer-events:none;box-sizing:border-box;" + css; a.doc.body.appendChild(d); return d; }
  function draw(f, name, m, active) {
    var a = api(f), w = Math.max(1, 1 / f.scale); // keep 1 screen px after scaling
    m.lines.forEach(function (l) {
      var k = l.kLine || l.k;
      if (l.v) add(a, "left:" + (l.x - w / 2) + "px;top:" + l.y1 + "px;height:" + (l.y2 - l.y1) + "px;width:0;border-left:" + stroke(k, w));
      else add(a, "top:" + (l.y - w / 2) + "px;left:" + l.x1 + "px;width:" + (l.x2 - l.x1) + "px;height:0;border-top:" + stroke(k, w));
    });
    if (active) add(a, "left:" + m.region.x + "px;top:" + m.region.y + "px;width:" + m.region.w + "px;height:" + m.region.h + "px;background:" + TINT + ";outline:" + w + "px solid " + ACCENT + ";border-radius:" + 4 * w + "px");
  }
  function closePopover(a) { var pop = a.q("popover"); if (pop && !(pop.hidden || pop.hasAttribute("hidden"))) a.q("filter-trigger").click(); }

  function caption() {
    var c = CAPTIONS[state.spot], cap = document.getElementById("caption");
    cap.textContent = ""; var b = document.createElement("strong"); b.textContent = c[0] + " "; cap.appendChild(b); cap.appendChild(document.createTextNode(c[1]));
  }
  function render() {
    caption();
    if (!frames.every(function (f) { return f.ready; })) return;
    frames.forEach(function (f) {
      var a = api(f), set = state.kind === "print" ? PSPOTS : SPOTS; clear(a);
      if (state.kind === "web" && state.spot !== "popover") closePopover(a);
      var results = {};
      Object.keys(set).forEach(function (n) { if (state.kind === "web" && n === "popover" && state.spot !== "popover") return; try { results[n] = set[n](a); } catch (e) { results[n] = null; } });
      if (state.overlay) Object.keys(results).forEach(function (n) { if (results[n]) draw(f, n, results[n], n === state.spot); });
      var m = results[state.spot];
      f.tags.textContent = "";
      if (m && state.overlay) (m.tags || []).concat(m.lines.filter(function (l) { return l.label; })).forEach(function (l) {
        var t = document.createElement("span"); t.className = "tag tag-" + l.k; t.textContent = (l.k === "ok" ? "\u2713 " : "") + l.label; f.tags.appendChild(t);
      });
      if (m) {
        var visibleH = f.box.clientHeight / f.scale, visibleW = f.box.clientWidth / f.scale;
        a.win.scrollTo(0, Math.max(0, m.region.y + m.region.h / 2 - visibleH / 2));
        // zoomed in, slide the frame sideways so the spot sits in the middle of the column
        f.tx = state.zoom ? Math.max(0, Math.min(state.width - visibleW, (m.focusX != null ? m.focusX : m.region.w > visibleW - 32 ? m.region.x - 16 + visibleW / 2 : m.region.x + m.region.w / 2) - visibleW / 2)) : 0;
        f.iframe.style.transform = "translateX(" + (-f.tx * f.scale) + "px) scale(" + f.scale + ")";
      }
    });
  }

  /* ---------- sizing ---------- */
  function layout() {
    frames.forEach(function (f) {
      var colW = f.box.clientWidth; f.scale = state.zoom ? 1 : colW / state.width; f.tx = 0;
      f.iframe.style.width = state.width + "px";
      f.iframe.style.height = Math.ceil(f.box.clientHeight / f.scale) + "px";
      f.iframe.style.transform = "scale(" + f.scale + ")";
    });
  }
  var pending = 0;
  function relayout() { layout(); clearTimeout(pending); pending = setTimeout(render, 120); }

  frames.forEach(function (f) {
    var onLoad = function () { f.ready = true; relayout(); };
    f.iframe.addEventListener("load", onLoad);
    if (f.iframe.contentDocument && f.iframe.contentDocument.readyState === "complete" && f.iframe.contentDocument.querySelector("[data-qa]")) onLoad();
  });
  window.addEventListener("resize", relayout);

  function press(group, btn) { [].slice.call(group).forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); }); }
  var widthBtns = document.querySelectorAll("[data-width]");
  [].slice.call(widthBtns).forEach(function (b) { b.addEventListener("click", function () { state.width = +b.getAttribute("data-width"); press(widthBtns, b); relayout(); }); });
  var spotBtns = document.querySelectorAll("[data-spot]");
  [].slice.call(spotBtns).forEach(function (b) { b.addEventListener("click", function () { state.spot = b.getAttribute("data-spot"); press(spotBtns, b); render(); }); });
  /* the example switch: the web page pair or the A4 print guide pair */
  var kindBtns = document.querySelectorAll("[data-kind]"), widthSeg = document.getElementById("width-seg"), leadEl = document.getElementById("lead");
  var LEADS = {
    web: leadEl.textContent,
    print: "A real A4 guide, built twice from the same text: once as first written, once with the skill and its checks. Printed documents have no hover and no breakpoints, but the same rules apply: one inset, one scale, equal heights for pairs, no stub lines. Both pages run live below."
  };
  function setKind(kind) {
    state.kind = kind; state.width = CASES[kind].width; state.spot = CASES[kind].spot; state.termsIdx = null; state.orphanIdx = null; state.zoom = false;
    zb.setAttribute("aria-pressed", "false");
    press(kindBtns, document.querySelector("[data-kind=" + kind + "]"));
    widthSeg.hidden = kind !== "web";
    [].slice.call(spotBtns).forEach(function (b) { b.hidden = b.getAttribute("data-kind") !== kind; b.setAttribute("aria-pressed", b.getAttribute("data-spot") === state.spot ? "true" : "false"); });
    leadEl.textContent = LEADS[kind];
    frames.forEach(function (f, i) { f.ready = false; f.iframe.title = CASES[kind].titles[i]; f.iframe.src = CASES[kind].src[i]; });
    layout(); render();
  }
  [].slice.call(kindBtns).forEach(function (b) { b.addEventListener("click", function () { if (b.getAttribute("data-kind") !== state.kind) setKind(b.getAttribute("data-kind")); }); });
  var ov = document.getElementById("overlay-toggle");
  ov.addEventListener("click", function () { state.overlay = !state.overlay; ov.setAttribute("aria-pressed", String(state.overlay)); render(); });
  var zb = document.getElementById("zoom-toggle");
  zb.addEventListener("click", function () { state.zoom = !state.zoom; zb.setAttribute("aria-pressed", String(state.zoom)); relayout(); });
  layout();
  render();
})();
