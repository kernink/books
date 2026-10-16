# 12 — Opportunities and horizons<a id="ch12"></a>

> This is the product-ideation chapter the whole book was built for. It takes the *capabilities* the
> device actually has — and honestly does not have — and asks what is worth building. The rules:
> every idea below is grounded in a verified capability (`01`–`10`), and nothing assumes a sensor,
> radio, or coprocessor the device lacks.

## 12.1 The strategic frame

Three facts define the opportunity:

1. **The niche is empty.** No MIT, Rust, purpose-built Kindle launcher/reader exists (`09.1`). The
   incumbent frontends are AGPL readers (KOReader, Plato) or menus (KUAL/KUALA).
2. **The device is capable of far better than it delivers.** A 1 GHz A9, 512 MB RAM, a 300 ppi Carta
   panel, and a clean MT-B touchscreen are a *good* reading computer. ~190 MB of Java/X11/GTK is what
   stands between that hardware and a great experience.
3. **Distribution and persistence are solved.** KPM + `/MNTUS_EXEC` + `framework_ready` = a real,
   surviving install path (`10.6`).

So the opportunity is not "make a Kindle hack." It is: **be the frontend for a large installed base
of e-ink Kindles, with a piece of software the stock stack structurally cannot match.**

## 12.2 Horizon 1 — the launcher (`inkcipit`?)

The first product: a home screen that *is* the device.

Grounded features:

- **Instant, waveform-aware home.** Grid or list of books/recent reads; `A2` for taps, `DU` for.
  scrolling, a periodic `GC16` for hygiene (`04.11`).
- **"Continue reading" from real state.** Read the current book from `/var/local/cc.db`.
  (`Entries.p_cdeKey`) and library state from the SQLite DBs (`08.3`); open the stock reader via
  `lipc-set-prop com.lab126.kppReader openDocumentWithParams` (`07.5`) — or, later, read it
  ourselves.
- **Gestures the stock UI never had** (`05.5`): **edge-swipe for back**, **corner-tap for quick.
  actions**, **long-press for context** — cheap to build once you own the recogniser.
- **Frontlight and battery as first-class UI**, via `powerd` (`06.6`).
- **Cover = sleep** (hall sensor, `06.4`), so closing the cover behaves exactly as users expect.
- **No spinners, no "Please wait."** Because there is no framework to boot, the home is on screen.
  before the stock UI would have finished loading fonts.

This alone is a shippable, novel product.

## 12.3 Horizon 2 — the reading experience

The name of the project is **kernink** (kerning + ink), so typography is the point, not a detail.

- **A real text engine:** `ttf-parser` + a rasteriser, with **kerning** and hinting tuned for 16.
  greyscale levels (`11.5`). Render pages with deliberate waveform choices: `A2`/`GL16` for
  incremental, `GC16` on page turn.
- **Formats:** start with a well-defined subset (plain text, a simple EPUB path) rather than chasing.
  every Kindle format. Kindle content is heavily DRM'd; **the honest, legal scope is sideloaded,
  DRM-free content plus plain text** — and KOReader already proves there is a large audience for
  exactly that.
- **Typography features the stock device hides:** user-chosen OFL fonts (Literata, EB Garamond),
  hyphenation, real margins, adjustable line-height — the things Kindle power users complain are
  missing.
- **Reading analytics that respect privacy:** all local (SQLite on `/mnt/us`), no cloud.

## 12.4 The known gap: getting *back* from the stock OS

Today the "switch to stock Kindle" button is **one-way** (`11.11`). Design options, all grounded in
verified interfaces:

- **Power-button hook.** A *short* `KEY_POWER` press is delivered on `event0` (`05.7`). `powerd` also.
  listens, so a "short press = toggle home/stock" behaviour requires **coordination with `powerd`**
  (e.g. via its LIPC properties) rather than a fight.
- **The cover.** Open/close is a hall event (`06.4`); a deliberate pattern (e.g. close-then-open) is a.
  candidate gesture.
- **A persistent overlay.** If we ship in **`awesome`-window mode** (`07.8`), we are a *managed layer*.
  and the stock UI can sit beneath us; "go back" is a layer switch, not a process war.
- **The honest answer for v1:** make kernink the *supervisor* of both worlds — it stops the framework.
  to show itself, and can *start* the framework on demand, with the power button as the toggle.

This is *the* product-defining interaction to get right; it is not an afterthought.

## 12.5 Horizon 3 — a platform, not an app

Once the head exists, it becomes a surface for others:

- **A tiny app model.** Real extensions without a JVM: a directory of small programs (or WASM-like.
  sandboxes) that render to our surface and receive our gesture events.
- **An SDK.** The GPL "kindle-sdk" exists (`09.8`), but an **MIT Rust** one does not. Publishing the.
  `Display`/`Input`/`Widget` traits as a library (`11.9`) invites a community that cannot exist around
  KOReader's AGPL monolith or Slint's licence.
- **A package story via KPM** (`10.6`), so apps install with `;kpm install …`.
- **Widgets/plugins:** weather (cached, resumable — the network dies on suspend, `06.4`), reading.
  stats, a Pandoc-style "send to device" companion, dictionary lookup (offline).

## 12.6 Horizon 4 — companion experiences

Ideas that exploit the device's *specific* strengths rather than papering over its limits:

- **A "paper dashboard."** Because the panel is bistable and the device sleeps, an idle screen can be.
  a *useful artifact* — a calendar, a today-view, a family message board — that costs almost no power
  to hold. (The stock screensaver is a wasted surface; `blanket` can load one, `07.6`.)
- **A focus/writing device.** A minimal, distraction-free text surface: no notifications, no.
  browser, instant resume, the frontlight as the only control. This is the "Kindle as a typewriter"
  idea, and the device's constraints *are* the feature.
- **A shared/communal device.** Multiple profiles with a simple picker (the language picker shows the.
  pattern, `07.2`), good for a family Kindle.
- **Truly local-first.** No account required at all. For a large segment of users, "a Kindle that.
  doesn't phone home" is the product.

## 12.7 What we should *not* build (anti-opportunities)

The device's limits are as informative as its capabilities (`01.8`):

- **No auto-rotate apps** — there is no accelerometer.
- **No always-on connectivity** — Wi-Fi dies on suspend with no wake-on-WLAN.
- **No audio, no Bluetooth, no haptics-as-API** — none exist (`01.7`, `01.8`).
- **No heavy animation** — the panel cannot do 60 fps, and pretending otherwise makes it worse.
- **No colour** — 16 greys is the medium.
- **No ambient-light auto-brightness** — the ALS module exists but is never loaded.

Every one of these is a *trap* for a product manager who has not read this book.

## 12.8 Business / positioning notes

- **Licence: MIT** is a deliberate differentiator (`09.11`). It is what lets the project be embedded,
  forked, and shipped in contexts AGPL cannot go.
- **Distribution** is community-native (KPM, GitHub Pages repo, the KindleModding ecosystem) — cheap,
  and it reaches the exact people who want this.
- **The moat is architectural, not feature-based:** a lean, waveform-aware, single-process head that.
  is *cheap to keep alive* on a decade-old device. Competitors can copy a feature; they cannot easily
  copy "it runs in 2 MB and idles at 0 %."
- **The wedge** is the launcher (Horizon 1), because it is small, visible, and immediately better.
  than the stock home. The reader (Horizon 2) is the retention story; the SDK (Horizon 3) is the
  expansion story.

## 12.9 A concrete roadmap

Each phase is a deliverable, and each proves one thing:

- **0** — Host **PNG backend** + the `Display`/`Input` traits (`10.5`, `11.2`). Architecture is portable, not device-locked.
- **1** — **Native EPDC backend** (mmap + `MXCFB_SEND_UPDATE`) + `RefreshPolicy`. We own the panel.
- **2** — **evdev + gesture engine** (`kernink-input`). We own input; edge-swipe works.
- **3** — **`kindlehome` launcher** via the **trapped supervisor** (`11.4`). A real home screen, no freeze trap.
- **4** — **`kernink-text`** (kerning, greyscale/bilevel) + a reader. The typography thesis lands.
- **5** — **KPM package + `framework_ready` job**. It installs and survives for real users.
- **6** — **(Open question) back-from-stock toggle** (`12.4`). The product is two-way.
- **7** — **SDK + extension model** (`12.5`). It becomes a platform.

## 12.10 The one-line pitch

> **kernink: a lean, MIT, Rust e-ink head for Kindle — a home screen and reader that run in
> megabytes and milliseconds, treat the panel's refresh and the device's sleep as first-class design
> materials, and cooperate with the stock system instead of fighting it.**
