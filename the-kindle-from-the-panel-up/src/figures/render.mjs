// Rebuild every figure's book PNG (and, with --dark, the dark stills).
//
//   node render.mjs            # light PNGs into this directory
//   node render.mjs --dark     # also dark PNGs into shots/
//   node render.mjs --no-check # skip the line-end check
//
// The line-end check uses the anatomy skill's `lines.mjs` when it can find it
// (set ANATOMY_SCRIPTS to point at the skill's scripts directory). A figure with
// floating line ends fails the run.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = process.env.ANATOMY_SCRIPTS ?? join(homedir(), ".agents", "skills", "anatomy", "scripts");
const CHECKER = join(SCRIPTS, "lines.mjs");
const FIGS = ["refresh", "touch", "power", "stack"];
const dark = process.argv.includes("--dark");
const checking = !process.argv.includes("--no-check") && existsSync(CHECKER);

if (!checking) {
  console.log(`note: ${CHECKER} not found — rendering without the line-end check`);
}

let failed = [];
for (const fig of FIGS) {
  const src = `fig-${fig}.mjs`;
  if (!existsSync(join(HERE, src))) {
    console.log(`skip  ${fig}: ${src} not present`);
    continue;
  }
  execFileSync(process.execPath, [src], { cwd: HERE, stdio: "inherit" });
  execFileSync(process.execPath, [src, "--light"], { cwd: HERE, stdio: "inherit" });

  if (checking) {
    let report = "";
    try {
      report = execFileSync(process.execPath, [CHECKER, `fig-${fig}-light.html`, "--wait", "900"], { cwd: HERE, encoding: "utf8" });
    } catch (error) {
      report = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    const line = report.split("\n").find((text) => text.startsWith("line ends:")) ?? "line ends: unreadable";
    console.log(`${line.startsWith("line ends: 0 ") ? "ok   " : "FLOAT"} ${fig}: ${line}`);
    if (!line.startsWith("line ends: 0 ")) failed.push(fig);
  }

  // --scale 1 on purpose. The plate is laid out at ~992 CSS px, so a 1x capture is
  // the figure's native resolution: no detail is lost on a 1072 px panel, the EPUB
  // stays half the size, and — the point — an image whose intrinsic width is
  // smaller than the target screen cannot overflow it even in a reader that
  // ignores the book's stylesheet.
  execFileSync(process.execPath, ["_kit/capture.mjs", `fig-${fig}-light.html`, "--out", `fig-${fig}-light.png`, "--width", "1100", "--height", "1000", "--scale", "1", "--reduced", "--wait", "900"], { cwd: HERE, stdio: "inherit" });
  if (dark) {
    execFileSync(process.execPath, ["_kit/capture.mjs", `fig-${fig}.html`, "--out", `shots/${fig}-dark.png`, "--width", "1100", "--height", "1000", "--reduced", "--wait", "900"], { cwd: HERE, stdio: "inherit" });
  }
}

if (failed.length) {
  console.error(`\nfloating line ends in: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\nall figures rendered");
