# Kindle (esp. Paperwhite 3 "Wario") — Architecture & Internals — Internet Research Notes

Scope: raw research notes assembled from public sources for the *kernink* book.
Focus: Kindle platform and PW3 internals — hardware, boot, display/EPDC, userspace,
IPC (lipc), power, filesystem, Amazon GPL drops, and key public documents.
Explicitly **excludes** DRM circumvention / content piracy. Homebrew *jailbreak*
mechanics are covered only as architecture-relevant facts (they never touch the
boot chain; all exploits are userspace).

Confidence markers used throughout:
- `[official]` — Amazon / vendor documentation.
- `[GPL source]` — read from an Amazon GPL source drop (kernel/u-boot).
- `[RE/documented]` — reverse-engineered or documented by a credible community source.
- `[forum/uncertain]` — forum/wiki claim, possibly stale or unverified.

---

## 1. Hardware

### 1.1 SoC / platform
- PW2 **and** PW3 share the same SoC family: **Freescale/NXP i.MX6SoloLite (i.MX6SL)**, single Cortex-A9 @ up to 1 GHz. `[GPL source]`
- PW2 codename **"Wario"** / board string `PINOT_WFO`; PW3 board **"Muscat WFO"**. Both are `DP75SDI` SoM variants. `[forum/uncertain]` (gdamjan dmesg shows Wario/PW2; Muscat appears in PW3 dmesg/schematics threads)
- SoloLite differs from other i.MX6 parts: **no GPU** (no Vivante GC), **no IPU/display controller for LCD**, and only a single core. This is *why* the EPDC is driven directly. `[GPL source]`/`[RE/documented]`
- No `/dev/dri`, no DRM/KMS driver. Display is a bare **framebuffer** device. `[GPL source]`
- RAM: **LPDDR2**, Samsung MfgId `0x1`. PW2 = 256 MB, PW3 = **512 MB**. `[GPL source]`
- Storage: **eMMC**, not raw NAND. PW3-class module = **Micron MMC02G** (≈1.83 GiB), with `boot0`/`boot1` hardware boot partitions of 2 MiB each, plus `rpmb`. `[GPL source]` (dmesg `mmcblk0`, `mmcblk0boot0/boot1`)

### 1.2 Power management IC — MAX77696A
- System PMIC is a **Maxim MAX77696A** (the "MUSE"/TOP block). It is a highly integrated device; the driver exposes many sub-blocks. `[GPL source]` (dmesg)
- Sub-blocks seen in dmesg: 6 bucks (`buck1`–`buck6`), 10 LDOs (`ldo1`–`ldo10`), load switches, fuel gauge + battery (`max77696-battery`), ONKEY (`max77696-onkey`), RTC, backlight/LED drivers, ADC, charger, and an energy-harvesting (boost) block. `[GPL source]`
- Rails relevant to EPD/soc (from dmesg/board code): `vddsoc`, `vddcore`, `vdd2p5`, `vdd1p1`, `vdd3p0`; EPD-specific rails **`vpos`, `vneg`, `vcom`, `vee`, `vddh`** — these power the E Ink panel's source/gate drivers and VCOM bias. `[GPL source]`
- ONKEY is the **power button** wake source (see §6); touch wake handled by the touch controller IRQ. `[GPL source]`

### 1.3 Display panel
- PW3 panel: **ED060KD1C4** (aka **ED060KD1**), 6", 1072×1448 visible, 16-level grayscale, Carta-class e-paper. `[RE/documented]`
- PW2 panel is a slightly older 6" ED060-series part; effective resolution the same (1072×1448). `[RE/documented]`
- Panel ribbon mates to the EPDC via the `vpos/vneg/vcom/vee/vddh` rails above. `[GPL source]`

### 1.4 Wireless / input
- **WiFi:** PW3 uses an **Atheros AR6803G** — i.e. an AR6003 core in a QFN package. Driver is `ath6kl` (SDIO). PW2 is also AR6003-family. `[RE/documented]`
- **Touch:** **Cypress TrueTouch Gen4** (`cyttsp4`), I²C address `0x24`, protocol **MT-B** (multi-touch type B). Exposed at `/dev/input/event1`. `[GPL source]`
- **Power button:** `max77696-onkey` → `/dev/input/event0`. `[GPL source]`

### 1.5 Audio
- **PW3 has no audio codec** (no audible path). PW2/Kindle Touch *did* have audio (speaker/headphone). Relevant if porting anything that assumes ALSA. `[RE/documented]`

### 1.6 Kernel cmdline / video mode
- Sample cmdline (PW2): `video=mxcepdcfb:E60,bpp=8,x_mem=3M`. `[GPL source]`
- Meaning: EPDC framebuffer, 8 bits per pixel (Y8 grayscale), `E60` = 6.0" panel timing, 3 MiB reserved framebuffer memory. `[GPL source]`

| Item | Value | Confidence |
|---|---|---|
| SoC | i.MX6SoloLite (single A9, no GPU) | [GPL source] |
| PW2 board / PW3 board | Wario (`PINOT_WFO`) / Muscat WFO | [forum/uncertain] |
| RAM | 256 MB (PW2) / 512 MB (PW3), LPDDR2 | [GPL source] |
| Storage | eMMC Micron MMC02G ~1.83 GiB, boot0/boot1 2 MiB | [GPL source] |
| PMIC | MAX77696A | [GPL source] |
| WiFi | Atheros AR6803G (AR6003 core, ath6kl) | [RE/documented] |
| Touch | Cypress TrueTouch Gen4 (cyttsp4, 0x24, MT-B) | [GPL source] |
| Panel | ED060KD1C4, 1072×1448, 16-gray | [RE/documented] |
| Battery | ~1420 mAh | [forum/uncertain] |
| Audio | none on PW3 | [RE/documented] |

---

## 2. Boot chain

### 2.1 ROM → bootloader
- i.MX6 internal **Boot ROM** reads the **eMMC hardware boot partition (`boot0`/partition 1 of the boot area)** and jumps to an **imximage** (the u-boot SPL/proper image wrapped with the i.MX IVT + DCD header). `[GPL source]`/`[RE/documented]`
- u-boot is a **vendor fork of u-boot v2009.08** (very old), heavily patched by Lab126. `[GPL source]`
- **HAB (High Assurance Boot)** is enabled: images are signed; the ROM verifies the CSF/signature. This is why nobody has replaced the bootloader on a locked device — the chain is cryptographically anchored. `[official]`/`[RE/documented]`
- Board strings seen: `muscat`, `wario` (imx `board_fit`/dt board ids). `[GPL source]`

### 2.2 USB serial download / blanking
- The SoC supports **USB Serial Downloader mode** (enumerates as **"SE Blank MEGREZ"** / Freescale USB device 15a2:00xx). Entering it normally requires the eMMC to be unreadable — the community trick is to **short/disable the eMMC** (resistor pull) so the ROM falls back to USB. `[RE/documented]` (MobileRead "unbrick"/schematics threads, bdm310)
- This is the low-level recovery vector; combined with an unlocked/blank eMMC you can boot a custom imximage. `[RE/documented]`

### 2.3 `idme` and device identity
- Amazon stores device identity in **`idme` variables** (`idme` is a u-boot command/area on the boot partition): `pcbsn`, `serial`, `mac`, `bootmode`, etc. These survive factory resets and are used to derive the serial/MAC. `[GPL source]`/`[RE/documented]`

### 2.4 Recovery / diags
- **Diags/recovery lives on partition 2** (`mmcblk0p2`) as an ext3 image; triggered by a boot "bootmode" variable / special key combo. Provides factory tests + recovery shell. `[RE/documented]`

### 2.5 Jailbreak lineage (userspace-only)
All known jailbreaks exploit **userspace** components; the signed boot chain has never been defeated. `[RE/documented]`
- **5.x Jailbreak (≈2016)** — factory-image *downgrade* attack (flash old rootfs image via a signed update). Authors: Branch Delay, NiLuJe, knc1. Required user action; the "attack" is an unsigned user-supplied update that a *pre-fix* firmware would accept. `[forum/uncertain]`
- **LanguageBreak (2023)** — demo/language-pack exploit, works FW ≤ **5.16.2.1.1**. Repo `github.com/notmarek/LanguageBreak`. `[RE/documented]`
- **WinterBreak (2025)** — released New Year's Day 2025 by **Hackerdude**; delivered via the **Mesquito** homebrew store app, abuses **`.active_content_sandbox` LocalStorage**. Works on a wide firmware range incl. recent. `[RE/documented]`
- **AdBreak (24 Sep 2025)** — abuse of **CVE-2012-3748**, a use-after-free in the ad display path. `[RE/documented]`
- Others referenced in the ecosystem/milestones: Vera, SpiderCat, SpringBreak, Nosebleed, Sanctuary, WinterBreak2. `[forum/uncertain]` (names as catalogued on kindlemodding.org)

### 2.6 What a jailbreak actually *does* ("root code")
Once code execution is gained, the canonical jailbreak payload: `[RE/documented]` (kindlemodding.org / MobileRead)
1. Remount the **rootfs read-write**.
2. Install **developer keys** into `/etc/uks` (or `/etc/uks.sqsh`) so the device accepts homebrew-signed packages.
3. Create the marker file **`/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC`**.
4. Create **`/MNTUS_EXEC`** so `/mnt/us` becomes executable.
5. Remount **read-only**.
6. Install the **Hotfix** ("bridge") — a homebrew-signed OTA `.bin` (signed with the key inside **KindleTool**). Its `install.sh` + `libotautils6`:
   - create `/var/local/kmc` and `/var/local/mkk`,
   - install **`gandalf`** = busybox linked as **`su`**,
   - register `kmc.conf` as an **upstart job on `framework_ready`** (persistence across reboots),
   - patch `appreg.db`.

| Stage | Mechanism | Confidence |
|---|---|---|
| ROM | i.MX BootROM, HAB-signed imximage from eMMC boot area | [official] |
| Bootloader | vendor u-boot v2009.08 fork | [GPL source] |
| Identity | `idme` vars (pcbsn/serial/mac/bootmode) | [GPL source] |
| Recovery | partition 2 diags/recovery (ext3) | [RE/documented] |
| USB recovery | Serial Download mode "SE Blank MEGREZ" (eMMC-disable) | [RE/documented] |
| Jailbreaks | userspace only (LanguageBreak/WinterBreak/AdBreak/…) | [RE/documented] |

---

## 3. Display / EPDC (the e-ink core)

### 3.1 Framebuffer device
- Driver: **`mxc_epdc_fb`** (the public framebuffer/ioctl interface). Amazon ships a companion proprietary **`mxc_epdc_eink`** module that **taints the kernel** (no source) — this likely does the actual waveform/panel handling. `[GPL source]`/`[RE/documented]`
- `/dev/fb0` geometry (PW3): **8 bpp, Y8 grayscale**, `visible = 1072×1448`, `stride (xres_virtual) = 1088`, `rotate = 3`. `[GPL source]` (fbset/ioctl output)
- Drawing: `mmap()` the framebuffer, write Y8 pixels, then issue **`MXCFB_SEND_UPDATE`** ioctl with a damage rect + waveform. `[GPL source]`

### 3.2 `mxcfb_update_data` and friends (from FBInk `mxcfb-kindle.h`)
Struct fields (relevant): `update_region` (rect `left/top/width/height`), `waveform_mode`, `update_mode`, `update_marker`, and — for newer SoCs — `hist_bw_waveform_mode` / `hist_gray_waveform_mode`, `temp`, `flags`, and `alt_buffer_data`. `[GPL source]`

**Waveform modes** (`waveform_mode` values):
| Name | Value | Purpose |
|---|---|---|
| INIT | 0x0 | full init / clear |
| DU | 0x1 | fast, non-flashing (direct update) |
| GC16 | 0x2 | grayscale-clear 16-level (clean, flashing) |
| GC16_FAST | 0x3 | |
| A2 | 0x4 | fastest, 1-bit, flashing (2-level) |
| GL16 | 0x5 | grayscale, reduced flash |
| GL16_FAST | 0x6 | |
| DU4 | 0x7 | |
| REAGL | 0x8 | |
| REAGLD | 0x9 | |
| GL4 | 0xA | |
| GL16_INV | 0xB | |
| AUTO | 257 (0x101) | driver picks |

`[GPL source]`

**Temperature constants:** `TEMP_USE_AMBIENT = 0x1000` (plus fixed-range constants); temperature selects the waveform lookup table because E Ink response is temp-dependent. `[GPL source]`

**Material types:** `EPD_MATERIAL_V220` / `EPD_MATERIAL_V320` (panel material generation). `[GPL source]`

### 3.3 ioctls
| ioctl | Numeric | Direction | Notes |
|---|---|---|---|
| MXCFB_SEND_UPDATE | `_IOW('F', 0x2E)` | write | submit damage rect + waveform |
| MXCFB_WAIT_FOR_UPDATE_COMPLETE | `_IOWR('F', 0x2F)` | rw | block until marker done |
| MXCFB_SET_TEMPERATURE | `_IOW('F', 0x2C)` | write | |
| MXCFB_SET_UPDATE_SCHEME | `_IOW('F', 0x32)` | write | |
| MXCFB_SET_WAVEFORM_MODES | `_IOW('F', 0x2B)` | write | |
| MXCFB_GET_TEMPERATURE | `0x38` | — | |
| MXCFB_GET_WAVEFORM_TYPE | `0x39` | — | |
| MXCFB_GET_MATERIAL_TYPE | `0x3A` | — | |

`[GPL source]`

**Legacy einkfb ioctls** (older kernels/tools; observed live via `strace -e raw=ioctl eips -c`):
`FBIO_EINK_CLEAR_SCREEN = 0x46e1`, `FBIO_EINK_UPDATE_DISPLAY = 0x46db`. `[RE/documented]`

### 3.4 Software abstraction
- **`eips`** — Amazon's CLI tool to draw text/clear via the legacy einkfb interface. `[RE/documented]`
- **FBInk** (NiLuJe) — the de-facto portable library over `mxc_epdc_fb`; handles ioctl selection, waveform choice, region math, and NUL-terminated update markers/zombie handling. This is what the `kindle-launcher` POC drives. `[RE/documented]` + `[GPL source]` header

> Contradiction to resolve: whether waveform selection is done entirely by the closed `mxc_epdc_eink` module or partly by userspace via the fb ioctls. Evidence points to userspace *requesting* a waveform mode + the closed module *realizing* it. Treat "who owns the LUT" as **open**. `[forum/uncertain]`

---

## 4. Userspace UI stack

- **Xorg owns `/dev/fb0`.** The whole UI is an X11 desktop, not a custom compositor. `[RE/documented]`
- **Window manager: `awesome` (awesomeWM).** Tiling WM; Amazon-authored config. `[RE/documented]`
- **Toolkit: GTK2 + cairo + pango** (no GTK3, no Qt). `[RE/documented]`
- **Java runtime:** Amazon ships **`cvm`** — a proprietary, **Java 1.4-compatible** JVM (Cleanroom/CDC-class fork). The framework (`kpp` = Kindle Platform Package) runs **"booklets"** = Java applications. Jars live under `/opt/amazon/ebook/**/*.jar`. Started by the **upstart `framework`** job. `[RE/documented]`
- **Browser/render engine:** WebKit-based **WAFs** ("Web Application Frameworks") under **`/var/local/waf/`**, each with a `config.xml`, registered in `appreg.db`. `[RE/documented]`
- **Pillow:** an **HTML5/JS layer** over the native stack — `libpillow.so` + `pillowd` daemon + web assets in `/usr/share/webkit-1.0/pillow/`. The native bridge can execute shell commands (a known local-privilege surface historically). `[RE/documented]`
- **blanket:** a **cairo-based** rendering layer (`libblanket`) that loads modules; used for the screensaver, USB-connect dialog, language picker. Open source reimplementation: **yifanlu/OpenBlanket**. `[RE/documented]`
- **winmgr / ligl:** native window-management + graphics glue under the X session. `[forum/uncertain]`
- **Keyboard:** `/usr/bin/kb` + `libkb.so`. `[RE/documented]`

| Layer | Component | Notes |
|---|---|---|
| Display server | Xorg | owns fb0 |
| WM | awesome | tiling |
| Toolkit | GTK2 + cairo + pango | |
| Apps | Java "booklets" on `cvm` | Java 1.4-compatible; `/opt/amazon/ebook` |
| Web apps | WebKit WAFs | `/var/local/waf/`, appreg.db |
| HTML5 shell | Pillow | `libpillow.so`, `pillowd` |
| Native widgets | blanket | cairo-based, OpenBlanket reimpl |
| Boot orchestration | upstart | `/etc/upstart/*.conf`, `framework` job |

---

## 5. IPC / lipc

- **lipc = "Lab126 IPC"**, a thin **custom API layered on top of D-Bus**. The system bus socket is `/var/run/dbus/system_bus_socket`. `[RE/documented]`
- **Services** are named `com.lab126.*` (e.g. `com.lab126.powerd`, `com.lab126.pillow`, `com.lab126.blanket`, `com.lab126.cvm`, …). `[RE/documented]`
- **Two primitives:**
  - **Properties** — a `get`/`set` pair implemented as D-Bus **method calls** with typed variants (`Int`, `Str`, …) and an optional *sender* argument. A "Has"/hash property is a GLib `GHashTable` backed by **shared memory**. `[RE/documented]`
  - **Events** — D-Bus **signals** (e.g. `framework_ready`, state changes). `[RE/documented]`
  Since properties are just method calls, **any D-Bus client works** — you don't need Amazon's tools. `[RE/documented]`
- Object path is always **`/default`** (flat namespace; service name carries the identity). `[RE/documented]`
- **CLI tools:** `lipc-get-prop`, `lipc-set-prop`, `lipc-probe -a -v` (enumerate all services/props), `lipc-wait-event`, `lipc-hash-prop`. `[RE/documented]`
- **Bindings:** `openlipc` (C), `openlipclua` (Lua), and community re-implementations (`notmarek/openlipc`). `[RE/documented]`
- **Registration/wiring:** `/var/local/appreg.db` is a **SQLite** DB (the union of the shipped `ServerConfig.db` + `prereg.db`) mapping handlers ↔ interfaces ↔ mimetypes ↔ URL associations. This is how the OS knows which booklet/WAF opens what. `[RE/documented]`

| Concept | lipc/Lab126 | Underlying |
|---|---|---|
| Property get/set | `lipc-get/set-prop` | D-Bus method call, `/default` |
| Hash property | `lipc-hash-prop` | GLib GHashTable over shm |
| Event | `lipc-wait-event` | D-Bus signal |
| Service | `com.lab126.<x>` | D-Bus well-known name |
| Registration | `appreg.db` | SQLite (ServerConfig + prereg) |

---

## 6. Power management

- Daemon: **`powerd`** (`com.lab126.powerd`). `[RE/documented]`
- **Four states** with two-stage inactivity timeouts: `[RE/documented]` (kindlemodding.org com.lab126.powerd; MobileRead Architecture)
  1. **Active**
  2. **Screen Saver** — entered after **T1** (`t1 = 600 s` default).
  3. **Ready to suspend** — short grace (~5 s) to coalesce activity.
  4. **sleep / SUSPENDED** — after **T2** (`t2 = 60 s` past T1); actual suspend-to-RAM.
- **Suspend-to-RAM**; wake sources: **power button** (`max77696-onkey`), **RTC** alarm, and **touch**. WiFi drops on suspend (hence device "goes offline"). `[RE/documented]`
- **LIPC properties** (via `com.lab126.powerd`): `state`, `status`, `battLevel`, `battStateInfo`, `isCharging`, `preventScreenSaver`, `touchScreenSaverTimeout`, frontlight: `flIntensity`, `flMaxIntensity`, `flRawIntensity`, `flAuto`, `flTurboBrightnessIntensity`; timing/behaviour: `rtcWakeup`, `suspendGrace`, `deferSuspend`, `addSuspendLevels`. `[RE/documented]`
- **Config DB:** **`/etc/kdb`** (with `/etc/kdb.src`), a flat config DB used by powerd and others. `[forum/uncertain]` — specifics not confirmed firsthand (search noise: "kdb" collides with the kernel debugger). **Low confidence.**
- **CPU frequency:** kernel has a Lab126-specific cpufreq override (`CONFIG_CPU_FREQ_OVERRIDE_LAB126`); powerd can clamp frequency. `[GPL source]`

> Practical note for kernink: while a foreground app runs you must periodically **`lipc-set-prop com.lab126.powerd preventScreenSaver 1`** (or bump `touchScreenSaverTimeout`), otherwise powerd screensavers/suspends under you at T1/T2.

---

## 7. Filesystem & config

- **Partitions** (`mmcblk0`): `[RE/documented]` (MobileRead)
  | # | Device | FS | Mount | Contents |
  |---|---|---|---|---|
  | 1 | `mmcblk0p1` | ext3 | `/` (ro) | rootfs, ~350 MB, mounted read-only |
  | 2 | `mmcblk0p2` | ext3 | (diags) | diags/recovery image |
  | 3 | `mmcblk0p3` | ext3 | `/var/local` | writable state, 32–64 MB |
  | 4 | `mmcblk0p4` | FAT32 | `/mnt/us` | **userstore** ("USB drive"), via FUSE; `/MNTUS_EXEC` enables exec |
- **App locations:** `/app` and `/opt/amazon` (Java/booklets); `/opt/amazon/ebook/**/*.jar`. `[RE/documented]`
- **Init:** **upstart** — job files in **`/etc/upstart/*.conf`** (e.g. `framework`, `powerd`, `pillowd`, `kmc`). `[RE/documented]`
- **Logging:** `showlog` (journal viewer), plus the device shell's **`;debugOn`** / `;log` sequence, to enable/read verbose framework logs. `[RE/documented]`
- **Read-only rootfs** is a core design property: persistent changes must land in `/var/local`, `/mnt/us`, or a remount (as the jailbreak does). `[RE/documented]`

---

## 8. Amazon GPL source drops

- Amazon publishes **"Source Code Notice for Kindle E-Readers and Fire Tablets"** at `amazon.com/gp/help/customer/display.html?nodeId=200203720` (page ID commonly cited as **nodeId=200203720**). `[official]`
- **What is covered:** only **GPL/LGPL** components — the **Linux kernel**, **u-boot**, **busybox**, **upstart**, and similar. The GPL source is what the FBInk headers, dmesg, and kernel config in these notes derive from. `[official]`/`[GPL source]`
- **What is *not* covered:** the Amazon-proprietary userspace (WebKit/Pillow/blanket/WAFs/booklets), the **`cvm`** JVM, the **`mxc_epdc_eink`** module, and most UI. The FSF has noted these omissions. `[official]`/`[RE/documented]`
- Because the drop is just tarballs behind a help-page, they get re-hosted; e.g. **`github.com/katadelos/linux-3.0.35-lab126`** is a mirror of the `linux-3.0.35-lab126` kernel tree. `[GPL source]`
- **Access issue:** the official page returns **503/403 to automated fetchers**. Workaround: use mirrors (GitHub re-hosts) or the Internet Archive. **Unresolved** — no direct official fetch captured. `[official]` (negative result)
- **Lifecycle note:** per the **barebox** board documentation, Amazon **stopped producing factory update images** for these devices sometime between 2021–2023. `[RE/documented]`

---

## 9. Key public documents / wikis

Primary/near-primary references worth citing in the book: `[RE/documented]`
- **FBInk source** — canonical Kindle EPDC/ioctl/waveform reference: `github.com/NiLuJe/FBInk` (esp. `eink/mxcfb-kindle.h`). `[GPL source]`
- **barebox board docs** — cleanest public description of Kindle boot/SoC: `barebox.org/doc/latest/boards/imx/amazon-kindle-6-7.html` (and `amazon-kindle-4-5`). `[RE/documented]`
- **kindlemodding.org** — modern hub: `index`, `jailbreaking/index`, `WinterBreak/`, `AdBreak/`, `jailbreak-faq`, `kindle-apps-and-services/index`, service pages for `com.lab126.powerd` and `com.lab126.pillow`, `kindle-hacking/hotfix`, `kindle-hacking/index`, `wafs-and-mesquite/index`. `[RE/documented]`
- **MobileRead wiki** — `wiki.mobileread.com/wiki/Kindle_Touch_Hacking` (best "Architecture" writeup: LIPC/Java/Webkit/Pillow/Blanket/OTA), plus `K5_Index`, `Lipc`, `Kindle_Hardware_Index`, `Eips`, `5_x_Jailbreak`, `Kindle_Serial_Numbers`. `[RE/documented]`
- **Jailbreak repos** — `github.com/notmarek/LanguageBreak`; WinterBreak/AdBreak writeups on kindlemodding.org. `[RE/documented]`
- **dmesg/kernel config dump** — `gist.github.com/gdamjan/13fc8c75a2f8bb34541da0948739baed` (Wario/PW2 dmesg incl. PMIC/MMC/rails). `[GPL source]`
- **PW3 schematics + mainline u-boot thread** — MobileRead `showthread.php?t=332253` (bdm310). `[forum/uncertain]`
- **Wikipedia** — `en.wikipedia.org/wiki/Amazon_Kindle_devices` (model/codename/hardware table). `[RE/documented]`
- **sixfoisneuf.fr** — "Kindle hacking: deeper dive internals" (good systems-level writeup). `[RE/documented]`
- **inkframe.net** — "E-paper waveform modes glossary" (maps Amazon waveform names to the E Ink AF spec table). `[forum/uncertain]`

---

## Open questions / contradictions (carry into the book)

1. **Waveform ownership** — does userspace fully select the waveform, or does the closed `mxc_epdc_eink` module override via panel tables? Evidence suggests request-in-userspace / realize-in-module. `[forum/uncertain]`
2. **`/etc/kdb` schema** — the exact key set powerd reads is unconfirmed; search is polluted by "kdb" (kernel debugger). `[forum/uncertain]`
3. **PW3 partition flags** beyond the documented 4-partition layout are not confirmed firsthand (only p1–p4). `[forum/uncertain]`
4. **Board codenames** — "Wario"/"Muscat" mapping to PW2/PW3 and `PINOT_WFO`/`Muscat WFO` strings is from forum dmesg, not a single authoritative table. `[forum/uncertain]`
5. **Official GPL page** — could not be fetched directly (503/403); all GPL-derived facts come from mirrors/tarballs. `[official]` (negative)
6. **Battery capacity (~1420 mAh)** and a few other part numbers are forum-sourced. `[forum/uncertain]`

---

## References

Confidence legend: **[official]** Amazon/vendor, **[GPL source]** Amazon GPL drop, **[RE/documented]** community reverse-engineering / wiki, **[forum/uncertain]** forum thread.

- [official] Amazon — Source Code Notice for Kindle E-Readers and Fire Tablets: https://www.amazon.com/gp/help/customer/display.html?nodeId=200203720 *(503/403 to bots; fetched indirectly)*
- [GPL source] FBInk — Kindle EPDC/ioctl/waveform header: https://github.com/NiLuJe/FBInk/blob/master/eink/mxcfb-kindle.h (raw: https://raw.githubusercontent.com/NiLuJe/FBInk/master/eink/mxcfb-kindle.h)
- [GPL source] Linux kernel mirror (`linux-3.0.35-lab126`, PW3/Wario tree): https://github.com/katadelos/linux-3.0.35-lab126
- [GPL source] dmesg + kernel config dump (Wario/PW2): https://gist.github.com/gdamjan/13fc8c75a2f8bb34541da0948739baed
- [RE/documented] barebox — Amazon Kindle 6th/7th gen board docs: https://barebox.org/doc/latest/boards/imx/amazon-kindle-6-7.html
- [RE/documented] barebox — Amazon Kindle 4th/5th gen board docs: https://barebox.org/doc/latest/boards/imx/amazon-kindle-4-5.html
- [RE/documented] kindlemodding.org — platform root/index: https://kindlemodding.org/
- [RE/documented] kindlemodding.org — jailbreaking index: https://kindlemodding.org/jailbreaking/
- [RE/documented] kindlemodding.org — WinterBreak: https://kindlemodding.org/jailbreaking/WinterBreak/
- [RE/documented] kindlemodding.org — AdBreak: https://kindlemodding.org/jailbreaking/AdBreak/
- [RE/documented] kindlemodding.org — jailbreak FAQ: https://kindlemodding.org/jailbreaking/jailbreak-faq.html
- [RE/documented] kindlemodding.org — apps & services: https://kindlemodding.org/kindle-apps-and-services/
- [RE/documented] kindlemodding.org — `com.lab126.powerd`: https://kindlemodding.org/kindle-apps-and-services/com.lab126.powerd.html
- [RE/documented] kindlemodding.org — `com.lab126.pillow`: https://kindlemodding.org/kindle-apps-and-services/com.lab126.pillow.html
- [RE/documented] kindlemodding.org — hotfix: https://kindlemodding.org/kindle-hacking/hotfix.html
- [RE/documented] kindlemodding.org — WAFs & Mesquito: https://kindlemodding.org/kindle-hacking/wafs-and-mesquite/
- [RE/documented] MobileRead wiki — Kindle Touch Hacking (Architecture/LIPC/Java/Webkit/Pillow/Blanket/OTA): https://wiki.mobileread.com/wiki/Kindle_Touch_Hacking
- [RE/documented] MobileRead wiki — Lipc: https://wiki.mobileread.com/wiki/Lipc
- [RE/documented] MobileRead wiki — K5 Index: https://wiki.mobileread.com/wiki/K5_Index
- [RE/documented] MobileRead wiki — Kindle Hardware Index: https://wiki.mobileread.com/wiki/Kindle_Hardware_Index
- [RE/documented] MobileRead wiki — Eips: https://wiki.mobileread.com/wiki/Eips
- [forum/uncertain] MobileRead wiki — 5.x Jailbreak: https://wiki.mobileread.com/wiki/5_x_Jailbreak
- [forum/uncertain] MobileRead wiki — Kindle Serial Numbers: https://wiki.mobileread.com/wiki/Kindle_Serial_Numbers
- [RE/documented] notmarek — LanguageBreak: https://github.com/notmarek/LanguageBreak
- [RE/documented] yifanlu — OpenBlanket: https://github.com/yifanlu/OpenBlanket
- [RE/documented] notmarek — openlipc: https://github.com/notmarek/openlipc
- [forum/uncertain] MobileRead — PW3 schematics / mainline u-boot (bdm310): https://www.mobileread.com/forums/showthread.php?t=332253
- [RE/documented] Wikipedia — Amazon Kindle devices: https://en.wikipedia.org/wiki/Amazon_Kindle_devices
- [RE/documented] sixfoisneuf.fr — Kindle hacking: a deeper dive into the internals: https://sixfoisneuf.fr/posts/kindle-hacking-deeper-dive-internals/
- [forum/uncertain] inkframe.net — E-paper waveform modes glossary: https://inkframe.net/en/guides/e-paper-waveform-modes-glossary
