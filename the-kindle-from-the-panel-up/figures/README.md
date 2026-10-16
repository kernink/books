# Figures

Isometric figures for *The Kindle, From the Panel Up*. Each one is a **machine** whose parts map
1:1 onto the concept it explains — the object *is* the explanation. They are built as plain
TypeScript-free ES modules that emit SVG, so there is no framework, no build system, and no
runtime dependency.

| Figure | Machine | Chapter |
|---|---|---|
| `fig-refresh` | The refresh press — a gantry carrying an aperture frame to a damage rectangle, indexed by a temperature slide and a waveform selector | 04 — Display and the EPDC |
| `fig-touch` | The contact tracker — a strip-chart recorder fed by a slot turret and a cam bank | 05 — Input and gestures |
| `fig-power` | The idle clock — a two-stage clockwork timer with a prevent pawl and wake trip levers | 06 — Power, sleep and thermal |
| `fig-stack` | The layer rack — drawers on guide pillars feeding one chute, against a single tray | 07 — Userspace and the rendering stack |

## What each figure emits

Running a figure script writes four files:

- `fig-<name>.html` — the interactive card, dark theme. Open it directly: hover moves the machine,
  the arrow keys nudge it, the digits pick a mode, and the readout follows.
- `fig-<name>-light.html` — the same card in the light theme.
- `fig-<name>.svg` / `fig-<name>-light.svg` — the static drawing with its styles embedded, for
  anywhere an image is wanted rather than a page.
- `fig-<name>-light.png` — the light card rasterised at 1×, which is what the book embeds. Written
  by `render.mjs`, not by the figure script. **1× is deliberate**: the plate is laid out at ~992 CSS
  px, so a 1× capture is the figure at its native size. That keeps the EPUB half the size, loses no
  detail on a 1072 px panel, and — the reason — an image narrower than the screen it is read on
  cannot overflow it, even in a reader that ignores the book's stylesheet.

## Build

```sh
cd docs/books/the-kindle-from-the-panel-up/figures
node fig-refresh.mjs && node fig-refresh.mjs --light      # one figure, both themes
node render.mjs                                           # rebuild every figure's book PNG
node render.mjs --dark                                    # dark PNGs, for the screenshot set
```

Then rebuild the book:

```sh
cd docs/books/the-kindle-from-the-panel-up && ./make-epub.sh
```

## Verify

Rendering is cheap and guessing is expensive, so nothing here is considered done until it has been
looked at. Two checks, both run against the light card:

```sh
# every texture line must end on another stroke, a dot or an outline, or under a
# fill painted after it
node /path/to/anatomy/scripts/lines.mjs fig-refresh-light.html
# -> "line ends: 0 of 390 ends on 86 lines float"

# and then actually look at it, at desk width, at 390 px, and in both themes
node _kit/capture.mjs fig-refresh-light.html --out shots/refresh.png --width 1100 --reduced
node _kit/capture.mjs fig-refresh-light.html --out shots/refresh-phone.png --width 390 --reduced
```

`node render.mjs` runs the line-end check on every figure as it renders, and exits non-zero if any
of them reports floating line ends, so the check cannot be skipped by accident. It looks for the
anatomy skill at `$ANATOMY_SCRIPTS` (default `~/.agents/skills/anatomy/scripts`); if that is not
present it says so and renders without the check. Verifying also means *looking* — capture the card
at 1100 px, at 390 px, and in both themes, and read the PNGs.

The capture step also measures the card's own chrome. The hint and the readout are both pinned to
the plate's bottom edge, so a hint that grows too long silently collides with the readout — which it
did in `fig-touch`, where the two printed on top of each other. `capture.mjs` now measures both boxes
and refuses to write a PNG if they come within 8 px, so the failure is caught rather than shipped:

```
chrome · hint 398px · readout 391px · gap 151px
```

## The kit

`_kit/` is vendored from the `anatomy` skill (MIT, © 2026 Ryan), with two edits:

- `_kit/iso-kit.mjs` — projection, prisms, cylinders, ticks, knurling, dots, fills, the card and the
  page shell. This is the whole drawing language. Unmodified.
- `_kit/inline-kit.mjs` — inlines the kit into the page so the live script can call `iso()`,
  `translateAlong()` and friends directly. **Edit 1**: `KIT` points at this directory instead of
  `../kit`, because the kit is vendored beside it.
- `_kit/capture.mjs`, `_kit/chrome-port.mjs` — headless-Chrome screenshotting, used by `render.mjs`.
  **Edit 2**: `capture.mjs` measures the hint and readout boxes before shooting and refuses to
  capture a plate whose chrome has run into itself (see *Verify* above).
- `_kit/LICENSE` — the MIT licence the above is distributed under.

Everything the figures add on top is one local helper each: a `helix()` for the press spring (the
kit's `coil()` only winds about a horizontal axis, and a press spring stands up), and the same
`helix()` reused for the clock weights.

## House rules the figures follow

- **One world unit is one panel pixel** where the figure is about the panel: the frame in `fig-refresh`
  is a real 480×60 damage rectangle on a real 1072×1448 page.
- **One `lit` accent per figure** — the single part that is doing the work the figure is about.
- **Every number in a readout is true and comes from the model.** Where a quantity is not knowable
  from the device (a panel's per-waveform latency, say), the figure shows only what the book's own
  tables claim, and the caption says which parts are kernink policy rather than vendor fact.
- **Calm motion.** Nothing bounces. A machine that is idle should look idle, and
  `prefers-reduced-motion` must hold a still frame.
