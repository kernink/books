// Fig 7.1 — the layer rack.
// One world unit is one unit of the rack model; the card is 900 x 560.
// The stock rendering path costs one drawer per layer (seven of them, 190 MB);
// kernink's path is a single shallow tray in one process (two layers, 3 MB).
// A beam balance weighs the two stacks.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./_kit/iso-kit.mjs";
import { kitScript } from "./_kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const NAME = "fig-stack";
const WIDTH = 900, HEIGHT = 560;

// ---------------------------------------------------------------- the model
// ch. 7 §7.3 order, bottom drawer first; the MB are the §7.7 RSS figures.
const LAYERS = [
  { short: "panel", name: "panel", mb: 0 },
  { short: "epdc", name: "epdc · kernel", mb: 0 },
  { short: "fb0", name: "framebuffer", mb: 0 },
  { short: "xorg", name: "xorg", mb: 5 },
  { short: "gtk", name: "awesome · gtk", mb: 25 },
  { short: "cvm", name: "cvm · jvm", mb: 104 },
  { short: "kpp", name: "kpp · reader", mb: 56 },
];
const STOCK_MB = LAYERS.reduce((sum, layer) => sum + layer.mb, 0); // 190
const KERN = [
  { short: "raster", name: "rasteriser → fb0", mb: 3 },
  { short: "update", name: "send_update", mb: 0 },
];
const KERN_MB = KERN.reduce((sum, layer) => sum + layer.mb, 0); // 3

// ---------------------------------------------------------------- geometry
const PLATE_TOP = 16;

// the rack: a casing on three legs, a column of drawers, a hopper under it
const RACK_PLATE = { x: 460, y: 160, w: 360, d: 360, r: 10 }; // 460..820, 160..520
const LEGS = [
  { x: 486, y: 186 }, { x: 762, y: 186 }, { x: 486, y: 442 }, // near-right corner open
];
const LEG_W = 32, LEG_TOP = 166;
const RING = { x: 480, y: 180, w: 320, d: 300 }; // 480..800, 180..480
const RING_Z = 166, RING_H = 30, RING_BAR = 34;
const COL_Z = 196, PITCH = 66, DH = 52; // drawer column: 196 .. 644
const TOP_Z = COL_Z + PITCH * 6 + DH; // 644
const HOOD = { x: 466, y: 166, w: 352, d: 328, r: 8 };
const HOOD_Z = TOP_Z, HOOD_H = 32;

const D = {
  back: { x: 524, y: 220, w: 14, d: 220, r: 0 },
  far: { x: 538, y: 220, w: 248, d: 14, r: 0 },
  near: { x: 538, y: 426, w: 248, d: 14, r: 0 },
  floor: { x: 538, y: 234, w: 248, d: 192, r: 0 },
  front: { x: 786, y: 220, w: 24, d: 220, r: 0 },
  lip: { x: 810, y: 224, w: 9, d: 212, r: 0 },
  plate: { x: 810, y: 228, w: 2.5, d: 116, r: 0 }, // the engraved name plate
  weight: { x: 810, y: 350, w: 28, d: 86, r: 0 }, // the memory block
};
const PULL_OPEN = 78, PULL_MAX = 90; // how far a drawer slides on its runner
const RAIL = [{ x: 480, y: 214, w: 34, d: 232 }, { x: 766, y: 214, w: 34, d: 232 }];
const RAIL_H = 8;
const RP_W = 34, RP = { far: [{ x: 480, y: 180 }, { x: 766, y: 180 }], near: [{ x: 480, y: 446 }, { x: 766, y: 446 }] };

// The chute.  The camera looks down at 30 degrees, so the drawer column hides
// almost everything directly beneath it: a point (x,y,z) in the base chamber is
// visible only when it steps out past x > 810 - 1.2245(196 - z) or past
// y > 440 - 1.2245(196 - z).  A funnel that merely narrowed straight down would
// be invisible, so the chute gathers the whole column and then steps out toward
// the open near-right corner, stage by stage, into the light.
const CH_A = { outer: { x: 520, y: 214, w: 246, d: 232, r: 6 }, inner: { x: 630, y: 310, w: 120, d: 110, r: 5 } };
const CH_B = { outer: CH_A.inner, inner: { x: 686, y: 358, w: 60, d: 40, r: 4 } };
const CH_C = { outer: CH_B.inner, inner: { x: 700, y: 370, w: 34, d: 20, r: 3 } };
const CH_A_Z = 126, CH_B_Z = 86, CH_C_Z = 56, SPOUT_Z = 26;
const SHEET = { x: 642, y: 325, w: 150, d: 110, r: 2 }; // the one page, both sides of the figure
const SHEET_H = 10;

// the tray machine: two pillars, one shallow tray, one chute, one tiny weight
const TRAY_PLATE = { x: 700, y: -260, w: 280, d: 316, r: 10 };
const POSTS = [{ x: 724, y: -172 }, { x: 932, y: -172 }], POST_W = 24, POST_TOP = 108;
const TRAY = { x: 724, y: -190, w: 232, d: 110, r: 4 };
const TRAY_FLOOR = 108, TRAY_WALL = 6, TRAY_WALL_H = 16;
const TRAY_IN = { x: 730, y: -184, w: 220, d: 98 };
const TCH_A = { outer: { x: 748, y: -180, w: 184, d: 90, r: 5 }, inner: { x: 804, y: -150, w: 72, d: 30, r: 4 } };
const TCH_B = { outer: TCH_A.inner, inner: { x: 816, y: -144, w: 48, d: 18, r: 3 } };
const TCH_A_Z = 74, TCH_B_Z = 40, TCH_SPOUT_Z = PLATE_TOP + 10;
const CARD = { x: 765, y: -190, w: 150, d: 110, r: 2 }; // the same one page

// the balance: a beam on a column, a loaded pan each end
const BAL_PLATE = { x: 20, y: 600, w: 400, d: 340, r: 12 };
const COL = { x: 200, y: 690, w: 44, d: 44, r: 6 };
const COL_BASE = { x: 188, y: 678, w: 68, d: 68, r: 8 };
const CAP = { x: 206, y: 696, w: 32, d: 32, r: 4 };
const PIVOT = [222, 712];
const BEAM = { x: 60, y: 706, w: 324, d: 12, r: 3 };
const BEAM_Z = 322, BEAM_H = 12, BEAM_MID = BEAM_Z + BEAM_H / 2; // 328
const PAN_Z = 112, PAN_H = 14, PAN_R = 52, PAN_TRAVEL = 22, BEAM_MAX = 6.4;
const BEAM_TAU = 55;
const beamAngle = (load) => BEAM_MAX * (1 - Math.exp(-Math.max(0, load - KERN_MB) / BEAM_TAU));
const BEAM_FULL = beamAngle(STOCK_MB); // the lean in the still frame, 6.19°
const STILL_SEL = 5; // the still frame reads the cvm drawer
const PAN_X = [80, 340]; // stock pan (screen left), kernink pan
const PLATE_W = 86, PLATE_PLATE = 4, WEIGHT_K = 0.33, WEIGHT_MIN = 11;
const ROD_TOP = 290, SLEEVE = 46; // the rod's top stays inside the beam's sleeve
const blockHeight = (mb) => WEIGHT_MIN + mb * WEIGHT_K; // 0 -> 11, 3 -> 12, 104 -> 45.3

const FIT = [
    ...k.boxCorners(BAL_PLATE, 0, PLATE_TOP),
    ...k.boxCorners(COL, PLATE_TOP, BEAM_Z + BEAM_H),
    ...k.boxCorners({ x: BEAM.x - 14, y: BEAM.y - 8, w: BEAM.w + 28, d: BEAM.d + 16 }, BEAM_Z - SLEEVE, BEAM_Z + BEAM_H + 26),
    ...k.boxCorners({ x: 30, y: 662, w: 100, d: 100 }, PAN_Z - PAN_TRAVEL, PAN_Z + 120),
    ...k.boxCorners({ x: 290, y: 662, w: 100, d: 100 }, PAN_Z, PAN_Z + 40),
    ...k.boxCorners(TRAY_PLATE, 0, PLATE_TOP),
    ...k.boxCorners({ x: TRAY.x, y: TRAY.y, w: TRAY.w, d: TRAY.d }, TRAY_FLOOR, TRAY_FLOOR + TRAY_WALL_H + 12),
    ...k.boxCorners(RACK_PLATE, 0, PLATE_TOP),
    ...k.boxCorners({ x: 460, y: 160, w: 450, d: 380 }, 0, HOOD_Z + HOOD_H),
];
const P = k.fitProjection(FIT, WIDTH, HEIGHT, { pad: 42, azimuth: 45, elevation: 30 });
if (process.argv.includes("--debug")) {
  const unit = { origin: [0, 0], scale: 1, azimuth: 45, elevation: 30 };
  const flat = FIT.map((point) => k.iso(point, unit));
  const xs = flat.map(([x]) => x), ys = flat.map(([, y]) => y);
  console.log("extent", (Math.max(...xs) - Math.min(...xs)).toFixed(0), (Math.max(...ys) - Math.min(...ys)).toFixed(0), "worst-x", FIT[xs.indexOf(Math.max(...xs))].join(","), FIT[xs.indexOf(Math.min(...xs))].join(","), "worst-y", FIT[ys.indexOf(Math.max(...ys))].join(","), FIT[ys.indexOf(Math.min(...ys))].join(","));
}

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const at = (point) => k.iso(point, P);
const box = (plan, z, height, tone, extra = {}) => S(k.slabOf(plan, z, height, P, 4, extra.bevel ?? 1.2), { tone, ...extra });
const groove = (plan, z, tone = "faint") => L(k.planOutline(plan, z, P, 4), { tone });

// ---------------------------------------------------------------- the balance
// Two pans hang on one beam: the stock stack and the kernink stack.  A pan
// drops by PAN_TRAVEL when its load is at STOCK_MB and the beam leans by
// BEAM_MAX degrees, so the two ends of the beam never disagree.
function balance() {
  const out = [];
  const pivot = at([PIVOT[0], PIVOT[1], BEAM_MID]);
  out.push(S(k.slabOf(BAL_PLATE, 0, PLATE_TOP, P, 10, 2), { tone: "mid", halo: true }));
  out.push(groove(k.insetPlan(BAL_PLATE, 14), PLATE_TOP, "faint"));
  out.push(L(k.sideSeam(BAL_PLATE, 6, P, 10), { tone: "faint" }));
  out.push(S(k.slabOf(COL_BASE, PLATE_TOP, 28, P, 6, 1.6), { tone: "mid" }));
  out.push(S(k.slabOf(COL, PLATE_TOP + 28, BEAM_Z - PLATE_TOP - 28 - 16, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.sideSeam(COL, 150, P, 8), { tone: "faint" }));
  out.push(groove(k.insetPlan(COL, 7), BEAM_Z - 16, "faint"));
  out.push(S(k.slabOf(CAP, BEAM_Z - 16, 16, P, 4, 1.2), { tone: "mid" }));

  // the pans: a disc, a rod up into the beam's sleeve, and the stack on top
  const panGroup = (side, plates, tag, hi) => {
    const px = PAN_X[side];
    const parts = [];
    parts.push(S(k.slabOf({ x: px - 4, y: PIVOT[1] - 4, w: 8, d: 8, r: 0 }, PAN_Z + PAN_H, ROD_TOP - PAN_Z - PAN_H, P, 4, 0.8), { tone: "mid", crease: "none" }));
    parts.push(S(k.cylinder(px, PIVOT[1], PAN_R, PAN_Z, PAN_H, P, 44, 1.6), { tone: "mid" }));
    parts.push(L(k.ring(px, PIVOT[1], PAN_R - 6, PAN_Z + PAN_H, P, 44), { tone: "faint" }));
    parts.push(Dots(k.corners({ x: px - PAN_R + 8, y: PIVOT[1] - PAN_R + 8, w: (PAN_R - 8) * 2, d: (PAN_R - 8) * 2 }, 0).map(([x, y]) => at([x, y, PAN_Z + PAN_H])), { size: 0.9 }));
    let z = PAN_Z + PAN_H;
    for (const plate of plates) {
      const plan = { x: px - PLATE_W / 2, y: PIVOT[1] - PLATE_W / 2, w: PLATE_W, d: PLATE_W, r: PLATE_PLATE };
      const grown = { x: plan.x + plate.inset / 2, y: plan.y + plate.inset / 2, w: plan.w - plate.inset, d: plan.d - plate.inset, r: PLATE_PLATE };
      parts.push(`<g data-part="load" data-i="${plate.i}" opacity="1">${S(k.slabOf(grown, z, blockHeight(plate.mb), P, 8, 1), { tone: "mid" })}</g>`);
      z += blockHeight(plate.mb);
    }
    return `<g data-part="pan" data-side="${tag}" data-hi="${hi}" transform="${k.translateAlong(P, [0, 0, side === 0 ? -PAN_TRAVEL : PAN_TRAVEL])}">${parts.join("")}</g>`;
  };
  const stockPlates = LAYERS.map((layer, i) => ({ i, mb: layer.mb, inset: i * 3 }));
  const kernPlates = KERN.map((layer, i) => ({ i: `k${i}`, mb: layer.mb, inset: i * 3 }));
  const pans = [];
  pans.push(panGroup(0, stockPlates, "stock", "total"));
  pans.push(panGroup(1, kernPlates, "kern", "kern"));

  // the beam, with a sleeve at each end that swallows the top of the rod
  const beamParts = [];
  beamParts.push(S(k.slabOf(BEAM, BEAM_Z, BEAM_H, P, 4, 1.2), { tone: "hi" }));
  beamParts.push(L(k.lineOnTop([BEAM.x + 4, PIVOT[1]], [BEAM.x + BEAM.w - 4, PIVOT[1]], BEAM_Z + BEAM_H, P), { tone: "faint" }));
  for (const px of PAN_X) {
    beamParts.push(S(k.slabOf({ x: px - 6, y: PIVOT[1] - 6, w: 12, d: 12, r: 0 }, BEAM_Z - SLEEVE, SLEEVE, P, 4, 0.8), { tone: "mid", crease: "none" }));
    beamParts.push(S(k.slabOf({ x: px - 9, y: PIVOT[1] - 9, w: 18, d: 18, r: 0 }, BEAM_Z + BEAM_H, 10, P, 4, 1), { tone: "mid" }));
  }
  beamParts.push(S(k.cylinder(PIVOT[0], PIVOT[1], 11, BEAM_Z + BEAM_H, 20, P, 24, 1), { tone: "mid" }));
  beamParts.push(S(k.cylinder(PIVOT[0], PIVOT[1], 6, BEAM_Z + BEAM_H + 20, 6, P, 20, 0.6), { tone: "hi" }));
  out.push(`<g data-part="pans">${pans.join("")}</g>`);
  out.push(`<g data-part="beam" transform="rotate(${(-BEAM_FULL).toFixed(2)} ${pivot[0].toFixed(1)} ${pivot[1].toFixed(1)})">${beamParts.join("")}</g>`);
  return out.join("");
}
// ---------------------------------------------------------------- shared bits
// A funnel stage: four bars round an opening, the way a hopper narrows.
function frame(outer, inner, z, height, tone) {
  const bars = [
    { x: outer.x, y: outer.y, w: outer.w, d: inner.y - outer.y, r: 0 },
    { x: outer.x, y: inner.y + inner.d, w: outer.w, d: outer.y + outer.d - inner.y - inner.d, r: 0 },
    { x: outer.x, y: inner.y, w: inner.x - outer.x, d: inner.d, r: 0 },
    { x: inner.x + inner.w, y: inner.y, w: outer.x + outer.w - inner.x - inner.w, d: inner.d, r: 0 },
  ];
  return bars.map((bar) => S(k.slabOf(bar, z, height, P, 3, 1.2), { tone })).join("");
}

// The one page: the same rules of text under both spouts.
function pageRules(plan, z) {
  const out = [groove(k.insetPlan(plan, 4), z, "faint")];
  const lines = 5, top = plan.y + 17, pitch = (plan.d - 36) / (lines - 1);
  for (let i = 0; i < lines; i++) {
    const y = top + i * pitch;
    const end = plan.x + plan.w - 12 - (i % 3) * 20;
    out.push(L(k.lineOnTop([plan.x + 12, y], [end, y], z + 0.6, P), { tone: "lo", free: true }));
  }
  return out.join("");
}

// ------------------------------------------------------------ the tray machine
// kernink's whole path: two pillars, one shallow tray holding two thin plates,
// one chute, and the same page under the spout.
function trayMachine() {
  const out = [];
  out.push(S(k.slabOf(TRAY_PLATE, 0, PLATE_TOP, P, 10, 2), { tone: "mid", halo: true }));
  out.push(groove(k.insetPlan(TRAY_PLATE, 14), PLATE_TOP, "faint"));
  out.push(L(k.sideSeam(TRAY_PLATE, 6, P, 10), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([716, 4], PLATE_TOP + 0.6, P, "x"), "kernink · 2 layers", { size: 20, tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([716, 48], PLATE_TOP + 0.6, P, "x"), "3 MB", { size: 40, tone: "hi" }));

  for (const post of POSTS) {
    const plan = { x: post.x, y: post.y, w: POST_W, d: POST_W, r: 2 };
    out.push(box(plan, PLATE_TOP, POST_TOP - PLATE_TOP, "mid", { bevel: 1.6 }));
    out.push(L(k.sideSeam(plan, 60, P, 4), { tone: "faint" }));
  }
  out.push(box(TRAY, TRAY_FLOOR, 4, "mid")); // the tray's floor
  const tw = TRAY_WALL, th = TRAY_WALL_H - 4;
  out.push(box({ x: TRAY.x, y: TRAY.y, w: TRAY.w, d: tw, r: 0 }, TRAY_FLOOR + 4, th, "mid"));
  out.push(box({ x: TRAY.x, y: TRAY.y + TRAY.d - tw, w: TRAY.w, d: tw, r: 0 }, TRAY_FLOOR + 4, th, "mid"));
  out.push(box({ x: TRAY.x, y: TRAY.y + tw, w: tw, d: TRAY.d - tw * 2, r: 0 }, TRAY_FLOOR + 4, th, "mid"));
  out.push(box({ x: TRAY.x + TRAY.w - tw, y: TRAY.y + tw, w: tw, d: TRAY.d - tw * 2, r: 0 }, TRAY_FLOOR + 4, th, "mid"));
  let tz = TRAY_FLOOR + 4;
  KERN.forEach((layer, i) => {
    const plan = { x: TRAY_IN.x + i * 3, y: TRAY_IN.y + i * 3, w: TRAY_IN.w - i * 6, d: TRAY_IN.d - i * 6, r: 3 };
    out.push(`<g data-part="kplate" data-i="${i}">${S(k.slabOf(plan, tz, blockHeight(layer.mb), P, 8, 1), { tone: "mid" })}</g>`);
    tz += blockHeight(layer.mb);
  });
  out.push(frame(TCH_A.outer, TCH_A.inner, TCH_A_Z, TRAY_FLOOR - TCH_A_Z, "mid"));
  out.push(frame(TCH_B.outer, TCH_B.inner, TCH_B_Z, TCH_A_Z - TCH_B_Z, "mid"));
  out.push(box(CARD, PLATE_TOP, 10, "mid", { bevel: 1 }));
  out.push(pageRules(CARD, PLATE_TOP + 10));
  out.push(box(TCH_B.inner, TCH_SPOUT_Z, TCH_B_Z - TCH_SPOUT_Z, "mid", { bevel: 1 }));
  out.push(L(k.sideSeam(TCH_B.inner, TCH_B_Z - 6, P, 3), { tone: "faint" }));
  return `<g data-drawer="kern" data-hi="kern">${out.join("")}</g>`;
}

// ---------------------------------------------------------------- the rack
// A casing on three legs (the near corner is left open so the chamber reads),
// seven drawers on runners, a hopper under the column narrowing to one spout
// that lands on the page lying on the base plate.
function rackFrame() {
  const out = [];
  out.push(S(k.slabOf(RACK_PLATE, 0, PLATE_TOP, P, 10, 2), { tone: "mid", halo: true }));
  out.push(groove(k.insetPlan(RACK_PLATE, 14), PLATE_TOP, "faint"));
  out.push(L(k.sideSeam(RACK_PLATE, 6, P, 10), { tone: "faint" }));
  for (const leg of LEGS) {
    const plan = { x: leg.x, y: leg.y, w: LEG_W, d: LEG_W, r: 2 };
    out.push(box(plan, PLATE_TOP, LEG_TOP - PLATE_TOP, "mid", { bevel: 1.6 }));
    out.push(L(k.sideSeam(plan, 90, P, 4), { tone: "faint" }));
  }
  const bars = [
    { x: RING.x, y: RING.y, w: RING.w, d: RING_BAR, r: 0 },
    { x: RING.x, y: RING.y + RING_BAR, w: RING_BAR, d: RING.d - RING_BAR, r: 0 },
    { x: RING.x + RING.w - RING_BAR, y: RING.y + RING_BAR, w: RING_BAR, d: RING.d - RING_BAR, r: 0 },
  ];
  for (const bar of bars) out.push(box(bar, RING_Z, RING_H, "mid", { bevel: 1.4 }));
  for (let i = 1; i < LAYERS.length; i++) {
    const z = COL_Z + i * PITCH - RAIL_H;
    for (const rail of RAIL) out.push(box({ ...rail, r: 0 }, z, RAIL_H, "mid"));
  }
  for (const post of RP.far) {
    const plan = { x: post.x, y: post.y, w: RP_W, d: RP_W, r: 2 };
    out.push(box(plan, COL_Z, TOP_Z - COL_Z, "mid", { bevel: 1.6 }));
    out.push(L(k.sideSeam(plan, 420, P, 4), { tone: "faint" }));
  }
  out.push(box(SHEET, PLATE_TOP, SHEET_H, "mid", { bevel: 1 }));
  out.push(pageRules(SHEET, PLATE_TOP + SHEET_H));
  out.push(box(CH_C.inner, SPOUT_Z, CH_C_Z - SPOUT_Z, "mid", { bevel: 1 })); // the spout lands on the page
  out.push(frame(CH_C.outer, CH_C.inner, CH_C_Z, CH_B_Z - CH_C_Z, "mid"));
  out.push(frame(CH_B.outer, CH_B.inner, CH_B_Z, CH_A_Z - CH_B_Z, "mid"));
  out.push(frame(CH_A.outer, CH_A.inner, CH_A_Z, RING_Z - CH_A_Z, "mid"));
  return out.join("");
}

// the two near posts come after the drawers: they stand in front of them
function rackNear() {
  return RP.near
    .map((post) => {
      const plan = { x: post.x, y: post.y, w: RP_W, d: RP_W, r: 2 };
      return box(plan, COL_Z, TOP_Z - COL_Z, "mid", { bevel: 1.6 }) + L(k.sideSeam(plan, 420, P, 4), { tone: "faint" });
    })
    .join("");
}

function hood() {
  const out = [];
  out.push(S(k.slabOf(HOOD, HOOD_Z, HOOD_H, P, 8, 2.4), { tone: "mid" }));
  out.push(L(k.sideSeam(HOOD, HOOD_Z + 12, P, 8), { tone: "faint" }));
  out.push(groove(k.insetPlan(HOOD, 20), HOOD_Z + HOOD_H, "faint"));
  out.push(k.faceTextSvg(k.topMatrix([492, 250], HOOD_Z + HOOD_H + 0.6, P, "x"), "STOCK RENDERING PATH", { size: 21, tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([494, 328], HOOD_Z + HOOD_H + 0.6, P, "x"), "190 MB", { size: 44, tone: "hi" }));
  return out.join("");
}

// one drawer: floor, back, two side walls, thick front plate, grab lip, an
// engraved plate carrying the layer's name and its cost, and a memory block
// whose height is the layer's RSS (nothing at all for the free layers).
function drawer(i) {
  const layer = LAYERS[i];
  const z0 = COL_Z + i * PITCH;
  const out = [];
  out.push(box(D.floor, z0, 5, "mid"));
  out.push(box(D.back, z0, DH, "mid"));
  out.push(box(D.far, z0, DH, "mid"));
  out.push(box(D.near, z0, DH, "mid"));
  out.push(box(D.front, z0, DH, "mid", { bevel: 1 }));
  out.push(groove({ x: 790, y: 226, w: 16, d: 208, r: 0 }, z0 + DH, "faint"));
  out.push(box(D.lip, z0 + DH - 10, 8, "mid"));
  out.push(box(D.plate, z0 + 4, 36, "lo", { crease: "none", flat: true }));
  out.push(k.faceTextSvg(k.sideMatrix([813.4, 344], z0 + 30, P, "right"), layer.name, { size: 13, tone: "mid" }));
  out.push(k.faceTextSvg(k.sideMatrix([813.4, 344], z0 + 9, P, "right"), `${layer.mb} MB`, { size: 23, tone: "hi" }));
  if (layer.mb > 0) {
    const top = z0 + 4 + blockHeight(layer.mb);
    out.push(box(D.weight, z0 + 4, blockHeight(layer.mb), "mid", { bevel: 1.4 }));
    for (const gy of [366, 402]) out.push(L(k.onTop([[D.weight.x, gy], [D.weight.x + D.weight.w, gy]], top, P), { tone: "faint" }));
  } else {
    const bay = D.weight, z = z0 + 4;
    const loop = [
      [811, bay.y, z], [811, bay.y + bay.d, z], [811, bay.y + bay.d, z + 34], [811, bay.y, z + 34],
    ];
    for (let corner = 0; corner < 4; corner++) out.push(L(k.segment(loop[corner], loop[(corner + 1) % 4], P), { tone: "faint" }));
  }
  return `<g data-drawer="${i}" data-hi="${i}" transform="${k.translateAlong(P, [i === STILL_SEL ? PULL_OPEN : 0, 0, 0])}">${out.join("")}</g>`;
}

// ---------------------------------------------------------------- assemble
const svgBody = [
  balance(),
  trayMachine(),
  rackFrame(),
  LAYERS.map((_, i) => drawer(i)).join(""),
  rackNear(),
  hood(),
];

const LABEL =
  "A drawer rack of seven drawers on four pillars over one chute. Each drawer is a layer of the stock Kindle rendering path: the panel, the EPDC kernel driver and the framebuffer are empty, xorg holds 5 megabytes, awesome with GTK and pillowd 25, the cvm Java VM 104 and the KPP book host 56. The chute gathers them into one spout that lands on a page lying on the base plate. A much smaller machine beside it is kernink's whole path: two pillars, one shallow tray with two thin plates, one chute, and the same page. A beam balance on the left weighs the two stacks.";

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody });

// exactly one lit accent at a time: the selected layer's own solids
const litRules = [
  ".iso-fill{fill:var(--anatomy-face)}",
  ".iso-top{fill:var(--anatomy-lit-top)}",
  ".iso-shade{fill:var(--anatomy-lit-shade)}",
  ".iso-edge{stroke:var(--anatomy-lit)}",
  ".iso-face-text{fill:var(--anatomy-hi)}",
];
const litCss = [...LAYERS.map((_, i) => String(i)), "kern", "total"]
  .flatMap((key) => litRules.map((rule) => `[data-sel="${key}"] [data-hi="${key}"] ${rule}`))
  .join("");

// ---------------------------------------------------------------- live code
const live = `
const P = ${JSON.stringify(P)};
const LAYERS = ${JSON.stringify(LAYERS)};
const KERN = ${JSON.stringify(KERN)};
const STOCK_MB = ${STOCK_MB}, KERN_MB = ${KERN_MB};
const COL_Z = ${COL_Z}, PITCH = ${PITCH}, DH = ${DH};
const PULL_OPEN = ${PULL_OPEN}, CYCLE_PULL = 52;
const PAN_TRAVEL = ${PAN_TRAVEL}, BEAM_MAX = ${BEAM_MAX}, BEAM_TAU = ${BEAM_TAU};
const PIVOT = ${JSON.stringify([PIVOT[0], PIVOT[1], BEAM_Z + BEAM_H / 2])};
const STEP = 2.1, CYCLE = STEP * (LAYERS.length + 1);
const VIEW_W = ${WIDTH}, VIEW_H = ${HEIGHT}, SLAB_X = ${D.front.x + D.front.w};
const TRAY_HIT = { x0: 716, x1: 964, y0: -204, y1: -76, z: 112 };
const STILL_SEL = "${STILL_SEL}";
const beamAngle = (load) => BEAM_MAX * (1 - Math.exp(-Math.max(0, load - KERN_MB) / BEAM_TAU));

const cam = cameraOf(P);
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const drawerEls = LAYERS.map((_, i) => svg.querySelector('[data-drawer="' + i + '"]'));
const stockLoads = [...svg.querySelectorAll('[data-part="load"]')].filter((el) => el.getAttribute("data-i").charAt(0) !== "k");
const panStock = svg.querySelector('[data-part="pan"][data-side="stock"]');
const panKern = svg.querySelector('[data-part="pan"][data-side="kern"]');
const beamEl = svg.querySelector('[data-part="beam"]');
const info = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const towards = (v, t, dt, tau) => v + (t - v) * (1 - Math.exp(-dt / tau));
const pivotFlat = iso(PIVOT, P);
const bell = (u) => (u < 0.86 ? Math.sin((Math.PI * u) / 0.86) : 0);

// a pointer lands on a plane: a drawer's own front face, or the tray's top
const onFace = (sx, sy, x) => {
  const s = (sx - P.origin[0]) / cam.k;
  const y = (x * cam.sinA - s) / cam.cosA;
  const z = ((x * cam.cosA + y * cam.sinA) * cam.sinE - (sy - P.origin[1]) / cam.k) / cam.cosE;
  return [y, z];
};
const onPlane = (sx, sy, z) => {
  const s = (sx - P.origin[0]) / cam.k;
  const u = ((sy - P.origin[1]) / cam.k + z * cam.cosE) / cam.sinE;
  return [s * cam.sinA + u * cam.cosA, u * cam.sinA - s * cam.cosA];
};
const pick = (sx, sy) => {
  const [tx, ty] = onPlane(sx, sy, TRAY_HIT.z);
  if (tx > TRAY_HIT.x0 && tx < TRAY_HIT.x1 && ty > TRAY_HIT.y0 && ty < TRAY_HIT.y1) return "kern";
  for (let i = LAYERS.length - 1; i >= 0; i--) {
    const [y, z] = onFace(sx, sy, SLAB_X + pull[i]);
    if (y < 220 || y > 440) continue;
    if (z >= COL_Z + i * PITCH && z <= COL_Z + i * PITCH + DH) return String(i);
  }
  return null;
};

let sel = STILL_SEL, held = false, tour = !still.matches, step = LAYERS.length, clock = STEP * LAYERS.length;
let pull = LAYERS.map((_, i) => (String(i) === STILL_SEL ? PULL_OPEN : 0));
let share = LAYERS.map(() => 1);
let dz = -PAN_TRAVEL, ang = ${BEAM_FULL.toFixed(3)};
let frame = 0, last = 0, visible = false, idle = 0, moving = true;

function draw() {
  if (stage.getAttribute("data-sel") !== sel) stage.setAttribute("data-sel", sel);
  LAYERS.forEach((_, i) => drawerEls[i].setAttribute("transform", translateAlong(P, [pull[i], 0, 0])));
  stockLoads.forEach((el, i) => el.setAttribute("opacity", (0.14 + 0.86 * share[i]).toFixed(3)));
  panStock.setAttribute("transform", translateAlong(P, [0, 0, dz]));
  panKern.setAttribute("transform", translateAlong(P, [0, 0, -dz]));
  beamEl.setAttribute("transform", "rotate(" + (-ang).toFixed(3) + " " + pivotFlat[0].toFixed(1) + " " + pivotFlat[1].toFixed(1) + ")");
  const i = Number(sel);
  const text = sel === "total"
    ? "stock stack \\u00b7 " + STOCK_MB + " MB \\u00b7 " + LAYERS.length + " layers"
    : sel === "kern"
      ? "kernink \\u00b7 " + KERN.length + " layers \\u00b7 " + KERN_MB + " MB"
      : LAYERS[i].short + " \\u00b7 " + LAYERS[i].mb + " MB \\u00b7 layer " + (i + 1) + " of " + LAYERS.length;
  if (info.textContent !== text) {
    info.textContent = text;
    stage.setAttribute("aria-label", "Layer rack: " + text + ". The stock path is " + STOCK_MB + " MB in " + LAYERS.length + " layers; kernink's path is two layers in one process, " + KERN_MB + " MB.");
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const span = (tau) => (calm ? 0.001 : tau);
  if (tour) {
    clock += dt;
    const u = ((clock % CYCLE) + CYCLE) % CYCLE / STEP;
    step = Math.floor(u);
    const phase = u - step;
    if (step >= LAYERS.length) sel = "total";
    else sel = String(step);
    LAYERS.forEach((_, i) => {
      pull[i] = towards(pull[i], i === step ? CYCLE_PULL * bell(phase) : 0, dt, span(0.32));
      share[i] = towards(share[i], i <= step ? 1 : 0, dt, span(0.5));
    });
  } else {
    LAYERS.forEach((_, i) => {
      pull[i] = towards(pull[i], sel === String(i) ? PULL_OPEN : 0, dt, span(0.32));
      share[i] = towards(share[i], 1, dt, span(0.5));
    });
  }
  const load = LAYERS.reduce((sum, layer, i) => sum + layer.mb * share[i], 0);
  dz = towards(dz, -PAN_TRAVEL * (load / STOCK_MB), dt, span(0.5));
  ang = towards(ang, beamAngle(load), dt, span(0.5));
  if (Math.abs(dz + PAN_TRAVEL * (load / STOCK_MB)) < 0.05) dz = -PAN_TRAVEL * (load / STOCK_MB);
  if (Math.abs(ang - beamAngle(load)) < 0.02) ang = beamAngle(load);
  draw();
  moving = tour
    || Math.abs(dz - -PAN_TRAVEL * (load / STOCK_MB)) > 0.04
    || Math.abs(ang - beamAngle(load)) > 0.04
    || LAYERS.some((_, i) => Math.abs(pull[i] - (sel === String(i) && !tour ? PULL_OPEN : pull[i])) > 0.2);
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { moving = true; last = 0; frame = requestAnimationFrame(tick); } };
const stopTour = () => {
  tour = false;
  clearTimeout(idle);
  idle = setTimeout(() => { held = false; tour = !still.matches; step = LAYERS.length; clock = STEP * LAYERS.length; run(); }, 7000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const sx = ((event.clientX - box.left) / box.width) * VIEW_W;
  const sy = ((event.clientY - box.top) / box.height) * VIEW_H;
  const hit = pick(sx, sy);
  stopTour();
  if (hit !== null) { held = false; sel = hit; }
});
stage.addEventListener("click", (event) => {
  const box = svg.getBoundingClientRect();
  const sx = ((event.clientX - box.left) / box.width) * VIEW_W;
  const sy = ((event.clientY - box.top) / box.height) * VIEW_H;
  const hit = pick(sx, sy);
  if (hit !== null) { sel = hit; held = true; }
  stopTour();
});
stage.addEventListener("keydown", (event) => {
  const base = /^[0-7]$/.test(sel) ? Number(sel) : LAYERS.length - 1;
  let used = true;
  if (event.key === "c" || event.key === "C") {
    held = false;
    clearTimeout(idle);
    tour = !still.matches;
    step = LAYERS.length;
    clock = STEP * LAYERS.length;
    run();
    return event.preventDefault();
  }
  if (/^[1-7]$/.test(event.key)) sel = String(clamp(Number(event.key) - 1, 0, LAYERS.length - 1));
  else if (event.key === "ArrowUp") sel = String(clamp(base - 1, 0, LAYERS.length - 1));
  else if (event.key === "ArrowDown") sel = String(clamp(base + 1, 0, LAYERS.length - 1));
  else used = false;
  if (used) { held = true; stopTour(); }
  if (used) event.preventDefault();
});
draw();
`;

// ---------------------------------------------------------------- the plate
const stillText = `${LAYERS[STILL_SEL].short} · ${LAYERS[STILL_SEL].mb} MB · layer ${STILL_SEL + 1} of ${LAYERS.length}`;

const body = k.plateHtml({
  fig: "Fig 7.1",
  title: "The layer rack",
  hint: "Hover a drawer · 1–7 pick a layer · c cycles",
  readout: stillText,
  keys: [
    { mark: "lit", label: "The layer under the pointer: its plate, its block and its pan light up" },
    { mark: "raised", label: "One drawer: one layer of the stock path on its runner" },
    { mark: "flat", label: "The engraved plate: the layer's name over its RSS" },
    { mark: "dim", label: "An empty bay: no user-space memory at all" },
  ],
  caption:
    "Seven layers, seven drawers (§7.3). The panel, the EPDC driver and the framebuffer drawers are empty, because those layers live in the kernel and cost no user-space RSS. What the rest hold is §7.7's resident set: Xorg 4.8 MB asked as 5, awesome with GTK, pillowd and the on-screen keyboard a further 25, the `cvm` Java VM 104, and the KPP book host with its reader 56 — 190 MB of resident memory in all, none of it the pixels. The chute under the column gathers the seven drawers into one spout, and the spout lands on the page, because a page on the panel is the only thing the stack exists to produce. kernink's whole path is the small machine beside it: two pillars, one shallow tray holding two thin plates (a CPU rasteriser writing /dev/fb0, and one MXCFB_SEND_UPDATE ioctl), one chute, the same page, and a target of 3 MB in one process (§7.7: 'a few MB and one process'). Each pan carries one plate per layer on the same scale as the drawers' blocks, and the beam tips by the difference of the two real loads — 190 MB against 3.",
  body: `<style>${litCss}</style><div class="iso-stage" tabindex="0" role="application" aria-label="Layer rack" data-sel="${STILL_SEL}">${svg}</div>`,
});

mkdirSync(join(HERE, "shots"), { recursive: true });
const suffix = theme === "light" ? "-light" : "";
writeFileSync(join(HERE, `${NAME}${suffix}.html`), k.pageHtml({ title: "The layer rack", theme, body, script: kitScript() + live, width: 980 }));
writeFileSync(
  join(HERE, `${NAME}${suffix}.svg`),
  k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: `<style>${litCss}</style><g data-sel="${STILL_SEL}">${svgBody.join("")}</g>`, standalone: theme }),
);
console.log("wrote", `${NAME}${suffix}.html`, `${NAME}${suffix}.svg`, "·", stillText, "· scale", P.scale.toFixed(3));
