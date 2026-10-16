# The Kindle, From the Panel Up

### A device-specific architecture reference for building e-ink-native software

This is the research foundation for **kernink** — a lean, MIT-licensed, Rust "head" (frontend/OS)
for Kindle e-ink devices. It is *not* a general guide to Linux. It is a guide to **this** machine:
a 2015 Kindle Paperwhite 3 ("Wario", i.MX6SoloLite), running a vendor-forked Linux 3.0.35 with
Amazon's `lab126` patches, an e-ink controller instead of a GPU, and a userspace that assumes
nothing modern.

The goal is not just to understand the device, but to **think in it** — to know which layers are
load-bearing, which are costume, where the real cost lives, and where a small, deliberate program
can replace a giant one. It ends in product terrain: what this understanding lets us build.

---

## How to read this

- Chapters `01`–`08` are the machine (hardware, boot, kernel, display, input, power, userspace,
  storage).
- Chapter `09` is the ecosystem: what others have built and the hard-won lessons (and licenses).
- Chapter `10` is how we build and deploy for it.
- Chapter `11` turns the findings into concrete architecture decisions for kernink.
- Chapter `12` is the product-ideation lens: extensions and applications.

Every non-obvious claim carries a **confidence marker** and, where useful, a source:

| Marker | Meaning |
|---|---|
| `[dev]` | **Verified on our device** by direct read-only probing (see `_notes/C-device.md`). |
| `[GPL source]` | Read from Amazon's GPL source drops (kernel / u-boot / busybox / upstart) or community mirrors. |
| `[RE/documented]` | Reverse-engineered / documented by credible community sources (kindlemodding.org, MobileRead, FBInk, etc.). |
| `[official]` | Amazon / vendor documentation. |
| `[forum/uncertain]` | Community claim, possibly stale or unverified — treat with care. |
| `[inferred]` | Our own analysis; not directly confirmed. |

If a claim matters to a decision and is not `[dev]` or `[GPL source]`, it is flagged.

---

## The device in one paragraph

A **Kindle Paperwhite 3** (2015): a Freescale **i.MX6SoloLite** SoC (single Cortex-A9, **no GPU,
no IPU**), 512 MB LPDDR2, 3.6 GiB eMMC, a **Maxim MAX77696** PMIC, an **E Ink Carta** panel
(`ED060KD1C4`, 1072×1448, 16 grey levels) driven by the SoC's **EPDC** (electrophoretic display
controller), a **Cypress TrueTouch Gen4** capacitive touch panel (MT-B evdev), an **Atheros AR6003**
Wi-Fi chip (no Bluetooth, **no audio**), and a **magnetic-cover hall sensor**. It runs
`linux-3.0.35-lab126` (board-file, **no device tree**), glibc 2.20, **upstart 0.6.6**, busybox, an
X11 desktop (`Xorg` + `awesome` + `blanket`), and Amazon's Java "KPP" framework on a proprietary
`cvm` JVM, with `lipc` (a D-Bus layer) as the system bus.

The single most important architectural fact: **there is no graphics stack as we know it.** There
is no DRM/KMS, no GPU, no compositor pipeline. There is a `/dev/fb0` that is 8-bit greyscale, and
a controller you *publish damage rectangles to*. Everything — Amazon's home screen, KOReader, and
what we will build — is ultimately: *write pixels into memory, then tell the EPDC which rectangle
changed and how hard to refresh it.*

---

## Table of contents

A list rather than a table on purpose: every entry reflows to the width of whatever screen it is
read on, and each one is a link into the book.

- [**00 — Preface: why this device, and why the panel is the point**](#preface) — why this book;
  the thesis; method and provenance.
- [**01 — Hardware**](#ch01) — SoC, PMIC, panel, touch, storage, radios, **sensors**.
- [**02 — Boot, firmware, and the security model**](#ch02) — Boot ROM → HAB → u-boot → kernel;
  diags; jailbreaks; OTA; persistence.
- [**03 — The lab126 kernel and the device model**](#ch03) — board-file, no device tree, modules,
  `/proc/bd`, watchdog, PXP, uinput.
- [**04 — Display and the EPDC: the heart of the machine**](#ch04) — **the core.** Framebuffer,
  EPDC, waveforms, ioctls, damage, ghosting, refresh policy.
- [**05 — Input and gestures**](#ch05) — evdev MT-B, capability bitmaps, how stock does gestures,
  **how to build our own**.
- [**06 — Power, sleep, and the absence of thermal**](#ch06) — `powerd` states, timers,
  suspend/wake, hall, RTC, battery, frontlight.
- [**07 — The userspace stack: how the stock Kindle actually renders**](#ch07) —
  X/awesome/blanket/pillow/cvm/Java/lipc — **the layers when stock draws a menu or a book**.
- [**08 — Storage, filesystem, and configuration**](#ch08) — partitions, mounts, FUSE, `/mnt/us`,
  `/var/local`, `/etc/kdb`, `uks`.
- [**09 — The ecosystem and prior art**](#ch09) — jailbreaks, KUAL/KPM, KOReader, FBInk,
  `slint-kindle-backend`, licensing, gap analysis.
- [**10 — Toolchain and deployment**](#ch10) — Zig/musl static armv7, `cargo-zigbuild`, deploying to.
  `/mnt/us`, KPM scriptlets.
- [**11 — Implications for kernink**](#ch11) — what the research forces into the architecture.
- [**12 — Opportunities and horizons**](#ch12) — extensions, applications, product ideation.
- [**Glossary**](#glossary) — terms.
- [**References**](#references) — consolidated sources.

The raw research notes that fed the book are preserved in the repository under
`docs/books/the-kindle-from-the-panel-up/_notes/`: `A-internet.md` (public/RE research),
`B-prior-art.md` (ecosystem survey), `C-device.md` (live probe transcript). The book is the
synthesis; the notes are the evidence.

---

## Method & provenance

Three independent streams fed this book, and were then reconciled:

1. **Public record** — Amazon GPL source drops, the MobileRead wiki, kindlemodding.org, FBInk's
   headers, and community reverse-engineering writeups (`_notes/A-internet.md`).
2. **Prior art** — every meaningful third-party Kindle project, its mechanism, license, and the
   constraints it reveals (`_notes/B-prior-art.md`).
3. **Live device** — a read-only SSH probe of our own PW3 (kernel, sysfs, `/proc`, input
   capabilities, upstart, LIPC, partitions) (`_notes/C-device.md`).

Where the three disagreed, the device wins, then the GPL source, then documented RE. Conflicts are
called out inline (see, e.g., the **waveform-LUT ownership** question in `04`).

> **Safety & scope.** This book covers *architecture* and *homebrew*. It deliberately excludes
> DRM/content-piracy topics. All our experiments on the device were read-only; no boot-chain,
> kernel, or firmware modification is contemplated — as `02` explains, that is both impossible
> (signed boot) and unnecessary.

---

## House rules for the prose

This book is mostly read on the device it describes, so how it *renders* is part of how it is
written. Three rules follow, and `scripts/check-epub.py` fails the build when the first two break:

- **No table wider than two columns.** In a three-column table the reader squeezes the columns until
  a long token no longer fits, and then hyphenates it: `CONFIG_THERMAL_OFF` is rendered
  `CON-FIG_THERMAL_OFF`, which is no longer the string. Measured on the device, so anything needing a
  third field is a list instead.
- **No image wider than the panel.** Figures are rendered at 992 px against a 1072 px screen, so they
  cannot overflow even in a reader that ignores the stylesheet.
- **Nothing whose meaning is its alignment.** Device transcripts stay verbatim — they are evidence,
  and `check-epub.py` reports their over-wide lines rather than failing them. Authored diagrams and
  column grids do not survive here, because their meaning would depend on the reader's viewport.

The book's stylesheet (`epub.css`) is deliberately narrow to match: no `font-family` overrides, one
small heading scale, and every rule that changes `font-size` resets the inline runs inside it, so an
`em` cannot compound twice.
