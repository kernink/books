# 07 — The userspace stack: how the stock Kindle actually renders<a id="ch07"></a>

> This chapter answers the question that motivates the whole project: **what does it take for this
> device to draw a home screen and a page of a book?** The answer is a stack of seven or eight
> layers, ~190–225 MB of resident memory, and well over a hundred processes — all to eventually write
> 8-bit greyscale bytes into a framebuffer and poke the EPDC. Understanding the layers is how you
> decide which ones to keep.

## 7.1 The job of userspace on this device

Everything in userspace exists to serve a handful of goals:

1. **Boot into a usable reading UI** without the user seeing the machinery.
2. **Draw things** (home, library, reader, menus, chrome) onto an E Ink panel.
3. **Let the system talk to itself** (services, state, events) — via LIPC.
4. **Sleep and wake** gracefully (powerd, blanket).
5. **Stay updateable and secure-ish** (signed OTAs, a read-only rootfs).

The stock architecture achieves all five with a stack designed for a *general-purpose appliance*
(flexible, Java-extensible, web-renderable) rather than a *reading device*. That mismatch is the
opportunity.

## 7.2 Upstart: the topology

Init is **upstart 0.6.6** (not systemd). Jobs live in `/etc/upstart/*.conf` (~150 of them) and are
wired by events. The two "collapse points" that define what's running are:

- **`lab126`** — the non-GUI service set (started by `system_setup_after_shpm` + `demd`).
  - **`x`** — the X11 desktop (started on `x_should_start`, emitted by the `wi` job).
    - **`lab126_gui`** — started when `n_ready` and `langpicker_ready`.
      - **`framework`** — the Java CVM ("KPP").
      - **`pillow`** — the HTML5/Pillow UI layer (respawns).
      - `kb`, `kfx*`, …

Selected jobs `[dev]` — for each, when it starts, when it stops, whether upstart respawns it, and what
it execs:

- **`x`** — starts on `x_should_start`, stops on `stopping dbus or stop_x`. No respawn. Execs.
  `lxinit blanket -t "splash screensaver langpicker blankwindow"`.
- **`lab126_gui`** — starts on `n_ready and langpicker_ready`, stops on `stopping x or.
  ota-update`. No respawn. A watchdog script (`MAX_RESTARTS=3`, `MAX_REBOOTS=2`).
- **`framework`** — starts on `contentpack_font_ready`, stops on `stopping lab126_gui`. No respawn.
  Execs `/etc/upstart/framework`, the Java CVM — unless `/mnt/us/DONT_START_FRAMEWORK` exists.
- **`pillow`** — starts on `started lab126_gui or start_pillow`, stops on `stopping lab126_gui`.
  **Respawns.** Execs `su framework -c "exec pillowd -f"`.
- **`powerd`** — starts on `started lab126`, stops on `stopping lab126`. **Respawns.** Execs.
  `powerd -f`.
- **`wifid`** — starts on `started lab126`, stops on `stopping lab126`. **Respawns.** Execs.
  `wifid -f`.
- **`wi`** — starts on `started dynconfig and started dbus`, stops on `stopping lab126`.
  **Respawns.** Execs `nice -n -4 /app/bin/WetInkHandler`, emits `x_should_start`, and **sleeps 2 s
  for uinput**.
- **`display`** — starts on `mounted_varLocal and loaded_modules_dependencies`. Not a daemon but a.
  task; emits `display_ready`.
- **`touch`** — starts on `mounted_varLocal and loaded_modules_dependencies`. A task; emits.
  `loaded_touch`.
- **`lab126`** — starts on `started system_setup_after_shpm and started demd`, stops on.
  `stopping dbus or ota-update`. The daemon collapse point.
- **`kindle`** — starts on `started poll_daemons and started kb and started pillow and started.
  cmd`. The final target.

Two facts fall out immediately:

- **The framework is optional and separable.** `framework` is gated on a *file*.
  (`/mnt/us/DONT_START_FRAMEWORK`), and `x`/`lab126_gui` can be stopped without taking down the
  system. There is a supported way to boot *without* Amazon's Java stack.
- **`x_should_start` is emitted by `wi` (WetInkHandler)**, and `lab126_gui` waits on `n_ready` and.
  `langpicker_ready`. The boot is a graph of events, and it has seams.

During our probe, `framework`, `pillow`, and `lab126_gui` were all **`stop/waiting`** while `x` was
up `[dev]` — i.e. the device was sitting on X + awesome + blanket (screensaver) with the reading
stack down. **That is exactly the state a custom launcher replaces.**

## 7.3 The rendering layers, bottom to top

Each layer owns the one below it. Read upward — the panel is the thing we are ultimately driving:

- **Panel** — E Ink Carta plus frontlight; it reflects light. (`04`, `06`).
- **Controller** — the **EPDC** (`mxc_epdc_fb` plus the closed `mxc_epdc_eink`): damage and waveform.
  → pixels. (`04`)
- **Framebuffer** — `/dev/fb0`, Y8. The surface. (`04`).
- **Display server** — **Xorg** with the `imx` driver: *sole owner of fb0*, `FormatEPDC=Y8`, rotates.
  CCW. Runs `-nolisten tcp +bs`.
- **Window manager** — **awesome**, a tiling WM: window layout and stacking. Amazon config; the.
  window-title conventions matter.
- **Layer manager** — **winmgr / LIGL**: refresh and damage policy, layers, `liglFlash`. LIPC service.
  `com.lab126.winmgr`.
- **Toolkit** — **GTK2 + cairo + pango**: widgets and text shaping. No GTK3, no Qt.
- **Native widget layer** — **blanket** (`libblanket`): screensaver, USB dialog, language picker.
  cairo-based; OpenBlanket is a reimplementation.
- **HTML5 shell** — **Pillow** (`libpillow.so` + `pillowd`): the web-based UI surface. Assets under.
  `/usr/share/webkit-1.0/pillow/`.
- **JS/web apps** — WebKit **WAFs**: web-app UIs, under `/var/local/waf/` and `appreg.db`.
- **Java runtime** — **`cvm`** (Java 1.4-compatible): runs "booklets". Proprietary.
- **App framework** — **KPP**: the app model, chrome, and status bar. Under `/app` and.
  `/opt/amazon`.
- **Reader** — the native reader behind a Java host: renders the books. See `07.5`.
- **System bus** — **LIPC** over D-Bus: properties and events. See `07.6`.
- **Power/sleep** — **powerd** + **blanket**: the state machine and the screensaver. See `06`.

## 7.4 The full trace: drawing one menu

1. **User taps.** `cyttsp4_mt` → evdev `event1` → Xorg (`multitouch.so`) → XInput2 → the GTK/KPP app.
2. **The Java KPP app decides what changed** ("Library: 6 items") and builds or updates GTK widgets over
   JNI (`cvm` / JVM).
3. **GTK2 / cairo / pango rasterise** those widgets into an X11 surface, text-shaped through pango with a
   system font (Bookerly, from `/usr/java/lib/fonts`).
4. **X11 draw requests → the Xorg "imx" driver**, which writes Y8 pixels into the mmap'd `/dev/fb0`,
   rotating CCW with `FormatEPDC=Y8`.
5. **winmgr / LIGL damage policy** decides which rectangles to refresh and with which waveform —
   `liglFlash`, `extendDamageTimeout`, `refreshOnTurn`.
6. **`MXCFB_SEND_UPDATE(rect, waveform, marker)`** on `/dev/fb0`.
7. **`mxc_epdc_eink` → EPDC → panel**, in tens to hundreds of milliseconds.

Every layer above step 5 is overhead relative to the *output*: greyscale bytes + a rectangle. The
stock stack pays for generality (Java app extensibility, web rendering, GTK widgets); a reading-first
frontend pays only for the pixels.

## 7.5 How the stock stack renders a *book*

The reading path has changed across firmware generations, and this matters because the old idioms
are gone `[RE/documented]`:

- **Older firmware:** the reader was a Java "Kindlet" (`app://com.lab126.booklet.reader`); a book was.
  opened by dispatching that app handler.
- **Our firmware (5.16+, KPP):** the legacy reader booklet handler is **gone**. Books are opened via.
  KPP's reader interface, e.g.:

  lipc-set-prop com.lab126.kppReader \
  openDocumentWithParams '{"asin":"…","type":"EBOK"}'

  and the "current book / ASIN" state lives in **SQLite**: `/var/local/cc.db` (`Entries.p_cdeKey`).

- **The rendering itself** is a **native (C/C++) reading engine behind the Java/KPP host** — the.
  pixels still ultimately go through GTK/X11/EPDC on this device. (KFX/EPUB/MOBI handling and
  page-layout are the native reader's job; the Java layer is chrome and lifecycle.)

For kernink, the takeaways are:

1. **The reader is not accessible as a reusable library** in any friendly way; the interfaces are
   LIPC "open this document" plumbing and a SQLite state DB.
2. **Book state is discoverable** (ASINs, progress) from `cc.db` / `appreg.db`, which is a real
   integration surface for "show me what I was reading."
3. **Rendering a book ourselves** (our own parser + layout + greyscale rasteriser) is the clean,
   lean path — and is precisely what KOReader/Plato do (`09`).

## 7.6 LIPC: the system bus (and how to use it without Amazon's tools)

**LIPC** ("Lab126 IPC") is a thin API over **D-Bus** `[RE/documented]`. The system bus socket is
`/var/run/dbus/system_bus_socket`, and `lipc-daemon` (`/usr/bin/lipc-daemon`) is a D-Bus client that
republishes the Amazon services `[dev]`.

Structure:

- **Service** — `com.lab126.<name>`. D-Bus well-known name.
- **Property get/set** — `lipc-get-prop` / `lipc-set-prop`. D-Bus method call on object `/default`.
- **Hash property** — `lipc-hash-prop`. GLib `GHashTable` over shared memory.
- **Event** — `lipc-wait-event`. D-Bus signal.
- **Enumeration** — `lipc-probe -a`. Introspect all services.
- **Registration** — `/var/local/appreg.db`. **SQLite** (mime/URL → handler map).

**Key fact:** because properties are just D-Bus method calls at a flat object path `/default`, **any
D-Bus client works**, in any language. You are not required to ship Amazon's `lipc-*` tools; a Rust
program can speak D-Bus directly (or shell out to `lipc-*`, or use `openlipc`-style bindings).

Services observed on our device `[dev]`:

- `com.lab126.todo`, `BootActionsApplication`, `winmgr`, `winmgr.ligl`, `powerd`, `deviced`.
- `bootactions`, `progressbar`, `blanket`, `archive`, `system`, `transfer`, `dynconfig`, `cmd`.
- `refreshCache`, `languagepicker`, `wifid`, `lxinit`, `appmgrd`, `phd`, `volumd`.
- `sph`, `demd`, `tphv3`, `dpmManager`, `asrtutorial`, `usbnetd`.
- (plus one non-`lab126` service: `AssetOwnership.SMD.Poll`).

The ones a launcher cares about:

- **`com.lab126.powerd`** — hold awake, frontlight, battery, suspend (`06`).
- **`com.lab126.winmgr`** — refresh/waveform/layer policy; `fakeTap`/`fakeKeyEvent` injection;
  `isScreenSaverLayerWindowActive` (`04.7`).
- **`com.lab126.blanket`** — screensaver/USB/langpicker layer control (`load`/`unload`).
- **`com.lab126.system`** — panel/serial metadata; `takeScreenShot`, `sendEvent`, `updateWaveform`.
- **`com.lab126.appmgrd`** — start apps; e.g. `appmgrd start app://com.lab126.booklet.home`.
  (the canonical "restart the home screen" call).
- **`com.lab126.cmd`** — Wi-Fi interface enable/disable.
- **`com.lab126.volumd`** — userstore (USB drive mode, free space).

## 7.7 What is actually resident (the cost we are avoiding)

Measured on our device `[dev]` (framework running, earlier session):

- **`cvm`** — ~104 MB. The Java JVM.
- **`KPPMainApp`** — ~45 MB. The main Java app.
- **`JunoStatusBarDriver`** — ~11 MB. Status bar.
- **`pillowd`** — ~10 MB. HTML5 UI layer.
- **`kb`** — ~7 MB. Keyboard.
- **`awesome`** — ~8.4 MB. WM.
- **`blanket`** — ~6.3 MB. Screensaver layer.
- **`Xorg`** — ~4.8 MB. Display server.
- **`lxinit`** — ~1.6 MB. X session init.
- **`powerd`** — ~5.3 MB. Power.
- **`wifid`** — ~4.6 MB. Wi-Fi.

Summing the GUI stack alone is **~190 MB**; with the rest of the services and kernel threads the
device runs well over a hundred processes. Against that, a lean Rust frontend is **a few MB and one
process** — and `slint-kindle-backend`'s PW3 builds are on the order of a couple of MB binary
(`09`).

![An isometric rack of seven drawers in a frame, one per rendering layer, each engraved with its name and its megabytes, a chute beneath gathering all seven into one spout that lands on a single page, a much smaller two-plate machine standing beside it producing the same page, and a beam balance weighing a tall stack of plates against a nearly empty pan](figures/fig-stack-light.png)

> **Fig 7.1 — The layer rack.** Seven layers, seven drawers (§7.3). The panel, the EPDC driver and the
> framebuffer drawers are **empty**, because those layers live in the kernel and cost no user-space RSS.
> What the rest hold is exactly the table above: Xorg **4.8 MB**, then awesome with GTK, `pillowd` and
> the on-screen keyboard for a further **25**, the `cvm` Java VM **104**, and the KPP book host with its
> reader **56** — **190 MB** of resident memory in all, and none of it the pixels.
>
> The chute under the column gathers the seven drawers into one spout, and the spout lands on the page,
> because a page on the panel is the only thing the stack exists to produce. kernink's whole path is the
> small machine beside it: two pillars, one shallow tray holding two plates (a CPU rasteriser writing
> `/dev/fb0`, and one `MXCFB_SEND_UPDATE`), one chute, the same page, and **3 MB** in one process. The
> balance is the argument of this whole book: each pan carries one plate per layer on the same scale as
> the drawers' blocks, and the beam tips by the difference of the two real loads — 190 MB against 3.
>
> Interactive version (hover a drawer, `1`–`7` to pick a layer, `c` to cycle): `figures/fig-stack-light.html`.

This is not micro-optimisation for its own sake. On this device, **memory is the margin between a
snappy appliance and a swapping one** (there is no swap/zram, `06`), and **idle CPU is the margin
between a week of battery and a day**.

## 7.8 The two ways to own the screen

Because X/`awesome`/`cvm` own the display and dispatch input, a third-party fullscreen app must
either **suspend** them or **join** them `[RE/documented]`:

### Option A — the "suspend the framework" dance (pragmatic, proven)

What KOReader does (`--framework_stop`) and what our POC launcher mimics:

1. `lipc-set-prop com.lab126.pillow disableEnablePillow disable` — hide the chrome.
2. `killall -STOP awesome` — stop the window manager.
3. `killall -STOP cvm` — stop input dispatch (some builds).
4. Take over `/dev/fb0` (and usually `EVIOCGRAB` `event1`).
5. Run the app, then restore on exit:
   - `killall -CONT cvm`.
   - `killall -CONT awesome`.
   - `lipc-set-prop com.lab126.pillow disableEnablePillow enable`.
   - `lipc-set-prop com.lab126.appmgrd start app://com.lab126.booklet.home` — restart home.

**Rules:** `trap … EXIT` a resume, always. If your process dies after `STOP` and never `CONT`s, the
device is a frozen brick until reboot. This is the single most important reliability rule in the
whole ecosystem.

### Option B — be an `awesome` window (correct, more involved)

Become a managed window with a specially-formatted title and a layer assignment
(`APP`/`CHROME`/`DIALOG`/`KB`/**`SCREENSAVER`**). `awesome` then handles layout and the LIGL layer
manager handles refresh policy for you. Cleaner, coexists with the framework, and is the route to a
"real" home screen — at the cost of living inside X and its quirks. Documented at kindlemodding.org.

### Why not "just write to the framebuffer underneath X"?

Because **X also writes to `/dev/fb0`** and will happily overwrite you on its next repaint; and
because two writers → two damage policies → flicker and ghost storms. `04.7` and `09.10` make this
explicit. Either stop the other writer, or join the managed layer system.

## 7.9 The seams a launcher should use

- **Boot hook** — upstart job on **`framework_ready`** (hotfix idiom). Autostart / restore after OTA.
- **Take/hand back screen** — `SIGSTOP`/`SIGCONT` + `appmgrd start app://…home`. Fullscreen takeover.
- **Stay awake** — `com.lab126.powerd preventScreenSaver`. While interactive.
- **Frontlight** — `com.lab126.powerd flIntensity`. User control.
- **Refresh policy** — `com.lab126.winmgr` (`liglFlash`, timeouts) or direct `MXCFB_SEND_UPDATE`. Display.
- **App launch** — `com.lab126.appmgrd`. Open stock apps/books.
- **Reading state** — `/var/local/cc.db` (SQLite). "continue reading"
- **Screensaver layer** — `com.lab126.blanket`. Idle screen.
- **Panel metadata** — `com.lab126.system`. Waveform/panel info.

## 7.10 Summary

- The stock device is a **seven-layer, ~190 MB, 100+ process** stack whose only irreducible output.
  is **greyscale pixels + a damage rectangle**.
- The reading app is **native behind a Java/KPP host**; the useful integration surfaces are **LIPC**.
  and the **SQLite state DBs**, not a reusable reader library.
- There are **two supported ways to take the screen**: the SIGSTOP/SIGCONT dance (proven, must be.
  trapped) and the `awesome`-managed window (cleaner, more work).
- **LIPC is just D-Bus**, so a Rust frontend can use it directly and skip Amazon's tooling.
- Every one of these seams is a place where a lean frontend can **cooperate** with the stock system.
  instead of fighting it.
