/* ==========================================
   APEX 5.0 — EMIRATES STADIUM
   An interactive, hand-built vector illustration of Arsenal's home ground.
   Everything is drawn as SVG in code: no image files, no external requests,
   no network dependency. Works identically in the browser, in the Tauri
   Windows window and in the iOS WKWebView.

   Two views share one set of interactive sections:
     "bowl"  — three-quarter isometric, the headline view
     "plan"  — top-down seating plan, clearer on small screens

   No club crest, badge, cannon or official typeface is reproduced. The
   artwork is original and the lettering is the application's own type.
   ========================================== */

const STADIUM_KEY = "apexStadiumPrefs";

/* ---------- Factual content for the information panel ---------- */
const STADIUM_SECTIONS = {
  "north-bank": {
    name: "NORTH BANK",
    tag: "HOME END · NORTH",
    text: "The traditional home end, behind the north goal, carrying the name of the terrace at Highbury. It is where the most vocal support gathers, and the lower tier is among the most sought-after seating in the ground."
  },
  "clock-end": {
    name: "CLOCK END",
    tag: "SOUTH END",
    text: "The south end, named after the clock at Highbury that gave the old stand its name. The away allocation sits in the lower tier here, with home supporters filling the rest."
  },
  "east-stand": {
    name: "EAST STAND",
    tag: "LONG SIDE · EAST",
    text: "The largest stand in the ground, running the full length of the pitch alongside the railway line. It looks directly across at the dugouts and the players' tunnel, which makes it a good vantage point for reading substitutions."
  },
  "west-stand": {
    name: "WEST STAND",
    tag: "LONG SIDE · WEST",
    text: "The working side of the stadium. The players' tunnel, the dugouts, the Directors' Box and the media and camera positions are all on this side, which is why it provides the familiar television angle."
  },
  "pitch": {
    name: "THE PITCH",
    tag: "105 × 68 METRES",
    text: "Laid out north to south, at 105 by 68 metres it is among the largest playing surfaces in the league. The bowl around it is built in three tiers — lower, club level and upper — with no pillars, so sightlines are clear from effectively every seat."
  }
};

const STADIUM_FACTS = [
  ["OPENED", "2006"],
  ["CAPACITY", "60,704"],
  ["PITCH", "105 × 68 m"],
  ["TIERS", "Three"],
  ["STANDS", "Four"],
  ["ORIENTATION", "North–South"]
];

/* ---------- Tiny SVG helpers (self-contained, no dependency on script.js) ---------- */
const SVG_NS = "http://www.w3.org/2000/svg";
function sv(tag, attrs){
  const n = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function pts(list){ return list.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" "); }

/* ---------- Isometric projection ----------
   Ground plane (x east, y south), z up. A steep three-quarter angle keeps every
   stand's seating visible rather than hiding the near side behind its own wall. */
const ISO = { kx: 0.80, ky: 0.455, kz: 0.60, cx: 500, cy: 335 };
function iso(x, y, z){
  return [ ISO.cx + (x - y) * ISO.kx,
           ISO.cy + (x + y) * ISO.ky - (z || 0) * ISO.kz ];
}
/* Rectangle corners in plan order: NW, NE, SE, SW */
function rect(a, b){ return [[-a,-b],[a,-b],[a,b],[-a,b]]; }

/* Geometry of the bowl, in arbitrary units */
const G = {
  pitch:     { a: 150, b: 98 },     // playing surface
  surround:  { a: 176, b: 124 },    // grass margin + pitch-side track
  deckIn:    { a: 186, b: 134, z: 10 },   // front row
  deckOut:   { a: 300, b: 250, z: 88 },   // back row of the upper tier
  /* The roof covers only the back third of the deck, so the seating bowl
     stays readable and every tier remains visible and clickable. */
  roofIn:    { a: 258, b: 208, z: 146 },  // inner lip of the roof
  roofOut:   { a: 338, b: 288, z: 158 },  // outer edge of the roof
  facade:    { a: 300, b: 250, z: 0 }     // ground line of the outer wall
};

/* The four sides, each a trapezoid between two concentric rectangles.
   corner indices: 0=NW 1=NE 2=SE 3=SW */
const SIDES = [
  { id: "north-bank", i0: 0, i1: 1, depth: -1, axis: "y" },
  { id: "east-stand", i0: 1, i1: 2, depth:  1, axis: "x" },
  { id: "clock-end",  i0: 2, i1: 3, depth:  1, axis: "y" },
  { id: "west-stand", i0: 3, i1: 0, depth: -1, axis: "x" }
];

function band(innerRect, outerRect, side, zi, zo){
  const i = rect(innerRect.a, innerRect.b), o = rect(outerRect.a, outerRect.b);
  return [ iso(i[side.i0][0], i[side.i0][1], zi),
           iso(i[side.i1][0], i[side.i1][1], zi),
           iso(o[side.i1][0], o[side.i1][1], zo),
           iso(o[side.i0][0], o[side.i0][1], zo) ];
}
/* Screen depth of a side's centroid — larger means nearer the viewer. */
function sideDepth(side){
  const o = rect(G.deckOut.a, G.deckOut.b);
  return (o[side.i0][0] + o[side.i1][0] + o[side.i0][1] + o[side.i1][1]) / 2;
}

/* ---------- The three-quarter bowl ---------- */
function buildBowl(svg){
  const defs = sv("defs");

  /* Grass stripes, drawn as a clipped pattern so the mow lines follow the pitch. */
  const grass = sv("linearGradient", { id: "stGrass", x1: "0", y1: "0", x2: "0", y2: "1" });
  grass.append(sv("stop", { offset: "0", "stop-color": "#1f6b3a" }),
               sv("stop", { offset: "1", "stop-color": "#15492a" }));
  const sky = sv("radialGradient", { id: "stSky", cx: "0.5", cy: "0.1", r: "0.9" });
  sky.append(sv("stop", { offset: "0", "stop-color": "#1b2740" }),
             sv("stop", { offset: "1", "stop-color": "#070b13" }));
  const roofGrad = sv("linearGradient", { id: "stRoof", x1: "0", y1: "0", x2: "0.3", y2: "1" });
  roofGrad.append(sv("stop", { offset: "0", "stop-color": "#2a3448" }),
                  sv("stop", { offset: "1", "stop-color": "#151c29" }));
  const lightGrad = sv("radialGradient", { id: "stLight", cx: "0.5", cy: "0.5", r: "0.5" });
  lightGrad.append(sv("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": "0.5" }),
                   sv("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": "0" }));
  defs.append(grass, sky, roofGrad, lightGrad);
  svg.appendChild(defs);

  svg.appendChild(sv("rect", { x: 0, y: 0, width: 1000, height: 640, fill: "url(#stSky)" }));

  /* Ground shadow, so the bowl sits on a surface rather than floating */
  const base = rect(G.deckOut.a + 26, G.deckOut.b + 26).map(pt => iso(pt[0], pt[1], 0));
  svg.appendChild(sv("polygon", { points: pts(base), class: "st-ground", "pointer-events": "none" }));

  /* Soft floodlight pools on the turf */
  const glow = sv("g", { "pointer-events": "none", opacity: "0.55" });
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
    const p = iso(sx * 210, sy * 170, 0);
    glow.appendChild(sv("ellipse", { cx: p[0], cy: p[1], rx: 210, ry: 96, fill: "url(#stLight)" }));
  });

  const far = sv("g"), near = sv("g"), roofs = sv("g", { "pointer-events": "none" });
  const ordered = [...SIDES].sort((a, b) => sideDepth(a) - sideDepth(b));

  /* Outer facade wall + raked seating deck for each side */
  ordered.forEach((side, index) => {
    const host = index < 2 ? far : near;
    const group = sv("g");

    const wall = band(G.facade, G.deckOut, side, 0, G.deckOut.z);
    /* facade is the same rectangle at two heights, so build it directly */
    const o = rect(G.deckOut.a, G.deckOut.b);
    const wallPoly = sv("polygon", {
      points: pts([ iso(o[side.i0][0], o[side.i0][1], 0),
                    iso(o[side.i1][0], o[side.i1][1], 0),
                    iso(o[side.i1][0], o[side.i1][1], G.deckOut.z),
                    iso(o[side.i0][0], o[side.i0][1], G.deckOut.z) ]),
      class: "st-facade"
    });
    group.appendChild(wallPoly);

    /* Panelled facade detail */
    const steps = 9;
    for (let s = 1; s < steps; s++){
      const t = s / steps;
      const x = o[side.i0][0] + (o[side.i1][0] - o[side.i0][0]) * t;
      const y = o[side.i0][1] + (o[side.i1][1] - o[side.i0][1]) * t;
      const a = iso(x, y, 4), b = iso(x, y, G.deckOut.z - 4);
      group.appendChild(sv("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "st-facade-line" }));
    }

    /* Three seating tiers, so the bowl reads as lower / club / upper */
    const hit = sv("g", { class: "st-stand", "data-section": side.id,
                          role: "button", tabindex: "0", "aria-pressed": "false",
                          "aria-label": STADIUM_SECTIONS[side.id].name });
    const tiers = [[0, 0.38], [0.38, 0.62], [0.62, 1]];
    tiers.forEach(([t0, t1], ti) => {
      const inner = {
        a: G.deckIn.a + (G.deckOut.a - G.deckIn.a) * t0,
        b: G.deckIn.b + (G.deckOut.b - G.deckIn.b) * t0
      };
      const outer = {
        a: G.deckIn.a + (G.deckOut.a - G.deckIn.a) * t1,
        b: G.deckIn.b + (G.deckOut.b - G.deckIn.b) * t1
      };
      const zi = G.deckIn.z + (G.deckOut.z - G.deckIn.z) * t0;
      const zo = G.deckIn.z + (G.deckOut.z - G.deckIn.z) * t1;
      hit.appendChild(sv("polygon", { points: pts(band(inner, outer, side, zi, zo)),
                                      class: "st-tier st-tier-" + ti }));
      /* Seat texture: fine lines following the rake */
      const rows = ti === 1 ? 3 : 6;
      for (let r = 1; r < rows; r++){
        const t = t0 + (t1 - t0) * (r / rows);
        const rr = { a: G.deckIn.a + (G.deckOut.a - G.deckIn.a) * t,
                     b: G.deckIn.b + (G.deckOut.b - G.deckIn.b) * t };
        const rz = G.deckIn.z + (G.deckOut.z - G.deckIn.z) * t;
        const c = rect(rr.a, rr.b);
        const p1 = iso(c[side.i0][0], c[side.i0][1], rz), p2 = iso(c[side.i1][0], c[side.i1][1], rz);
        hit.appendChild(sv("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: "st-seatline" }));
      }
    });
    /* A single transparent overlay keeps hover and tap reliable across the tiers */
    hit.appendChild(sv("polygon", { points: pts(band(G.deckIn, G.deckOut, side, G.deckIn.z, G.deckOut.z)),
                                    class: "st-stand-hit" }));
    group.appendChild(hit);
    host.appendChild(group);

    /* Roof panel and its trusses */
    const roof = sv("g", { class: "st-roof-group" });
    roof.appendChild(sv("polygon", { points: pts(band(G.roofIn, G.roofOut, side, G.roofIn.z, G.roofOut.z)),
                                     class: "st-roof" }));
    const ri = rect(G.roofIn.a, G.roofIn.b), ro = rect(G.roofOut.a, G.roofOut.b);
    for (let s = 0; s <= 8; s++){
      const t = s / 8;
      const ax = ri[side.i0][0] + (ri[side.i1][0] - ri[side.i0][0]) * t;
      const ay = ri[side.i0][1] + (ri[side.i1][1] - ri[side.i0][1]) * t;
      const bx = ro[side.i0][0] + (ro[side.i1][0] - ro[side.i0][0]) * t;
      const by = ro[side.i0][1] + (ro[side.i1][1] - ro[side.i0][1]) * t;
      const p1 = iso(ax, ay, G.roofIn.z), p2 = iso(bx, by, G.roofOut.z);
      roof.appendChild(sv("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: "st-truss" }));
    }
    /* Inner lip, catching the light from below */
    const lipA = iso(ri[side.i0][0], ri[side.i0][1], G.roofIn.z);
    const lipB = iso(ri[side.i1][0], ri[side.i1][1], G.roofIn.z);
    roof.appendChild(sv("line", { x1: lipA[0], y1: lipA[1], x2: lipB[0], y2: lipB[1], class: "st-roof-lip" }));
    roofs.appendChild(roof);
  });

  /* The pitch sits between the far stands and the near stands */
  const pitchGroup = sv("g", { class: "st-stand", "data-section": "pitch",
                               role: "button", tabindex: "0", "aria-pressed": "false",
                               "aria-label": "The pitch" });
  const sur = rect(G.surround.a, G.surround.b);
  pitchGroup.appendChild(sv("polygon", {
    points: pts(sur.map(p => iso(p[0], p[1], 0))), class: "st-surround" }));

  const pr = rect(G.pitch.a, G.pitch.b);
  pitchGroup.appendChild(sv("polygon", { points: pts(pr.map(p => iso(p[0], p[1], 0))),
                                         class: "st-pitch" }));
  /* Mow stripes run across the pitch, east to west */
  const stripes = 8;
  for (let s = 0; s < stripes; s += 2){
    const y0 = -G.pitch.b + (2 * G.pitch.b) * (s / stripes);
    const y1 = -G.pitch.b + (2 * G.pitch.b) * ((s + 1) / stripes);
    pitchGroup.appendChild(sv("polygon", {
      points: pts([ iso(-G.pitch.a, y0, 0), iso(G.pitch.a, y0, 0),
                    iso(G.pitch.a, y1, 0), iso(-G.pitch.a, y1, 0) ]),
      class: "st-stripe" }));
  }
  /* Markings */
  const mark = sv("g", { class: "st-markings" });
  mark.appendChild(sv("polygon", { points: pts(pr.map(p => iso(p[0], p[1], 0))), class: "st-line" }));
  mark.appendChild(sv("line", {
    x1: iso(-G.pitch.a, 0, 0)[0], y1: iso(-G.pitch.a, 0, 0)[1],
    x2: iso(G.pitch.a, 0, 0)[0],  y2: iso(G.pitch.a, 0, 0)[1], class: "st-line-stroke" }));
  /* Centre circle as an isometric ellipse */
  const circle = [];
  for (let d = 0; d < 36; d++){
    const ang = d / 36 * Math.PI * 2;
    circle.push(iso(Math.cos(ang) * 34, Math.sin(ang) * 34, 0));
  }
  mark.appendChild(sv("polygon", { points: pts(circle), class: "st-line" }));
  /* Penalty areas at both ends */
  [-1, 1].forEach(dir => {
    const bx = G.pitch.a, by = 56, depth = 42;
    mark.appendChild(sv("polygon", {
      points: pts([ iso(dir * bx, -by, 0), iso(dir * (bx - depth), -by, 0),
                    iso(dir * (bx - depth), by, 0), iso(dir * bx, by, 0) ]),
      class: "st-line" }));
    const sy = 26, sdepth = 16;
    mark.appendChild(sv("polygon", {
      points: pts([ iso(dir * bx, -sy, 0), iso(dir * (bx - sdepth), -sy, 0),
                    iso(dir * (bx - sdepth), sy, 0), iso(dir * bx, sy, 0) ]),
      class: "st-line" }));
    /* Goal */
    mark.appendChild(sv("polygon", {
      points: pts([ iso(dir * bx, -11, 0), iso(dir * bx, 11, 0),
                    iso(dir * bx, 11, 14), iso(dir * bx, -11, 14) ]),
      class: "st-goal" }));
  });
  pitchGroup.appendChild(mark);
  pitchGroup.appendChild(sv("polygon", { points: pts(sur.map(p => iso(p[0], p[1], 0))),
                                         class: "st-stand-hit" }));

  svg.append(glow, far, pitchGroup, near, roofs);

  /* Compass, so the stand names make sense */
  const compass = sv("g", { "pointer-events": "none", class: "st-compass" });
  const nPos = iso(0, -G.roofOut.b - 34, G.roofOut.z);
  const nText = sv("text", { x: nPos[0], y: nPos[1], "text-anchor": "middle", class: "st-compass-n" });
  nText.textContent = "N ↗";
  compass.appendChild(nText);
  svg.appendChild(compass);
}

/* ---------- Top-down seating plan ---------- */
function buildPlan(svg){
  const defs = sv("defs");
  const g2 = sv("linearGradient", { id: "stPlanGrass", x1: "0", y1: "0", x2: "0", y2: "1" });
  g2.append(sv("stop", { offset: "0", "stop-color": "#1f6b3a" }),
            sv("stop", { offset: "1", "stop-color": "#164d2d" }));
  defs.appendChild(g2);

  const cx = 500, cy = 320;
  const OUT = { w: 410, h: 282 }, IN = { w: 232, h: 150 };

  /* The four stands tile the whole rectangle including the corners, so they are
     clipped to the rounded bowl outline rather than drawn over it. */
  const clip = sv("clipPath", { id: "stPlanClip" });
  clip.appendChild(sv("rect", { x: cx - OUT.w, y: cy - OUT.h, width: OUT.w * 2, height: OUT.h * 2,
                                rx: 94 }));
  defs.appendChild(clip);
  svg.appendChild(defs);
  svg.appendChild(sv("rect", { x: 0, y: 0, width: 1000, height: 640, fill: "#070b13" }));

  /* Outer bowl outline */
  svg.appendChild(sv("rect", { x: cx - OUT.w, y: cy - OUT.h, width: OUT.w * 2, height: OUT.h * 2,
                               rx: 94, class: "st-plan-bowl" }));
  const standLayer = sv("g", { "clip-path": "url(#stPlanClip)" });
  svg.appendChild(standLayer);

  /* Four stands as trapezoids between the inner and outer rectangles */
  const o = [[cx - OUT.w, cy - OUT.h], [cx + OUT.w, cy - OUT.h], [cx + OUT.w, cy + OUT.h], [cx - OUT.w, cy + OUT.h]];
  const i = [[cx - IN.w, cy - IN.h], [cx + IN.w, cy - IN.h], [cx + IN.w, cy + IN.h], [cx - IN.w, cy + IN.h]];
  const planSides = [
    { id: "west-stand", a: 0, b: 3, label: [cx - (OUT.w + IN.w) / 2, cy] },
    { id: "east-stand", a: 1, b: 2, label: [cx + (OUT.w + IN.w) / 2, cy] },
    { id: "north-bank", a: 0, b: 1, label: [cx, cy - (OUT.h + IN.h) / 2] },
    { id: "clock-end",  a: 2, b: 3, label: [cx, cy + (OUT.h + IN.h) / 2] }
  ];
  planSides.forEach(side => {
    const g = sv("g", { class: "st-stand", "data-section": side.id, role: "button", tabindex: "0",
                        "aria-pressed": "false", "aria-label": STADIUM_SECTIONS[side.id].name });
    g.appendChild(sv("polygon", {
      points: pts([ o[side.a], o[side.b], i[side.b], i[side.a] ]), class: "st-plan-stand" }));
    /* Tier divisions */
    [0.36, 0.64].forEach(t => {
      const p1 = [ o[side.a][0] + (i[side.a][0] - o[side.a][0]) * t,
                   o[side.a][1] + (i[side.a][1] - o[side.a][1]) * t ];
      const p2 = [ o[side.b][0] + (i[side.b][0] - o[side.b][0]) * t,
                   o[side.b][1] + (i[side.b][1] - o[side.b][1]) * t ];
      g.appendChild(sv("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: "st-plan-tier" }));
    });
    const label = sv("text", { x: side.label[0], y: side.label[1] + 4,
                               "text-anchor": "middle", class: "st-plan-label" });
    label.textContent = STADIUM_SECTIONS[side.id].name;
    g.appendChild(label);
    g.appendChild(sv("polygon", { points: pts([ o[side.a], o[side.b], i[side.b], i[side.a] ]),
                                  class: "st-stand-hit" }));
    standLayer.appendChild(g);
  });

  /* Pitch */
  const pw = 186, ph = 120;
  const pg = sv("g", { class: "st-stand", "data-section": "pitch", role: "button", tabindex: "0",
                       "aria-pressed": "false", "aria-label": "The pitch" });
  pg.appendChild(sv("rect", { x: cx - pw, y: cy - ph, width: pw * 2, height: ph * 2,
                              fill: "url(#stPlanGrass)" }));
  for (let s = 0; s < 8; s += 2){
    pg.appendChild(sv("rect", { x: cx - pw, y: cy - ph + (2 * ph) * (s / 8),
                                width: pw * 2, height: (2 * ph) / 8, class: "st-stripe" }));
  }
  pg.appendChild(sv("rect", { x: cx - pw, y: cy - ph, width: pw * 2, height: ph * 2, class: "st-line" }));
  pg.appendChild(sv("line", { x1: cx - pw, y1: cy, x2: cx + pw, y2: cy, class: "st-line-stroke" }));
  pg.appendChild(sv("circle", { cx: cx, cy: cy, r: 36, class: "st-line" }));
  [-1, 1].forEach(dir => {
    pg.appendChild(sv("rect", { x: dir < 0 ? cx - pw : cx + pw - 46, y: cy - 62,
                                width: 46, height: 124, class: "st-line" }));
    pg.appendChild(sv("rect", { x: dir < 0 ? cx - pw : cx + pw - 18, y: cy - 28,
                                width: 18, height: 56, class: "st-line" }));
  });
  pg.appendChild(sv("rect", { x: cx - pw, y: cy - ph, width: pw * 2, height: ph * 2,
                              class: "st-stand-hit" }));
  svg.appendChild(pg);

  /* Tunnel and dugout markers on the west side, which is where they are */
  const marks = sv("g", { "pointer-events": "none" });
  marks.appendChild(sv("rect", { x: cx - IN.w - 10, y: cy - 16, width: 12, height: 32, class: "st-tunnel" }));
  [-56, 40].forEach(off => {
    marks.appendChild(sv("rect", { x: cx - pw - 26, y: cy + off, width: 22, height: 16, class: "st-dugout" }));
  });
  const tl = sv("text", { x: cx - IN.w - 18, y: cy - 24, "text-anchor": "end", class: "st-plan-note" });
  tl.textContent = "TUNNEL · DUGOUTS";
  marks.appendChild(tl);
  const north = sv("text", { x: cx, y: cy - OUT.h - 22, "text-anchor": "middle", class: "st-compass-n" });
  north.textContent = "N ↑";
  marks.appendChild(north);
  svg.appendChild(marks);
}

/* ---------- State and rendering ---------- */
let stadiumView = "bowl", stadiumSelected = null, stadiumBuilt = false;

function stadiumLoadPrefs(){
  const saved = (typeof readStorage === "function") ? readStorage(STADIUM_KEY, null) : null;
  if (saved && (saved.view === "bowl" || saved.view === "plan")) stadiumView = saved.view;
}
function stadiumSavePrefs(){
  if (typeof writeStorage === "function") writeStorage(STADIUM_KEY, { view: stadiumView });
}

function stadiumSelect(id){
  stadiumSelected = (id && STADIUM_SECTIONS[id]) ? id : null;
  const svg = document.getElementById("stadiumSvg");
  if (svg){
    svg.querySelectorAll(".st-stand").forEach(node => {
      node.classList.toggle("is-selected", node.dataset.section === stadiumSelected);
      node.setAttribute("aria-pressed", String(node.dataset.section === stadiumSelected));
    });
    svg.classList.toggle("has-selection", !!stadiumSelected);
  }
  stadiumRenderPanel();
}

function stadiumRenderPanel(){
  const box = document.getElementById("stadiumPanel");
  if (!box) return;
  box.replaceChildren();
  if (!stadiumSelected){
    box.appendChild(el("p", "st-panel-hint",
      "Select a stand or the pitch to read about it. Hover on a desktop, tap on a touchscreen."));
    const facts = el("div", "st-facts");
    STADIUM_FACTS.forEach(([k, v]) => {
      const row = el("div", "st-fact");
      row.append(el("small", "", k), el("strong", "", v));
      facts.appendChild(row);
    });
    box.appendChild(facts);
    return;
  }
  const data = STADIUM_SECTIONS[stadiumSelected];
  const head = el("div", "st-panel-head");
  head.append(el("span", "st-panel-tag", data.tag), el("h3", "st-panel-name", data.name));
  box.append(head, el("p", "st-panel-text", data.text));
  box.appendChild(btn("CLEAR SELECTION", "secondary st-clear", () => stadiumSelect(null)));
}

function stadiumBuild(){
  const stage = document.getElementById("stadiumStage");
  if (!stage) return;
  stage.replaceChildren();
  const svg = sv("svg", {
    id: "stadiumSvg", viewBox: "0 0 1000 640",
    preserveAspectRatio: "xMidYMid meet",
    class: "st-svg st-view-" + stadiumView,
    role: "img",
    "aria-label": "Interactive illustration of Emirates Stadium"
  });
  (stadiumView === "bowl" ? buildBowl : buildPlan)(svg);
  stage.appendChild(svg);

  /* One delegated listener covers mouse, touch and pen through pointer events. */
  svg.addEventListener("click", event => {
    const node = event.target.closest(".st-stand");
    if (!node){ stadiumSelect(null); return; }
    stadiumSelect(node.dataset.section === stadiumSelected ? null : node.dataset.section);
  });
  svg.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = event.target.closest(".st-stand");
    if (!node) return;
    event.preventDefault();
    stadiumSelect(node.dataset.section === stadiumSelected ? null : node.dataset.section);
  });

  if (stadiumSelected) stadiumSelect(stadiumSelected);
}

function renderStadium(){
  const root = document.getElementById("stadiumRoot");
  if (!root) return;
  if (!stadiumBuilt){
    stadiumLoadPrefs();
    root.replaceChildren();

    const card = el("div", "card st-card");
    const top = el("div", "st-top");
    const titles = el("div");
    titles.append(el("h3", "", "EMIRATES STADIUM"), el("p", "st-sub", "Islington, London · Arsenal"));
    const seg = el("div", "seg st-views");
    [["bowl", "THREE-QUARTER"], ["plan", "SEATING PLAN"]].forEach(([value, label]) => {
      seg.appendChild(btn(label, "secondary" + (stadiumView === value ? " on" : ""), () => {
        if (stadiumView === value) return;
        stadiumView = value; stadiumSavePrefs();
        seg.querySelectorAll("button").forEach((b, index) =>
          b.classList.toggle("on", index === (value === "bowl" ? 0 : 1)));
        stadiumBuild();
      }));
    });
    top.append(titles, seg);

    const stage = el("div", "st-stage"); stage.id = "stadiumStage";
    const panel = el("div", "st-panel"); panel.id = "stadiumPanel";

    card.append(top, stage, panel);
    root.appendChild(card);
    stadiumBuilt = true;
  }
  stadiumBuild();
  stadiumRenderPanel();
}

/* ---------- Compact entry point on the home dashboard ---------- */
function renderStadiumCard(){
  const slot = document.getElementById("stadiumHomeCard");
  if (!slot) return;
  slot.replaceChildren();
  const svg = sv("svg", { viewBox: "0 0 240 120", class: "st-mini", "aria-hidden": "true" });
  /* A miniature of the bowl: four bands and a pitch, no interactivity */
  const cx = 120, cy = 62;
  svg.appendChild(sv("rect", { x: 14, y: 12, width: 212, height: 98, rx: 34, class: "st-mini-bowl" }));
  svg.appendChild(sv("rect", { x: 40, y: 30, width: 160, height: 62, rx: 16, class: "st-mini-inner" }));
  svg.appendChild(sv("rect", { x: 66, y: 44, width: 108, height: 34, rx: 3, class: "st-mini-pitch" }));
  svg.appendChild(sv("line", { x1: cx, y1: 44, x2: cx, y2: 78, class: "st-mini-line" }));
  svg.appendChild(sv("circle", { cx: cx, cy: 61, r: 7, class: "st-mini-line" }));
  slot.appendChild(svg);
}

window.renderStadium = renderStadium;
window.renderStadiumCard = renderStadiumCard;
renderStadiumCard();
