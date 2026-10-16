// Fig 5.1 — the contact tracker.
// One world unit = one panel pixel: evdev ABS units are panel pixels on this
// device, so the tape's numbers are the numbers the driver sends.  /dev/input/
// event1 is a cyttsp4_mt speaking MT-B — eleven slots, each holding one
// ABS_MT_TRACKING_ID, fed by BEGIN/UPDATE/END packet sets that are each closed
// by one SYN_REPORT — with no pressure and no contact size, so every gesture
// has to be geometry over time.  The deck records the live contact as three
// traces (displacement in X, displacement in Y, BTN_TOUCH) and makes the four
// decisions the chapter's recogniser makes: a comb gated by the path the finger
// has covered, a one-shot timer whose two cams read the tap and the long press,
// and a governor that releases the swipe once the finger is fast enough.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./_kit/iso-kit.mjs";
import { kitScript } from "./_kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const NAME = "fig-touch";

const { depthOf, iso, pathOf, cameraOf, onTop, slabOf, cylinder, extrude, solidSvg, lineSvg, dotsSvg, translateAlong, circleRing, knurl, planOutline, lineOnTop, segment, ring, sideSeam, faceTextSvg, topMatrix, sideMatrix, radialTicks, topTicks, sideTicks, insetPlan, corners, ringOf, roundedPlan } = k;

// ---------------------------------------------------------------- truth (ch. 5)
const SLOTS = 11;                 // ABS_MT_SLOT, 0..10
const ID_MAX = 65535;             // ABS_MT_TRACKING_ID, 0..65535
const D_SLOP = 16;                // tap slop, px of path covered
const T_CLICK = 250;              // ms: where the tap cam reads
const T_LONG = 500;               // ms: where the long-press cam reads
const V_SWIPE = 420;              // px/s: where the governor trips
const TURN = 1000;                // ms for one revolution of the timer shaft
const EPOCH = 620;                // ms the one-shot timer runs on past the lift
const EPOCH_MS = 1500, EPOCH_Z0 = 12, EPOCH_K = 0.115;  // the epoch scale, in world units

// ---------------------------------------------------------------- geometry
const WIDTH = 900, HEIGHT = 560;

const BASE = { x: -430, y: -540, w: 1170, d: 1060, r: 26 };  // x -430..740, y -540..520
const TOP = 0, LOW = -30, FOOT = -52;

// the platen and the tape it carries.  x is the direction of travel (time), y
// is the recorded axis.  A band 120 wide plots a +-40 px window, so the 16 px
// slop the recogniser allows is four tenths of the band — plainly visible.
const PLATEN = { x: -250, y: -245, w: 770, d: 490, r: 10 };
const PLATEN_TOP = 112;
const TAPE = { x: -190, y: -195, w: 710, d: 390, r: 3 };
const TAPE_X0 = TAPE.x, TAPE_X1 = TAPE.x + TAPE.w, TAPE_Y0 = TAPE.y, TAPE_Y1 = TAPE.y + TAPE.d;
const RAIL_MARGIN = { x: -250, y: -195, w: 60, d: 390, r: 4 };
const TAPE_Z = PLATEN_TOP, TAPE_H = 6, TAPE_TOP = TAPE_Z + TAPE_H;
const MARGIN_TOP = PLATEN_TOP + 14;

const BAND_W = 120, GAP = 15;
const bandY = (i) => -195 + i * (BAND_W + GAP);    // -195, -60, 75
const bandMid = (i) => bandY(i) + BAND_W / 2;      // -135, 0, 135
const TAG_TOUCH = -30, TAG_IDLE = 30;              // where the BTN_TOUCH pen sits
const PX = 1;                                      // world units per panel pixel
const SPAN = 40;                                   // the recorded window, +- px
const SPEED = 120;                                 // tape travel, world units per second
const T_ZERO = 100;                                // = the pen's station, so the tape reads age to the right

// the chart head: a rail across the tape on two columns, one carriage per channel
const PEN_X = 100, RAIL_Z = 140, RAIL_H = 22;
const CAR_Z = RAIL_Z + RAIL_H + 8, CAR_H = 24, CAR_TOP = CAR_Z + CAR_H;
const CAR_Y = 14, COL_Y = 300;

// the trays the fanfold stack feeds from and refolds into
const SUP = { x: -380, y: -195, w: 130, d: 390, r: 8 };
const TAK = { x: 520, y: -195, w: 130, d: 390, r: 8 };
const STACK_TOP = TAPE_Z + TAPE_H - 6;

// The gate: three 32-wide posts on a 64 pitch.  Each tappet's blade is a 16-wide
// tab, and the comb's slide runs from 0 to exactly 16 units toward the far end —
// one 16-unit step, the tap slop.  TAP's tab sits flush with a post's leading
// edge, so it is free through the whole slide and the flank crosses it only at
// the very end; LONG's tab sits flush with the next post's leading edge the same
// way; DRAG's tab sits flush with a post's trailing edge, so it is covered at
// rest and uncovered only when the slide is home.  The reading is therefore
// exact: a contact whose path stays under 16 px never completes the slide, so the
// tap and long-press tabs stay free; a contact that covers 16 px takes the slide
// up, and the gate snaps over to the drag.  The slide goes through a slot and a
// ratchet, so what the comb travels is the path the finger covered, not the
// offset it happens to end at.
const GATE_X = 195, COMB_W = 34, COMB_Y0 = -456, COMB_LEN = 192;
const COMB_Z = 126, COMB_H = 18, POST_Z = 112, COMB_SLIDE = D_SLOP;
const COMB_POSTS = [0, 1, 2].map((n) => [COMB_Y0 + 8 + n * 64, COMB_Y0 + 40 + n * 64]);
const TAP_Y = COMB_Y0 + 48, LONG_Y = COMB_Y0 + 112, DRAG_Y = COMB_Y0 + 160;
const BLADE_R = 8;                                 // the blades' half-depth in y
const BLADE_Z = 96, BLADE_H = 12, LIFT_FREE = 16, LIFT_BLOCK = 4;

// the timer: one motor, two belts, a face cam under the tap and the long press.
// Each cam's lobe rides LOBE_OFF out from the shaft and the follower sits at
// FOLLOW_R, so the follower only reaches full lift as the lobe sweeps through
// the shaft's +x side — at 250 ms for the tap cam and at 500 ms for the long
// cam, which is the whole of the tap/long gap.  TURN is one revolution a second.
const CAM_R = 19, CAM_H = 14, LOBE_R = 16, LOBE_OFF = 10, LOBE_H = 10;
const CAM_Z = 40, CAM_SHAFT = 26, FOLLOW_R = 26, ROD_R = 6, CAM_LIFT = 10;
const CAM_PEAKS = [90, 180];                       // the cam angle, in degrees, of each read
const MOTOR = { x: 40, y: -440 }, MOTOR_R = 26, PULLEY_R = 18;
// the one rigid link the release solenoid lifts: the timer's detent pawl and the
// comb's ratchet pawl, so the detent lets go exactly while a contact is alive
const BAR = [247, DRAG_Y - 2, 290, MOTOR.y];
// the one rigid link the release solenoid lifts: the timer's detent pawl and the
// comb's ratchet pawl, so the detent lets go exactly while a contact is alive

// the governor rides the X carriage and is driven off a rack on the rail
const RACK_X = 22, RACK_Z = 150, RACK_H = 18, PINION_R = 12;
const GOV = 34;                                    // the governor's spindle, off the carriage's face
const GOV_TOP = CAR_TOP + 58;
const TRIP_V = 30;                                 // the shaft angle, degrees, that trips the arm
const SWING_REST = -22;                            // and the angle it hangs at when it is not tripping

// the front deck: the slot turret, the name plate, the frame counter
const TUR = { x: -320, y: 370 }, TUR_R = 100, TUR_D = 108, TUR_TOP = TUR_D;
const PLATE = { x: -150, y: 348, w: 500, d: 136, r: 8 };
const COUNTER = { x: 400, y: 352, w: 214, d: 104, r: 6 };
const COUNTER_Z = 96;

const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, FOOT, TOP),
    ...k.boxCorners(TAPE, TAPE_Z, TAPE_TOP),
    ...k.boxCorners(RAIL_MARGIN, PLATEN_TOP, MARGIN_TOP),
    ...k.boxCorners({ x: -60, y: -320, w: 132, d: 640 }, TOP, GOV_TOP + 34),
    ...k.boxCorners({ x: GATE_X - 60, y: -480, w: 130, d: 260 }, TOP, COMB_Z + COMB_H),
    ...k.boxCorners({ x: -240, y: -470, w: 300, d: 180 }, TOP, 215),
    ...k.boxCorners({ x: TUR.x - TUR_R, y: TUR.y - TUR_R, w: TUR_R * 2, d: TUR_R * 2 }, TOP, TUR_TOP + 46),
    ...k.boxCorners(PLATE, TOP, 8),
    ...k.boxCorners(COUNTER, TOP, COUNTER_Z + 40),
  ],
  WIDTH, HEIGHT, { pad: 24, azimuth: 45, elevation: 30 },
);

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const at = (p) => k.iso(p, P);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const slot = (plan, tone = "faint") => S(k.slabOf(plan, TOP, 1.4, P, 8), { tone, crease: "none", flat: true }) + L(k.planOutline(plan, TOP + 1.4, P, 8), { tone });

// A plan point list turned about [cx, cy] by `deg`.  Bare kit names only, so it
// runs in the page too (it is inlined by toString()).
const turnPlan = (points, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
  return points.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};

// A thin flat bar from one plan point to another, and the same shape rotated
// about a hub.  Bare kit names only (inlined by toString()).
const barRing = (x0, y0, x1, y1, half) => {
  const dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * half, ny = (dx / length) * half;
  return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
};

// A stadium loop around two vertical shafts, sampled at matching angles on both
// ends, so the outer and inner edges share point indices and the ribbon between
// them is a valid ring.
const beltRing = (ax, ay, bx, by, radius, steps = 20) => {
  const t0 = Math.atan2(by - ay, bx - ax);
  const half = Math.max(2, steps >> 1);
  const out = [];
  for (let i = 0; i <= half; i++) {
    const a = t0 + Math.PI / 2 + (i / half) * Math.PI;
    out.push([ax + radius * Math.cos(a), ay + radius * Math.sin(a)]);
  }
  for (let i = 0; i <= half; i++) {
    const a = t0 - Math.PI / 2 + (i / half) * Math.PI;
    out.push([bx + radius * Math.cos(a), by + radius * Math.sin(a)]);
  }
  return out;
};

// The plan position of slot `i` on the turret.  Bare kit names only (inlined).
const slotAt = (i) => {
  const a = -Math.PI / 2 + (i / SLOTS) * Math.PI * 2;
  return [TUR.x + Math.sin(a) * 64, TUR.y - Math.cos(a) * 64];
};

// The three pen traces, rebuilt each frame from the sample list: a sample is the
// pen's value a given age ago, and the tape has carried it out to the right of
// the pens at SPEED.  Bare kit names only (inlined by toString()).
const traceSvg = (samples) => {
  let out = "";
  for (let band = 0; band < 3; band++) {
    const pts = [];
    for (const s of samples) {
      const x = PEN_X + (s.age * SPEED) / 1000;
      if (x < TAPE_X0 + 1 || x > TAPE_X1 - 1) continue;
      const v = band === 0 ? s.dx : band === 1 ? s.dy : (s.touch ? TAG_TOUCH : TAG_IDLE);
      pts.push([x, bandMid(band) + v, TAPE_TOP + 0.7]);
    }
    if (pts.length > 1) out += lineSvg(onTop(pts, TAPE_TOP + 0.7, P), { tone: "hi", className: "trace", free: true });
  }
  return out;
};

// ---------------------------------------------------------------- the bed
function bed() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, FOOT, 6, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 60))) {
    out.push(S(k.cylinder(x, y, 30, FOOT, 7, P, 26), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 20, FOOT + 7, -FOOT + LOW - 7, P, 26), { tone: "lo", crease: "none" }));
  }
  out.push(S(k.slabOf(BASE, LOW, -LOW, P, 10, 2.4), { tone: "lo" }));
  out.push(L(k.sideSeam(BASE, LOW + 8, P, 10), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 13), TOP, P, 10), { tone: "faint" }));
  const screws = k.corners(BASE, 44);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 8, TOP, P, 18)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, TOP])), { size: 1.3 }));
  // the time scale is cut into the platen's near face: the tape runs at 120
  // world units a second, so a 30-unit tick is 250 ms and a major is one second
  // the time scale is cut into the platen's near face.  The tape runs at 120
  // world units a second, so a 30-unit tick is 250 ms and a major is one second;
  // 0 ms is the pen's own station, and the scale only runs forward from there.
  const ticks = k.sideTicks(T_ZERO, TAPE_X1, 30, 4, PLATEN.y + PLATEN.d, PLATEN_TOP, [9, 18], P, "x");
  out.push(L(ticks.minor, { tone: "faint" }), L(ticks.major, { tone: "mid" }));
  for (const x of [T_ZERO, T_ZERO + 120, T_ZERO + 240, T_ZERO + 360]) {
    out.push(k.faceTextSvg(k.sideMatrix([x, PLATEN.y + PLATEN.d + 0.5], PLATEN_TOP - 30, P, "left"), String(Math.round(((x - T_ZERO) / SPEED) * 1000)), { size: 22, tone: "lo", anchor: "middle" }));
  }
  out.push(k.faceTextSvg(k.sideMatrix([T_ZERO - 60, PLATEN.y + PLATEN.d + 0.5], PLATEN_TOP - 30, P, "left"), "ms", { size: 22, tone: "lo", anchor: "middle" }));
  return out.join("");
}

// ---------------------------------------------------------------- the platen
function platen() {
  const out = [];
  out.push(S(k.slabOf(PLATEN, TOP, PLATEN_TOP - TOP, P, 10, 2.2), { tone: "mid" }));
  out.push(L(k.sideSeam(PLATEN, TOP + 12, P, 10), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(PLATEN, 8), PLATEN_TOP, P, 10), { tone: "lo" }));
  out.push(L(k.planOutline({ x: TAPE.x - 6, y: TAPE.y - 6, w: TAPE.w + 12, d: TAPE.d + 12, r: 4 }, PLATEN_TOP, P, 5), { tone: "faint" }));
  out.push(D(k.corners(PLATEN, 22).map(([x, y]) => at([x, y, PLATEN_TOP])), { size: 1.3 }));
  // the label rail: the channel names and the deflection scale, alongside the tape
  out.push(S(k.slabOf(RAIL_MARGIN, PLATEN_TOP, MARGIN_TOP - PLATEN_TOP, P, 6, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(RAIL_MARGIN, MARGIN_TOP, P, 6), { tone: "faint" }));
  out.push(L(k.sideSeam(RAIL_MARGIN, PLATEN_TOP + 5, P, 6), { tone: "faint" }));
  out.push(D([[RAIL_MARGIN.x + 14, RAIL_MARGIN.y + 14], [RAIL_MARGIN.x + 14, RAIL_MARGIN.y + RAIL_MARGIN.d - 14]].map(([x, y]) => at([x, y, MARGIN_TOP])), { size: 1.1 }));
  for (const [i, name] of [[0, "dX"], [1, "dY"], [2, "TOUCH"]]) {
    out.push(k.faceTextSvg(k.topMatrix([RAIL_MARGIN.x + 44, bandMid(i)], MARGIN_TOP, P, "y"), name, { size: 18, tone: "hi", anchor: "middle" }));
  }
  // one scale per band: the two displacement bands read +-40 px, and the touch
  // band is an event pen — one level for a contact, the other for none
  for (let i = 0; i < 3; i++) {
    const ticks = k.topTicks(bandMid(i) - 40, bandMid(i) + 40, 20, 2, RAIL_MARGIN.x + 4, MARGIN_TOP, [5, 10], P, "y");
    out.push(L(ticks.minor, { tone: "faint" }), L(ticks.major, { tone: "mid" }));
    const marks = i < 2 ? [[-40, "-40"], [0, "0"], [40, "40"]] : [[TAG_TOUCH, "1"], [TAG_IDLE, "0"]];
    for (const [v, label] of marks) {
      out.push(k.faceTextSvg(k.topMatrix([RAIL_MARGIN.x + 22, bandMid(i) + v], MARGIN_TOP, P, "y"), label, { size: 15, tone: "lo", anchor: "middle" }));
    }
  }
  out.push(L(k.lineOnTop([TAPE.x, bandY(1) - GAP / 2], [TAPE.x + TAPE.w, bandY(1) - GAP / 2], TAPE_TOP + 0.4, P), { tone: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------- the trays
function tray(plan, katch) {
  const out = [];
  out.push(S(k.slabOf(plan, TOP, 16, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.sideSeam(plan, TOP + 8, P, 8), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 9), 16, P, 8), { tone: "faint" }));
  const far = katch ? plan.x + plan.w - 16 : plan.x;
  out.push(S(k.slabOf({ x: far, y: plan.y, w: 16, d: plan.d, r: 4 }, 16, 96, P, 5, 1.4), { tone: "mid" }));
  for (const wy of [plan.y, plan.y + plan.d - 16]) {
    out.push(S(k.slabOf({ x: plan.x, y: wy, w: plan.w, d: 16, r: 4 }, 16, 96, P, 5, 1.4), { tone: "mid" }));
    out.push(L(k.planOutline({ x: plan.x, y: wy, w: plan.w, d: 16, r: 4 }, 112, P, 5), { tone: "faint" }));
    out.push(D([[plan.x + 22, wy + 8], [plan.x + plan.w - 22, wy + 8]].map(([x, y]) => at([x, y, 112])), { size: 1.2 }));
  }
  out.push(L(k.lineOnTop([far + 8, plan.y + 4], [far + 8, plan.y + plan.d - 4], 60, P), { tone: "faint", free: true }));
  const x0 = plan.x + 12, x1 = plan.x + plan.w - (katch ? 8 : 22);
  for (let i = 5; i >= 0; i--) {
    const wobble = i % 2 ? 9 : 0;
    const sheet = { x: x0 - wobble, y: plan.y + 26, w: x1 - x0 + wobble * 2, d: plan.d - 52, r: 2 };
    out.push(S(k.slabOf(sheet, 16 + i * 15, 5, P, 5, 0.8), { tone: i === 5 ? "hi" : "mid" }));
    out.push(L(k.planOutline(sheet, 21 + i * 15, P, 5), { tone: i === 5 ? "lo" : "faint" }));
  }
  out.push(D([[plan.x + 30, plan.y + 40], [plan.x + plan.w - 30, plan.y + 40], [plan.x + 30, plan.y + plan.d - 40], [plan.x + plan.w - 30, plan.y + plan.d - 40]].map(([x, y]) => at([x, y, 16])), { size: 1.1 }));
  return out.join("");
}

// ---------------------------------------------------------------- the tape
function tape() {
  const out = [];
  out.push(S(k.slabOf(TAPE, TAPE_Z, TAPE_H, P, 8, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideSeam(TAPE, TAPE_Z + 3, P, 8), { tone: "faint" }));
  for (let i = 0; i < 3; i++) {
    out.push(S(k.slabOf({ x: TAPE.x, y: bandY(i), w: TAPE.w, d: BAND_W, r: 2 }, TAPE_TOP - 0.6, 0.6, P, 5, 0), { tone: "hi", crease: "none", flat: true }));
    out.push(L(k.planOutline({ x: TAPE.x, y: bandY(i), w: TAPE.w, d: BAND_W, r: 2 }, TAPE_TOP + 0.2, P, 4), { tone: "faint" }));
  }
  out.push(L(k.planOutline(TAPE, TAPE_TOP, P, 8), { tone: "lo" }));
  for (const y of [bandY(1) - GAP / 2, bandY(2) - GAP / 2]) {
    out.push(L(k.lineOnTop([TAPE.x, y], [TAPE.x + TAPE.w, y], TAPE_TOP + 0.4, P), { tone: "mid" }));
  }
  return out.join("");
}

// ---------------------------------------------------------------- the chart head
function bridge() {
  const out = [];
  for (const cy of [-COL_Y, COL_Y]) {
    out.push(S(k.slabOf({ x: -44, y: cy - 34, w: 88, d: 68, r: 10 }, TOP, 14, P, 6, 1.6), { tone: "mid" }));
    out.push(S(k.slabOf({ x: -26, y: cy - 20, w: 52, d: 40, r: 6 }, 14, RAIL_Z - 14, P, 6, 1.4), { tone: "mid" }));
    out.push(L(k.planOutline({ x: -26, y: cy - 20, w: 52, d: 40, r: 6 }, 80, P, 6), { tone: "faint" }));
    out.push(L(k.sideSeam({ x: -26, y: cy - 20, w: 52, d: 40, r: 6 }, 46, P, 6), { tone: "faint" }));
    out.push(S(k.slabOf({ x: -34, y: cy - 26, w: 68, d: 52, r: 8 }, RAIL_Z - 14, 14, P, 6, 1.4), { tone: "mid" }));
    out.push(D(k.corners({ x: -34, y: cy - 26, w: 68, d: 52 }, 14).map(([x, y]) => at([x, y, RAIL_Z])), { size: 1.2 }));
  }
  // the rail: a beam along y with a guide rib on top
  out.push(S(k.slabOf({ x: -22, y: -COL_Y - 14, w: 44, d: (COL_Y + 14) * 2, r: 6 }, RAIL_Z, RAIL_H, P, 6, 1.4), { tone: "mid" }));
  out.push(L(k.sideSeam({ x: -22, y: -COL_Y - 14, w: 44, d: (COL_Y + 14) * 2, r: 6 }, RAIL_Z + 9, P, 6), { tone: "faint" }));
  out.push(S(k.slabOf({ x: -12, y: -COL_Y, w: 24, d: COL_Y * 2, r: 3 }, RAIL_Z + RAIL_H, 8, P, 4, 1), { tone: "mid" }));
  out.push(L(k.lineOnTop([0, -COL_Y + 10], [0, COL_Y - 10], RAIL_Z + RAIL_H + 8, P), { tone: "faint", free: true }));
  for (const cy of [-COL_Y + 40, COL_Y - 40]) out.push(D([[0, cy]].map(([x, y]) => at([x, y, RAIL_Z + RAIL_H + 8])), { size: 1.2 }));
  // the rack the governor's pinion runs on: teeth only where the carriage goes
  out.push(S(k.slabOf({ x: RACK_X, y: -COL_Y + 16, w: 10, d: (COL_Y - 16) * 2, r: 2 }, RACK_Z, RACK_H, P, 4, 1), { tone: "mid" }));
  const rack = [];
  for (let y = -168; y <= 168; y += 16) rack.push(k.lineOnTop([RACK_X + 10, y], [RACK_X + 10, y + 7], RACK_Z + RACK_H, P));
  out.push(L(rack.join(""), { tone: "lo", free: true }));
  return out.join("");
}

// one pen carriage, built around (0, 0) and set at its band's y each frame
function carriage(i, name) {
  const out = [];
  const body = { x: -30, y: -CAR_Y, w: 60, d: CAR_Y * 2, r: 5 };
  out.push(S(k.slabOf(body, CAR_Z, CAR_H, P, 6, 1.4), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(body, 7), CAR_TOP, P, 6), { tone: "faint" }));
  out.push(S(k.slabOf({ x: -20, y: -CAR_Y + 2, w: 40, d: CAR_Y * 2 - 4, r: 4 }, CAR_TOP, 7, P, 5, 1), { tone: "hi" }));
  out.push(L(k.sideSeam(body, CAR_Z + 10, P, 6), { tone: "faint" }));
  out.push(D(k.corners(body, 11).map(([x, y]) => at([x, y, CAR_TOP + 7])), { size: 1.1 }));
  // the pen: a barrel down to a nib on the tape, with a clamp collar
  out.push(S(k.cylinder(0, 0, 5, TAPE_TOP + 2, CAR_Z - TAPE_TOP - 2, P, 20, 0.6), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(0, 0, 9, TAPE_TOP + 26, 10, P, 22, 1), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, 2.6, TAPE_TOP, 3, P, 16), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, 8, CAR_Z - 8, 8, P, 22, 1), { tone: "hi" }));
  out.push(S(k.cylinder(20, 0, 5, CAR_TOP + 7, 9, P, 18), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 6, y: -7, w: 9, d: 14, r: 2 }, CAR_TOP + 7, 9, P, 4, 0.8), { tone: "mid" }));
  out.push(k.faceTextSvg(k.sideMatrix([0, CAR_Y], CAR_Z + 8, P, "left"), name, { size: 13, tone: "hi", anchor: "middle" }));
  return out.join("");
}

// the tape's printed grid, rebuilt each frame with the tape's travel, so the
// tape visibly runs under the pens.  Bare kit names only (inlined by toString()).
const grid = (offset) => {
  const first = Math.ceil((TAPE_X0 - offset) / 40) * 40 + offset;
  let d = "";
  for (let x = first; x < TAPE_X1; x += 40) d += onTop([[x, TAPE_Y0 + 3], [x, TAPE_Y1 - 3]], TAPE_TOP + 0.5, P);
  return `<path class="iso-line" data-tone="faint" data-free d="${d}"/>`;
};

// ---------------------------------------------------------------- the gate
// The comb: a bar over the far deck whose three posts hang into the path of the
// tappets' blades.  Slid one window across, its posts close over the tap and the
// long-press tappets and clear off the drag tappet.  The slide is fed through a
// slot and a ratchet, so what the comb travels is the path the finger has
// covered — not the offset it happens to be at when it lifts.
function comb() {
  const out = [];
  const body = { x: GATE_X - COMB_W / 2, y: COMB_Y0, w: COMB_W, d: COMB_LEN, r: 3 };
  out.push(S(k.slabOf(body, COMB_Z, COMB_H, P, 4, 1.6), { tone: "hi" }));
  out.push(L(k.planOutline(k.insetPlan(body, 5), COMB_Z + COMB_H, P, 4), { tone: "faint" }));
  out.push(L(k.sideSeam(body, COMB_Z + 8, P, 4), { tone: "faint" }));
  for (const [y0, y1] of COMB_POSTS) {
    const post = { x: body.x, y: y0, w: COMB_W, d: y1 - y0, r: 2 };
    out.push(S(k.slabOf(post, POST_Z, COMB_Z - POST_Z, P, 4, 1.2), { tone: "hi" }));
    out.push(L(k.sideSeam(post, POST_Z + 5, P, 4), { tone: "faint" }));
    out.push(D(k.corners(post, 6).map(([x, y]) => at([x, y, POST_Z])), { size: 1.1 }));
  }
  const teeth = [];
  for (let y = COMB_Y0 + 10; y < COMB_Y0 + COMB_LEN - 8; y += 6) teeth.push(segment([GATE_X + COMB_W / 2, y, COMB_Z + 2], [GATE_X + COMB_W / 2, y + 3, COMB_Z + 11], P));
  out.push(L(teeth.join(""), { tone: "lo", free: true }));
  const lug = { x: GATE_X - 10, y: COMB_Y0 + COMB_LEN, w: 20, d: 24, r: 3 };
  out.push(S(k.slabOf(lug, COMB_Z, 26, P, 4, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(lug, COMB_Z + 26, P, 4), { tone: "faint" }));
  out.push(L(k.sideSeam(lug, COMB_Z + 12, P, 4), { tone: "faint" }));
  out.push(L(k.planOutline({ x: lug.x + 6, y: lug.y + 4, w: 8, d: 16, r: 4 }, COMB_Z + 26, P, 6), { tone: "lo" }));
  return out.join("");
}

// the comb's own pawl: a plunger under the comb's rack, held up by the same
// release bar that lets the timer's detent off.  Without it the comb, and so the
// gate, would simply follow the pen carriage back.
function combPawl() {
  const out = [];
  const x = GATE_X + 38, y = DRAG_Y - 2;
  out.push(S(k.slabOf({ x: x - 20, y: y - 14, w: 40, d: 28, r: 5 }, TOP, 12, P, 5, 1.3), { tone: "mid" }));
  out.push(L(k.sideSeam({ x: x - 20, y: y - 14, w: 40, d: 28, r: 5 }, TOP + 6, P, 5), { tone: "faint" }));
  return out.join("");
}
function combPawlPlunger() {
  const x = GATE_X + 38, y = DRAG_Y - 2;
  const out = [];
  out.push(S(k.cylinder(x, y, 6, TOP + 10, 118, P, 16, 0.6), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 10, 44, 10, P, 20, 1), { tone: "hi" }));
  out.push(S(k.slabOf({ x: GATE_X + COMB_W / 2 - 2, y: y - 6, w: 40, d: 12, r: 2 }, 128, 9, P, 4, 1), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 9, 137, 6, P, 18, 0.8), { tone: "hi" }));
  return out.join("");
}

// ---------------------------------------------------------------- the governor
// On the X carriage: a pinion running on the rail's rack, so the governor turns
// with the finger.  The balls fly out with speed, the sleeve climbs, and the arm
// trips past its stop at 420 px/s.  The swipe is the one decision with no comb
// and no tappet, because its rule is a speed, not a distance.
function governorBase() {
  const out = [];
  out.push(S(k.slabOf({ x: GOV - 24, y: -22, w: 48, d: 44, r: 6 }, CAR_TOP, 7, P, 5, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline({ x: GOV - 18, y: -16, w: 36, d: 32, r: 4 }, CAR_TOP + 7, P, 5), { tone: "faint" }));
  out.push(S(k.cylinder(GOV, 0, 12, RACK_Z, RACK_H, P, 24, 1), { tone: "hi" }));
  out.push(L(k.knurl(GOV, 0, 12, RACK_Z + 1, RACK_Z + RACK_H - 1, 22, P, 0.4), { tone: "lo" }));
  out.push(L(k.ring(GOV, 0, 12, RACK_Z + RACK_H, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(GOV, 0, 5, RACK_Z + RACK_H, CAR_TOP - RACK_Z - RACK_H, P, 14), { tone: "mid" }));
  out.push(S(k.cylinder(GOV, 0, 6, CAR_TOP + 7, 20, P, 16), { tone: "mid" }));
  out.push(S(k.cylinder(GOV, 44, 6, CAR_TOP + 7, 11, P, 18, 0.8), { tone: "mid" }));
  out.push(L(k.ring(GOV, 44, 6, CAR_TOP + 18, P, 18), { tone: "faint" }));
  return out.join("");
}

// the governor's live half, rebuilt each frame.  Bare kit names only (inlined).
const governorLive = (speed, rise, swing) => {
  const radius = 16 + Math.min(speed, 700) * 0.031;
  const arm = turnPlan([[GOV - 5, 4], [GOV + 5, 4], [GOV + 5, 46], [GOV - 5, 46]], GOV, 0, swing);
  const out = [];
  out.push(solidSvg(cylinder(GOV, 0, 11, CAR_TOP + 14 + rise, 12, P, 20, 1), { tone: "hi" }));
  out.push(solidSvg(extrude(barRing(GOV - radius, 0, GOV + radius, 0, 4), CAR_TOP + 26, 6, P, { convex: true, bevel: 1 }), { tone: "hi" }));
  out.push(solidSvg(cylinder(GOV - radius, 0, 9, CAR_TOP + 26, 18, P, 22, 1), { tone: "hi" }));
  out.push(solidSvg(cylinder(GOV + radius, 0, 9, CAR_TOP + 26, 18, P, 22, 1), { tone: "hi" }));
  out.push(solidSvg(extrude(arm, CAR_TOP + 30, 6, P, { convex: true, bevel: 1 }), { tone: "hi" }));
  out.push(solidSvg(cylinder(GOV, 40, 5, CAR_TOP + 30, 8, P, 16), { tone: "hi" }));
  return out.join("");
};

// ---------------------------------------------------------------- the front deck
// The slot turret: eleven chambers, one per ABS_MT_SLOT, with a raised index
// flag the frame slides onto whichever slot is holding the live contact.
function turret() {
  const out = [];
  out.push(S(k.cylinder(TUR.x, TUR.y, TUR_R, TOP, TUR_TOP, P, 56, 2), { tone: "mid" }));
  out.push(L(k.ring(TUR.x, TUR.y, TUR_R - 6, TUR_TOP, P, 56), { tone: "faint" }));
  out.push(L(k.sideSeam({ x: TUR.x - TUR_R, y: TUR.y - TUR_R, w: TUR_R * 2, d: TUR_R * 2, r: TUR_R }, 22, P, 40), { tone: "faint" }));
  out.push(L(k.ring(TUR.x, TUR.y, TUR_R, 40, P, 48), { tone: "faint" }));
  out.push(L(k.ring(TUR.x, TUR.y, TUR_R, TUR_TOP - 8, P, 48), { tone: "faint" }));
  out.push(L(k.knurl(TUR.x, TUR.y, TUR_R, 40, TUR_TOP - 8, 48, P, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(TUR.x, TUR.y, 30, TUR_TOP, 12, P, 32, 1.4), { tone: "mid" }));
  out.push(L(k.ring(TUR.x, TUR.y, 30, TUR_TOP + 12, P, 32), { tone: "faint" }));
  for (let i = 0; i < SLOTS; i++) {
    const [cx, cy] = slotAt(i);
    const pocket = turnPlan([[cx - 11, cy - 14], [cx + 11, cy - 14], [cx + 11, cy + 14], [cx - 11, cy + 14]], cx, cy, (i / SLOTS) * 360);
    out.push(S(k.extrude(pocket, TUR_TOP, 4, P, { convex: true }), { tone: "hi", crease: "none" }));
    out.push(L(k.onTop(pocket, TUR_TOP + 4, P, true), { tone: "faint" }));
    out.push(L(k.onTop(turnPlan([[cx - 11, cy + 10], [cx + 11, cy + 10]], cx, cy, (i / SLOTS) * 360), TUR_TOP + 4, P), { tone: "lo" }));
    out.push(k.faceTextSvg(k.topMatrix([cx, cy + 2], TUR_TOP + 4, P, "x"), String(i), { size: 15, tone: "hi", anchor: "middle" }));
  }
  out.push(k.faceTextSvg(k.topMatrix([TUR.x, TUR.y + 30], TUR_TOP + 12, P, "x"), "SLOT", { size: 20, tone: "hi", anchor: "middle" }));
  return out.join("");
}

// the index flag: the one lit accent in the whole figure — a post through the
// turret's top plate with a blade on it, slid onto the live slot each frame
const flagSolid = (x, y, z, h) => solidSvg(cylinder(x, y + 12, 4.5, z - 30, h + 30, P, 14), { tone: "hi", lit: true })
  + solidSvg(slabOf({ x: x - 13, y: y + 12, w: 26, d: 9, r: 2 }, z, h, P, 4, 1), { tone: "hi", lit: true });

// the name plate and its four verdict telltales, which pop up as they latch
function plate() {
  const out = [];
  out.push(S(k.slabOf(PLATE, TOP, 8, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 7), 8, P, 8), { tone: "faint" }));
  out.push(L(k.sideSeam(PLATE, TOP + 4, P, 8), { tone: "faint" }));
  out.push(D(k.corners(PLATE, 14).map(([x, y]) => at([x, y, 8])), { size: 1.2 }));
  out.push(k.faceTextSvg(k.topMatrix([PLATE.x + 26, PLATE.y + 24], 8, P, "x"), "THE CONTACT TRACKER", { size: 23, tone: "hi" }));
  out.push(L(k.lineOnTop([PLATE.x + 26, PLATE.y + 34], [PLATE.x + PLATE.w - 26, PLATE.y + 34], 8, P), { tone: "lo", free: true }));
  out.push(k.faceTextSvg(k.topMatrix([PLATE.x + 26, PLATE.y + 58], 8, P, "x"), "MT-B · 11 slots · cyttsp4_mt · /dev/input/event1", { size: 13, tone: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([PLATE.x + 26, PLATE.y + 82], 8, P, "x"), "touch 1072 × 1448 · no pressure · no contact size", { size: 13, tone: "lo" }));
  const names = ["TAP", "LONG", "DRAG", "SWIPE"];
  names.forEach((name, i) => {
    const x = PLATE.x + 40 + i * 122;
    out.push(S(k.cylinder(x, PLATE.y + 118, 9, 8, 3, P, 18, 0.6), { tone: "lo" }));
    out.push(k.faceTextSvg(k.topMatrix([x + 16, PLATE.y + 118], 8, P, "x"), name, { size: 14, tone: "hi" }));
  });
  return out.join("");
}
function telltale(i) {
  const x = PLATE.x + 40 + i * 122;
  return S(k.cylinder(x, PLATE.y + 118, 7, 11, 7, P, 18, 1), { tone: "hi" })
    + L(k.ring(x, PLATE.y + 118, 7, 18, P, 18), { tone: "faint" });
}

// the frame counter: how many SYN_REPORTs have closed a packet set so far
function counter() {
  const out = [];
  out.push(S(k.slabOf(COUNTER, TOP, COUNTER_Z, P, 8, 2), { tone: "mid" }));
  out.push(L(k.sideSeam(COUNTER, TOP + 14, P, 8), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(COUNTER, 10), COUNTER_Z, P, 8), { tone: "faint" }));
  const win = { x: COUNTER.x + 16, y: COUNTER.y + 14, w: COUNTER.w - 32, d: 58, r: 3 };
  out.push(S(k.slabOf(win, COUNTER_Z, 4, P, 6, 0.8), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(win, COUNTER_Z + 4, P, 6), { tone: "mid" }));
  for (let i = 0; i < 6; i++) {
    const x = win.x + 6 + i * 27;
    out.push(S(k.slabOf({ x, y: win.y + 6, w: 21, d: win.d - 12, r: 3 }, COUNTER_Z + 4, 2, P, 4, 0.6), { tone: "lo", crease: "none", flat: true }));
    out.push(L(k.planOutline({ x, y: win.y + 6, w: 21, d: win.d - 12, r: 3 }, COUNTER_Z + 6, P, 4), { tone: "faint" }));
  }
  out.push(k.faceTextSvg(k.topMatrix([COUNTER.x + COUNTER.w / 2, COUNTER.y + 96], COUNTER_Z + 6, P, "x"), "SYN_REPORT", { size: 17, tone: "lo", anchor: "middle" }));
  out.push(D(k.corners(COUNTER, 20).map(([x, y]) => at([x, y, COUNTER_Z])), { size: 1.2 }));
  return out.join("");
}

// ---------------------------------------------------------------- the model
// The deck is the chapter's recogniser made of metal (§5.4).  A contact is a slot
// holding one tracking id and one position; the deck integrates the path it
// covers, clocks its life, and measures its speed.  Four readings come off those
// numbers: the comb's slide (the path, taken up through a slot and a ratchet),
// the tap cam's read at 250 ms, the long cam's read at 500 ms, and the
// governor's trip at 420 px/s.  Plain numbers and bare kit names only, so the
// very same code runs here — to bake the first frame of the tour into the static
// SVG — and in the page.
const TOUR = [
  { slot: 0, id: 4021, kind: "still", live: 140, tail: 900 },   // a tap
  { slot: 1, id: 4022, kind: "pan", live: 620, tail: 900 },     // a drag
  { slot: 2, id: 4023, kind: "hold", live: 760, tail: 900 },    // a long press
  { slot: 3, id: 4024, kind: "fling", live: 240, tail: 900 },   // a swipe
];
const TOUR_GAP = 900, PRE = 3800, SLIDE_TAU = 0.018, V_TAU = 0.09, LIFT_TAU = 0.05;
const MAX_AGE = ((TAPE_X1 - 2 - PEN_X) / SPEED) * 1000;

// the tour's hand: the displacement the finger has made since it went down
const handAt = (entry, t) => {
  if (entry.kind === "pan") { const u = Math.min(t, 260); return [u * (40 / 260), u * (-8 / 260)]; }
  if (entry.kind === "fling") { const u = Math.min(t, 200); return [u, u * 0.02]; }
  if (entry.kind === "hold") return [Math.sin((t / 2000) * Math.PI * 2) * 4, 0];
  return [0, 0];
};

// how much of a lobe is bearing on its follower, 0..1.  It is full only as the
// lobe's offset swings round to point at the follower, which is what makes the
// peak of the cam the instant of the read: 250 ms on the tap cam, 500 ms on the
// long cam, at one revolution a second.
const camCover = (theta, peak) => {
  const a = ((theta - peak) * Math.PI) / 180;
  const e = Math.hypot(FOLLOW_R - LOBE_OFF * Math.cos(a), LOBE_OFF * Math.sin(a));
  return Math.min(1, Math.max(0, (LOBE_R + ROD_R - e) / ROD_R));
};

const newDeck = () => ({
  manual: false, step: 0, epT: 0, elapsed: 0,
  live: false, slot: 0, id: 0,
  x: 0, y: 0, px: 0, py: 0, downX: 0, downY: 0,
  dx: 0, dy: 0, path: 0, age: 0, lifeAge: 0,
  vx: 0, vy: 0, speed: 0, theta: 0, epoch: 0, tag: 0, bar: 0,
  slide: 0, open: false, hitTap: false, hitLong: false,
  rise: [0, 0, 0], verdict: [false, false, false, false],
  reports: 0, samples: [],
});

// a BEGIN: the driver opens a packet set, the slot takes an id, the clock starts
const deckBegin = (d, x, y) => {
  d.live = true;
  d.x = d.px = d.downX = x;
  d.y = d.py = d.downY = y;
  d.dx = 0; d.dy = 0; d.path = 0; d.age = 0; d.lifeAge = 0;
  d.epoch = 0; d.theta = 0; d.open = false; d.hitTap = false; d.hitLong = false;
  d.reports += 1;
};

// the lift: the tracking id goes back to -1 and the three release-time verdicts
// are read — a tap is a release after the tap cam never got home, a swipe is a
// release above 420 px/s, and the long press has already latched off its cam
const deckEnd = (d) => {
  d.live = false;
  d.lifeAge = d.age;
  d.reports += 1;
  if (!d.hitTap && !d.open) d.verdict[0] = true;
  if (d.hitLong) d.verdict[1] = true;
  if (d.speed >= V_SWIPE) d.verdict[3] = true;
};

const deckStep = (d, dt) => {
  const ms = dt * 1000;
  d.elapsed += ms;

  // 1. the hand: the tour plays itself until the reader takes the deck over
  if (d.manual) {
    if (d.pressed && !d.live) deckBegin(d, d.x, d.y);
    else if (!d.pressed && d.live) deckEnd(d);
  } else {
    const span = TOUR[d.step].live + TOUR[d.step].tail + (d.step === TOUR.length - 1 ? TOUR_GAP : 0);
    d.epT += ms;
    if (d.epT >= span) { d.epT -= span; d.step = (d.step + 1) % TOUR.length; }
    const entry = TOUR[d.step];
    d.slot = entry.slot; d.id = entry.id;
    const [mx, my] = handAt(entry, d.epT);
    if (d.epT < entry.live && !d.live) deckBegin(d, mx, my);
    else if (d.epT < entry.live) { d.x = mx; d.y = my; }
    else if (d.live) deckEnd(d);
  }

  // 2. the motion, the path, the clock, the tachometer
  const reach = 1 - Math.exp(-dt / V_TAU);
  if (d.live) {
    d.path += Math.hypot(d.x - d.px, d.y - d.py);
    d.dx = d.x - d.downX; d.dy = d.y - d.downY;
    d.vx += ((d.x - d.px) / dt - d.vx) * reach;
    d.vy += ((d.y - d.py) / dt - d.vy) * reach;
    d.age += ms; d.lifeAge = d.age; d.epoch = d.age;
    d.theta = (d.theta + (360 * ms) / TURN) % 360;
    d.reports += 1;
  } else {
    d.dx = 0; d.dy = 0;
    d.vx -= d.vx * reach; d.vy -= d.vy * reach;
    d.epoch = Math.min(d.lifeAge + EPOCH, d.epoch + ms);
  }
  d.speed = Math.hypot(d.vx, d.vy);
  d.px = d.x; d.py = d.y;

  // 3. the four readings off the gate, the cams and the tachometer
  const covTap = camCover(d.theta, CAM_PEAKS[0]);
  const covLong = camCover(d.theta, CAM_PEAKS[1]);
  if (d.live && !d.open && covTap >= 0.995) d.hitTap = true;
  if (d.live && !d.open && covLong >= 0.995) d.hitLong = true;
  if (d.path >= D_SLOP) d.open = true;
  if (d.open) d.verdict[2] = true;
  const want = d.open ? COMB_SLIDE : Math.min(COMB_SLIDE, d.path);
  d.slide += (want - d.slide) * (1 - Math.exp(-dt / SLIDE_TAU));
  const rise = 1 - Math.exp(-dt / LIFT_TAU);
  d.rise[0] += ((d.open ? LIFT_BLOCK : covTap * LIFT_FREE) - d.rise[0]) * rise;
  d.rise[1] += ((d.open ? LIFT_BLOCK : covLong * LIFT_FREE) - d.rise[1]) * rise;
  d.rise[2] += ((d.open ? LIFT_FREE : LIFT_BLOCK) - d.rise[2]) * rise;
  d.tag += ((d.live ? 1 : 0) - d.tag) * (1 - Math.exp(-dt / 0.06));
  d.bar += ((d.live ? 9 : 0) - d.bar) * rise;

  // 4. the tape: one sample a frame, and every sample ages out to the take-up
  d.samples.push({ age: 0, dx: d.dx, dy: d.dy, touch: d.live });
  for (const s of d.samples) s.age += ms;
  while (d.samples.length && (d.samples[0].age > MAX_AGE || d.samples.length > 400)) d.samples.shift();
};

// every moving part's transform, from the model.  Bare kit names only.
const poseTransforms = (d) => {
  const lobe = (peak) => {
    const a = ((d.theta - peak) * Math.PI) / 180;
    return [LOBE_OFF * (Math.cos(a) - 1), LOBE_OFF * Math.sin(a), 0];
  };
  const out = {
    carriage0: translateAlong(P, [0, bandMid(0) + d.dx, 0]),
    carriage1: translateAlong(P, [0, bandMid(1) + d.dy, 0]),
    carriage2: translateAlong(P, [0, bandMid(2) + TAG_TOUCH + (TAG_IDLE - TAG_TOUCH) * (1 - d.tag), 0]),
    "cam-tap": translateAlong(P, lobe(CAM_PEAKS[0])),
    "cam-long": translateAlong(P, lobe(CAM_PEAKS[1])),
    "p-tap": translateAlong(P, [0, 0, d.rise[0]]),
    "p-long": translateAlong(P, [0, 0, d.rise[1]]),
    "p-drag": translateAlong(P, [0, 0, d.rise[2]]),
    comb: translateAlong(P, [0, -d.slide, 0]),
    bar: translateAlong(P, [0, 0, d.bar]),
    pointer: translateAlong(P, [0, 0, EPOCH_Z0 + d.epoch * EPOCH_K]),
  };
  const home = slotAt(0), here = slotAt(d.slot);
  out.flag = translateAlong(P, [here[0] - home[0], here[1] - home[1], 0]);
  out.grid = grid(d.elapsed * 0.12);
  out.gov = translateAlong(P, [0, bandMid(0) + d.dx, 0]);
  for (let i = 0; i < 4; i++) out["tell" + i] = translateAlong(P, [0, 0, d.verdict[i] ? 7 : 0]);
  return out;
};

const deckBoot = (d, ms) => {
  const n = Math.round(ms / (1000 / 60));
  for (let i = 0; i < n; i++) deckStep(d, 1 / 60);
  return d;
};

const readout = (d) => {
  const names = ["tap", "long", "drag", "swipe"];
  const hit = names.filter((name, i) => d.verdict[i]);
  const who = d.live ? "slot " + d.slot + " · id " + d.id : "no contact · slot " + d.slot;
  return who + " · " + Math.round(d.age) + " ms · dx " + Math.round(d.dx) + " dy " + Math.round(d.dy) +
    " · path " + Math.round(d.path) + " · " + (hit.length ? hit.join(" ") : "no verdict");
};

const st0 = deckBoot(newDeck(), PRE);
const T0 = poseTransforms(st0);
const govBoot = (d) => governorLive(d.speed, Math.min(1, d.speed / 700), SWING_REST + TRIP_V * Math.min(1, d.speed / V_SWIPE));

// ---------------------------------------------------------------- assemble
const svgBody = [
  bed(),
  `<g data-part="traySup">${tray(SUP, false)}</g>`,
  `<g data-part="trayTak">${tray(TAK, true)}</g>`,
  platen(),
  tape(),
  `<g data-part="grid" transform="${T0.grid}">${grid(0)}</g>`,
  `<g data-part="traces">${traceSvg(st0.samples)}</g>`,
  tappet(TAP_Y, "cam"),
  tappet(LONG_Y, "cam"),
  tappet(DRAG_Y, "spring"),
  timer(),
  `<g data-part="bar" transform="${T0.bar}">${releaseBar()}</g>`,
  `<g data-part="p-tap" transform="${T0["p-tap"]}">${plunger(TAP_Y, "cam")}</g>`,
  `<g data-part="p-long" transform="${T0["p-long"]}">${plunger(LONG_Y, "cam")}</g>`,
  `<g data-part="p-drag" transform="${T0["p-drag"]}">${plunger(DRAG_Y, "spring")}</g>`,
  `<g data-part="cam-tap" transform="${T0["cam-tap"]}">${lobeSvg(GATE_X - CAM_SHAFT, TAP_Y, CAM_Z + CAM_H)}</g>`,
  `<g data-part="cam-long" transform="${T0["cam-long"]}">${lobeSvg(GATE_X - CAM_SHAFT, LONG_Y, CAM_Z + CAM_H)}</g>`,
  combPawl(),
  `<g data-part="p-pawl" transform="${T0.bar}">${combPawlPlunger()}</g>`,
  `<g data-part="comb" transform="${T0.comb}">${comb()}</g>`,
  `<g data-part="epoch">${epochColumn()}</g>`,
  bridge(),
  `<g data-part="carriage0" transform="${T0.carriage0}">${carriage(0, "dX")}</g>`,
  `<g data-part="carriage1" transform="${T0.carriage1}">${carriage(1, "dY")}</g>`,
  `<g data-part="carriage2" transform="${T0.carriage2}">${carriage(2, "TOUCH")}</g>`,
  `<g data-part="gov0" transform="${T0.gov}">${governorBase()}</g>`,
  `<g data-part="govArm" transform="${T0.gov}">${govBoot(st0)}</g>`,
  `<g data-part="pointer" transform="${T0.pointer}">${epochPointer()}</g>`,
  `<g data-part="turret">${turret()}</g>`,
  `<g data-part="plate">${plate()}</g>`,
  ...st0.verdict.map((hit, i) => `<g data-part="tell${i}" transform="${T0[`tell${i}`]}" opacity="${hit ? 1 : 0.2}">${telltale(i)}</g>`),
  `<g data-part="counter">${counter()}</g>`,
  `<g data-part="count">${k.faceTextSvg(k.topMatrix([COUNTER.x + COUNTER.w / 2, COUNTER.y + 46], COUNTER_Z + 6, P, "x"), String(st0.reports).padStart(6, "0"), { size: 34, tone: "hi", anchor: "middle" })}</g>`,
  `<g data-part="flag" transform="${T0.flag}">${flagSolid(slotAt(0)[0], slotAt(0)[1], TUR_TOP + 12, 4)}</g>`,
];

const LABEL =
  "A strip-chart recorder reading a live touch contact off /dev/input/event1. " +
  "The tape runs left to right under a rail that carries three pen carriages, one per channel: " +
  "the displacement in X, the displacement in Y, and BTN_TOUCH. " +
  "Behind the tape a comb of three posts slides one 16-unit step across, taken up from the path the finger has covered through a slot and a ratchet, and it gates three tappets: a tap tappet and a long-press tappet that ride face cams turned by a one-revolution timer, and a spring tappet that is held down by the comb and thrown up the moment the gate opens. " +
  "A vertical epoch scale beside the timer carries a pointer through the contact's life and 620 milliseconds past the lift, marked where the two cams read. " +
  "On the X carriage a governor, driven through a pinion off the rail's rack, lets its fly-balls out and swings its arm past a stop at 420 pixels a second: that is the swipe, the one decision with no comb. " +
  "A slot turret carries eleven chambers with a lit flag on the live one, a counter counts the SYN_REPORTs that have closed a packet set, and four telltales on the name plate latch whichever verdicts have fired.";

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody });

// one tappet's fixed half: its foot on the deck, the guide column, the bushing
// the plunger slides in, and — for a cam tappet — the shaft, pulley, face cam
// and its belt.  The blade and everything above the bushing belongs to the
// plunger, which the frame translates up by whatever the tappet is reading.
function tappet(y, kind) {
  const out = [];
  const foot = { x: GATE_X - 26, y: y - 12, w: 52, d: 24, r: 5 };
  out.push(S(k.slabOf(foot, TOP, 12, P, 6, 1.3), { tone: "mid" }));
  out.push(L(k.sideSeam(foot, TOP + 6, P, 6), { tone: "faint" }));
  out.push(D(k.corners(foot, 6).map(([x, a]) => at([x, a, 12])), { size: 1.1 }));
  out.push(S(k.slabOf({ x: GATE_X + 22, y: y - 8, w: 12, d: 16, r: 2 }, TOP, 82, P, 4, 1), { tone: "mid" }));
  out.push(S(k.slabOf({ x: GATE_X + 10, y: y - 7, w: 24, d: 14, r: 2 }, 82, 10, P, 4, 1), { tone: "mid" }));
  out.push(S(k.cylinder(GATE_X, y, 10, 82, 10, P, 20, 0.8), { tone: "mid" }));
  out.push(L(k.ring(GATE_X, y, 10, 92, P, 20), { tone: "faint" }));
  out.push(L(k.ring(GATE_X, y, 14, 88, P, 20), { tone: "faint" }));
  if (kind === "cam") {
    const sx = GATE_X - CAM_SHAFT;
    out.push(S(k.cylinder(sx, y, 7, 12, CAM_Z - 12, P, 16), { tone: "mid" }));
    out.push(S(k.cylinder(sx, y, PULLEY_R, 24, 8, P, 26, 0.8), { tone: "mid" }));
    out.push(L(k.knurl(sx, y, PULLEY_R, 25, 31, 36, P, 0.4), { tone: "lo" }));
    out.push(S(k.cylinder(sx, y, CAM_R, CAM_Z, CAM_H, P, 30, 1.4), { tone: "hi" }));
    out.push(L(k.ring(sx, y, CAM_R - 4, CAM_Z + CAM_H, P, 30), { tone: "faint" }));
    out.push(L(k.ring(sx, y, 7, CAM_Z + CAM_H, P, 16), { tone: "faint" }));
  } else {
    // a spring tappet: the coil the plunger's collar rides, and nothing else
    for (let z = 16; z <= 36; z += 10) out.push(L(k.ring(GATE_X, y, 12, z, P, 20), { tone: "faint" }));
  }
  return out.join("");
}

// the moving half, drawn at home; the frame translates it up by its reading.  A
// cam plunger's strikers sit at the lobe's own height, so the cam and the blade
// share one shaft line; a spring plunger is thrown up the moment its gate opens.
function plunger(y, kind) {
  const out = [];
  const low = kind === "cam" ? CAM_Z + CAM_H : 14;
  out.push(S(k.cylinder(GATE_X, y, ROD_R, low, BLADE_Z - low, P, 16, 0.6), { tone: "hi" }));
  out.push(S(k.slabOf({ x: GATE_X - 15, y: y - BLADE_R, w: 30, d: BLADE_R * 2, r: 2 }, BLADE_Z, BLADE_H, P, 4, 1), { tone: "hi" }));
  out.push(L(k.planOutline({ x: GATE_X - 12, y: y - 4, w: 24, d: 8, r: 1 }, BLADE_Z + BLADE_H, P, 4), { tone: "faint" }));
  if (kind === "cam") {
    out.push(S(k.cylinder(GATE_X, y, 9, CAM_Z + CAM_H, 12, P, 20, 1), { tone: "hi" }));
    out.push(L(k.ring(GATE_X, y, 9, CAM_Z + CAM_H + 12, P, 20), { tone: "faint" }));
  } else {
    out.push(S(k.cylinder(GATE_X, y, 11, 46, 12, P, 22, 1), { tone: "hi" }));
    out.push(L(k.ring(GATE_X, y, 11, 58, P, 22), { tone: "faint" }));
  }
  return out.join("");
}

// The face cam's lobe, riding LOBE_OFF out from the shaft: one solid in a group
// the frame translates, so the lobe visibly walks round under its follower.
function lobeSvg(sx, y, z) {
  return solidSvg(cylinder(sx + LOBE_OFF, y, LOBE_R, z, LOBE_H, P, 26, 1), { tone: "hi" });
}

// ---------------------------------------------------------------- the timer
// One motor makes one revolution a second while a contact is alive.  Its pulley
// carries two belts to the two cams (equal pulleys, so both cams hold the same
// second) and a detent wheel that the release solenoid holds home between them.
function belt(ax, ay, bx, by) {
  const outer = beltRing(ax, ay, bx, by, 24);
  const inner = beltRing(ax, ay, bx, by, 20);
  return S(k.extrude([...outer, ...[...inner].reverse()], 24, 8, P, { convex: false }), { tone: "mid", crease: "none" })
    + L(k.onTop(outer, 32, P, true), { tone: "faint" })
    + L(k.onTop(inner, 32, P, true), { tone: "faint" });
}

function timer() {
  const out = [];
  const { x: mx, y: my } = MOTOR;
  out.push(S(k.cylinder(mx, my, MOTOR_R, TOP, 22, P, 30, 1.6), { tone: "mid" }));
  out.push(L(k.knurl(mx, my, MOTOR_R, TOP + 2, 18, 26, P, 0.5), { tone: "lo" }));
  out.push(L(k.sideArc(mx, my, MOTOR_R, 11, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(mx, my, 7, 20, 36, P, 16), { tone: "mid" }));
  out.push(S(k.cylinder(mx, my, PULLEY_R, 24, 8, P, 26, 0.8), { tone: "hi" }));
  out.push(L(k.knurl(mx, my, PULLEY_R, 25, 31, 36, P, 0.4), { tone: "lo" }));
  out.push(belt(mx, my, GATE_X - CAM_SHAFT, TAP_Y));
  out.push(belt(mx, my, GATE_X - CAM_SHAFT, LONG_Y));
  out.push(k.faceTextSvg(k.topMatrix([mx, my + 6], 22, P, "x"), "1 rev/s", { size: 19, tone: "lo", anchor: "middle" }));
  // the detent wheel the pawl drops into, and the solenoid that lifts the pawl
  out.push(S(k.cylinder(mx, my, 14, 46, 8, P, 24, 0.8), { tone: "mid" }));
  out.push(L(k.radialTicks(mx, my, 14, 12, 1, 54, [3, 3], P).major, { tone: "lo" }));
  out.push(S(k.cylinder(mx + 66, my, 13, TOP, 40, P, 22, 1.2), { tone: "mid" }));
  out.push(L(k.knurl(mx + 66, my, 13, TOP + 2, 36, 20, P, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(mx + 66, my, 6, 40, 8, P, 16), { tone: "hi" }));
  out.push(L(k.ring(mx + 66, my, 6, 48, P, 16), { tone: "faint" }));
  return out.join("");
}

// the release bar: one rigid link in a group the frame lifts.  The solenoid
// pushes its east end up, its west end carries the tooth out of the timer's
// detent wheel, and its south arm lifts the comb's ratchet pawl.  One solenoid,
// energised while a contact is alive, because that is exactly what both need.
function releaseBar() {
  const out = [];
  out.push(S(k.extrude(barRing(MOTOR.x + 62, MOTOR.y, 232, MOTOR.y, 5), 50, 8, P, { convex: true, bevel: 1 }), { tone: "mid" }));
  out.push(S(k.extrude(barRing(BAR[2], BAR[3], BAR[0], BAR[1], 5), 50, 8, P, { convex: true, bevel: 1 }), { tone: "mid" }));
  out.push(L(k.onTop(barRing(BAR[2], BAR[3], BAR[0], BAR[1], 5), 58, P, true), { tone: "faint" }));
  out.push(S(k.slabOf({ x: 232, y: MOTOR.y - 6, w: 13, d: 12, r: 2 }, 42, 8, P, 4, 1), { tone: "hi" }));
  out.push(S(k.cylinder(BAR[0], BAR[1], 9, 58, 8, P, 18), { tone: "hi" }));
  return out.join("");
}

// ---------------------------------------------------------------- the clock
// A vertical scale for the contact's life: the tap cam reads at 250 ms, the long
// cam at 500 ms, and the pointer shows where the epoch has got to.  The epoch
// runs for the contact's whole life and then EPOCH ms on past the lift, so the
// scale has to cover 1500 ms.
function epochColumn() {
  const out = [];
  const plan = { x: -186, y: -404, w: 72, d: 48, r: 4 };
  const body = { x: plan.x + 10, y: plan.y + 8, w: 36, d: 18, r: 2 };
  out.push(S(k.slabOf(plan, TOP, 12, P, 6, 1.4), { tone: "mid" }));
  out.push(S(k.slabOf(body, EPOCH_Z0, EPOCH_MS * EPOCH_K, P, 4, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(body, EPOCH_Z0 + EPOCH_MS * EPOCH_K, P, 4), { tone: "faint" }));
  out.push(L(k.sideSeam(body, 70, P, 4), { tone: "faint" }));
  const face = body.y + body.d;
  // the graduations are cut into the column's face rather than drawn on it, so
  // they are notches: a slab a touch proud of the face, wider at every 500 ms
  for (let ms = 0; ms <= EPOCH_MS; ms += 100) {
    const z = EPOCH_Z0 + ms * EPOCH_K;
    const major = ms % 500 === 0;
    const notch = { x: body.x + body.w - 5 - (major ? 30 : 18), y: face - 4, w: major ? 30 : 18, d: 7, r: 1 };
    out.push(S(k.slabOf(notch, z - 2.6, 5.2, P, 3, 0.6), { tone: major ? "hi" : "mid" }));
    out.push(L(k.planOutline(notch, z - 2.6, P, 3), { tone: "faint" }));
  }
  for (const [ms, label] of [[T_CLICK, "250"], [T_LONG, "500"], [EPOCH_MS, "1500"]]) {
    out.push(k.faceTextSvg(k.sideMatrix([body.x + body.w + 12, face + 0.5], EPOCH_Z0 + ms * EPOCH_K - 5, P, "left"), label, { size: 15, tone: "lo" }));
  }
  out.push(k.faceTextSvg(k.topMatrix([plan.x + 8, plan.y + 46], 12, P, "x"), "EPOCH ms", { size: 13, tone: "hi" }));
  return out.join("");
}

// the pointer that climbs that scale, one plate in a group the frame translates
function epochPointer() {
  return S(k.slabOf({ x: -178, y: -398, w: 36, d: 24, r: 3 }, 0, 9, P, 5, 1.2), { tone: "hi" })
    + S(k.slabOf({ x: -204, y: -396, w: 26, d: 20, r: 2 }, 2, 7, P, 5, 0.8), { tone: "hi" })
    + L(k.planOutline({ x: -178, y: -398, w: 36, d: 24, r: 3 }, 9, P, 5), { tone: "faint" });
}

// ---------------------------------------------------------------- the page
// One script, the same model: it boots the deck to the same 3.8 s of tour the
// static SVG was baked from, then drives every moving part from the state.
const live = `
const P = ${JSON.stringify(P)};
const VIEW_W = ${WIDTH}, VIEW_H = ${HEIGHT}, PLATEN_TOP = ${PLATEN_TOP};
const TAPE_TOP = ${TAPE_TOP}, TAPE_X0 = ${TAPE_X0}, TAPE_X1 = ${TAPE_X1};
const TAPE_Y0 = ${TAPE_Y0}, TAPE_Y1 = ${TAPE_Y1};
const PEN_X = ${PEN_X}, SPEED = ${SPEED}, SLOTS = ${SLOTS}, TUR = ${JSON.stringify(TUR)};
const BAND_W = ${BAND_W}, GAP = ${GAP};
const D_SLOP = ${D_SLOP}, TURN = ${TURN}, EPOCH = ${EPOCH}, V_SWIPE = ${V_SWIPE};
const LOBE_OFF = ${LOBE_OFF}, LOBE_R = ${LOBE_R}, ROD_R = ${ROD_R}, FOLLOW_R = ${FOLLOW_R};
const CAM_PEAKS = ${JSON.stringify(CAM_PEAKS)};
const COMB_SLIDE = ${COMB_SLIDE}, LIFT_FREE = ${LIFT_FREE}, LIFT_BLOCK = ${LIFT_BLOCK};
const EPOCH_Z0 = ${EPOCH_Z0}, EPOCH_K = ${EPOCH_K};
const TAG_TOUCH = ${TAG_TOUCH}, TAG_IDLE = ${TAG_IDLE};
const GOV = ${GOV}, CAR_TOP = ${CAR_TOP}, TRIP_V = ${TRIP_V}, SWING_REST = ${SWING_REST};
const TOUR = ${JSON.stringify(TOUR)}, TOUR_GAP = ${TOUR_GAP}, PRE = ${PRE};
const SLIDE_TAU = ${SLIDE_TAU}, V_TAU = ${V_TAU}, LIFT_TAU = ${LIFT_TAU};
const MAX_AGE = ${MAX_AGE}, STEP_MS = 1000 / 60, BACK_OFF = 6000;

const bandY = ${bandY.toString()};
const bandMid = ${bandMid.toString()};
const turnPlan = ${turnPlan.toString()};
const barRing = ${barRing.toString()};
const slotAt = ${slotAt.toString()};
const grid = ${grid.toString()};
const traceSvg = ${traceSvg.toString()};
const handAt = ${handAt.toString()};
const camCover = ${camCover.toString()};
const newDeck = ${newDeck.toString()};
const deckBegin = ${deckBegin.toString()};
const deckEnd = ${deckEnd.toString()};
const deckStep = ${deckStep.toString()};
const deckBoot = ${deckBoot.toString()};
const poseTransforms = ${poseTransforms.toString()};
const readout = ${readout.toString()};
const governorLive = ${governorLive.toString()};

const cam = cameraOf(P);
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const parts = {};
for (const name of ["grid", "traces", "cam-tap", "cam-long", "p-tap", "p-long", "p-drag", "comb",
  "bar", "pointer", "flag", "gov0", "govArm", "carriage0", "carriage1", "carriage2",
  "tell0", "tell1", "tell2", "tell3"]) parts[name] = part(name);
const count = part("count").querySelector("text");
const info = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let calm = still.matches;

// the deck's own plane, so a pointer can be inverted exactly onto it
const unproject = (sx, sy, z) => {
  const s = (sx - P.origin[0]) / cam.k;
  const u = ((sy - P.origin[1]) / cam.k + z * cam.cosE) / cam.sinE;
  return [s * cam.sinA + u * cam.cosA, u * cam.sinA - s * cam.cosA];
};

const state = deckBoot(newDeck(), PRE);
state.manual = calm;
let frame = 0, last = 0, visible = false, back = 0, hold = 0;

function paint() {
  const T = poseTransforms(state);
  for (const name in T) if (parts[name]) parts[name].setAttribute("transform", T[name]);
  for (let i = 0; i < 4; i++) parts["tell" + i].setAttribute("opacity", state.verdict[i] ? "1" : "0.2");
  parts.traces.innerHTML = traceSvg(state.samples);
  parts.govArm.innerHTML = governorLive(state.speed, Math.min(1, state.speed / 700),
    SWING_REST + TRIP_V * Math.min(1, state.speed / V_SWIPE));
  const digits = String(Math.round(state.reports)).padStart(6, "0");
  if (count.textContent !== digits) count.textContent = digits;
  const text = readout(state);
  if (info.textContent !== text) {
    info.textContent = text;
    stage.setAttribute("aria-label", "The contact tracker: " + text);
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (!calm) deckStep(state, dt);
  paint();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
still.addEventListener("change", (event) => { calm = event.matches; });

// a burst of fixed steps, so the deck still answers with the clock stopped
const burst = (n) => { const steps = calm ? n : 1; for (let i = 0; i < steps; i++) deckStep(state, 1 / STEP_MS / 60); paint(); };
const take = () => { state.manual = true; clearTimeout(back); back = setTimeout(resume, BACK_OFF); };
const resume = () => {
  state.manual = false;
  if (state.pressed) { state.pressed = false; deckEnd(state); }
  state.step = 0; state.epT = 0; state.live = false;
  last = 0;
  run();
};
const point = (event) => {
  const box = svg.getBoundingClientRect();
  return unproject(((event.clientX - box.left) / box.width) * VIEW_W,
    ((event.clientY - box.top) / box.height) * VIEW_H, PLATEN_TOP);
};

stage.addEventListener("pointerdown", (event) => {
  const [px, py] = point(event);
  take();
  clearTimeout(hold);
  state.x = px; state.y = py;
  state.pressed = true;
  if (event.pointerId !== undefined && stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
  if (state.live) deckEnd(state);
  burst(1);
  event.preventDefault();
});
stage.addEventListener("pointermove", (event) => {
  if (!state.manual) return;
  const [px, py] = point(event);
  state.x = px; state.y = py;
  if (calm && state.live) burst(1);
});
const release = () => { if (state.manual && state.pressed) { state.pressed = false; burst(1); } };
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("pointerleave", release);
stage.addEventListener("keydown", (event) => {
  const by = event.shiftKey ? 64 : 20;
  let used = true;
  if (/^[1-4]$/.test(event.key)) {
    const i = Number(event.key) - 1;
    take();
    state.manual = false;
    state.pressed = false;
    state.live = false;
    state.step = i;
    state.epT = 0;
    state.verdict[i] = true;
    last = 0;
    if (calm) { for (let f = 0; f < TOUR[i].live / 16.667 + 6; f++) deckStep(state, 1 / 60); paint(); }
    else run();
  } else if (event.key.indexOf("Arrow") === 0) {
    take();
    state.pressed = true;
    if (event.key === "ArrowLeft") state.x -= by;
    else if (event.key === "ArrowRight") state.x += by;
    else if (event.key === "ArrowUp") state.y -= by;
    else state.y += by;
    burst(2);
    clearTimeout(hold);
    hold = setTimeout(() => { state.pressed = false; burst(1); }, 900);
  } else if (event.key === "Escape") {
    state.pressed = false;
    burst(2);
  } else used = false;
  if (used) event.preventDefault();
});

paint();
run();
`;

const body = k.plateHtml({
  fig: "Fig 5.1",
  title: "The contact tracker",
  hint: "Drag the deck to make a contact · 1–4 replay · arrows nudge",
  readout: readout(st0),
  keys: [
    { mark: "lit", label: "The index flag: which of the eleven slots holds the live tracking id" },
    { mark: "raised", label: "The comb gate, and the three tappets it holds and frees" },
    { mark: "dotted", label: "The three pens' traces, in the tape: dX, dY and BTN_TOUCH" },
    { mark: "dim", label: "The fanfold stacks, and the clean tape the pens have not reached" },
  ],
  caption:
    "A strip-chart recorder fed from two fanfold trays: the tape runs left to right at 120 units a second under a rail that carries three pens, and each pen writes one channel of the contact — how far it has moved in X, how far in Y, and whether BTN_TOUCH is down. The tape's 0 ms is the pens' own station, so everything to their right is the contact's history and everything to the left is clean tape. Behind the tape, a comb of three posts is taken up 16 units — the tap slop — by the path the finger has covered, through a slot and a one-way ratchet, and its posts gate three tappets: the tap and long-press tappets ride face cams on a one-revolution timer, and the spring tappet is held down by the comb until the gate opens, which is the drag. A vertical epoch scale carries a pointer through the contact's life and 620 ms past the lift, marked where each cam reads: 250 ms for the tap, 500 ms for the long press. On the X carriage a governor spins off the rail's rack, lets its balls out with speed and swings its arm past a stop at 420 px/s — the swipe, the one decision with no comb, because its rule is a speed and not a distance. The turret's eleven chambers are this driver's eleven ABS_MT_SLOTs with the index flag on the live one, the counter counts the packet sets that SYN_REPORT has closed, and the four telltales on the name plate latch each verdict as it fires. There is no pressure and no contact size anywhere on this deck, because cyttsp4_mt reports none: every decision here is geometry over time.",
  body: `<div class="iso-stage" tabindex="0" role="application" aria-label="The contact tracker">${svg}</div>`,
});

mkdirSync(join(HERE, "shots"), { recursive: true });
const suffix = theme === "light" ? "-light" : "";
writeFileSync(join(HERE, `${NAME}${suffix}.html`), k.pageHtml({ title: "The contact tracker", theme, body, script: kitScript() + live, width: 980 }));
writeFileSync(join(HERE, `${NAME}${suffix}.svg`), k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody, standalone: theme }));
console.log("wrote", `${NAME}${suffix}.html`, `${NAME}${suffix}.svg`, "·", readout(st0));
