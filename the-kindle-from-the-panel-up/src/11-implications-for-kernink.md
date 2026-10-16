# 11 — Implications for kernink<a id="ch11"></a>

> This chapter converts the research into design. Nothing here is a final commitment — it is the set
> of constraints the device *imposes* on any frontend, expressed as decisions a lean Rust "head" can
> adopt. Where a choice is still open, it is marked.

## 11.1 The non-negotiables the device hands us

- **One 8-bpp Y8 framebuffer, no GPU, no DRM** — `04`. A **greyscale CPU rasteriser**; no GPU/graphics stack.
- **Refresh = damage rect + waveform** — `04`. **Waveform is a parameter of every draw**, not a global setting.
- **Waveform dominates perceived latency** — `05.8`. UX = **choosing waveforms well**, on a per-rectangle basis.
- **One EPDC ⇒ one writer** — `04`, `07`. **Single-writer discipline**: suspend the other writer, or join `awesome`.
- **Clean MT-B evdev, 1:1 coords, no pressure, ~2 fingers** — `05`. **Own gesture engine**; design for 2 fingers.
- **Power is a state machine; sleep is the norm** — `06`. **Event-driven, idle in `poll(2)`, hold-awake only while interactive**.
- **Read-only `/`, FUSE `/mnt/us`, `/MNTUS_EXEC`** — `08`. **Everything ships to `/mnt/us`**.
- **`framework_ready` + KPM are the seams** — `02`, `09`. **Cooperate with the system**: autostart job + package.
- **No FBInk (GPL) / no Slint (GPL) is MIT-safe** — `09.11`. **Own the EPDC + input + rasteriser**; tiny dep budget.
- **`slint-kindle-backend` proves the mechanics on PW3** — `09.8`. Reuse the *patterns* (mmap/ioctl/evdev/poll/suspend).

## 11.2 The central abstraction: a `Display` that speaks waveforms and damage

The device's model is explicit and should be the *first* thing the architecture encodes:

/// A rendered greyscale frame plus the regions
/// that changed.
pub trait Display {
    /// mmap'd Y8 surface (or host buffer)
    fn fb(&self) -> Surface;
    /// Refresh with an explicit intent.
    fn update(&mut self, damage: &[Rect],
              mode: RefreshMode) -> Result<Marker>;
    fn wait(&mut self, marker: Marker) -> Result<()>;
}

**Backends behind that trait** (chosen by `cfg`/feature/CLI):

- **`NativeEpdc`** — device. The real thing: mmap fb0 + `MXCFB_SEND_UPDATE` (`04.4`).
- **`FbInkCli`** — device. Shell out to existing `fbink` (POC parity; no `libfbink.so`).
- **`Png`** — **host**. Render a frame to PNG — fast layout iteration (`10.5`).
- **`Null`** — tests/CI. Record damage rects, draw nothing.

This one abstraction buys three things at once: **licensing cleanliness** (our own EPDC code),
**fast host iteration**, and **honest portability** (the UI layer never touches the device).

## 11.3 Ghosting and refresh are *policy*, so make policy a first-class object

`04.6` and `04.7` show that the quality of the device is decided by a *policy*: when to use `A2`
vs `DU` vs `GC16`, how long to coalesce damage, how many partials before a clean flush. The stock
stack expresses this as `winmgr`/`LIGL` (`liglFlash`, `extendDamageTimeout`, `refreshOnTurn`). We
should model the same thing explicitly:

struct RefreshPolicy {
    coalesce_window: Duration,  // before flushing
    ghost_budget: u32,          // then a Clean / Reset
    per_widget_mode: …,         // cursor → FastBilevel
}

**This is the single highest-leverage piece of "design" in the project.** A launcher that gets this
right feels like paper; one that doesn't feels like a bad LCD.

## 11.4 Single-writer discipline: the supervisor

Because one EPDC means one writer (`04`, `07.8`), the program that owns `/dev/fb0` must ensure it is
the *only* writer. Two modes, both supported by the ecosystem:

- **Takeover** (KOReader-style): `SIGSTOP` `awesome`(/`cvm`), `EVIOCGRAB` `event1`, own the fb,
  restore on exit.
- **Coexist**: be an `awesome` window on a layer, let LIGL manage refresh.

Either way, the awkward part is *lifecycle*, and it must be a **separate, tiny, survive-anything
supervisor** — not code inside the UI process:

// supervisor (conceptual)
install_exit_trap();      // signals + panic → resume
stop_stock_writers();     // SIGSTOP awesome / cvm
grab_input();
let code = run_child_ui();// the launcher, as a child
resume_stock_writers();   // SIGCONT + restart home
release_input();

Rationale: if the UI process dies unexpectedly, the **supervisor** (which is trivial and
signal-hardened) still resumes the stock writers. This directly neutralises the ecosystem's #1
failure mode — the **freeze trap** (`09.10`). *(Open question: supervisor-as-parent vs supervisor-as-
wrapper-script; the former is cleaner, the latter is more robust to the parent being killed.)*

## 11.5 Widgets, layout, and a rasteriser that respects 16 greys

- **Render in greyscale, deliberately.** Anti-aliased text tuned for 16 levels; a **bilevel path** for.
  `FastBilevel` updates (`A2`), because you cannot anti-alias in 1 bit and pretending otherwise makes
  text mushy. Two render modes, selected by `RefreshMode`, is the correct design.
- **Cheap is a feature.** A simple immediate-mode widget tree that produces (surface writes, damage.
  rects) is enough; there is no need for a retained, animation-capable scene graph on a device that
  updates a few times per second at most.
- **Text:** `ttf-parser` + one rasteriser (`fontdue` or `swash`), with **kerning** and tunable.
  hinting — the raison d'être of the project name. Load **Bookerly/Ember from the device at runtime**;
  **ship an OFL face** (Literata / EB Garamond / Inter) so the product is self-contained (`08.7`).

## 11.6 Input: a first-class, separate pipeline

`05` argues the gesture engine is *pure geometry over time* once evdev is decoded, and that it must
be decoupled from rendering (act immediately; let `RefreshPolicy` decide the repaint). So:

- **`kernink-input`** — evdev reader → `ContactTracker` → `GestureRecognizer` → `GestureEvent`.
- **`kernink-ui`** — `GestureEvent` → widget routing → state change → damage.

Because the device reports **no pressure and ~2 fingers**, the recogniser's catalogue is honest about
what it can do (`05.5`): tap, long-press, double-tap, drag/pan, swipe, two-finger tap, pinch,
edge-swipe, corner-tap, hold-and-drag. Power button (`event0`) and cover (hall) are **first-class
gestures**, not afterthoughts — and the power button is *shared* with `powerd` (`06.9`).

## 11.7 Power, as a collaborator not an obstacle

- **Hold awake only while interactive**: `preventScreenSaver 1` on interaction, `0` on idle, with an.
  **exit trap** (`06.3`). A launcher that reads for an hour should let the device sleep when the user
  walks away.
- **Wake sources are gestures**: touch, cover-open, power button, RTC (`06.4`). Design the "resume"
  path to be instant.
- **Network is optional and intermittent** (Wi-Fi dies on suspend, `06.4`). Any sync feature must be.
  resumable and must never block the UI.
- **Frontlight** via `powerd.flIntensity` (0–25) so the value stays system-consistent (`06.6`).

## 11.8 Boot integration, distribution, and survival

- **Autostart** via an upstart job on **`framework_ready`** (the hotfix idiom, `02.4`), launching the.
  **supervisor** (`11.4`).
- **Distribution** via a **KPM package + scriptlet** (`10.6`); also a manual `scp` path for dev.
- **Everything on `/mnt/us`**, requiring `/MNTUS_EXEC` (`08.9`) — survives OTAs and factory resets.
- **Reinstall gracefully**: assume an OTA can wipe rootfs state; a single KPM reinstall restores us.

## 11.9 Proposed crate layout (for discussion)

The research points at clean seams; a workspace that mirrors them:

Everything lives under `crates/` except the app and the build tool. The split mirrors the seams the
research found (`05`–`10`), not a layered architecture:

- **`kernink-core`** — `Rect`, `Surface`, `Marker`, `RefreshMode`, geometry, time, errors.
- **`kernink-fb`** — the `Display` trait and its backends: `NativeEpdc`, `FbInkCli`, `Png`, `Null`.
- **`kernink-input`** — evdev reader, `ContactTracker`, `GestureRecognizer`.
- **`kernink-text`** — fonts, shaping/kerning, greyscale + bilevel raster.
- **`kernink-ui`** — surface widgets, layout, theme, damage collection.
- **`kernink-runtime`** — the `poll` loop, app model, `RefreshPolicy`, wake/sleep.
- **`kernink-device`** — upstart/lipc/KOReader/power/hall integration.
- **`apps/kindlehome`** — the launcher (themed "inkcipit"?) — the first product.
- **`xtask`** — build/deploy/size/sim.

**Dependency budget:** `libc`; later `ttf-parser` + one rasteriser; `bitflags`; `png` (**host only**).
Explicitly **not**: `fbink-sys`/`fbink-rs` (GPL), `slint` (GPL), any GTK/cairo/pango binding, any
async runtime (we are `poll(2)`-driven, single-threaded, event-driven by design).

## 11.10 Risk register

Likelihood and impact first, then what we do about it.

- **Freeze trap (SIGSTOP without resume)** — likelihood **med**, impact **high**. Mitigation: a.
  **hardened supervisor** with exit traps (`11.4`).
- **Ghosting / bad waveform policy** — **high** / **med**. Mitigation: a `RefreshPolicy` object, plus.
  on-device tuning (`11.3`).
- **`MXCFB` struct or ioctl mismatch** — **med** / **med**. Mitigation: copy from the FBInk headers,
  and test marker/wait early.
- **OTA wipes our rootfs bits** — **low** (the OTA is blocked) / **low**. Mitigation: live on.
  `/mnt/us`, and reinstall via KPM.
- **FUSE exec-bit surprises** — **low** / **low**. Mitigation: ensure `/MNTUS_EXEC` is set, and test.
  on the device.
- **X stealing the framebuffer back** — **med** / **med**. Mitigation: takeover mode with the.
  supervisor, or `awesome`-window mode.
- **Scope creep (bloat)** — **high** / **high**. Mitigation: an `xtask size` budget, and "no.
  dependencies unless proven".
- **Font licensing mistake** — **low** / **high**. Mitigation: runtime-load the system fonts, and.
  ship OFL only (`08.7`).

## 11.11 Open questions to resolve next

1. **Keep `x` running, or drop it by default?** The device boots `x` (`Xorg`+`awesome`+`blanket`) even
   with the framework down (`07.2`). A lean head arguably wants `x` *stopped* — but then we own input,
   screensaver, and the `x_should_start` graph ourselves. *(Decision pending; affects `11.4`.)*
2. **Stop Amazon content daemons (`todo`/`tmd`/`archive`/`rcm`) by default?** Reclaims ~25–30 MB
   (`06`, `07.7`) at the cost of stock features. *(Decision pending.)*
3. **How does the user get *back* from the stock Kindle OS to kernink?** Today it is one-way; the
   **power button** (`event0`, shared with `powerd`) is the likely hook (`12.4`). *(Design gap.)*
4. **`awesome`-window mode vs takeover** as the default product path (`07.8`). *(Trade-off: polish vs
   simplicity.)*

## 11.12 The thesis, restated as an architecture

> **One process, `poll(2)`-driven, greyscale, waveform-aware, single-writer, on `/mnt/us`, started at
> `framework_ready`, wrapping the stock stack in a trapped supervisor — and never linking anything
> that would compromise its licence or its lightness.**

If that sentence survives contact with the device, the project is on track.
