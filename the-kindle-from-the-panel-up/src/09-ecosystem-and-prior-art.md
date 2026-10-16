# 09 — The ecosystem and prior art<a id="ch09"></a>

> Nothing here is invented in a vacuum. Two decades of hobbyists have reverse-engineered this device,
> and several of them have built the exact pieces we need — most notably a **Rust backend that runs
> on our precise model** and a **pure-Rust e-ink reader** for a sibling platform. The job of this
> chapter is to extract the lessons, the licences, and the one genuine gap.

## 9.1 The gap, stated plainly

> **There is no MIT-licensed, Rust, purpose-built home/launcher for modern Kindle.**

The space is occupied by:

- **KOReader** — a superb full alternate reader, but *reader-first* (not a home screen), and.
  **AGPL-3.0**.
- **KUAL / KUALA** — an **app menu launched as a document**, not a home; KUAL is Java (deprecated),
  KUALA is a native GTK C++ rewrite.
- **The SIGSTOP hack** — "replace the home screen" by suspending `awesome`/`cvm` and running.
  fullscreen; proven, but fragile by design.
- **`simpleui.koplugin`** (MIT) — a home screen *inside* KOReader; a design reference, not a.
  framework.

Meanwhile, on the **Rust** axis, the closest precedent is a *backend*, not a product. So kernink's
position is unusual: the *pieces* exist (a proven ioctl/evdev/suspend recipe on PW3; a proven
pure-Rust e-ink reader architecture on Kobo), but nobody has assembled them into an **MIT launcher**.

## 9.2 The prior art, project by project

Each entry gives what it is, how it works, its licence, and what it means for us.

- **KOReader** — a full alternate reader and UI, **AGPL-3.0**. Custom C `einkfb` plus a bundled.
  FBInk; `--framework_stop` SIGSTOPs `awesome` (+ `cvm`) and restarts `lab126_gui` on exit. **The
  reference for owning the screen, and for power/frontlight LIPC integration.**
- **Plato** (baskerville) — a Rust document reader for Kobo, **AGPL-3.0**. Pure Rust, a **CPU.
  rasteriser**, drawing via FBInk, no Qt. **The best pure-Rust e-ink UI architecture** — read-only
  for us.
- **Cadmus** (OGKevin) — a modernised Plato fork, AGPL-3.0 [likely]. Rust + sqlx/devenv/xtask/CI.
  Same as Plato, newer tooling.
- **FBInk** (NiLuJe) — a framebuffer inker, library and CLI, **GPL-3.0+**. `MXCFB_SEND_UPDATE`,
  waveform/dither/image/OT text, daemon. **The EPDC oracle — do not link.**
- **eips** (Amazon) — the stock text/image/refresh tool, proprietary. Legacy `FBIO_EINK_*` ioctls.
  A cheap fullscreen refresh or screenshot escape hatch.
- **KUAL / KUALA** — an app menu, licence unverified. A Java kindlet, or native GTK C++. The.
  incumbent "launcher" idiom.
- **KPM** (KindleModding) — an on-device package manager, GPL-3.0 (README CC0). Scriptlets in the.
  search bar, static repos. **Our distribution channel.**
- **Hotfix** — post-jailbreak persistence, GPL-3.0. A signed OTA `.bin`; dev keys, `MNTUS_EXEC`,
  `gandalf`, a `framework_ready` job. **Our persistence and autostart model.**
- **KindleTool** — pack/unpack/sign an OTA, GPL-3.0+. Bundles the homebrew signing key. Only if we.
  ship OTA-format installers.
- **kterm** — a GTK+VTE terminal, GPL-3.0+. GTK2/3 + VTE as a KUAL extension. Proof that GTK and VTE.
  exist on the PW3.
- **libkh** — a Kindle hacks library and tools, licence unverified. Lives in `/mnt/us/libkh/bin`,
  fbink-with-image. Handy tooling, not a dependency.
- **`slint-kindle-backend`** — **a Rust+Slint backend for Kindle**, **MIT OR Apache-2.0** (⚠ it.
  depends on **Slint, which is GPL-3.0**). mmaps the framebuffer, MXCFB ioctl damage rects, evdev
  MT-B, idle poll, suspend/wake, bilevel. **The closest Rust precedent, and tested on a PW3.**
- **`fbink-sys` / `fbink-rs`** — Rust FFI to FBInk, which links the GPL FBInk. bindgen plus a static.
  link. An FFI pattern only.
- **`kindling`** — a Rust MOBI/AZW3 builder, permissive-ish. Pure Rust, on-device thumbnails.
  Library thumbnailing.

## 9.3 Jailbreaks & the persistence contract

All jailbreaks are **userspace** (`02`); the boot chain has never fallen. The lineage matters only
because it defines **where homebrew lives** and **how it survives** `[RE/documented]`:

- **LanguageBreak** (2023) — works up to **5.16.2.1.1**; the historical entry point for our device.
- **WinterBreak** (Jan 2025) — broad range, patched in 5.18.1; delivered via the **Mesquito** WAF.
- **AdBreak** (Sep 2025) — `CVE-2012-3748` (ad-path UAF).
- Siblings catalogued: Véra, SpiderCat, SpringBreak, Nosebleed, Sanctuary, WinterBreak2.

**The payload is always the same:** `mntroot rw` → install dev keys in `/etc/uks` → create
`/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC` → create **`/MNTUS_EXEC`** → `mntroot ro`, then a
**Hotfix** (`02`).

**Two facts kernink is built on:**

1. **`/MNTUS_EXEC`** is why our binary on `/mnt/us` can run.
2. The **`framework_ready` upstart job** is the canonical autostart seam (the hotfix registers
   `kmc.conf` to run on it).

## 9.4 Package managers & distribution

- **KUAL / KUALA** — extension menus (`/mnt/us/extensions/*/menu.json`). KUALA is the closest prior.
  art to a native launcher.
- **MRPI** — a KUAL extension that installs `.bin` packages (predecessor to KPM).
- **KPM** — the current standard. Install by typing a **scriptlet** in the search bar.
  (`;kpm install <pkg>`), with static repos at `repo.kindlemodding.org`. **This is the cheapest
  possible install UX and the obvious channel for kernink.**
- **KindleForge** (Go) — a competing GUI package manager; its static cross-build recipe.
  (`GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0`) is a useful sanity reference.

## 9.5 How alternates handle the stock framework

The ecosystem's collective answer to "how do I own the screen?" (`07.8`):

- **KOReader** — `--framework_stop` → `SIGSTOP awesome` (+ `cvm` on some builds); on exit `SIGCONT`.
  and `lipc-set-prop com.lab126.appmgrd start app://com.lab126.booklet.home`. **Reversible, no
  reboot — and if it crashes without resuming, the device freezes.**
- **kindle-home-assistant-panel** — the same dance with explicit `disableEnablePillow` and.
  `killall -STOP/-CONT`, plus a documented "frozen device" trap.
- **The "correct" alternative** — become an **`awesome`-managed window** on the SCREENSAVER layer.
  with a specially-formatted title (`07.8`).

**The lesson, twice over:** *always* `trap ... EXIT` a resume.

## 9.6 Readers, and what "replacing the reader" means

- **KOReader** — its own C einkfb + bundled FBInk (image support compiled out); LuaJIT + C; AGPL.
- **Plato / Cadmus** — pure Rust, CPU rasteriser, FBInk backend; **the architecture we want** (but.
  Kobo, AGPL).
- **Stock reader** — native behind a Java/KPP host; **no reusable library**; interfaces are LIPC.
  `openDocumentWithParams` and SQLite state (`07.5`).

## 9.7 EPDC tooling: the oracle and the escape hatch

- **FBInk** — the canonical reference for waveforms, partial refresh (`-s`), flash (`-f`), dither.
  (`-D`), images (`-g`), OT text (`-t`), daemon mode, and the `alt_buffer` shim. **GPL-3.0+; read,
  don't link.**
- **`eips`** — Amazon's own legacy tool (`FBIO_EINK_*`); good for "clean full-screen refresh" and.
  screenshots.
- **`fbdepth`** — bitdepth/rotation utility; its warning about rotating the fb under X is a warning.
  worth heeding.

## 9.8 Rust-on-Kindle: the full inventory (the important part)

1. **`sverrejb/slint-kindle-backend`** — **the precedent that matters.** Rust + Slint
   (`renderer-software`, no GPU) fed through a `LineBufferProvider` that converts to greyscale and
   writes to the mmap'd `/dev/fb0`, then `ioctl`s the dirty region. Touch via `read()` on
   `/dev/input/event1`, **MT protocol B**, acting on `SYN_REPORT`, `tracking_id == -1` = release.
   Extras: **idle `poll(2)` (0 % idle CPU)**, a **wake schedule** (suspend-to-RAM between refreshes),
   **bilevel** mode (threshold → flicker-free A2-ish), 0/90/180/270 rotation. **Tested on PW3, PW1,
   PW4, KT4, KOA3.** Cross-compiled with `cargo-zigbuild` to `armv7-unknown-linux-musleabihf` —
   **exactly our plan.** Licence of the code: **MIT OR Apache-2.0**, but it depends on
   **Slint (GPL-3.0-only OR royalty-free)** → **borrow the patterns, drop Slint.**
2. **`Szybet/fbink-sys`**, **`sublipri/fbink-rs`** — Rust FFI to FBInk (static, musl, armv7l). Links
   GPL FBInk → treat as GPL.
3. **`baskerville/plato`**, **`OGKevin/cadmus`** — full Rust e-ink readers (AGPL).
4. **Quill OS** (PineNote) — Rust + Slint, Rust userspace, e-ink "modes".
5. **`ciscoriordan/kindling`** — pure-Rust MOBI builder with an on-device thumbnail writer.

**Conclusion:** kernink would be the **first purpose-built, MIT-licensed, Rust EPDC launcher/reader**
for Kindle. The hard mechanics — mmap fb0, MXCFB damage ioctl, MT-B evdev, idle poll, suspend/wake,
zigbuild to armv7-musl — are **already proven on PW3** by `slint-kindle-backend`. Only the Slint
dependency and GPL FBInk are things to avoid, and both are avoidable by writing our own small layer.

## 9.9 Adjacent e-ink work worth borrowing from

- **Plato / Cadmus** — CPU rasteriser + layout for e-ink, in Rust.
- **rmkit / InkVT** — reMarkable alt-UI toolkit and a FBInk terminal; refresh-strategy notes at.
  `rmkit.dev/eink-dev-notes`.
- **InkPlate / Soldered** — ESP32 e-paper dev boards; dithering/partial-refresh ideas.
- **Kobo `nickel`** — the same "`killall -STOP` the vendor UI" shape as Kindle `awesome`; the problem.
  is industry-wide, so the *solutions* generalise.

## 9.10 Reliability lessons (hard-won, and applicable to us)

1. **Secure boot is intact; you never need to touch it.**
2. **OTAs wipe rootfs hacks; `/mnt/us` survives.** Live in `/mnt/us`.
3. **The freeze trap.** `SIGSTOP` without `SIGCONT` = dead session. **Always trap the exit.**
4. **The EPDC has one owner.** Two writers → ghosting/flash storms. Suspend the other writer or join
   the layer system.
5. **X owns the fb** — do not rotate or change bitdepth underneath it.
6. **Exclusive input needs `EVIOCGRAB`**; passive reads let the framework react too.
7. **Waveform discipline decides perceived quality** — `A2`/`DU` for fast/bilevel, `GC16` for clean
   greyscale; bilevel thresholding is why a good UI can feel near-instant.
8. **Hold awake with `preventScreenSaver`, release reliably**, or drain the battery.
9. **busybox `ash` has no `$((16#hex))`** — use `$((0x…))`; KOReader's bundled fbink lacks image
   support (use libkh's).

## 9.11 Licensing map (MIT-safety)

**Safe to build on:**
- `slint-kindle-backend` code — **MIT OR Apache-2.0** (⚠ do **not** depend on Slint itself).
- `simpleui.koplugin` — **MIT**; `Awesome-Kindle` — **CC0**; `kindling` — permissive-ish.

**Read-only / do not link:**
- **FBInk — GPL-3.0+**; **KOReader — AGPL-3.0**; **Plato/Cadmus — AGPL-3.0**; **kterm —
  GPL-3.0+**; **KindleTool — GPL-3.0+**; **Hotfix — GPL-3.0**; **KPM — GPL-3.0**; **kindle-sdk —
  GPL-3.0**; `fbink-sys`/`fbink-rs` (link GPL FBInk).

**Unverified (treat cautiously):** WinterBreak, KUAL/KUALA, MRPI, KindleForge, usbnetlite,
kindle-python, libkh, openlipc.

**Takeaway:** the easy path (`link FBInk` / `use Slint`) is **not** MIT-clean. The clean path is
exactly the one we already chose: **own fbdev + `MXCFB` ioctls, own evdev input, own CPU rasteriser,
own layout/theme — no FBInk, no Slint.**

## 9.12 What this means for kernink's design

| Lesson | kernink decision |
|---|---|
| No MIT Rust launcher exists | **We are the gap** — build it |
| `slint-kindle-backend` proves PW3 mechanics | Reuse the *patterns*, not the deps (`10`, `11`) |
| FBInk is the oracle but GPL | Implement our own EPDC layer |
| Plato is the Rust e-ink reader architecture | Mirror its separation (renderer vs backend), don't copy code |
| Hotfix/KPM define persistence + distribution | Ship as a KPM package + `framework_ready` job |
| SIGSTOP dance is fragile | Wrap it in a trapped supervisor (`11`) |
| `/MNTUS_EXEC` + `/mnt/us` is home | All artifacts on `/mnt/us` |
