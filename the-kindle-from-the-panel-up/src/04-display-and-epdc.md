# 04 — Display and the EPDC: the heart of the machine<a id="ch04"></a>

> If you read one chapter, read this one. On this device, *display* is not a service you call; it is
> a physical process you commission. Everything about the user experience — how fast a tap feels,
> whether a page turn flashes, whether text ghosts — is decided by how you use the EPDC. Software
> that treats `/dev/fb0` as "just a framebuffer" will look like the stock UI: slow, flashy, and
> heavier than it needs to be.

## 4.1 Why e-ink is not a screen

An LCD *emits* light and can be redrawn 60+ times a second. E Ink **reflects** ambient light and is
**bistable**: once a pixel's pigment is where you put it, it stays there with **no power**. To change
a pixel you must physically drive pigment through a sequence of voltages — a **waveform** — which
takes **tens to hundreds of milliseconds** and, if done crudely, leaves **ghosting** (the previous
image faintly visible).

The controller that orchestrates this is the **EPDC** (Electrophoretic Display Controller), a block
inside the i.MX6SoloLite. It is exposed to Linux as `mxc_epdc_fb`, and its model of the world is
simple and powerful:

> **You write pixels into memory (the framebuffer), then you tell the EPDC which rectangle changed
> and how hard to refresh it.** The rectangle is the *damage*; "how hard" is the *waveform*.

Everything else — Xorg, awesome, GTK, Java, KOReader, your launcher — is a way of producing those two
things.

## 4.2 The framebuffer, precisely

```
$ cat /proc/fb
0 mxc_epdc_fb
$ ls -l /dev/fb0
crw-rw---- 1 root video 29, 0 /dev/fb0          # exactly one fb; no /dev/fb1; no DRM
```

`/sys/class/graphics/fb0/*` `[dev]`:

- **`bits_per_pixel`** — **8**. Y8 greyscale: one byte per pixel, 0=black … 255=white.
- **`stride` (xres_virtual)** — **1088**. 1072 visible + 16 px padding per row.
- **`virtual_size`** — **1088,6144**. 6144 rows ≈ space for multiple 1448-tall buffers.
- **`rotate`** — **3**. 270° (counter-clockwise); Xorg logs "rotating … counter-clockwise"
- **`modes`** — `U:1072x1448p-0` / `U:1448x1072p-0`. Portrait and landscape mode strings.
- **`name`** — `mxc_epdc_fb`.

Key numbers: **1072 × 1448 visible**, stride **1088**, **8 bits per pixel**, one byte per pixel. A
full frame is `1088 × 1448 = 1,575,424` bytes ≈ 1.5 MB. `x_mem=3M` on the kernel cmdline reserves a
3 MB video pool, and `virtual_size` y=6144 ≈ 4 frames of 1448 — i.e. there is room for
multi-buffering / panning, which the stock stack and the driver may use.

**Rotation is a driver/EPDC property, not a userspace transformation.** The touch coordinates are
already in this same 1072×1448 space (`05`), so a portrait app does **no** rotation maths anywhere.

### Format and rendering

`Y8` means your rasteriser is **greyscale-first**. The pleasant consequences:

- Fonts and shapes are rendered into a byte buffer, not RGBA.
- Memory traffic is 1/4 of a 32-bit surface.
- 16 grey levels are *enough* for text and line art; deliberate dithering covers the rest.

The unpleasant consequence: anything assuming colour must be reduced, and bad reduction (naive
thresholding of anti-aliased text) looks worse than plain bilevel. A good e-ink rasteriser renders
text with **greyscale anti-aliasing tuned for 16 levels** (or renders bilevel for `A2`-waveform
updates and greyscale for `GC16` updates — two render modes, chosen by the refresh mode).

## 4.3 Waveforms: the crux

A **waveform** is a per-pixel-transition voltage program that moves pigment from its current state
to a target state. Different waveforms trade **speed** against **image quality**. The names below are
FBInk's; the driver ids are what this device actually reports `[dev]`:

- **`A2`** — bilevel fast; the driver exposes it as `du`. **Fastest, flashing, 1-bit (2 levels).**.
  Use it for a cursor, typing, page turns, "instant" bilevel UI.
- **`DU`** (`0x1`) — fast, non-flashing, limited grey accuracy. Use it for small updates, menus,
  incremental UI.
- **`DU4`** (`0x7`) — a DU variant, ~4 levels. Use it for fast partial updates.
- **`GL16`** (`0x3`) — greyscale, **reduced flash**. Use it for text pages where a soft update.
  suffices.
- **`GL16_FAST`** (`0x3`, `gl16f`) — a faster GL16.
- **`GC16`** (`0x2`) — **16-level clean, flashing**. Use it for page turns, images, and a "reset to.
  perfect".
- **`GC16_FAST`** (`0x2`, `gc16f`) — a faster GC16.
- **`GC4`** (`0x2`, `gc4`) — 4-level clear.
- **`GL4`** (`0x7`, `gl4`).
- **`GL16_INV`** (`0x2`, `gl16inv`) — inverted GL16.
- **`REAGL`** (`0x4`) — **reduced ghosting (REGAL)**. Use it for high-quality greyscale with less.
  flash.
- **`REAGLD`** (`0x5`) — a REGAL derivative.
- **`INIT`** (`0x0`) — full clear/init. Wipes everything clean.

Our device exposes this mapping directly `[dev]`:

`mxc_epdc_waveform_modes` `[dev]` — a version stamp (`0x19`) followed by the **selector code** each
waveform answers to:

| Waveform | Code |
|---|---|
| `init` | `0x0` |
| `du` | `0x1` |
| `du4` | `0x7` |
| `gc16f` | `0x2` |
| `gc16` | `0x2` |
| `gc4` | `0x2` |
| `gl4` | `0x7` |
| `gl16inv` | `0x2` |
| `gl16f` | `0x3` |
| `gl16` | `0x3` |
| `reagld` | `0x5` |
| `reagl` | `0x4` |

The mapping to LUT ids is the point: **the driver is handing userspace a set of named, selectable
waveforms, each backed by a lookup table in the waveform file**
(`320_R169_AE4141_ED060KD1C4_TC`).

> **Open question — who owns the LUT?** Amazon's `mxc_epdc_eink` module is closed and taints the
> kernel. The evidence (`[GPL source]` headers + `[dev]` mode map + `[RE/documented]` tooling)
> supports: **userspace *requests* a waveform mode via ioctl; the closed module/panel table
> *realises* the actual voltage program.** Treat "who owns the LUT" as open, but do not worry: the
> interface is stable and sufficient (`04.4`). `[forum/uncertain]`

### Temperature selects the waveform

E Ink response is temperature-dependent (cold pigment is sluggish), so the EPDC uses a temperature
input to pick the right table. We can see it `[dev]`:

- `mxc_epdc_temperature` = `4097` — the raw code fed to the waveform picker.
- `com.lab126.system displayTemperature` = `30` — the same thing in degrees.
- `TEMP_USE_AMBIENT` = `0x1000` — the sentinel meaning "use the ambient sensor" `[GPL source]`.

A frontend can largely ignore this and let the driver use ambient. But it is why a device left in
the cold looks sluggish until it warms, and why the driver supports explicit
`MXCFB_SET_TEMPERATURE`/`MXCFB_GET_TEMPERATURE`.

## 4.4 The ioctl surface

The modern path is `MXCFB_*` ioctls on `/dev/fb0` `[GPL source]`:

- **`MXCFB_SEND_UPDATE`** — `_IOW('F', 0x2E)`. **Submit a damage rect + waveform. The core call.**.
- **`MXCFB_WAIT_FOR_UPDATE_COMPLETE`** — `_IOWR('F', 0x2F)`. Block until the update with a given marker finishes.
- **`MXCFB_SET_TEMPERATURE`** — `_IOW('F', 0x2C)`. Override temperature.
- **`MXCFB_SET_UPDATE_SCHEME`** — `_IOW('F', 0x32)`.
- **`MXCFB_SET_WAVEFORM_MODES`** — `_IOW('F', 0x2B)`.
- **`MXCFB_GET_TEMPERATURE`** — `0x38`.
- **`MXCFB_GET_WAVEFORM_TYPE`** — `0x39`.
- **`MXCFB_GET_MATERIAL_TYPE`** — `0x3A`.

The legacy path (`FBIO_EINK_*`) still exists and is what Amazon's own `eips` uses:

- `FBIO_EINK_UPDATE_DISPLAY` = `0x46db` — param `0` = update without flash; `1` = clean black flash.
- `FBIO_EINK_CLEAR_SCREEN` = `0x46e1`.
- `FBIOGET_VSCREENINFO` = `0x4600`.

Modern code should use `MXCFB_SEND_UPDATE`; `eips` is useful mostly as a "give me a clean full-screen
refresh / screenshot" escape hatch.

![An isometric gantry press over a page of text: two rails carry a bridge, the bridge carries a carriage, and the carriage presses an aperture frame down onto a bracketed damage rectangle, with a temperature slide, a grey-level window, an update-marker counter and a waveform knob alongside](figures/fig-refresh-light.png)

> **Fig 4.1 — The refresh press.** The EPDC never scans the framebuffer: you hand it a **rectangle**
> and a **waveform** (§4.4, §4.5). A two-axis gantry carries an aperture frame to the damage
> rectangle — here 480×60 panel pixels, one line of text — and a slide carries the temperature that
> indexes the waveform selector, because the EPDC picks its voltage table by temperature (§4.3). The
> dotted grid inside the frame is the set of pixels the update rewrites; the window next to the
> selector shows how many greys the chosen waveform can address; the marker window counts
> `update_marker`. Every descent of the frame is one `MXCFB_SEND_UPDATE`.
>
> The modes and their grey levels are the table in §4.3; the temperature bands shown on the machine
> are kernink's own policy, not a vendor table. Interactive version (hover, arrow keys, `1`–`4`):
> `figures/fig-refresh-light.html`.

### `mxcfb_update_data` — the payload

The struct (from FBInk's `mxcfb-kindle.h` `[GPL source]`) carries, in essence:

- `update_region` — a **rectangle** `{left, top, width, height}`.
- `waveform_mode` — which waveform (the table in `04.3`).
- `update_mode` — partial vs full, and flags for **dithering**.
- `update_marker` — a **non-zero user token** so you can wait for *this* update to finish.
- On newer SoCs also: `hist_bw_waveform_mode`, `hist_gray_waveform_mode`, `temp`, `flags`,
  `alt_buffer_data`

Two rules that bite everyone:

1. **`update_marker` must be non-zero and unique-ish** if you intend to wait on it. Reusing a stale
   marker lets you "wait" on the wrong update.
2. **The damage rect must fit on screen.** FBInk documents that an out-of-bounds rectangle makes the
   ioctl fail. Clamp your rects.

## 4.5 Damage rectangles: the discipline

The EPDC does not scan the framebuffer. It knows only what you tell it. So the core loop of any
e-ink frontend is:

1. Render changed pixels into the mmap'd framebuffer.
2. Compute the bounding rectangles of what changed — the **damage**.
3. `MXCFB_SEND_UPDATE(rect, waveform, marker)`.
4. Optionally, `MXCFB_WAIT_FOR_UPDATE_COMPLETE(marker)`.

Design decisions that follow directly:

- **Coalesce.** Many small logical changes (a clock digit, a highlighted row) should become a few.
  rectangles. More rectangles = more ioctl calls = more EPDC work and more chances for flashing.
- **Choose the waveform per rectangle.** A blinking cursor and a full page turn deserve different.
  waveforms; the same call handles both by parameter.
- **Full-screen clean refreshes are expensive and flashy.** Use them *strategically* (after N.
  partial updates, after an image, on page turn) to keep ghosting bounded. This is "ghost
  management," and it is a genuine UX lever — the difference between a device that feels like paper
  and one that feels like a broken calculator.

Compare with `liglFlash`/`extendDamageTimeout` on `com.lab126.winmgr` (`04.7`) — Amazon's own
compositor implements exactly this kind of policy (it is the "LIGL" layer manager).

## 4.6 Ghosting, and how to keep it invisible

Ghosting accumulates because partial waveforms do not fully reset pigment. The standard mitigations:

1. **Periodic full GC16/INIT flush** — after a page, after a menu closes, after N fast updates.
2. **Match waveform to content** — bilevel UI on `A2`/`DU`; greyscale text on `GL16`/`REAGL`;
   photos on `GC16`.
3. **Localised damage** — refresh only the changed rectangle so the rest of the screen keeps its
   clean state.
4. **REAGL for low-flash quality** — when you want a good greyscale image *without* the full-screen
   flash, `REAGL`/`REAGLD` is the waveform designed for it.

A practical kernink policy (to be tuned on-device):

- **Text cursor / keystroke echo** — `A2` (bilevel). Must feel instant.
- **Highlight / selection change** — `DU`. Local, fast.
- **Menu open/list scroll** — `DU` (occasionally `GL16`). Fast, tolerable grey error.
- **Page turn (text)** — `GC16` (or `GL16` then periodic `GC16`). Clean, hiding partial-update history.
- **Image / cover** — `GC16`. Needs 16 levels.
- **Screen clear / big context switch** — `INIT`/`GC16` full. Reset ghost history.
- **Periodic hygiene** — `GC16` full. Every N partials.

## 4.7 The stock control surface: `com.lab126.winmgr`

The stock stack does not send `MXCFB_SEND_UPDATE` from every app. It has a **centralised refresh
manager** exposed over LIPC on `com.lab126.winmgr` `[dev]`, and its properties are the vocabulary of
e-ink policy:

**Read/write** — the policy surface, with the value our device reports:

- `epdcMode` (`[Y8]`), `lightboxMode` (`[1]`), `chromeState` (`[0]`).
- `orientationLock` (`[U]`), `setAccOrientation` (`[0]`).
- `refreshOnTurn`, `liglPause`, `eatTapMode`, `pageTurnkeyConfig`.

**Read-only** — the telemetry:

- `orientation` (`[U]`), `accelerometer` (`[U]`).
- `winmgrReady`, `isScreenSaverLayerWindowActive`.
- `timerRemainingTime`, `debugInfo`.

**Write-only** — the verbs:

- `createTrigger` / `clearTrigger`, `liglFlash`.
- `extendDamageTimeout` / `extendAfterDamageTimeout`.
- `fakeTap` / `fakeKeyEvent`, `defineWipeCurve`.

Read this as Amazon saying out loud what matters: **`epdcMode`** (the fb format), **`liglFlash`**
(force a flash), **`extendDamageTimeout`** (how long to accumulate damage before flushing),
**`refreshOnTurn`**, **`lightboxMode`**, and the layer model (`isScreenSaverLayerWindowActive`). The
"LIGL" layer manager is `ligl` — a *service name* (`com.lab126.winmgr.ligl`), not a separate process
or library on our device `[dev]`.

This matters for kernink in two ways:

- If we **coexist** with X/awesome, winmgr is the thing already arbitrating the panel; we must not.
  fight it.
- If we **take over** (SIGSTOP the framework, own `/dev/fb0`), we must reproduce this policy.
  ourselves — damage timeouts, flashing cadence, layer priorities — which is precisely what the
  architecture work in `11` is about.

## 4.8 The EPDC debug/telemetry nodes

`/sys/devices/platform/imx_epdc_fb/` `[dev]`:

- `mxc_epdc_temperature`, `mxc_epdc_waveform_modes`, `mxc_epdc_voltcontrol`.
- `mxc_epdc_wvaddr` (`0x81800000`), `mxc_epdc_update`, `mxc_epdc_reagl`.
- `mxc_epdc_powerup`, `mxc_epdc_pwrdown`, `mxc_epdc_regs`.

These give you: the temperature code, the full waveform-mode map, the EPD rail voltages, the
**waveform buffer physical address**, and power-up/down hooks. They are read-only telemetry for us
but they are gold for debugging "why did that refresh look wrong."

## 4.9 FBInk: the oracle you may not link

**FBInk** (NiLuJe) is the de-facto portable library over `mxc_epdc_fb`. It is the single best
public reference for this chapter's material, and it is **GPL-3.0+** — which, for an MIT product, we
may read but **must not link** `[RE/documented]`. Its capabilities define the target we are
reimplementing:

- waveform selection (`-W A2|DU|GL16|GC16|…`), with unsupported modes downgrading to `AUTO`;
- **partial refresh** (`-s [top,left,width,height]`) without touching the fb;
- **flash** (`-f`), **norefresh/batch** (`-b`), **wait** (`-w`), **dither** (`-D`), **nightmode** (`-H`);
- images (`-g`, PNG/JPEG/…) and OpenType text (`-t`);
- daemon mode over a FIFO for a long-running status line.

**Decision: kernink implements its own fbdev + `MXCFB_SEND_UPDATE` layer in Rust (MIT).** This is both
a licensing necessity and the "lean" principle: we need a small, correct subset, not a portable
multi-vendor inker. `slint-kindle-backend` proves the required subset is small — mmap the fb, track
a dirty rect, one ioctl (`09`, `10`).

## 4.10 How the stock stack actually paints (preview)

To appreciate what we are replacing, trace one menu repaint on the stock device:

Seven translations, each of which costs something:

1. **Java KPP app** (`cvm` / JVM) — decides to draw a list item.
2. **GTK2 / cairo / pango** — widgets, text shaping.
3. **X11 protocol** — draw requests.
4. **Xorg "imx" driver** — owns `/dev/fb0`; `FormatEPDC=Y8`; rotates CCW.
5. **mmap write of Y8 pixels** — plus the winmgr/LIGL damage policy.
6. **`MXCFB_SEND_UPDATE`** — rect + waveform.
7. **`mxc_epdc_eink` → EPDC → panel.**

Every layer above Xorg exists to turn "draw a list item" into "some Y8 bytes and a damage rect." A
lean frontend collapses **all** of those layers into one process. That is the whole economic
argument (`07`, `11`).

## 4.11 A refresh policy for kernink (concrete)

Putting it together, a defensible first policy:

on_input_effect(rect):
    waveform = if bilevel_ui { A2 } else { DU }
    mark_damage(rect, waveform)
on_page_turn(rect):
    if ghost_budget_exhausted { waveform = GC16;
                                reset }
    else { waveform = GL16 }
    mark_damage(rect, waveform)
on_image(rect):
    mark_damage(rect, GC16)
on_big_change():
    mark_damage(full_screen, INIT /* or GC16 */)
loop (coalesced, ~1 frame):
    rect = merge(damage)
    mxcfb_send_update(rect, waveform, marker++)
    if wait { mxcfb_wait_for_update_complete(marker) }

The subtleties — how long to coalesce, when to force a flash, how many partials before a clean —
are exactly the parameters that make or break the feel of the device. They are *policy*, and policy
is where a lean frontend can out-design the stock stack.

## 4.12 The one-sentence summary

> The EPDC is not a screen; it is a **transactional refresh engine**. You hand it **rectangles** and
> **waveforms**, and the art of an e-ink frontend is choosing those two things better than the last
> person did.
