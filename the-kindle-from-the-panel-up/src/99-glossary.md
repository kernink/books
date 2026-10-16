# 99 — Glossary<a id="glossary"></a>

Terms used across the book. `[dev]` = read off our device; `[GPL source]` = Amazon GPL drop;
`[RE/documented]` = community reverse-engineering.

| Term | Meaning |
|---|---|
| **A2** | Fastest E Ink waveform; bilevel (2 levels), flashing. Feels "instant." (`04.3`) |
| **`appreg.db`** | SQLite **app registry** in `/var/local` mapping handlers ↔ interfaces ↔ mimetypes ↔ URLs. (`08.3`) |
| **`ath6kl`** | Linux driver for the Atheros AR6003 Wi-Fi (SDIO). (`01.7`) |
| **`awesome`** | The tiling window manager the Kindle runs under X. Stopped via `SIGSTOP` by alt frontends. (`07`) |
| **`blanket`** | Cairo-based native layer manager for the screensaver/USB/langpicker surfaces. (`07.3`) |
| **`cc.db`** | SQLite content/reading-state DB in `/var/local` (`Entries.p_cdeKey` = current book). (`08.3`) |
| **`cvm`** | Amazon's proprietary Java 1.4-compatible JVM. (~104 MB RSS.) (`07.7`) |
| **`cyttsp4`** | Cypress TrueTouch Gen4 touch controller; MT-B evdev device on `event1`. (`05`) |
| **Damage rectangle** | The bounding rectangle of changed pixels that you hand the EPDC. (`04.5`) |
| **`DU`** | Fast, non-flashing E Ink waveform; limited grey accuracy. (`04.3`) |
| **EPDC** | Electrophoretic Display Controller — the in-SoC e-ink controller exposed via `mxc_epdc_fb`. (`04`) |
| **`eips`** | Amazon's legacy CLI using `FBIO_EINK_*` ioctls. (`04.4`, `09.7`) |
| **`EVIOCGRAB`** | evdev ioctl to take **exclusive** ownership of an input device. (`05.6`) |
| **FBInk** | NiLuJe's portable framebuffer inker — the EPDC oracle; **GPL-3.0+**. (`04.9`, `09.7`) |
| **FUSE / `fsp`** | `/mnt/us` is a FUSE re-export of the vfat user store by `/sbin/fsp`. (`08.4`) |
| **`gandalf`** | busybox renamed `su`, installed by the Hotfix for privilege escalation. (`02.4`) |
| **`GC16`** | 16-level clean, flashing waveform; for page turns and images. (`04.3`) |
| **Ghosting** | Residual previous-image pigment from partial waveforms; managed by periodic clean updates. (`04.6`) |
| **HAB** | High Assurance Boot — i.MX6 signed-boot verification. Never defeated. (`02.1`) |
| **hall sensor** | Magnetic-cover sensor (`wario_hall`); cover close→sleep, open→wake. (`01.8`, `06.4`) |
| **Hotfix** | Homebrew-signed OTA `.bin` that gives persistence (dev keys, `MNTUS_EXEC`, `framework_ready` job). (`02.4`) |
| **`idme`** | u-boot identity store (`pcbsn`, `serial`, `mac`, `bootmode`) on the eMMC boot area. (`02.1`) |
| **i.MX6SoloLite** | The SoC: single Cortex-A9, **no GPU, no IPU**. (`01.1`) |
| **KDB** | Amazon's key/value **config database** (`/etc/kdb`, source `/etc/kdb.src`). (`08.6`) |
| **KPM** | Kindle Package Manager — homebrew install via search-bar scriptlets. (`09.4`, `10.6`) |
| **KPP** | Kindle Platform Package — Amazon's Java app framework. (`07.3`) |
| **KUAL / KUALA** | Kindle Unified App Launcher — an app *menu*, not a home screen. (`09.2`) |
| **LIGL** | The refresh/layer policy inside `winmgr` (`com.lab126.winmgr.ligl`); not a separate process here. (`04.7`) |
| **LIPC** | Lab126 IPC — a D-Bus layer: services `com.lab126.*`, properties + events, object `/default`. (`07.6`) |
| **`lxinit`** | The X session init (`lxinit blanket -t …`). (`07.2`) |
| **`max77696`** | The Maxim PMIC (bucks, LDOs, gauge, ONKEY, RTC, backlight, EPD rails). (`01.4`) |
| **ModelGauge** | Maxim fuel-gauge algorithm exposed by `wario_battery`. (`01.4`, `06.5`) |
| **MT-B** | Linux multi-touch protocol **B**: `ABS_MT_SLOT` + `ABS_MT_TRACKING_ID`. (`05.3`) |
| **`/MNTUS_EXEC`** | Marker file that makes `/mnt/us` executable. Required for our binaries. (`02.4`, `08.9`) |
| **`MXCFB_SEND_UPDATE`** | The core EPDC ioctl: damage rect + waveform + marker. (`04.4`) |
| **OTA** | Signed firmware update; wipes rootfs hacks. (`02.6`) |
| **`pillow`** | Amazon's HTML5/JS UI layer (`libpillow.so`, `pillowd`). (`07.3`) |
| **`powerd`** | The power state machine; hold-awake, battery, frontlight, suspend. (`06`) |
| **PXP** | The SoC 2D blitter (`imx-pxp`, `/dev/pxp_device`). (`01.9`) |
| **`REAGL`/`REAGLD`** | Reduced-ghosting (REGAL) waveforms: quality greyscale without a full flash. (`04.3`) |
| **`RefreshMode`** | kernink's abstraction mapping intent (FastBilevel/Clean/…) to waveforms. (`11.2`) |
| **`framework_ready`** | The LIPC/upstart seam the Hotfix hooks; the canonical autostart point. (`02.4`, `09.3`) |
| **`sigstop` dance** | SIGSTOP the stock writers, own the fb, SIGCONT on exit — must be trapped. (`07.8`, `09.10`) |
| **`uinput`** | Input-injection device (`/dev/input/uinput`, world-accessible). (`05.6`) |
| **`wario`** | The board string our device reports (`i.MX 6SoloLite based Wario Board`). (`01.2`) |
| **Waveform** | The per-transition voltage program that moves E Ink pigment; selected per update. (`04.3`) |
| **WAF** | Web Application Framework — a WebKit web-app UI registered in `appreg.db`. (`07.3`) |
| **`winmgr`** | The display/compositor manager LIPC service; owns refresh/waveform/layer policy. (`04.7`) |
| **Y8** | 8-bit greyscale framebuffer format (1 byte/pixel). (`04.2`) |
