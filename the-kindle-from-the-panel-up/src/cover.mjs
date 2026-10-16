// cover.mjs — the cover.
//
// Same world as the figures (one unit is one panel pixel), same kit, same light
// theme — but a cover is not a figure: no card, no readout, no interaction, one
// object. It is drawn at the panel's own size (1072 x 1448), so the cover is the
// screen the book is about, and it survives being read on that screen: greys and
// black only, one accent, nothing whose meaning is its colour.
//
// The object is the thesis in one part: a page of prose with a damage rectangle
// marked on it — the rectangle you hand the EPDC, with the pixels it will rewrite
// and the waveform you will ask for. Every number on it is the book's.
//
//   node cover.mjs     -> cover.html, cover.svg, cover.png
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./figures/_kit/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1072, H = 1448;               // the visible panel, exactly

// ---------------------------------------------------------------- page type
const M = 104;                          // text margin
const REGION_Y = 560, REGION_H = 750;   // where the object is fitted

// ---------------------------------------------------------------- geometry
// Bezel proportions are the device's, and they are what make it read as a
// Kindle: the PW3 screen is 91 x 122 mm inside a 117 x 169 mm body, so the side
// bezels are thin, the top one is thin, and the chin is not.
const PANEL = { x: 0, y: 0, w: 1072, d: 1448, r: 20 };
const BODY = { x: -130, y: -130, w: 1332, d: 1813, r: 40 };
const BODY_TOP = 26, PANEL_LOW = 26, PANEL_TOP = 38;

// the damage rectangle of Fig 4.1: its image block, 880 x 300 panel pixels —
// the region the EPDC repaints in sixteen greys
const DAMAGE = { x: 96, y: 1030, w: 880, d: 300, r: 0 };
const LABEL = "880 × 300 · GC16";

// the page the panel is showing: a title rule and lines of prose
const RULE = { x: 96, y: 158, w: 520 };
const lineLength = (i) => 300 + ((i * 37) % 6) * 104;
const LINES = 12, PITCH = 66, FIRST = 240;

const P = k.fitProjection(k.boxCorners(BODY, 0, BODY_TOP), W, REGION_H, { pad: 46 });

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);

// ---------------------------------------------------------------- the machine
// the damage rectangle: shaded, because these are the pixels the next update
// rewrites; ticked at its corners, because in this book a rectangle is a
// rectangle and not a suggestion
function damage() {
  const out = [];
  out.push(`<path class="cv-damage" d="${k.slabOf(DAMAGE, PANEL_TOP, 0.8, P, 4).fill}"/>`);
  out.push(D(k.dotGrid(DAMAGE.x + 25, DAMAGE.y + 20, 34, 9, 25, PANEL_TOP + 1.0, P), { size: 1.4, tone: "hi" }));
  out.push(L(k.planOutline(DAMAGE, PANEL_TOP + 1.0, P, 4), { tone: "hi" }));
  out.push([[-1, 1, 1, 1], [1, 1, -1, 1], [-1, -1, 1, -1], [1, -1, -1, -1]].map(([ax, ay, sx, sy]) => {
    const cx = ax < 0 ? DAMAGE.x : DAMAGE.x + DAMAGE.w, cy = ay < 0 ? DAMAGE.y : DAMAGE.y + DAMAGE.d;
    return L(k.onTop([[cx + 44 * sx, cy], [cx, cy], [cx, cy + 36 * sy]], PANEL_TOP + 1.0, P), { tone: "hi" });
  }).join(""));
  return out.join("");
}

function machine() {
  const out = [];
  const z = PANEL_TOP + 0.6;

  out.push(`<path class="iso-halo" d="${k.haloOf(BODY, 0, 6, P)}"/>`);
  out.push(S(k.slabOf(BODY, 0, BODY_TOP, P, 10, 1.6), { tone: "mid" }));
  // the bezel is a shade darker than the screen, or the device reads as a sheet
  out.push(`<path class="cv-bezel" d="${k.slabOf(BODY, BODY_TOP, 0.4, P, 10, 1.6).fill}"/>`);
  out.push(L(k.planOutline(k.insetPlan(BODY, 10), BODY_TOP + 0.4, P, 10), { tone: "faint" }));
  // the chin carries the one number the whole book rests on
  out.push(k.faceTextSvg(k.topMatrix([536, 1572], BODY_TOP + 0.4, P, "x"), "1072 × 1448", { size: 34, tone: "lo", anchor: "middle" }));

  out.push(S(k.slabOf(PANEL, PANEL_LOW, PANEL_TOP - PANEL_LOW, P, 8, 1.2), { tone: "hi" }));

  // the page on the panel
  out.push(L(k.lineOnTop([RULE.x, RULE.y], [RULE.x + RULE.w, RULE.y], z, P), { tone: "hi", free: true }));
  for (let i = 0; i < LINES; i++) {
    const y = FIRST + i * PITCH;
    out.push(L(k.lineOnTop([M, y], [M + lineLength(i), y], z, P), { tone: "lo", free: true }));
  }

  out.push(damage());
  out.push(k.faceTextSvg(k.topMatrix([DAMAGE.x, DAMAGE.y + DAMAGE.d + 42], PANEL_TOP, P, "x"), LABEL, { size: 32, tone: "mid" }));
  return out.join("");
}

// ---------------------------------------------------------------- page type
function page() {
  return [
    `<rect class="cv-frame" x="40" y="40" width="${W - 80}" height="${H - 80}"/>`,
    `<text class="cv-eyebrow" x="${M}" y="190">KERNINK BOOKS</text>`,
    `<text class="cv-title" x="${M}" y="292">The Kindle,</text>`,
    `<text class="cv-title" x="${M}" y="384">From the Panel Up</text>`,
    `<text class="cv-sub" x="${M}" y="472">A device-specific architecture reference</text>`,
    `<text class="cv-sub" x="${M}" y="506">for building e-ink-native software.</text>`,
    `<line class="cv-rule" x1="${M}" y1="1340" x2="${W - M}" y2="1340"/>`,
    `<text class="cv-foot" x="${M}" y="1376">the kernink project</text>`,
    `<text class="cv-foot" x="${W - M}" y="1376" text-anchor="end">MIT · kernink/books</text>`,
  ].join("");
}

const CSS = `
.iso{--anatomy-weight:.75px}
.cv-bezel{fill:#e6e6e2;stroke:none}
.cv-damage{fill:#dcdcd9;stroke:none}
.cv-frame{fill:none;stroke:var(--anatomy-faint);stroke-width:1}
.cv-rule{stroke:var(--anatomy-faint);stroke-width:1}
.cv-eyebrow{font:500 15px var(--anatomy-mono);letter-spacing:.3em;fill:var(--anatomy-muted)}
.cv-title{font:600 78px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.022em;fill:var(--anatomy-strong)}
.cv-sub{font:400 21px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;fill:var(--anatomy-text)}
.cv-foot{font:500 14px var(--anatomy-mono);letter-spacing:.08em;fill:var(--anatomy-muted)}
`;

const svgBody = `${page()}<g transform="translate(0 ${REGION_Y})">${machine()}</g>`;

// the standalone SVG has to carry the cover's own type, not just the kit
writeFileSync(join(HERE, "cover.svg"), k.figureSvg({ width: W, height: H, label: "The Kindle, From the Panel Up — cover", body: `<style>${CSS}</style>${svgBody}`, standalone: "light" }));
writeFileSync(join(HERE, "cover.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Cover — The Kindle, From the Panel Up</title>
<style>${k.ISO_CSS}${CSS}
html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--anatomy-card)}
.iso-svg{display:block;width:${W}px;height:${H}px}
</style></head>
<body class="iso" data-theme="light"><svg class="iso-svg iso" data-theme="light" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="The Kindle, From the Panel Up — cover">${svgBody}</svg></body></html>
`);
// Capture at 1x for the same reason the figures do — the cover is laid out at
// exactly 1072 CSS px, so 1x is the panel's own resolution and nothing is
// resampled. The kit pads a plate by 6 px on every side; a cover must be the
// panel exactly, so clip the viewBox rather than the element box.
execFileSync(process.execPath, [join(HERE, "figures/_kit/capture.mjs"), "cover.html",
  "--out", join(HERE, "cover.png"), "--width", String(W), "--height", String(H),
  "--scale", "1", "--zoom", `0,0,${W},${H}`, "--zoom-scale", "1", "--reduced"], { cwd: HERE, stdio: "inherit" });
console.log("wrote cover.html cover.svg cover.png");
