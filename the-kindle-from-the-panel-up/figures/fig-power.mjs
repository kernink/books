// Fig 6.1 — the idle clock.
// powerd's two-stage inactivity timer, built as a weight-driven clockwork
// movement on a cast bedplate.  One turn of the T1 drum is 600 s and lifts the
// screen-saver flag; the T2 drum is geared 10:1 off the same arbor, so its next
// turn ends 60 s later and suspends the machine.  preventScreenSaver is a pawl
// that stops the train, and five stations on the back rail are what wake it.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./_kit/iso-kit.mjs";
import { kitScript } from "./_kit/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const NAME = "fig-power";
const { depthOf, iso, pathOf, cameraOf } = k;

// ---------------------------------------------------------------- constants
const WIDTH = 900, HEIGHT = 560;
const BED = { x: -240, y: -240, w: 480, d: 480, r: 40 };
const BASE_TOP = 0, BASE_LOW = -30, FOOT_LOW = -46;

// The machine stands on a 45-degree plan grid: `a` runs left to right across
// the screen, `b` runs from the back of the bed towards the viewer.  Both are
// real plan distances in millimetres of a mental model, so two cogs a and b
// mesh when |pose(a) - pose(b)| is the sum of their pitch radii.
const AX = Math.SQRT1_2;
const pose = (a, b) => [(a + b) * AX, (b - a) * AX];
const rect = (a, b, r) => { const [x, y] = pose(a, b); return { x: x - r, y: y - r, w: r * 2, d: r * 2 }; };
// the corners of a disc lying at (a, b): the exact screen bounds of a circle
const disc = (a, b, r, z0, z1) => {
  const [x, y] = pose(a, b), out = [];
  for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) for (const z of [z0, z1]) out.push([x + dx, y + dy, z]);
  return out;
};
// a straight bar in plan between two (a, b) points, `w` half-wide
const band = (a0, b0, a1, b1, w) => {
  const p = pose(a0, b0), q = pose(a1, b1);
  const dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy) || 1;
  const px = (-dy / n) * w, py = (dx / n) * w;
  return [[p[0] + px, p[1] + py], [q[0] + px, q[1] + py], [q[0] - px, q[1] - py], [p[0] - px, p[1] - py]];
};

const WZ0 = 24, WZ1 = 40;                     // the cog plane
const T1_S = 600, T2_S = 60, RATE = 40;       // seconds; virtual seconds per real second
const TEETH = 15, TICK_S = T1_S / TEETH;      // the escape wheel drops a tooth every 40 s
const SUSPEND_AT = T1_S + T2_S;               // 660 s: stage one plus stage two
const DROP = 106;                             // z the weight falls over one winding
// angles are gear relations off the escape wheel: 15 teeth driven by the
// 18-tooth second wheel, 18 by the 26-tooth great wheel, 26 by the 22-tooth
// barrel.  The T1 drum turns with the escape wheel; the T2 is 30:3 off the T1.
const GR = { escape: 1, second: 15 / 18, great: 15 / 26, barrel: 15 / 22, t1: 1, t2: 10 };

const WHEELS = [
  { id: "barrel", a: -176, b: -14, tip: 66, root: 54, teeth: 22, hub: 18 },
  { id: "great", a: -40, b: -14, tip: 82, root: 70, teeth: 26, hub: 20 },
  { id: "second", a: 86, b: -14, tip: 56, root: 44, teeth: 18, hub: 15 },
  { id: "escape", a: 186, b: -14, tip: 56, root: 46, teeth: 15, hub: 13, sharp: true },
  { id: "t1", a: 30, b: 250, tip: 66, root: 54, teeth: 30, hub: 16 },
  { id: "t2", a: 96, b: 250, tip: 12, root: 2, teeth: 3, hub: 4 },
];
const wheelOf = (id) => WHEELS.find((w) => w.id === id);

const T1 = { a: 30, b: 250, r: 44, top: 78 };     // stage 1: 600 s per turn
const T2 = { a: 96, b: 250, r: 11, top: 74 };     // stage 2: 60 s per turn
const FORK = { a: 186, b: 60 };                   // the pallets, 74 behind the escape wheel
const PAWL = { a: -40, b: 104 };                  // the prevent pawl, 118 behind the great wheel
const FLAG = { a: -56, b: 250 };                  // the screen-saver flag, off the T1 drum

const RAIL = { b: -190, z: 44, h: 13, d: 34, end: 150 };   // the wake-lever rail
const STATIONS = [
  { id: "accel", s: -120, key: "", wel: true, label: "accel" },
  { id: "hall", s: -60, key: "2", label: "hall" },
  { id: "touch", s: 0, key: "3", label: "touch" },
  { id: "power", s: 60, key: "1", label: "power" },
  { id: "rtc", s: 120, key: "4", label: "rtc" },
];
const NOTES = {
  power: "max77696-onkey, KEY_POWER",
  hall: "wario_hall, cover open",
  touch: "cyttsp4_mt, touch returns",
  rtc: "rtcWakeup on rtc0 / rtc2",
  accel: "no accelerometer, welded shut",
};
const WAKE = ["power", "hall", "touch", "rtc"];
const LIFT = 16;                                   // how far a station's plunger rises

const SHEAVE = { a: -300, b: -40, r: 26, z: 70 };
const WEIGHT = { a: -324.5, b: -48.6, r: 30 };
const KNOB = { a: -232, b: 96, r: 40 };
const NET = { a: 270, b: -60, r: 34 };
const NAME_P = { x: -70, y: 148, w: 164, d: 66, r: 9 };
const RULE = { x: 205, y: -70, w: 22, d: 132, r: 5 };

// ---------------------------------------------------------------- helpers
// Written with bare kit names so the same source runs in the page: each helper
// below is stringified into the live script, exactly as the reference does.
const DEG = Math.PI / 180;

// A cog as a floor outline: trapezoid teeth, with a narrower tip when sharp.
const cogRing = (rRoot, rTip, teeth, phase, sharp) => {
  const out = [], step = (Math.PI * 2) / teeth, K = step * 0.24;
  const verts = [[rRoot, -1.7, 1], [rTip, -1, sharp ? 0.32 : 1], [rTip, 1, sharp ? 0.32 : 1], [rRoot, 1.7, 1]];
  for (let i = 0; i < teeth; i++) for (const [r, o, w] of verts) {
    const ang = phase + i * step + o * K * w;
    out.push([r * Math.cos(ang), r * Math.sin(ang)]);
  }
  return out;
};
const rotP = (p, ang) => [p[0] * Math.cos(ang) - p[1] * Math.sin(ang), p[0] * Math.sin(ang) + p[1] * Math.cos(ang)];
// a rectangle from a to b: convex, so any winding is safe
const quad = (a, b, w) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
  const px = (-dy / n) * w, py = (dx / n) * w;
  return [[a[0] + px, a[1] + py], [b[0] + px, b[1] + py], [b[0] - px, b[1] - py], [a[0] - px, a[1] - py]];
};
// every piece of one rotating part, concatenated into eight writable paths
const bake = (list) => ({
  fill: list.map((p) => p.fill).join(""),
  shades: [0, 1, 2, 3].map((i) => list.map((p) => p.shades[i] || "").join("")),
  top: list.map((p) => p.top).join(""),
  crease: list.map((p) => p.crease).join(""),
  outline: list.map((p) => p.outline).join(""),
});
// a rotating assembly: flat rings that all turn together about the part's axis
const spinPaths = (parts, ang, P) =>
  bake(parts.map((p) => extrude(p.ring.map((q) => rotP(q, ang)), p.z, p.h, P, { convex: p.convex !== false })));
// the eight-path shell a rotating part writes its `d` attributes into each frame
const rotSvg = (paths, tone, extra = "") => `<g class="iso-solid"${extra}>` +
  `<path class="iso-fill" d="${paths.fill}"/>` +
  paths.shades.map((d, i) => `<path class="iso-shade" data-shade="${i}" d="${d}"/>`).join("") +
  `<path class="iso-top" d="${paths.top}"/>` +
  `<path class="iso-line iso-crease" data-tone="faint" d="${paths.crease}"/>` +
  `<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/></g>`;

// A coil about a vertical axis, split into the turns seen behind and in front
// of the drum so the drum can be painted between them.
const helix = (cx, cy, from, to, radius, turns, P, perTurn, phase) => {
  const count = Math.max(2, Math.round(turns * (perTurn || 12)));
  const back = [], front = [];
  let run = [], near = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count, ang = (phase || 0) + t * turns * Math.PI * 2;
    const facing = depthOf([Math.cos(ang), Math.sin(ang), 0], P) > 0;
    const flat = iso([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang), from + (to - from) * t], P);
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

const extrude = k.extrude, segment = k.segment;
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);

// ---------------------------------------------------------------- projection
const P = k.fitProjection(
  [
    ...k.boxCorners(BED, FOOT_LOW, BASE_TOP),
    ...disc(-176, -14, 70, WZ0, 100),
    ...disc(186, -14, 78, WZ0, 60),
    ...disc(30, 250, 60, WZ0, 104),
    ...disc(96, 250, 26, WZ0, 96),
    ...disc(-56, 250, 40, 0, 74),
    ...disc(0, -190, 162, 0, 100),
    ...disc(-40, 130, 60, 0, 52),
    ...disc(-300, -40, 40, 0, 90),
    ...disc(-324, -49, 38, -138, 0),
    ...disc(-232, 96, 50, 0, 32),
    ...disc(270, -60, 44, 0, 50),
    ...k.boxCorners(NAME_P, 0, 12),
  ],
  WIDTH, HEIGHT, { pad: 30, azimuth: 45, elevation: 30 },
);
const at = (p) => iso(p, P);
const atPose = (a, b, z) => iso([...pose(a, b), z], P);
const topText = (a, b, z) => k.topMatrix(pose(a, b), z, P, "x");
const topTextXY = (x, y, z) => k.topMatrix([x, y], z, P, "x");
const byDepth = (p, q) => depthOf([p[0], p[1], 0], P) - depthOf([q[0], q[1], 0], P);

// ---------------------------------------------------------------- bed
const post = (a, b, r, z0, h, tone = "mid") => S(k.cylinder(...pose(a, b), r, z0, h, P, 28, 0.6), { tone, crease: "none" });
const block = (a0, b0, a1, b1, w, z, h, tone = "mid", bevel = 1.4) =>
  S(extrude(band(a0, b0, a1, b1, w), z, h, P, { convex: true, bevel }), { tone });

function bed() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BED, FOOT_LOW, 8, P)}"/>`];
  for (const [x, y] of k.corners(BED, 52).sort(byDepth)) {
    out.push(S(k.cylinder(x, y, 26, FOOT_LOW, 7, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 18, FOOT_LOW + 7, BASE_LOW - FOOT_LOW - 7, P, 24), { tone: "lo", crease: "none" }));
  }
  out.push(S(k.slabOf(BED, BASE_LOW, -BASE_LOW, P, 10, 2.4), { tone: "lo" }));
  out.push(L(k.sideSeam(BED, BASE_LOW + 7, P, 10), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(BED, 14), BASE_TOP, P, 10), { tone: "faint" }));
  const screws = k.corners(BED, 44);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 7, BASE_TOP, P, 18)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, BASE_TOP])), { size: 1.1 }));
  return out.join("");
}

// the name plate, the retune knob and the seconds strip
function furniture() {
  const out = [];
  out.push(S(k.slabOf(NAME_P, BASE_TOP, 7, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(NAME_P, 5), BASE_TOP + 7, P, 8), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([NAME_P.x + 14, NAME_P.y + 28], BASE_TOP + 7, P, "x"), "powerd", { size: 21, tone: "hi" }));
  out.push(k.faceTextSvg(k.topMatrix([NAME_P.x + 14, NAME_P.y + 43], BASE_TOP + 7, P, "x"), "touchScreenSaverTimeout", { size: 10, tone: "lo" }));
  out.push(L(k.lineOnTop([NAME_P.x + 14, NAME_P.y + 51], [NAME_P.x + NAME_P.w - 14, NAME_P.y + 51], BASE_TOP + 7, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([NAME_P.x + 14, NAME_P.y + 57], [NAME_P.x + NAME_P.w - 74, NAME_P.y + 57], BASE_TOP + 7, P), { tone: "faint", free: true }));

  // the retune knob: writing touchScreenSaverTimeout re-arms stage one
  const kc = pose(KNOB.a, KNOB.b);
  out.push(S(k.slabOf(rect(KNOB.a, KNOB.b, KNOB.r + 9), BASE_TOP, 6, P, 8, 1.2), { tone: "mid" }));
  out.push(S(k.cylinder(...kc, KNOB.r, BASE_TOP + 6, 20, P, 48, 1.4), { tone: "mid" }));
  out.push(L(k.knurl(...kc, KNOB.r, BASE_TOP + 6, BASE_TOP + 26, 56, P, 0.5), { tone: "lo" }));
  const kt = k.radialTicks(...kc, KNOB.r + 6, 12, 3, BASE_TOP + 6, [4, 9], P);
  out.push(L(k.ring(...kc, KNOB.r + 6, BASE_TOP + 6, P, 48), { tone: "faint" }));
  out.push(L(k.ring(...kc, KNOB.r - 3, BASE_TOP + 6, P, 48), { tone: "faint" }));
  out.push(L(kt.minor, { tone: "faint" }), L(kt.major, { tone: "mid" }));
  out.push(L(k.ring(...kc, 9, BASE_TOP + 27, P, 24), { tone: "lo" }));

  // a graduated strip along the bed: one turn of stage one is six hundred of them
  out.push(S(k.slabOf(RULE, BASE_TOP, 4, P, 6, 0.8), { tone: "mid" }));
  const ticks = k.sideTicks(RULE.y + 4, RULE.y + RULE.d - 4, 12, 5, RULE.x + RULE.w, BASE_TOP + 4, [3, 5], P, "y");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(k.faceTextSvg(topTextXY(214, -84, BASE_TOP), "s", { size: 12, tone: "lo", anchor: "middle" }));
  return out.join("");
}

// ---------------------------------------------------------------- wake stations
// Five stations on the back rail.  Each is a plunger in a boss; four of them are
// the things the kernel will actually wake from, and the fifth — the
// accelerometer the PW3 does not have — is welded shut.
function rail() {
  const out = [], top = RAIL.z + RAIL.h;
  out.push(post(-140, RAIL.b, 15, BASE_TOP, RAIL.z, "mid"));
  out.push(post(140, RAIL.b, 15, BASE_TOP, RAIL.z, "mid"));
  out.push(block(-RAIL.end, RAIL.b, RAIL.end, RAIL.b, RAIL.d / 2, RAIL.z, RAIL.h, "mid", 2));
  out.push(L(k.lineOnTop(pose(-RAIL.end + 5, RAIL.b), pose(RAIL.end - 5, RAIL.b), top, P), { tone: "faint", free: true }));
  out.push(D([pose(-140, RAIL.b), pose(140, RAIL.b)].map(([x, y]) => at([x, y, top])), { size: 1.2 }));
  for (const st of STATIONS) {
    out.push(S(k.cylinder(...pose(st.s, RAIL.b), 15, top, 9, P, 28, 1), { tone: "mid" }));
    out.push(L(k.ring(...pose(st.s, RAIL.b), 11, top + 9, P, 24), { tone: "faint" }));
    out.push(L(k.lineOnTop(pose(st.s, -190), pose(st.s, -204), BASE_TOP, P), { tone: "faint", free: true }));
    out.push(k.faceTextSvg(topText(st.s, -216, BASE_TOP), st.label, { size: 11, tone: st.wel ? "lo" : "mid", anchor: "middle" }));
    if (st.wel) {
      // no accelerometer: the rod is a stub under a bolted strap
      out.push(S(k.cylinder(...pose(st.s, RAIL.b), 8, top + 9, 12, P, 20), { tone: "mid", crease: "none" }));
      out.push(block(st.s - 20, RAIL.b, st.s + 20, RAIL.b, 8, top + 19, 6, "mid", 1.2));
      out.push(D([pose(st.s - 14, RAIL.b), pose(st.s + 14, RAIL.b)].map(([x, y]) => at([x, y, top + 25])), { size: 1.4 }));
      continue;
    }
    const rod = [
      S(k.cylinder(...pose(st.s, RAIL.b), 7, top + 9, 22, P, 20), { tone: "mid", crease: "none" }),
      S(k.cylinder(...pose(st.s, RAIL.b), 13, top + 31, 8, P, 28, 1), { tone: "hi" }),
      L(k.ring(...pose(st.s, RAIL.b), 8, top + 39, P, 20), { tone: "lo" }),
    ].join("");
    out.push(`<g data-part="wake-${st.id}" transform="${k.translateAlong(P, [0, 0, 0])}">${rod}</g>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- the network
// ath6kl runs with wow_mode=0, so there is no wake-on-Wi-Fi: when the machine
// suspends, the plug drops out of its socket and the link goes with it.
function net() {
  const out = [], [x, y] = pose(NET.a, NET.b);
  // the socket the link plugs into, on the bed's back-right edge
  out.push(S(k.slabOf(rect(NET.a, NET.b, NET.r), BASE_TOP, 6, P, 8, 1.2), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 20, 6, 18, P, 28, 1.2), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 20, 6, 24, 32, P, 0.5), { tone: "lo" }));
  out.push(L(k.ring(x, y, 14, 24, P, 24), { tone: "faint" }));
  // the lead, painted first so its head sits under the plug's silhouette.  Its
  // first point is exactly on the plug's lower rim, so the line has a real root.
  const lead = [
    atPose(NET.a + 12, NET.b - 44, 12),
    atPose(NET.a + 16, NET.b - 8, 2),
    atPose(NET.a + 22, NET.b + 34, -10),
    atPose(NET.a + 26, NET.b + 62, -20),
  ];
  out.push(L(pathOf(lead), { tone: "lo" }));
  out.push(D([lead[3]], { size: 2.6, tone: "hi" }));
  // the plug drops out when the machine suspends
  const plug = [
    S(k.cylinder(...pose(NET.a, NET.b - 44), 12, 12, 22, P, 24, 1), { tone: "hi" }),
    L(k.ring(...pose(NET.a, NET.b - 44), 12, 34, P, 24), { tone: "lo" }),
    S(k.cylinder(...pose(NET.a, NET.b - 44), 6, 34, 12, P, 16), { tone: "mid" }),
  ].join("");
  out.push(`<g data-part="plug">${plug}</g>`);
  out.push(k.faceTextSvg(topText(170, -250, BASE_TOP), "no wake-on-WLAN", { size: 11, tone: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------- assemble
// The weight hangs at Z0 when the movement is wound; one winding is one 600 s
// turn of the stage-1 drum, and the pallet fork rocks once either way per tooth.
const ROCK = 0.1;
const spins = () => Object.entries(SPIN_POS).map(([id]) =>
  `<g data-part="${id}" transform="${k.translateAlong(P, [...pose(...SPIN_POS[id]), 0])}">` +
  `${rotSvg(spinPaths(SPIN[id], 0, P), SPIN_TONE[id])}</g>`).join("");
const coilAt = (phase) => helix(...pose(-176, -14), 47, 69, 29, 3.4, P, 12, phase);

const LABEL =
  "A weight-driven clockwork movement on a cast bedplate. A train of cog wheels runs "
  + "from a barrel drum along the bed's diagonal to an escape wheel, whose pallets let it "
  + "drop one tooth every forty seconds. Above the great wheel a pawl — the flag "
  + "preventScreenSaver drops into it — can stop the train. In front, the stage-1 drum "
  + "counts 600 seconds and trails a 30-tooth wheel that drives the stage-2 drum 10:1, so "
  + "stage 2 turns once in 60 seconds. A back rail carries five stations: four plungers "
  + "labelled power, hall, touch and rtc, and a fifth labelled accel, welded down because "
  + "the Paperwhite 3 has no accelerometer. A cord leaves the barrel over a sheave and hangs "
  + "a weight past the bed's edge; a network plug at the right drops out on suspend.";

// ---------------------------------------------------------------- the train
// every rotating part, as data the page re-cuts each frame.  Rings are centred
// on the part's own axis so a spin is a rotation about the origin in plan.
const SPIN = {};
for (const w of WHEELS) SPIN[w.id] = [
  { ring: cogRing(w.root, w.tip, w.teeth, 0, w.sharp), z: WZ0, h: WZ1 - WZ0, convex: false },
  { ring: k.circleRing(0, 0, w.hub, 20), z: WZ1, h: 6 },
];
const stem = (dir, len, w, z, h) => ({ ring: quad([0, 0], [dir[0] * len, dir[1] * len], w), z, h });
const knobAt = (p, r, z, h) => ({ ring: k.circleRing(p[0], p[1], r, 16), z, h });
const hnd = (r, z, h) => [
  stem([-AX, -AX], r, 4.5, z, h),
  stem([AX, AX], 13, 7, z, h),
  knobAt([0, 0], 8, z, h + 4),
];
SPIN.t1hand = hnd(T1.r + 10, T1.top + 6, 5);
SPIN.t2hand = hnd(T2.r + 6, T2.top + 5, 4);
// the pallet fork: an anchor 74 across from the escape wheel, its two pallets
// at 46 straddling the teeth a quarter of a tooth pitch either side
const PAL = [[-35.8, -9.4], [-9.4, -35.8]];
const PAL_U = PAL.map(([px, py]) => { const r = Math.hypot(px, py); return [px / r, py / r, r]; });
SPIN.fork = [
  stem([AX, AX], 64, 4, 41, 6),
  stem([-AX, -AX], 46, 3, 44, 3),
  ...PAL_U.map(([dx, dy, r]) => stem([dx, dy], r, 5, 41, 6)),
  ...PAL.map((p) => knobAt(p, 6, 42, 6)),
  knobAt([0, 0], 9, 40, 9),
];
SPIN.pawl = [
  stem([-AX, -AX], 36, 4, 41, 6),
  stem([AX, AX], 26, 3.5, 41, 6),
  { ring: quad([-36, -36], [-22, -22], 8), z: 43, h: 5 },
  knobAt([16.9, 16.9], 9, 40, 10),
  knobAt([0, 0], 7, 40, 9),
];
const SPIN_POS = {
  barrel: [-176, -14], great: [-40, -14], second: [86, -14], escape: [186, -14],
  t1: [30, 250], t2: [96, 250], fork: [186, 60], pawl: [-40, 104],
};
const SPIN_TONE = {
  barrel: "mid", great: "mid", second: "mid", escape: "mid",
  t1: "mid", t2: "mid", fork: "mid", pawl: "hi",
};

function trainStatics() {
  const out = [];
  for (const w of WHEELS) out.push(post(w.a, w.b, Math.min(16, w.root * 0.3), BASE_TOP, WZ0, "mid"));
  out.push(post(FORK.a, FORK.b, 10, BASE_TOP, 40, "mid"));
  out.push(post(PAWL.a, PAWL.b, 9, BASE_TOP, 40, "mid"));
  // the barrel: a flanged spool with the weight cord wound on its neck
  const [bx, by] = pose(-176, -14);
  out.push(S(k.cylinder(bx, by, 54, 40, 5, P, 44, 1), { tone: "mid" }));
  out.push(S(k.cylinder(bx, by, 27, 45, 26, P, 40, 0.6), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(bx, by, 54, 71, 6, P, 44, 1), { tone: "mid" }));
  out.push(L(k.knurl(bx, by, 54, 40, 45, 56, P, 0.4), { tone: "lo" }));
  out.push(L(k.knurl(bx, by, 54, 71, 77, 56, P, 0.4), { tone: "lo" }));
  out.push(L(k.ring(bx, by, 27, 71, P, 40), { tone: "faint" }));
  // the stage-1 drum with its knuckle, and the little stage-2 drum
  const [x1, y1] = pose(T1.a, T1.b);
  out.push(S(k.cylinder(x1, y1, T1.r, 40, T1.top - 40, P, 48, 0.8), { tone: "mid" }));
  out.push(L(k.knurl(x1, y1, T1.r, 40, T1.top, 64, P, 0.6), { tone: "lo" }));
  out.push(L(k.ring(x1, y1, T1.r, T1.top, P, 48), { tone: "faint" }));
  const [x2, y2] = pose(T2.a, T2.b);
  out.push(S(k.cylinder(x2, y2, T2.r, 40, T2.top - 40, P, 32, 0.8), { tone: "mid" }));
  out.push(L(k.knurl(x2, y2, T2.r, 40, T2.top, 32, P, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(x1, y1, 7, T1.top, 24, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(x2, y2, 4, T2.top, 20, P, 20), { tone: "mid" }));
  return out.join("");
}

// the two dial faces and the hands that sweep them.  Stage 1 turns once in
// 600 s, stage 2 once in 60 s.  The stage-1 face is the panel: it is what dims
// when the machine suspends, and its hand is the one lit part of the figure.
function faces() {
  const t1 = [], t2 = [];
  const [x1, y1] = pose(T1.a, T1.b);
  t1.push(S(k.slabOf(rect(T1.a, T1.b, T1.r + 10), T1.top, 5, P, 10, 1.6), { tone: "mid" }));
  t1.push(L(k.ring(x1, y1, T1.r + 2, T1.top + 5, P, 48), { tone: "faint" }));
  const tk1 = k.radialTicks(x1, y1, T1.r + 2, 30, 5, T1.top + 5, [5, 12], P);
  t1.push(L(tk1.minor, { tone: "lo" }), L(tk1.major, { tone: "mid" }));
  t1.push(L(k.ring(x1, y1, T1.r - 10, T1.top + 5, P, 48), { tone: "faint" }));
  t1.push(L(k.ring(x1, y1, 22, T1.top + 5, P, 28), { tone: "faint" }));
  t1.push(k.faceTextSvg(topText(T1.a, T1.b - 58, T1.top + 5), "T1", { size: 13, tone: "hi", anchor: "middle" }));
  t1.push(k.faceTextSvg(topText(T1.a, T1.b + 62, T1.top + 5), "600 s", { size: 12, tone: "lo", anchor: "middle" }));
  t1.push(`<g data-part="t1hand" transform="${k.translateAlong(P, [...pose(T1.a, T1.b), 0])}">${rotSvg(spinPaths(SPIN.t1hand, 0, P), "lit", ' data-lit=""')}</g>`);
  t1.push(S(k.cylinder(...pose(FLAG.a, FLAG.b), 8, BASE_TOP, 52, P, 20), { tone: "mid" }));
  t1.push(`<g data-part="flag" transform="${k.translateAlong(P, [0, 0, 0])}">${S(extrude(band(FLAG.a - 10, FLAG.b, FLAG.a + 24, FLAG.b, 9), 52, 5, P, { convex: true, bevel: 1.6 }), { tone: "hi" })}</g>`);
  t1.push(k.faceTextSvg(topText(FLAG.a - 40, FLAG.b + 30, BASE_TOP), "600", { size: 12, tone: "lo" }));

  const [x2, y2] = pose(T2.a, T2.b);
  t2.push(S(k.slabOf(rect(T2.a, T2.b, T2.r + 8), T2.top, 4, P, 8, 1.2), { tone: "mid" }));
  const tk2 = k.radialTicks(x2, y2, T2.r + 2, 12, 3, T2.top + 4, [3, 7], P);
  t2.push(L(k.ring(x2, y2, T2.r + 2, T2.top + 4, P, 32), { tone: "faint" }));
  t2.push(L(k.ring(x2, y2, T2.r - 5, T2.top + 4, P, 32), { tone: "faint" }));
  t2.push(L(tk2.minor, { tone: "faint" }), L(tk2.major, { tone: "lo" }));
  t2.push(k.faceTextSvg(topText(T2.a, T2.b + 24, T2.top + 4), "T2", { size: 12, tone: "mid", anchor: "middle" }));
  t2.push(`<g data-part="t2hand" transform="${k.translateAlong(P, [...pose(T2.a, T2.b), 0])}">${rotSvg(spinPaths(SPIN.t2hand, 0, P), "hi")}</g>`);
  return { panel: `<g data-part="panel">${t1.join("")}</g>`, t2: t2.join("") };
}

// ---------------------------------------------------------------- the drive
// the cord leaves the barrel's neck, runs out to a sheave on a bracket past the
// bed's edge, and drops to a weight that hangs clear of the plate.
function sheave() {
  const out = [];
  out.push(block(-268, SHEAVE.b, -306, SHEAVE.b, 17, 20, 12, "mid"));
  out.push(post(-268, SHEAVE.b, 12, BASE_TOP, 26, "mid"));
  out.push(S(k.cylinder(...pose(SHEAVE.a, SHEAVE.b), 13, 26, SHEAVE.z - 26, P, 24, 0.6), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(...pose(SHEAVE.a, SHEAVE.b), SHEAVE.r, SHEAVE.z, 4, P, 44, 1), { tone: "hi" }));
  out.push(S(k.cylinder(...pose(SHEAVE.a, SHEAVE.b), SHEAVE.r, SHEAVE.z + 4, 10, P, 44, 1), { tone: "mid" }));
  out.push(L(k.knurl(...pose(SHEAVE.a, SHEAVE.b), SHEAVE.r, SHEAVE.z + 5, SHEAVE.z + 13, 48, P, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(...pose(SHEAVE.a, SHEAVE.b), 7, SHEAVE.z + 14, 6, P, 20), { tone: "mid" }));
  return out.join("");
}

const CORD_A = { a: -204.4, b: -19.9, z: 66 };      // the take-off on the barrel neck
const CORD_B = { a: -325.5, b: -45.3, z: 88 };      // over the sheave's rim
function cordD(weightZ) {
  const p = (o) => [...pose(o.a, o.b), o.z];
  const drop = pose(WEIGHT.a, WEIGHT.b);
  return [
    segment(p(CORD_A), p(CORD_B), P),
    segment(p(CORD_B), [drop[0], drop[1], weightZ + 40], P),
  ];
}

function weight(weightZ) {
  const out = [], [x, y] = pose(WEIGHT.a, WEIGHT.b);
  const z = (d) => weightZ + 30 + d;
  out.push(S(k.cylinder(x, y, 30, z(-33), 32, P, 48, 1), { tone: "mid" }));
  for (let i = 1; i <= 4; i++) out.push(L(k.sideArc(x, y, 30, z(-33 + i * 6.4), P, 24), { tone: "lo" }));
  out.push(L(k.knurl(x, y, 30, z(-33), z(-1), 48, P, 0.5), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 12, z(1), 9, P, 24), { tone: "mid" }));
  out.push(L(k.ring(x, y, 12, z(10), P, 24), { tone: "lo" }));
  out.push(L(k.segment([x - 12, y, z(10)], [x + 12, y, z(10)], P), { tone: "lo" }));
  out.push(L(k.ring(x, y, 17, z(1), P, 28), { tone: "faint" }));
  return out.join("");
}

// ---------------------------------------------------------------- assembly
const Z0 = -30;                                     // the weight, wound up
const F = faces();
const cord0 = cordD(Z0);
const svgBody = [
  bed(),
  rail(),
  `<g data-part="weight" transform="${k.translateAlong(P, [0, 0, 0])}">${weight(Z0)}</g>`,
  `<g data-part="cord"><path class="iso-line" data-tone="lo" d="${cord0[0]}"/><path class="iso-line" data-tone="lo" d="${cord0[1]}"/></g>`,
  sheave(),
  net(),
  `<g data-part="coilBack"><path class="iso-line" data-tone="lo" d="${coilAt(0).back}"/></g>`,
  trainStatics(),
  `<g data-part="coilFront"><path class="iso-line" data-tone="lo" d="${coilAt(0).front}"/></g>`,
  spins(),
  furniture(),
  F.t2,
  F.panel,
];

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody });

// ---------------------------------------------------------------- live code
// The train's angles come off the escape wheel: one tooth drops every 40 s, so
// the wheel turns once in 600 s and the stage-1 hand with it.  The stage-2 drum
// is 30:3 off the stage-1 wheel, so it turns once in 60 s.  Nothing here invents
// a number: 600 and 60 are the two that powerd actually uses (§6.2).
const DIR = { barrel: 1, great: -1, second: 1, escape: -1, t1: -1, t2: 1 };
const live = `
const P = ${JSON.stringify(P)};
const SPIN = ${JSON.stringify(SPIN)};
const GR = ${JSON.stringify(GR)};
const DIR = ${JSON.stringify(DIR)};
const NOTES = ${JSON.stringify(NOTES)};
const WAKE = ${JSON.stringify(WAKE)};
const VIEW_W = ${WIDTH}, VIEW_H = ${HEIGHT};
const T1_S = ${T1_S}, SUSPEND_AT = ${SUSPEND_AT}, TICK_S = ${TICK_S}, RATE = ${RATE};
const DROP = ${DROP}, Z0 = ${Z0}, LIFT = ${LIFT}, ROCK = ${ROCK};
const WEIGHT = ${JSON.stringify(WEIGHT)};
const W_A = WEIGHT.a, W_B = WEIGHT.b;
const CORD_A = ${JSON.stringify(CORD_A)}, CORD_B = ${JSON.stringify(CORD_B)};
const RESET_S = 0.9, HOLD_S = 2.6, TAU = 0.28, RESUME_MS = 7000;
const pose = ${pose.toString()};
const AX = ${AX};
const rotP = ${rotP.toString()};
const bake = ${bake.toString()};
const spinPaths = ${spinPaths.toString()};
const helix = ${helix.toString()};
const coilAt = ${coilAt.toString()};
const cordD = ${cordD.toString()};
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const approach = (v, target, tau, dt) => (dt >= 1 ? target : v + (target - v) * (1 - Math.exp(-dt / tau)));

const cam = cameraOf(P);
const stage = document.querySelector(".iso-stage");
const svgEl = stage.querySelector("svg");
const part = (name) => svgEl.querySelector('[data-part="' + name + '"]');
const info = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// every rotating part is eight writable paths; a spin rewrites their d.
const spinNode = {}, spinCache = {};
for (const id in SPIN) spinNode[id] = part(id);
function setSpin(id, angle) {
  if (spinCache[id] !== undefined && Math.abs(angle - spinCache[id]) < 0.0006) return;
  spinCache[id] = angle;
  const kids = spinNode[id].querySelector(".iso-solid").children;
  const p = spinPaths(SPIN[id], angle, P);
  kids[0].setAttribute("d", p.fill);
  for (let i = 0; i < 4; i++) kids[1 + i].setAttribute("d", p.shades[i]);
  kids[5].setAttribute("d", p.top);
  kids[6].setAttribute("d", p.crease);
  kids[7].setAttribute("d", p.outline);
}

const weightEl = part("weight"), flagEl = part("flag"), plugEl = part("plug");
const panelEl = part("panel");
const cordPaths = part("cord").querySelectorAll("path");
const coilBack = part("coilBack").querySelector("path");
const coilFront = part("coilFront").querySelector("path");
const stations = [];
[...svgEl.querySelectorAll('[data-part^="wake-"]')].forEach((node) => {
  const id = node.getAttribute("data-part").slice(5);
  stations.push([id, node]);
  node.addEventListener("pointerenter", () => { hover = id; poke(); });
  node.addEventListener("pointerleave", () => { if (hover === id) { hover = null; poke(); } });
});

let idle = 0, held = false, suspended = false;
let flagZ = 0, plugZ = 0, dim = 0;
let suspendT = 0, tourIdx = 0, resetT = -1, resetFrom = 0, pressT = 0;
let hover = null, pressed = null, dragging = false, dragZ = 0, dragFrom = 0, resumeT = 0;
let running = false, frame = 0, last = 0, visible = false;

const stateText = () => {
  if (held) return "preventScreenSaver \\u00b7 held \\u00b7 T1 paused";
  if (suspended) return "suspended \\u00b7 wlan down \\u00b7 press 1\\u20134 to wake";
  const n = Math.round(idle);
  if (idle < T1_S) return "awake \\u00b7 idle " + n + " s \\u00b7 T1 in " + Math.round(T1_S - idle) + " s";
  return "screensaver \\u00b7 idle " + n + " s \\u00b7 T2 in " + Math.round(SUSPEND_AT - idle) + " s";
};

const weightZ = () => Z0 - DROP * Math.min(1, idle / T1_S);

function draw(dt) {
  const ang = -idle / T1_S * Math.PI * 2;
  setSpin("barrel", ang * GR.barrel * DIR.barrel);
  setSpin("great", ang * GR.great * DIR.great);
  setSpin("second", ang * GR.second * DIR.second);
  setSpin("escape", ang * GR.escape * DIR.escape);
  setSpin("t1", ang * DIR.t1);
  setSpin("t2", ang * GR.t2 * DIR.t2);
  setSpin("t1hand", ang * DIR.t1);
  setSpin("t2hand", ang * GR.t2 * DIR.t2);
  setSpin("fork", ROCK * Math.sin(Math.PI * (idle / TICK_S)));
  setSpin("pawl", held ? -0.17 : 0);

  const z = weightZ();
  weightEl.setAttribute("transform", translateAlong(P, [0, 0, z - Z0]));
  const cord = cordD(z);
  cordPaths[0].setAttribute("d", cord[0]);
  cordPaths[1].setAttribute("d", cord[1]);
  const coil = coilAt(-ang * 0.6);
  coilBack.setAttribute("d", coil.back);
  coilFront.setAttribute("d", coil.front);

  flagZ = approach(flagZ, (idle >= T1_S || suspended) ? 14 : 0, TAU, dt);
  plugZ = approach(plugZ, suspended ? -14 : 0, TAU * 1.2, dt);
  dim = approach(dim, suspended ? 1 : 0, TAU, dt);
  flagEl.setAttribute("transform", translateAlong(P, [0, 0, flagZ]));
  plugEl.setAttribute("transform", translateAlong(P, [0, 0, plugZ]));
  panelEl.setAttribute("opacity", (1 - 0.66 * dim).toFixed(3));

  for (const [id, node] of stations) {
    const up = id === pressed ? -6 : id === hover ? LIFT : 0;
    node.setAttribute("transform", translateAlong(P, [0, 0, up]));
  }

  const text = hover ? hover + " \\u00b7 " + NOTES[hover] : stateText();
  if (info.textContent !== text) {
    info.textContent = text;
    stage.setAttribute("aria-label", "Idle clock: " + text);
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (pressed && (pressT += dt) > 0.35) pressed = null;
  if (running && !dragging) {
    if (!held && !suspended) {
      if (resetT >= 0) {
        resetT += dt / RESET_S;
        idle = resetFrom * (1 - ease(clamp(resetT, 0, 1)));
        if (resetT >= 1) { resetT = -1; idle = 0; }
      } else if ((idle += dt * RATE) >= SUSPEND_AT) {
        idle = SUSPEND_AT; suspended = true; suspendT = 0;
      }
    }
    if (suspended) {
      suspendT += dt;
      if (suspendT > HOLD_S) trip(WAKE[tourIdx++ % WAKE.length]);
    }
  }
  draw(dt);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } }
function poke() { if (!frame) draw(1); }
function trip(id) {
  pressed = id; pressT = 0;
  resetFrom = idle; resetT = 0; suspended = false; suspendT = 0;
  run();
}

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

const toScreen = (event) => {
  const box = svgEl.getBoundingClientRect();
  return [((event.clientX - box.left) / box.width) * VIEW_W, ((event.clientY - box.top) / box.height) * VIEW_H];
};
const zAt = (sy) => (0.5 * W_B - (sy - P.origin[1]) / cam.k) / cam.cosE;
stage.addEventListener("pointerdown", (event) => {
  const [sx, sy] = toScreen(event), [wx, wy] = iso([...pose(W_A, W_B), weightZ()], P);
  if (Math.hypot(sx - wx, sy - wy) > 74) return;
  dragging = true; running = false;
  dragZ = weightZ(); dragFrom = zAt(sy);
  if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});
stage.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const [, sy] = toScreen(event);
  const z = clamp(dragZ + (zAt(sy) - dragFrom), Z0 - DROP, Z0);
  idle = clamp((Z0 - z) / DROP * T1_S, 0, T1_S);
  suspended = false; held = false; resetT = -1;
  draw(1);
  event.preventDefault();
});
stage.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  clearTimeout(resumeT);
  resumeT = setTimeout(() => { last = 0; run(); }, RESUME_MS);
});
stage.addEventListener("keydown", (event) => {
  let used = true;
  if (event.key === " ") {
    held = !held; resetT = -1;
    if (held) suspended = false;
  } else if (/^[1-4]$/.test(event.key)) {
    pressed = WAKE[Number(event.key) - 1]; pressT = 0;
    resetFrom = idle; resetT = 0; suspended = false; suspendT = 0;
  } else used = false;
  if (used) { event.preventDefault(); run(); poke(); }
});

if (still.matches) { idle = 412; running = false; } else { running = true; }
draw(1);
`;

const body = k.plateHtml({
  fig: "Fig 6.1",
  title: "The idle clock",
  hint: "Hover a lever to name it · drag the weight to rewind · 1–4 trip · Space holds the pawl",
  readout: "awake · idle 412 s · T1 in 188 s",
  keys: [
    { mark: "lit", label: "The 600-second hand — the figure's one lit part" },
    { mark: "raised", label: "A wake trip lever: power, hall, touch or rtc" },
    { mark: "dim", label: "The stage-1 face, dimmed once the machine suspends" },
    { mark: "dotted", label: "Graduations: 30 ticks of 20 s on T1, 12 of 5 s on T2" },
  ],
  caption:
    "powerd counts inactivity in two stages (§6.2). One winding of the barrel is one turn of the stage-1 drum — 600 s — and it ends by lifting the screen-saver flag; the stage-2 drum is geared 30:3 off the same wheel, so its next turn arrives 60 s later and suspends the machine to RAM. The preventScreenSaver property is a pawl dropped into the great wheel: while it holds, the train stops and stage one never fires. The back rail carries the five things that can wake the device: the power key (max77696-onkey, KEY_POWER only), the hall cover (wario_hall), the touch controller (cyttsp4_mt), and an RTC alarm (rtcWakeup, on two of the three RTCs). The fifth station is the accelerometer the Paperwhite 3 does not have — welded shut. The network socket at the right has no wake-on-WLAN: ath6kl runs with wow_mode=0, so the plug drops out when the machine suspends.",
  body: `<div class="iso-stage" tabindex="0" role="application" aria-label="The idle clock">${svg}</div>`,
});

mkdirSync(join(HERE, "shots"), { recursive: true });
const suffix = theme === "light" ? "-light" : "";
writeFileSync(join(HERE, `${NAME}${suffix}.html`), k.pageHtml({ title: "The idle clock", theme, body, script: kitScript() + live, width: 980 }));
writeFileSync(join(HERE, `${NAME}${suffix}.svg`), k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: svgBody, standalone: theme }));
console.log("wrote", `${NAME}${suffix}.html`, `${NAME}${suffix}.svg`);
