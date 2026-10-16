// Fig 4.1 — the refresh press.
// One world unit = one panel pixel (the PW3 panel is 1072 x 1448).
// A two-axis gantry carries an aperture frame to a damage rectangle; a
// temperature slide indexes the waveform selector, because the EPDC picks its
// voltage table by temperature (04.3).  Each stamp is one MXCFB_SEND_UPDATE.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./_kit/iso-kit.mjs";
import { kitScript } from "./_kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const NAME = "fig-refresh";

const { depthOf, iso, pathOf, cameraOf } = k;

// ---------------------------------------------------------------- geometry
const WIDTH = 900, HEIGHT = 560;

const PANEL = { x: 0, y: 0, w: 1072, d: 1448, r: 18 };     // /dev/fb0, visible
const PANEL_TOP = 16;
const BASE = { x: -210, y: -290, w: 1492, d: 1860, r: 30 };  // x -210..1282, y -290..1570
const BASE_TOP = 0, BASE_LOW = -34, FOOT_LOW = -52;

const RAIL_L = -170, RAIL_R = 1242;
const RAIL_Y0 = -58, RAIL_Y1 = 1506;
const RAIL_Z = 300;                                        // top of the rail strip
const POST = 70, POST_TOP = 240;

const CAR_Z = 350, CAR_H = 40, CAR_W = 150, CAR_D = 130, CAR_TOP = CAR_Z + CAR_H;

const HEAD_W = 540, HEAD_D = 120, BAR = 30;                // frame outer 540x120
const APER_W = HEAD_W - BAR * 2, APER_D = HEAD_D - BAR * 2;    // 480x60 = damage
const HEAD_H = 46, HEAD_TOP = PANEL_TOP + HEAD_H;
const STROKE = 26, SHAFT_LOW = PANEL_TOP + STROKE;
const SHAFT_R = 14, SPRING_R = 19, SPRING_TURNS = 12, COLLAR_R = 20;
const RAM_Y = -45;                                         // ram sits on the rear bar

const TITLE = { x: -190, y: -280, w: 340, d: 58, r: 8 };
const SLIDE = { x: -190, y: -206, w: 420, d: 20, r: 7, z: 10 };
const LEVELS = { x: 270, y: -280, w: 300, d: 124, r: 10 };
const MARKER = { x: 620, y: -280, w: 240, d: 124, r: 10 };
const KNOB = [1060, -212], KNOB_R = 60, KNOB_H = 22;

// the greeked page on the panel: 14 text rules, a heading bar, one image
const LINE_Y0 = 150, LINE_H = 62, LINES = 14;
const lineLength = (i) => 300 + ((i * 37) % 6) * 96;
const HEAD_BAR = { x: 96, y: 138, w: 520, d: 15 };
const IMAGE = { x: 96, y: 1030, w: 880, d: 300, r: 8 };

const T_MAX = 42;                                          // °C
const MODES = [
  { name: "GC16", levels: 16, flash: true, upTo: 8 },
  { name: "GL16", levels: 16, flash: false, upTo: 18 },
  { name: "DU", levels: 4, flash: false, upTo: 30 },
  { name: "A2", levels: 2, flash: true, upTo: T_MAX },
];
const modeFor = (t) => MODES.find((m) => t <= m.upTo) || MODES[MODES.length - 1];
const TOUR = [
  { x: 96, y: 430, t: 22 },     // a text line -> DU
  { x: 400, y: 460, t: 34 },    // the same line, fast echo -> A2
  { x: 96, y: 1032, t: 5 },     // the image block -> GC16
  { x: 96, y: 306, t: 12 },     // another line -> GL16
];
const X_RANGE = [0, PANEL.w - APER_W], Y_RANGE = [0, PANEL.d - APER_D];

// ---------------------------------------------------------------- helix
// A coil about a vertical axis, split into the turns seen behind and in front
// of the shaft so the shaft can be painted between them.  Written with bare kit
// names so the same source runs in the page (it is inlined by toString()).
const helix = (cx, cy, from, to, radius, turns, P, perTurn = 10) => {
  const count = Math.max(2, Math.round(turns * perTurn));
  const back = [], front = [];
  let run = [], near = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count, a = t * turns * Math.PI * 2;
    const facing = depthOf([Math.cos(a), Math.sin(a), 0], P) > 0;
    const flat = iso([cx + radius * Math.cos(a), cy + radius * Math.sin(a), from + (to - from) * t], P);
    if (near === null) near = facing;
    if (facing !== near) {
      run.push(flat);
      (near ? front : back).push(pathOf(run));
      run = [flat]; near = facing;
      continue;
    }
    run.push(flat);
  }
  if (run.length > 1) (near ? front : back).push(pathOf(run));
  return { back: back.join(""), front: front.join("") };
};

const PLAN = { x: -HEAD_W / 2, y: -HEAD_D / 2, w: HEAD_W, d: HEAD_D, r: 6 };

const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, FOOT_LOW, BASE_TOP),
    ...k.boxCorners(PANEL, BASE_TOP, PANEL_TOP + 6),
    ...k.boxCorners({ x: RAIL_L - 55, y: RAIL_Y0 - 55, w: RAIL_R - RAIL_L + 110, d: RAIL_Y1 - RAIL_Y0 + 110 }, 0, RAIL_Z + 40),
    ...k.boxCorners({ x: RAIL_L - 55, y: RAIL_Y0 - 55, w: RAIL_R - RAIL_L + 110, d: RAIL_Y1 - RAIL_Y0 + 110 }, 330, CAR_TOP + 20),
  ],
  WIDTH, HEIGHT, { pad: 54, azimuth: 45, elevation: 30 },
);

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const at = (p) => k.iso(p, P);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const slot = (plan, tone = "faint") => S(k.slabOf(plan, BASE_TOP, 1.4, P, 8), { tone, crease: "none", flat: true }) + L(k.planOutline(plan, BASE_TOP + 1.4, P, 8), { tone });

// ---------------------------------------------------------------- the bed
function bed() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, FOOT_LOW, 6, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 52))) {
    out.push(S(k.cylinder(x, y, 28, FOOT_LOW, 7, P, 26), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 19, FOOT_LOW + 7, -FOOT_LOW + BASE_LOW - 7, P, 26), { tone: "lo", crease: "none" }));
  }
  out.push(S(k.slabOf(BASE, BASE_LOW, -BASE_LOW, P, 10, 2.4), { tone: "lo" }));
  out.push(L(k.sideSeam(BASE, BASE_LOW + 7, P, 10), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 13), BASE_TOP, P, 10), { tone: "faint" }));
  const screws = k.corners(BASE, 40);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 8, BASE_TOP, P, 18)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, BASE_TOP])), { size: 1.2 }));
  for (const dx of [0, 1, 2]) out.push(slot({ x: 940 + dx * 86, y: -152, w: 58, d: 14, r: 7 }));
  for (const dx of [0, 1, 2]) out.push(slot({ x: -170 + dx * 86, y: -152, w: 58, d: 14, r: 7 }));
  return out.join("");
}

// ---------------------------------------------------------------- the panel
function panel() {
  const out = [];
  out.push(S(k.slabOf(PANEL, BASE_TOP, PANEL_TOP, P, 10, 2.2), { tone: "mid" }));
  out.push(L(k.sideSeam(PANEL, BASE_TOP + 5, P, 10), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(PANEL, 5), PANEL_TOP, P, 10), { tone: "lo" }));
  out.push(S(k.slabOf(HEAD_BAR, PANEL_TOP, 1, P, 6), { tone: "lo", crease: "none", flat: true }));
  for (let i = 1; i <= LINES; i++) {
    const y = LINE_Y0 + i * LINE_H;
    out.push(L(k.lineOnTop([96, y], [96 + lineLength(i), y], PANEL_TOP + 0.6, P), { tone: "lo", free: true }));
  }
  out.push(S(k.slabOf(IMAGE, PANEL_TOP, 2, P, 8, 0), { tone: "lo", crease: "none", flat: true }));
  out.push(L(k.planOutline(IMAGE, PANEL_TOP + 2, P, 8), { tone: "mid" }));
  out.push(D(k.dotGrid(IMAGE.x + 46, IMAGE.y + 44, 9, 3, 92, PANEL_TOP + 2.2, P), { size: 1.6, tone: "lo" }));
  out.push(D(k.corners(PANEL, 16).map(([x, y]) => at([x, y, PANEL_TOP])), { size: 1.3 }));
  // the X rule, in panel pixels, rooted on the strip's own edge
  const strip = { x: 0, y: -84, w: PANEL.w, d: 26, r: 5 };
  out.push(S(k.slabOf(strip, BASE_TOP, 8, P, 8, 1), { tone: "mid" }));
  const ticks = k.topTicks(0, PANEL.w, 67, 4, strip.y, BASE_TOP + 8, [6, 13], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  for (const x of [268, 804]) out.push(k.faceTextSvg(k.topMatrix([x, strip.y + 15], BASE_TOP + 8, P, "x"), String(x), { size: 26, tone: "lo", anchor: "middle" }));
  out.push(D([[2, strip.y + 13], [PANEL.w - 2, strip.y + 13]].map(([x, y]) => at([x, y, BASE_TOP + 8])), { size: 1 }));
  return out.join("");
}

// ---------------------------------------------------------------- flanks
// The bed either side of the panel: an encoder scale with its read-head clamps
// on the left, and the gantry's cable duct on the right.
function flanks() {
  const out = [];
  const scale = { x: -120, y: -20, w: 26, d: 1490, r: 6 };
  out.push(S(k.slabOf(scale, BASE_TOP, 6, P, 6, 1.2), { tone: "mid" }));
  const ticks = k.topTicks(-20, 1470, 60, 5, scale.x, BASE_TOP + 6, [8, 16], P, "y");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([scale.x + 20, 10], [scale.x + 20, 1440], BASE_TOP + 6, P), { tone: "faint" }));
  for (const cy of [200, 700, 1200]) {
    out.push(S(k.slabOf({ x: -126, y: cy - 16, w: 38, d: 32, r: 5 }, BASE_TOP + 6, 8, P, 4, 1), { tone: "mid" }));
    out.push(D([[ -107, cy - 6], [-107, cy + 6]].map(([x, y]) => at([x, y, BASE_TOP + 14])), { size: 1.1 }));
  }
  out.push(slot({ x: -72, y: -20, w: 16, d: 1490, r: 8 }));

  const duct = { x: 1118, y: -20, w: 76, d: 1490, r: 10 };
  out.push(S(k.slabOf(duct, BASE_TOP, 10, P, 8, 1.4), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(duct, 7), BASE_TOP + 10, 6, P, 8, 1), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(duct, 7), BASE_TOP + 16, P, 8), { tone: "faint" }));
  out.push(L(k.sideSeam(duct, BASE_TOP + 8, P, 8), { tone: "faint" }));
  out.push(D([180, 500, 820, 1140, 1400].map((y) => at([duct.x + 38, y, BASE_TOP + 16])), { size: 1.3 }));
  out.push(L(k.lineOnTop([duct.x + duct.w + 8, 0], [duct.x + duct.w + 8, 1450], BASE_TOP, P), { tone: "faint" }));
  return out.join("");
}

// ---------------------------------------------------------------- gantry
function gantry() {
  const out = [];
  for (const rx of [RAIL_L, RAIL_R]) {
    for (const ry of [RAIL_Y0, RAIL_Y1 - POST]) {
      out.push(S(k.slabOf({ x: rx - 55, y: ry - 55, w: 110, d: 110, r: 14 }, BASE_TOP, 14, P, 8, 1.6), { tone: "mid" }));
      out.push(S(k.slabOf({ x: rx - 35, y: ry - 35, w: POST, d: POST, r: 10 }, 14, POST_TOP - 14, P, 6, 1.6), { tone: "mid" }));
      out.push(L(k.planOutline({ x: rx - 35, y: ry - 35, w: POST, d: POST, r: 10 }, 124, P, 6), { tone: "faint" }));
      out.push(L(k.sideSeam({ x: rx - 35, y: ry - 35, w: POST, d: POST, r: 10 }, 196, P, 6), { tone: "faint" }));
      out.push(S(k.slabOf({ x: rx - 46, y: ry - 46, w: 92, d: 92, r: 12 }, POST_TOP, 14, P, 6, 1.4), { tone: "mid" }));
      out.push(D(k.corners({ x: rx - 46, y: ry - 46, w: 92, d: 92 }, 12).map(([x, y]) => at([x, y, POST_TOP + 14])), { size: 1.1 }));
    }
    out.push(S(k.slabOf({ x: rx - 30, y: RAIL_Y0, w: 60, d: RAIL_Y1 - RAIL_Y0, r: 8 }, 254, 32, P, 6, 1.6), { tone: "mid" }));
    out.push(L(k.sideSeam({ x: rx - 30, y: RAIL_Y0, w: 60, d: RAIL_Y1 - RAIL_Y0, r: 8 }, 272, P, 6), { tone: "faint" }));
    out.push(S(k.slabOf({ x: rx - 11, y: RAIL_Y0, w: 22, d: RAIL_Y1 - RAIL_Y0, r: 4 }, 286, 14, P, 4, 1.4), { tone: "mid" }));
    out.push(L(k.lineOnTop([rx, RAIL_Y0 + 12], [rx, RAIL_Y1 - 12], RAIL_Z, P), { tone: "faint" }));
    for (const ry of [RAIL_Y0, RAIL_Y1 - 34]) {
      out.push(S(k.slabOf({ x: rx - 26, y: ry, w: 52, d: 34, r: 7 }, RAIL_Z, 30, P, 4, 1.2), { tone: "mid" }));
      out.push(D([at([rx, ry + 17, RAIL_Z + 30])], { size: 1.2 }));
    }
  }
  return out.join("");
}

// the bridge, built at y = 0 and slid along the rails
function bridge() {
  const out = [];
  const beam = { x: RAIL_L - 20, y: -19, w: RAIL_R - RAIL_L + 40, d: 38, r: 8 };
  out.push(S(k.slabOf(beam, 314, 28, P, 6, 1.4), { tone: "mid" }));
  out.push(L(k.sideSeam(beam, 330, P, 6), { tone: "faint" }));
  out.push(S(k.slabOf({ x: RAIL_L - 10, y: -14, w: RAIL_R - RAIL_L + 20, d: 28, r: 6 }, 342, 8, P, 6, 1.2), { tone: "mid" }));
  for (const rx of [RAIL_L, RAIL_R]) {
    const block = { x: rx - 40, y: -44, w: 80, d: 88, r: 10 };
    out.push(S(k.slabOf(block, 296, 48, P, 6, 1.6), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(block, 9), 344, P, 6), { tone: "faint" }));
    out.push(D(k.corners(block, 20).map(([x, y]) => at([x, y, 344])), { size: 1.2 }));
  }
  return out.join("");
}

// the carriage, the ram shaft and its gland, built around (0, 0)
function carriage() {
  const out = [];
  out.push(S(k.cylinder(0, RAM_Y, SHAFT_R, SHAFT_LOW, CAR_Z - SHAFT_LOW, P, 24, 0.6), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(0, RAM_Y, COLLAR_R, CAR_Z - 12, 12, P, 28, 1), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -CAR_W / 2, y: -CAR_D / 2, w: CAR_W, d: CAR_D, r: 12 }, CAR_Z, CAR_H, P, 8, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -CAR_W / 2 + 12, y: -CAR_D / 2 + 10, w: CAR_W - 24, d: CAR_D - 20, r: 8 }, CAR_TOP, 9, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.lineOnTop([-CAR_W / 2 + 6, RAM_Y], [CAR_W / 2 - 6, RAM_Y], CAR_TOP, P), { tone: "faint" }));
  out.push(L(k.ring(0, RAM_Y, COLLAR_R + 4, CAR_TOP + 9, P, 28), { tone: "faint" }));
  const wheel = [CAR_W / 2 - 32, 20];
  out.push(S(k.cylinder(wheel[0], wheel[1], 20, CAR_TOP + 9, 10, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(wheel[0], wheel[1], 20, CAR_TOP + 9, CAR_TOP + 19, 40, P), { tone: "lo" }));
  out.push(L(k.ring(wheel[0], wheel[1], 13, CAR_TOP + 19, P, 24), { tone: "faint" }));
  out.push(L(k.ring(wheel[0], wheel[1], 4, CAR_TOP + 19, P, 16), { tone: "faint" }));
  out.push(L(k.lineOnTop([wheel[0] - 13, wheel[1]], [wheel[0] + 13, wheel[1]], CAR_TOP + 19, P), { tone: "hi" }));
  out.push(D([at([wheel[0], wheel[1], CAR_TOP + 19])], { size: 1.2, tone: "hi" }));
  out.push(D(k.corners({ x: -CAR_W / 2 + 8, y: -CAR_D / 2 + 8, w: CAR_W - 16, d: CAR_D - 16 }, 8).map(([x, y]) => at([x, y, CAR_TOP + 9])), { size: 1 }));
  return out.join("");
}

// the aperture frame, built at PANEL_TOP so its opening is the damage rectangle
function head() {
  const out = [];
  const bars = [
    { x: -HEAD_W / 2, y: -HEAD_D / 2, w: HEAD_W, d: BAR, r: 0 },
    { x: -HEAD_W / 2, y: HEAD_D / 2 - BAR, w: HEAD_W, d: BAR, r: 0 },
    { x: -HEAD_W / 2, y: -HEAD_D / 2 + BAR, w: BAR, d: APER_D, r: 0 },
    { x: HEAD_W / 2 - BAR, y: -HEAD_D / 2 + BAR, w: BAR, d: APER_D, r: 0 },
  ];
  bars.forEach((plan) => {
    out.push(S(k.slabOf(plan, PANEL_TOP, HEAD_H, P, 3, 1.4), { tone: "hi", lit: true }));
    out.push(L(k.sideSeam(plan, PANEL_TOP + HEAD_H * 0.55, P, 3), { tone: "faint" }));
  });
  out.push(L(k.planOutline({ x: -HEAD_W / 2 + 8, y: -HEAD_D / 2 + 8, w: HEAD_W - 16, d: HEAD_D - 16, r: 4 }, HEAD_TOP, P, 3), { tone: "faint" }));
  for (const [x, y] of [[-HEAD_W / 2 + 12, -HEAD_D / 2 + 12], [HEAD_W / 2 - 12, -HEAD_D / 2 + 12], [-HEAD_W / 2 + 12, HEAD_D / 2 - 12], [HEAD_W / 2 - 12, HEAD_D / 2 - 12]]) {
    out.push(S(k.cylinder(x, y, 9, HEAD_TOP, 6, P, 20), { tone: "hi" }));
  }
  out.push(S(k.cylinder(0, RAM_Y, COLLAR_R, HEAD_TOP, 10, P, 28, 1), { tone: "hi" }));
  return out.join("");
}

// the damage rectangle: the pixels the next update rewrites
function damage() {
  const out = [];
  const rect = { x: PLAN.x, y: PLAN.y, w: APER_W, d: APER_D, r: 0 };
  out.push(S(k.slabOf(rect, PANEL_TOP, 0.6, P, 4), { tone: "mid", crease: "none", flat: true }));
  out.push(D(k.dotGrid(rect.x + 24, rect.y + 16, 20, 2, 23, PANEL_TOP + 0.7, P), { size: 1.2, tone: "hi" }));
  out.push(L(k.planOutline(rect, PANEL_TOP + 0.7, P, 4), { tone: "mid" }));
  out.push([[-1, 1, 1, 1], [1, 1, -1, 1], [-1, -1, 1, -1], [1, -1, -1, -1]].map(([ax, ay, sx, sy]) => {
    const cx = ax < 0 ? rect.x : rect.x + rect.w, cy = ay < 0 ? rect.y : rect.y + rect.d;
    return L(k.onTop([[cx + 40 * sx, cy], [cx, cy], [cx, cy + 34 * sy]], PANEL_TOP + 0.7, P), { tone: "mid" });
  }).join(""));
  return out.join("");
}

// ---------------------------------------------------------------- controls
function window4(win, wb, height, tone) {
  const out = [];
  for (const bar of [
    { x: win.x, y: win.y, w: win.w, d: wb, r: 0 },
    { x: win.x, y: win.y + win.d - wb, w: win.w, d: wb, r: 0 },
    { x: win.x, y: win.y + wb, w: wb, d: win.d - wb * 2, r: 0 },
    { x: win.x + win.w - wb, y: win.y + wb, w: wb, d: win.d - wb * 2, r: 0 },
  ]) out.push(S(k.slabOf(bar, BASE_TOP, height, P, 3, 1), { tone }));
  out.push(S(k.slabOf(k.insetPlan(win, wb), BASE_TOP, 4, P, 6, 0.8), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(win, wb), BASE_TOP + 4, P, 6), { tone: "faint" }));
  return out.join("");
}

function deck() {
  const out = [];
  // title plate
  out.push(S(k.slabOf(TITLE, BASE_TOP, 5, P, 8, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(TITLE, 6), BASE_TOP + 5, P, 8), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([TITLE.x + 18, TITLE.y + 24], BASE_TOP + 5, P, "x"), "EPDC REFRESH", { size: 30, tone: "hi" }));
  out.push(L(k.lineOnTop([TITLE.x + 18, TITLE.y + 38], [TITLE.x + TITLE.w - 18, TITLE.y + 38], BASE_TOP + 5, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([TITLE.x + 18, TITLE.y + 48], [TITLE.x + TITLE.w - 118, TITLE.y + 48], BASE_TOP + 5, P), { tone: "lo", free: true }));

  // temperature slide + its slider
  out.push(S(k.slabOf(SLIDE, BASE_TOP, SLIDE.z, P, 6, 1.4), { tone: "mid" }));
  const ticks = k.topTicks(SLIDE.x + 14, SLIDE.x + SLIDE.w - 14, 31, 2, SLIDE.y, BASE_TOP + SLIDE.z, [5, 10], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(SLIDE, 4), BASE_TOP + SLIDE.z, P, 6), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([SLIDE.x + SLIDE.w + 16, SLIDE.y + 24], BASE_TOP, P, "x"), "°C", { size: 26, tone: "lo" }));
  const grip = [];
  grip.push(S(k.slabOf({ x: -20, y: -15, w: 40, d: 30, r: 5 }, SLIDE.z, 10, P, 6, 1.2), { tone: "hi", lit: true }));
  grip.push(k.faceTextSvg(k.topMatrix([0, 4], SLIDE.z + 10, P, "x"), "T", { size: 22, tone: "hi", anchor: "middle" }));
  out.push(`<g data-part="slider" transform="${k.translateAlong(P, [SLIDE.x + 26, 0, 0])}">${grip.join("")}</g>`);

  // levels window: how many greys the chosen waveform can address
  out.push(window4(LEVELS, 14, 12, "mid"));
  const inner = k.insetPlan(LEVELS, 14);
  for (let i = 0; i < 16; i++) {
    const plan = { x: inner.x + 14 + i * 17, y: inner.y + (inner.d - 30) / 2, w: 12, d: 30, r: 2 };
    out.push(`<g data-part="level">${S(k.slabOf(plan, BASE_TOP + 4, 9 + i * 2.6, P, 4, 0.8), { tone: "mid" })}</g>`);
  }
  out.push(k.faceTextSvg(k.topMatrix([LEVELS.x, LEVELS.y + LEVELS.d + 22], BASE_TOP, P, "x"), "GREY LEVELS", { size: 26, tone: "lo" }));

  // marker window (update_marker)
  out.push(window4(MARKER, 14, 12, "mid"));
  const mi = k.insetPlan(MARKER, 14);
  out.push(`<g data-part="markerText">${k.faceTextSvg(k.topMatrix([mi.x + mi.w / 2, mi.y + mi.d / 2 + 22], BASE_TOP + 4, P, "x"), "mk 001", { size: 56, tone: "hi", anchor: "middle" })}</g>`);
  out.push(k.faceTextSvg(k.topMatrix([MARKER.x, MARKER.y + MARKER.d + 22], BASE_TOP, P, "x"), "update_marker", { size: 26, tone: "lo" }));

  // waveform selector
  const knobPlate = { x: KNOB[0] - KNOB_R - 18, y: KNOB[1] - KNOB_R - 18, w: (KNOB_R + 18) * 2, d: (KNOB_R + 18) * 2, r: 18 };
  out.push(S(k.slabOf(knobPlate, BASE_TOP, 8, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(knobPlate, 7), BASE_TOP + 8, P, 8), { tone: "faint" }));
  out.push(S(k.cylinder(KNOB[0], KNOB[1], KNOB_R, BASE_TOP + 8, KNOB_H, P, 48, 1.4), { tone: "mid" }));
  out.push(L(k.knurl(KNOB[0], KNOB[1], KNOB_R, BASE_TOP + 10, BASE_TOP + 8 + KNOB_H - 2, 64, P, 0.5), { tone: "lo" }));
  out.push(L(k.ring(KNOB[0], KNOB[1], KNOB_R - 5, BASE_TOP + 8 + KNOB_H, P, 48), { tone: "faint" }));
  out.push(L(k.ring(KNOB[0], KNOB[1], 34, BASE_TOP + 8 + KNOB_H, P, 40), { tone: "faint" }));
  const kn = k.radialTicks(KNOB[0], KNOB[1], KNOB_R - 5, 40, 10, BASE_TOP + 8 + KNOB_H, [4, 9], P);
  out.push(L(kn.minor, { tone: "faint" }), L(kn.major, { tone: "mid" }));
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2;
    out.push(L(k.onTop([[KNOB[0] + Math.sin(a) * 34, KNOB[1] - Math.cos(a) * 34], [KNOB[0] + Math.sin(a) * (KNOB_R - 5), KNOB[1] - Math.cos(a) * (KNOB_R - 5)]], BASE_TOP + 8 + KNOB_H + 0.2, P), { tone: "hi" }));
  }
  out.push(`<g data-part="knobName">${k.faceTextSvg(k.topMatrix([KNOB[0], KNOB[1] + 14], BASE_TOP + 8 + KNOB_H, P, "x"), modeFor(TOUR[0].t).name, { size: 42, tone: "hi", anchor: "middle" })}</g>`);
  return out.join("");
}

// ---------------------------------------------------------------- assemble
const START = TOUR[0];
const spring = helix(0, RAM_Y, HEAD_TOP + 10, CAR_Z, SPRING_R, SPRING_TURNS, P);
const svgBody = [
  bed(),
  panel(),
  flanks(),
  `<g data-part="damage" transform="${k.translateAlong(P, [START.x, START.y, 0])}">${damage()}</g>`,
  gantry(),
  `<g data-part="bridge" transform="${k.translateAlong(P, [0, START.y, 0])}">${bridge()}</g>`,
  `<g data-part="springBack" transform="${k.translateAlong(P, [START.x, START.y, 0])}"><path class="iso-line" data-tone="lo" d="${spring.back}"/></g>`,
  `<g data-part="carriage" transform="${k.translateAlong(P, [START.x, START.y, 0])}">${carriage()}</g>`,
  `<g data-part="head" transform="${k.translateAlong(P, [START.x, START.y, 0])}">${head()}</g>`,
  `<g data-part="springFront" transform="${k.translateAlong(P, [START.x, START.y, 0])}"><path class="iso-line" data-tone="lo" d="${spring.front}"/></g>`,
  deck(),
];

const LABEL =
  "A gantry press over a 1072 by 1448 e-ink panel that is holding a page of text and one image. Two rails carry a bridge, the bridge carries a carriage, and the carriage presses an aperture frame down onto a damage rectangle of 480 by 60 panel pixels, drawn on the page as a bracketed rectangle holding a grid of dots. A slide in front of the panel carries a temperature scale, a rotary selector shows the waveform that temperature picks, a window shows how many greys that waveform can address, and another counts the update marker. Each descent of the frame is one MXCFB_SEND_UPDATE.";

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody });

// ---------------------------------------------------------------- live code
const live = `
const P = ${JSON.stringify(P)};
const MODES = ${JSON.stringify(MODES)};
const TOUR = ${JSON.stringify(TOUR)};
const X_RANGE = ${JSON.stringify(X_RANGE)}, Y_RANGE = ${JSON.stringify(Y_RANGE)};
const T_MAX = ${T_MAX}, VIEW_W = ${WIDTH}, VIEW_H = ${HEIGHT};
const APER_W = ${APER_W}, APER_D = ${APER_D}, PANEL_TOP = ${PANEL_TOP};
const SLIDE_X0 = ${SLIDE.x + 26}, SLIDE_X1 = ${SLIDE.x + SLIDE.w - 26};
const STROKE = ${STROKE}, HEAD_TOP = ${HEAD_TOP}, CAR_Z = ${CAR_Z};
const SPRING_R = ${SPRING_R}, SPRING_TURNS = ${SPRING_TURNS}, RAM_Y = ${RAM_Y};
const CYCLE = 2.7, PRESS_AT = 1.05, DOWN = 0.18, HOLD = 0.5, UP = 0.24;
const helix = ${helix.toString()};

const cam = cameraOf(P);
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const bridge = part("bridge"), carriage = part("carriage"), head = part("head"), damage = part("damage");
const springBack = part("springBack"), springFront = part("springFront"), slider = part("slider");
const knobName = part("knobName").querySelector("text");
const markerText = part("markerText").querySelector("text");
const levelBars = [...svg.querySelectorAll('[data-part="level"]')];
const info = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (t) => t * t * (3 - 2 * t);
const modeFor = (t) => MODES.find((m) => t <= m.upTo) || MODES[MODES.length - 1];

// the page is the plane z = PANEL_TOP, so the pointer can be inverted exactly
const unproject = (sx, sy, z) => {
  const s = (sx - P.origin[0]) / cam.k;
  const u = ((sy - P.origin[1]) / cam.k + z * cam.cosE) / cam.sinE;
  return [s * cam.sinA + u * cam.cosA, u * cam.sinA - s * cam.cosA];
};

let x = TOUR[0].x, y = TOUR[0].y, tx = x, ty = y;
let temp = TOUR[0].t, tTemp = temp;
let dz = 0, marker = 1, level = 0, step = 0, clock = 0, prevU = PRESS_AT + DOWN;
let frame = 0, last = 0, visible = false, touring = true, idle = 0;

const dzAt = (u) => {
  if (u < PRESS_AT) return STROKE;
  if (u < PRESS_AT + DOWN) return STROKE * (1 - ease((u - PRESS_AT) / DOWN));
  if (u < PRESS_AT + DOWN + HOLD) return 0;
  if (u < PRESS_AT + DOWN + HOLD + UP) return STROKE * ease((u - PRESS_AT - DOWN - HOLD) / UP);
  return STROKE;
};
const apply = (s) => { tx = s.x; ty = s.y; tTemp = s.t; };

function draw() {
  const mode = modeFor(temp);
  bridge.setAttribute("transform", translateAlong(P, [0, y, 0]));
  carriage.setAttribute("transform", translateAlong(P, [x, y, 0]));
  damage.setAttribute("transform", translateAlong(P, [x, y, 0]));
  head.setAttribute("transform", translateAlong(P, [x, y, dz]));
  springBack.setAttribute("transform", translateAlong(P, [x, y, dz]));
  springFront.setAttribute("transform", translateAlong(P, [x, y, dz]));
  const coil = helix(0, RAM_Y, HEAD_TOP + 10, CAR_Z - dz, SPRING_R, SPRING_TURNS, P);
  springBack.querySelector("path").setAttribute("d", coil.back);
  springFront.querySelector("path").setAttribute("d", coil.front);
  slider.setAttribute("transform", translateAlong(P, [SLIDE_X0 + (temp / T_MAX) * (SLIDE_X1 - SLIDE_X0), 0, 0]));
  if (knobName.textContent !== mode.name) knobName.textContent = mode.name;
  if (level !== mode.levels) {
    level = mode.levels;
    levelBars.forEach((bar, i) => bar.setAttribute("opacity", i < level ? "1" : "0.22"));
  }
  const label = "mk " + String(marker).padStart(3, "0");
  if (markerText.textContent !== label) markerText.textContent = label;
  const rx = Math.round(x), ry = Math.round(y);
  const text = temp.toFixed(0) + " °C · " + mode.name + " · " + APER_W + "×" + APER_D + " @" + rx + "," + ry;
  if (info.textContent !== text) {
    info.textContent = text;
    stage.setAttribute("aria-label", "Refresh press: damage rectangle at " + rx + ", " + ry + ", " + mode.name + " waveform at " + temp.toFixed(0) + " degrees, update marker " + marker);
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) clock += dt;
  const u = (((PRESS_AT + DOWN) + clock) % CYCLE + CYCLE) % CYCLE;
  if (touring && u < prevU) { step = (step + 1) % TOUR.length; apply(TOUR[step]); }
  if (prevU < PRESS_AT && u >= PRESS_AT) marker += 1;
  prevU = u;
  dz = dzAt(u);
  x = calm ? tx : x + (tx - x) * (1 - Math.exp(-dt / 0.16));
  y = calm ? ty : y + (ty - y) * (1 - Math.exp(-dt / 0.16));
  temp = calm ? tTemp : temp + (tTemp - temp) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(tx - x) < 0.02) x = tx;
  if (Math.abs(ty - y) < 0.02) y = ty;
  if (Math.abs(tTemp - temp) < 0.02) temp = tTemp;
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (nx, ny, nt) => {
  touring = false;
  tx = clamp(nx, X_RANGE[0], X_RANGE[1]);
  ty = clamp(ny, Y_RANGE[0], Y_RANGE[1]);
  if (nt !== undefined) tTemp = clamp(nt, 0, T_MAX);
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = 0; prevU = 0; run(); }, 5000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const sx = ((event.clientX - box.left) / box.width) * VIEW_W;
  const sy = ((event.clientY - box.top) / box.height) * VIEW_H;
  const [px, py] = unproject(sx, sy, PANEL_TOP);
  steer(px - APER_W / 2, py - APER_D / 2);
});
stage.addEventListener("keydown", (event) => {
  const nudge = event.shiftKey ? 64 : 20;
  let used = true;
  if (event.key === "ArrowLeft") steer(tx - nudge, ty);
  else if (event.key === "ArrowRight") steer(tx + nudge, ty);
  else if (event.key === "ArrowUp") steer(tx, ty - nudge);
  else if (event.key === "ArrowDown") steer(tx, ty + nudge);
  else if (event.key === "PageUp") steer(tx, ty, tTemp + 6);
  else if (event.key === "PageDown") steer(tx, ty, tTemp - 6);
  else if (/^[1-4]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const lo = index === 0 ? 0 : MODES[index - 1].upTo;
    steer(tx, ty, (lo + MODES[index].upTo) / 2);
  } else used = false;
  if (used) event.preventDefault();
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 4.1",
  title: "The refresh press",
  hint: "Hover to move the damage rect · 1–4 pick the waveform",
  readout: `${START.t} °C · ${modeFor(START.t).name} · ${APER_W}×${APER_D} @ ${START.x},${START.y}`,
  keys: [
    { mark: "lit", label: "The aperture frame: its opening is the damage rectangle" },
    { mark: "dotted", label: "The pixels the update rewrites, in the framebuffer" },
    { mark: "raised", label: "The temperature slide and the waveform it selects" },
    { mark: "dim", label: "Greys the chosen waveform cannot address" },
  ],
  caption:
    "The EPDC never scans the framebuffer: you hand it a rectangle and a waveform (§4.4, §4.5). A two-axis gantry carries the aperture frame to the damage rectangle — here 480×60 panel pixels, a line of text — and a slide carries the temperature that indexes the waveform selector, because the EPDC picks its voltage table by temperature (§4.3). The modes and their grey levels are the table from §4.3; the temperature bands are kernink's own policy.",
  body: `<div class="iso-stage" tabindex="0" role="application" aria-label="EPDC refresh press">${svg}</div>`,
});

mkdirSync(join(HERE, "shots"), { recursive: true });
const suffix = theme === "light" ? "-light" : "";
writeFileSync(join(HERE, `${NAME}${suffix}.html`), k.pageHtml({ title: "The refresh press", theme, body, script: kitScript() + live, width: 980 }));
writeFileSync(join(HERE, `${NAME}${suffix}.svg`), k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody, standalone: theme }));
console.log("wrote", `${NAME}${suffix}.html`, `${NAME}${suffix}.svg`);
