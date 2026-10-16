# 00 — Preface: why this device, and why the panel is the point<a id="preface"></a>

## 0.1 The uncomfortable question

Every UI framework you have used — on desktop, on mobile, even most "embedded" ones — was designed
for a display that emits light and can be redrawn sixty times a second. The Kindle's screen does
neither. It **reflects** ambient light (it is a light *valve*, not a lamp), it holds its image
with **zero power** (it is bistable), it renders in **16 shades of grey**, and it takes **tens to
hundreds of milliseconds** to change. Software that ignores these facts is either slow, ugly, or
both.

Amazon's own frontend is an object lesson in the cost of that mismatch. To show you a grid of book
covers, the device runs an X server, a tiling window manager, a GTK2 stack, a WebKit browser, a
proprietary JVM, and a Java application framework — **~190–225 MB of RAM and 126 processes**
`[dev]` — to eventually write grey bytes into a framebuffer and poke a controller. KOReader does
the same job with none of it. That gap is the whole opportunity.

## 0.2 The thesis

> The panel is not a dumb framebuffer at the bottom of a stack; it is the *centre* of the design.
> A frontend that owns the refresh — the damage rectangle and the waveform — and that assumes
> reflection, greyscale, and slowness from the first line of code, will be smaller, faster,
> longer-lived, and better-looking than anything ported onto the device.

Concretely, the thesis implies:

1. **No compositor tax.** No X, no Wayland, no GTK, no Cairo, no JVM, no browser. A single
   event-driven process that draws greyscale pixels and issues EPDC updates.
2. **Refresh is a design material**, not a side effect. Fast non-flashing updates (`A2`/`DU`) for a
   tap; clean flashing updates (`GC16`) for a page turn; ghost management as a first-class concern.
3. **The device is a fixed embedded target**, not a mini-distro. Its kernel is a 2011 vendor BSP;
   its interfaces (fbdev, evdev, sysfs, upstart, lipc) are ancient and stable. We program *those*.
4. **Lean is a moat, not a virtue.** A 1–2 MB process that boots instantly, idles at ~0% CPU, and
   can never "hang at a spinner" is something the stock stack structurally cannot be.

## 0.3 What this book is *not*

- Not a Linux kernel book. Linux is the substrate; this book is about how Amazon *bent* it for a.
  single-purpose e-ink appliance, and how to work inside that bend.
- Not a jailbreak guide. Our device is already jailbroken; `02` documents the boot/security model.
  so we know what is *safe to assume* and what is *untouchable*.
- Not a DRM or content-piracy resource.
- Not exhaustive. It is the map we need to build a frontend, with the terrain that changes our.
  decisions marked.

## 0.4 The device, tightly

| Aspect | Value |
|---|---|
| Model | Kindle Paperwhite 3 (2015), FW 5.16.2.1.1, unregistered |
| SoC | Freescale i.MX6SoloLite — single Cortex-A9, **no GPU, no IPU** |
| Board | "Wario" (`Hardware: i.MX 6SoloLite based Wario Board`) `[dev]` |
| RAM / storage | 512 MB LPDDR2 (≈503 MB usable `[dev]`) / 3.6 GiB eMMC |
| Kernel | `3.0.35-lab126 #8 PREEMPT`, gcc 4.9.1, **board-file, no device tree** `[dev]` |
| Userland | glibc 2.20, busybox 1.34.1, **upstart 0.6.6** |
| Display | `/dev/fb0` = `mxc_epdc_fb`, **8 bpp Y8**, 1072×1448, stride 1088, rotate 3 `[dev]` |
| Panel | `ED060KD1C4`, Carta, 16 greys; waveform `320_R169_AE4141_ED060KD1C4_TC` `[dev]` |
| Touch | Cypress `cyttsp4_mt`, **MT-B**, `/dev/input/event1` `[dev]` |
| Power btn | `max77696-onkey` → `KEY_POWER`, `/dev/input/event0` `[dev]` |
| Cover sensor | magnetic **hall** (`wario_hall`), `/dev/hall` `[dev]` |
| Radios | Wi-Fi only (Atheros AR6003 SDIO). **No Bluetooth. No audio.** `[dev]` |
| PMIC | Maxim MAX77696 (bucks, LDOs, fuel gauge, ONKEY, RTC, backlight, EPD rails) |

Full detail in `01`.

## 0.5 A note on the two Kindles in your head

There are really two machines here, and confusing them costs you days:

- **The Linux machine**: a stock `armv7l` Linux with fbdev, evdev, sysfs, procfs, POSIX, sockets,
  signals. Static armv7-musl binaries run on it. This is what we program.
- **The Amazon appliance**: `lab126` runlevels, `powerd`, `blanket`, `pillow`, the Java `KPP`.
  framework, `lipc`, the config DB (`kdb`), the secure-boot chain, and a rootfs that is
  **read-only, 93% full, and wiped by OTA** `[dev]`.

kernink lives almost entirely in the first and *interoperates* with the second only through
well-defined seams (upstart jobs, `lipc` properties, the `framework_ready` event, the fb/EPDC).
The rest of this book teaches those seams.
