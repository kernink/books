# 05 — Input and gestures<a id="ch05"></a>

> The Kindle gives you exactly two input devices: a **capacitive multi-touch panel** and a **power
> button**, plus a **magnetic cover** sensor. There is no accelerometer, no buttons beyond power, no
> stylus. Which means: if you want gestural richness on this device, **you build it — from raw
> evdev** — and the good news is that the touch controller is a clean, modern **MT-B** device with
> coordinates already in framebuffer space.

## 5.1 The two (three) input sources

- `/dev/input/event0` — `name="max77696-onkey"`; reports **`KEY_POWER` (116)** and nothing else. `[dev]`.
- `/dev/input/event1` — `name="cyttsp4_mt"`; **MT-B multitouch**. `[dev]`.
- `/dev/input/uinput` — misc `10:223`; **event injection**, world-accessible. `[dev]`.

And one non-evdev wake/sleep source:

- `/sys/devices/system/wario_hall/wario_hall0/`, plus `/dev/hall` (misc `10:163`) — **cover.
  open/close**. `[dev]`

That is the **entire** input vocabulary of the device. Design gestures within it.

## 5.2 Reading `/proc/bus/input/devices` (and why the hex looks backwards)

```
N: Name="cyttsp4_mt"
H: Handlers=event1
B: EV=f
B: KEY=6420 0 0 0 0 0 0 0 0 0 0
B: ABS=2608000 0
```

Two decoding rules that waste hours if you miss them `[dev]`:

1. The bitmap is printed **most-significant-word first**: the *last* hex group covers bits 0–31.
2. On this 32-bit kernel each group is a 32-bit long (8 hex digits).

So for `ABS=2608000 0`: the rightmost `0` is bits 0–31; the leftmost `2608000` is bits **32–63**.
`0x2608000` = bits 15, 21, 22, 25 → ABS codes `32+{15,21,22,25}` = **47, 53, 54, 57**. Similarly
`KEY=6420 0 …` with 11 groups puts `0x6420` in the group covering bits 320–351 → codes 325, 330,
333, 334.

## 5.3 The touch device, exactly

The advertised codes, decoded — name, then the `Type` and code, then the value and range the driver
reports:

- **`ABS_MT_SLOT`** (`EV_ABS` 47) — value 0, range 0..**10**, i.e. 11 addressable slots.
- **`ABS_MT_POSITION_X`** (`EV_ABS` 53) — value 0, range 0..**1071**.
- **`ABS_MT_POSITION_Y`** (`EV_ABS` 54) — value 0, range 0..**1447**.
- **`ABS_MT_TRACKING_ID`** (`EV_ABS` 57) — value 0, range 0..**65535**.
- **`BTN_TOOL_FINGER`** (`EV_KEY` 325) — the tool buttons carry no value or range.
- **`BTN_TOUCH`** (`EV_KEY` 330).
- **`BTN_TOOL_DOUBLETAP`** (`EV_KEY` 333).
- **`BTN_TOOL_TRIPLETAP`** (`EV_KEY` 334).

Line by line, and what it implies:

- **`EV=0xf`** advertises `EV_SYN|EV_KEY|EV_REL|EV_ABS`; **`REL=0`** means no relative codes are.
  ever sent — ignore `EV_REL`.
- **Coordinates are 0..1071 / 0..1447**, i.e. **1:1 with the visible framebuffer**. No scaling, no.
  rotation in userspace. This is a gift; use it.
- **MT-B (protocol B)**: contacts are identified by **slot** + **tracking id**, and each frame is.
  terminated by `SYN_REPORT`. You must implement the slot state machine — not "position deltas."
- **No `ABS_MT_PRESSURE`, no `ABS_MT_TOUCH_MAJOR`, no `ABS_MT_WIDTH/ORIENTATION`, and no legacy.
  `ABS_X/ABS_Y`.** There is **no pressure signal**. Gestures must be built from *positions*,
  *timing*, *slot/track ids*, and the *tool buttons* (`BTN_TOUCH`, `BTN_TOOL_FINGER`, `DOUBLETAP`,
  `TRIPLETAP`).
- **`ABS_MT_SLOT` max = 10** technically allows 11 contacts, but the tool buttons only go up to.
  tripletap: the driver's contact-count fallback tops out at 3, and the panel realistically reports
  **two** usable fingers. **Design for two fingers, tolerate more.**
- **Slot 0 is implicit**: for a single contact the driver does **not** emit `ABS_MT_SLOT=0`. A robust.
  reader treats *missing slot as slot 0*.
- **Lift is `ABS_MT_TRACKING_ID = -1` (`0xffffffff`).**.

### The real event sequence for a tap `[dev]`

Captured live on our device by the POC launcher's `touch.log`:

KEY code=0x14a val=1     # BTN_TOUCH down
ABS code=0x39 val=0      # ABS_MT_TRACKING_ID (new)
ABS code=0x35 val=635    # X
ABS code=0x36 val=351    # Y
SYN code=0x0  val=0      # SYN_REPORT (frame edge)
KEY code=0x145 val=1     # BTN_TOOL_FINGER
SYN code=0x0  val=0
ABS code=0x35 val=634    # X update (moved 1px)
…

The lesson: **parse on `SYN_REPORT`**, and treat the *first complete frame* as the contact's birth.
A one-pixel jitter (`635 → 634`) is normal for a finger at rest — **do not** treat tiny deltas as
drag.

## 5.4 How the *stock* stack handles touch (so you know the competition)

The stock path is heavier but instructive `[dev]`/`[RE/documented]`:

- `cyttsp4_mt` (`event1`) → the Xorg input driver `multitouch.so` (libinput-era), **not** the.
  classic evdev driver.
  - `XI2` multitouch events.
    - GTK2 gesture handling / app-level handlers (Java KPP, Pillow, `cvm`).

Consequences for coexistence:

- **X owns `event1`** in normal operation. If your program reads it passively, you *also* get the.
  events (evdev supports multiple readers), but X/GTK will *also* react — double-handling, unless you
  grab or the framework is stopped.
- The stock stack's own "gesture" vocabulary is thin and lives in the app layer: taps, swipes for.
  page turns, and special corners (e.g. the top-right "gear" region, top-left back). There is no
  evidence of a general-purpose gesture service; there is `winmgr`'s **`fakeTap`/`fakeKeyEvent`**
  (synthetic injection) and `grip_enabled`/`eatTapMode` (palm/grip suppression and tap swallowing).
- Amazon's `wi` job (`WetInkHandler`) explicitly **waits for `/dev/uinput`** — i.e. the stock stack.
  itself uses synthetic input injection internally.

So the bar for "gestures" on this device is genuinely low: the stock UX is mostly *taps and a couple
of swipes*. A well-built recogniser can comfortably beat it.

## 5.5 Building our own gesture engine

This is where the device rewards low-level work: because the touch device is clean MT-B with 1:1
coordinates and no pressure, a gesture engine is **pure geometry over time**. A layered design:

Three layers. Data flows upward, and each layer knows nothing of the one above it:

1. **evdev reader** — `read()`, `SYN_REPORT` framing, MT-B decode.
2. **Contact tracker** — slot state machine → live `Contact` list.
3. **Gesture recogniser** — tap, long-press, swipe, pinch, …

### Layer 1 — evdev reader

- Open `/dev/input/event1` `O_RDONLY | O_NONBLOCK` (or blocking in a `poll(2)` set — preferred, for.
  0 % idle CPU).
- Read `struct input_event { timeval time; u16 type; u16 code; s32 value; }` (24 bytes on 32-bit;
  mind timeval layout).
- Accumulate slot state on every event; **emit a "frame" on `EV_SYN`/`SYN_REPORT`**.
- Optionally `EVIOCGRAB` the device to take it exclusively (`05.6`).

### Layer 2 — contact tracker

Maintain `slots[0..11]`, each either empty or a `Contact { id, x, y, start_time, last_time, path }`.

```c
on ABS_MT_SLOT(s):         current = s
on ABS_MT_TRACKING_ID(t):
    if t == -1:  close(slots[current])   // lift
    else:        slots[current] =
                     Contact{ id:t, x:?, y:? }
on ABS_MT_POSITION_X(v):   slots[current].x = v
on ABS_MT_POSITION_Y(v):   slots[current].y = v
on SYN_REPORT:             publish(live_contacts)
```

Emit two kinds of notifications to the recogniser: **contact-updated** (with the current set) and
**contact-ended** (with the final path). Feed both.

![An isometric strip-chart recorder: two fanfold paper trays feed a tape running left to right beneath a rail that carries three pens, behind the tape a comb of three posts rises through a slot and a one-way ratchet and gates three tappets, a vertical epoch scale carries a pointer past the lift, a governor spins on the X carriage, and an eleven-chamber turret with an index flag stands to the left](figures/fig-touch-light.png)

> **Fig 5.1 — The contact tracker.** A strip-chart recorder, because that is what an MT-B tracker is: a
> tape running left to right under three pens, one per channel of a contact — `dX`, `dY`, and whether
> `BTN_TOUCH` is down (§5.3). The tape's 0 ms is the pens' own station, so everything to its right is the
> contact's history and everything to its left is clean, unwritten tape.
>
> Behind the tape, a comb of three posts is taken up 16 units — the tap slop — by the distance the finger
> has covered, through a slot and a one-way ratchet, and those posts gate the three tappets. Two ride face
> cams on a one-revolution timer and read at 250 ms and 500 ms: that is the tap and the long press. The
> third is a spring the comb holds down until the gate opens, which is the drag. The governor on the X
> carriage lets its balls out with speed and trips a stop at 420 px/s — the swipe, the one verdict that is
> a **speed** rather than a distance, and so the one with no comb. The turret's eleven chambers are the
> driver's eleven `ABS_MT_SLOT`s, with the index flag on the live one.
>
> There is no pressure and no contact size anywhere on this deck, because `cyttsp4_mt` reports neither:
> every decision here is geometry over time. Interactive version (drag the deck, `1`–`4` to replay a
> gesture): `figures/fig-touch-light.html`.

### Layer 3 — recogniser

Gesture recognition is then straightforward. Because the panel is slow but the *touch controller is
fast*, you can recognise gestures as they happen and decide **when** to repaint (that is a display
decision, `04`). A starter catalogue:

- **Tap** — 1 contact, path length < D, duration < T_click, end in same region. The workhorse. Act on **release** (the POC does; matches stock feel).
- **Long-press** — 1 contact, movement < D, duration ≥ T_long. Great for context menus; no pressure to fight.
- **Double-tap** — two taps within T_double, near same point. Driver also sets `BTN_TOOL_DOUBLETAP`; you may use either.
- **Drag / pan** — 1 contact, path length ≥ D, direction stable. Live scrolling; needs `A2`/`DU` updates to feel good.
- **Swipe** — drag that ends with velocity ≥ V in a direction. Page turns.
- **Two-finger tap** — 2 simultaneous contacts, both tap. Use `BTN_TOOL_DOUBLETAP` as a hint.
- **Pinch** — 2 contacts, distance ratio changes. Zoom; geometric, no pressure needed.
- **Two-finger scroll** — 2 contacts, parallel motion.
- **Edge swipe** — swipe whose start X ∈ [0, E) or (W−E, W]. Back/navigation; *big* win on a bezel-less device.
- **Corner tap** — tap whose end point ∈ a corner region. Stock Kindle uses corners (gear, back); you can too.
- **Hold-and-move** — long-press then drag. Reorder / select.

Useful defaults to tune on-device (tune empirically — e-ink users accept longer taps): `D` (tap
slop) on the order of **10–20 px**; `T_click` ≈ **200–350 ms**; `T_long` ≈ **500–700 ms**;
`T_double` ≈ **300–400 ms**; `V` (swipe) ≈ **300–600 px/s**; edge zone `E` ≈ **40–60 px**.

### Why e-ink changes gesture design

- **Latency is in the display, not the recogniser.** The touch IRQ and evdev read are fast; the.
  *repaint* is slow. So the recogniser should be able to act immediately and let the renderer decide
  what (and whether) to update. For a tap, many UIs act on **press** with an `A2` highlight, then
  commit on **release** — mimicking the physical "ink" feel.
- **No hover, no pressure, no palm rejection signal.** Grip suppression is `winmgr`'s job.
  (`grip_enabled`); if you own the panel, you must implement your own (e.g. ignore very large
  contact ellipses — except you have no `TOUCH_MAJOR`, so you cannot; instead use position/speed
  heuristics and the `BTN_TOOL_*` hints).
- **Two fingers is the practical ceiling.** Pinch works; three-finger gestures will be unreliable.
- **The power button and cover are part of the gesture language.** A "power-button short press" is.
  `KEY_POWER` on `event0`; cover close/open is the hall sensor. Design them in.

## 5.6 Exclusivity: `EVIOCGRAB`, and injection: `uinput`

Two kernel affordances make a custom input layer clean `[dev]`:

- **`EVIOCGRAB`** on `/dev/input/event1` makes your process the *exclusive* reader: other readers.
  (Xorg, the framework) see **nothing**. Use it when you have taken over the screen (SIGSTOP'd the
  framework) so touches do not leak to the suspended-but-alive stock stack. Release it on exit
  (`EVIOCGRAB` with 0) — and do so in an exit trap.
- **`uinput`** (`/dev/input/uinput`, world-accessible) lets you **create a virtual input device** and.
  emit synthetic events — `KEY_POWER`, taps, arbitrary keys. Uses: automated testing, remote control,
  and "pressing" something in the stock UI without touching hardware. The stock stack itself uses
  uinput internally.

## 5.7 The power button and the cover (the other two gestures)

- **`/dev/input/event0`**, `max77696-onkey`, `KEY_POWER` only. Note: a *short press* is delivered as.
  `KEY_POWER` down/up; a *long press* is typically intercepted by `powerd`/hardware to force
  shutdown. **Do not assume you own it** — powerd listens too. If you want a custom "power button
  short press = home" behaviour, you must coordinate with powerd (or the stock stack will also
  react). This is the likely hook for "return from the stock Kindle OS to the launcher"
  (`12`).
- **Hall sensor** (`wario_hall`, `hall_trig_wkup`, `hall_detect`): cover close → sleep, cover open →
  wake. It is a **first-class wake source** and a first-class *gesture* (close the cover = "I'm
  done"). `hall_detect=0` means open.

## 5.8 Latency budget: what a tap actually costs

Rough on-device budget for a tap-to-response, to set expectations:

- **Touch controller → IRQ → evdev readable** — sub-ms to few ms. Hardware + driver.
- **Your `poll()` wake + decode** — microseconds. Cheap.
- **Recognise + decide** — microseconds. Pure geometry.
- **Render affected rectangle** — sub-ms to ~10 ms. Small rect, greyscale.
- **`MXCFB_SEND_UPDATE` (+ EPDC)** — **tens to ~300 ms**. **Dominated by the waveform**.
- **Optional `WAIT_FOR_UPDATE_COMPLETE`** — included above.

**The waveform is the latency.** `A2` feels instant because it is bilevel and the shortest program;
`GC16` feels like a page turn because it is a full 16-level flash. Your gesture engine's job is to
make the *right* waveform happen at the *right* moment — that is what "responsive e-ink UI" actually
means.

## 5.9 Summary

- The device has **one real input: MT-B touch**, plus power button and cover.
- The touch device is **clean, pressure-free, 1:1 with the fb**, and supports **~2 fingers**.
- Gestures are **ours to build**: an `evdev → contact tracker → recogniser` pipeline over.
  positions/time, with the display deciding when to repaint.
- Exclusivity (`EVIOCGRAB`) and injection (`uinput`) are available and are how you cleanly coexist.
  with, or replace, the stock input path.
