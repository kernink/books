# 99 — References<a id="references"></a>

Consolidated sources for the book. Confidence legend as used throughout: `[official]`,
`[GPL source]`, `[RE/documented]`, `[forum/uncertain]`, `[dev]` (read off our own device).

The three raw research streams are preserved in this same folder under `_notes/`:

- `_notes/A-internet.md` — public-record + reverse-engineering research.
- `_notes/B-prior-art.md` — ecosystem/prior-art survey.
- `_notes/C-device.md` — live device probe transcript.

---

## Amazon / official

- `[official]` Source Code Notice for Kindle E-Readers and Fire Tablets —
  https://www.amazon.com/gp/help/customer/display.html?nodeId=200203720
  *(returns 503/403 to automated fetchers; read indirectly)*
- `[official]` NXP i.MX6SoloLite product documentation and reference manual (EPDC/HAB) —
  https://www.nxp.com/products/processors-and-microcontrollers/arm-processors/i-mx-applications-processors/i-mx-6-processors:IMX6X_SERIES

## GPL source drops & kernel mirrors

- `[GPL source]` Kernel mirror, `linux-3.0.35-lab126` — https://github.com/katadelos/linux-3.0.35-lab126
- `[GPL source]` FBInk EPDC/ioctl/waveform header (`eink/mxcfb-kindle.h`) —
  https://github.com/NiLuJe/FBInk/blob/master/eink/mxcfb-kindle.h
- `[GPL source]` Wario/PW2 dmesg + kernel-config dump —
  https://gist.github.com/gdamjan/13fc8c75a2f8bb34541da0948739baed

## Boot, hardware, and platform documentation

- `[RE/documented]` barebox — Amazon Kindle 6th/7th gen board docs —
  https://barebox.org/doc/latest/boards/imx/amazon-kindle-6-7.html
- `[RE/documented]` barebox — Amazon Kindle 4th/5th gen board docs —
  https://barebox.org/doc/latest/boards/imx/amazon-kindle-4-5.html
- `[RE/documented]` Wikipedia — Amazon Kindle devices (model/codename table) —
  https://en.wikipedia.org/wiki/Amazon_Kindle_devices
- `[forum/uncertain]` MobileRead — PW3 schematics / mainline u-boot (bdm310) —
  https://www.mobileread.com/forums/showthread.php?t=332253
- `[forum/uncertain]` MobileRead — Kindle recovery / `imx_usb_loader` —
  https://www.mobileread.com/forums/showthread.php?t=174916
- `[RE/documented]` i.MX USB loader tutorial —
  https://imxdev.gitlab.io/tutorial/Using_the_imx_usb_loader_tool/

## Display / EPDC

- `[RE/documented]` FBInk (the EPDC oracle; GPL-3.0+) — https://github.com/NiLuJe/FBInk
  · CLI: https://github.com/NiLuJe/FBInk/blob/master/CLI.md
  · `alt_buffer` shim: https://github.com/NiLuJe/FBInk/blob/master/utils/alt_buffer.c
- `[RE/documented]` MobileRead wiki — `eips` — https://wiki.mobileread.com/wiki/Eips
- `[RE/documented]` "Kindle hacking: a deeper dive into the internals" —
  https://sixfoisneuf.fr/posts/kindle-hacking-deeper-dive-internals/
- `[forum/uncertain]` E-paper waveform modes glossary —
  https://inkframe.net/en/guides/e-paper-waveform-modes-glossary
- `[RE/documented]` rmkit — e-ink dev notes — https://rmkit.dev/eink-dev-notes/

## Userspace, LIPC, services, and power

- `[RE/documented]` kindlemodding.org — platform index — https://kindlemodding.org/
  · apps & services: https://kindlemodding.org/kindle-apps-and-services/
  · `com.lab126.powerd`: https://kindlemodding.org/kindle-apps-and-services/com.lab126.powerd.html
  · `com.lab126.pillow`: https://kindlemodding.org/kindle-apps-and-services/com.lab126.pillow.html
  · awesome window manager: https://kindlemodding.org/kindle-dev/awesome-window-manager/
- `[RE/documented]` MobileRead wiki — Kindle Touch Hacking (Architecture/LIPC/Java/WebKit/Pillow/Blanket/OTA) —
  https://wiki.mobileread.com/wiki/Kindle_Touch_Hacking
- `[RE/documented]` MobileRead wiki — Lipc — https://wiki.mobileread.com/wiki/Lipc
- `[RE/documented]` MobileRead wiki — K5 Index — https://wiki.mobileread.com/wiki/K5_Index
- `[RE/documented]` System internals writeup (kindle-home-assistant-panel) —
  https://github.com/rune-bk/kindle-home-assistant-panel/blob/main/docs/03-system-internals.md
- `[RE/documented]` yifanlu — OpenBlanket — https://github.com/yifanlu/OpenBlanket
- `[RE/documented]` notmarek — openlipc — https://github.com/notmarek/openlipc
- `[RE/documented]` NiLuJe — openlipclua — https://github.com/NiLuJe/openlipclua

## Jailbreaks, persistence, and distribution

- `[RE/documented]` kindlemodding.org — jailbreaking index — https://kindlemodding.org/jailbreaking/
  · WinterBreak: https://kindlemodding.org/jailbreaking/WinterBreak/
  · AdBreak: https://kindlemodding.org/jailbreaking/AdBreak/
  · FAQ: https://kindlemodding.org/jailbreaking/jailbreak-faq.html
- `[RE/documented]` kindlemodding.org — hotfix — https://kindlemodding.org/kindle-hacking/hotfix.html
- `[RE/documented]` kindlemodding.org — core hacking — https://kindlemodding.org/kindle-hacking/index.html
- `[RE/documented]` kindlemodding.org — WAFs & Mesquito —
  https://kindlemodding.org/kindle-hacking/wafs-and-mesquite/
- `[RE/documented]` KindleModding/WinterBreak — https://github.com/KindleModding/WinterBreak
- `[RE/documented]` KindleModding/Hotfix (GPL-3.0) — https://github.com/KindleModding/Hotfix
- `[GPL source]` NiLuJe/KindleTool (GPL-3.0+) — https://github.com/NiLuJe/KindleTool
- `[RE/documented]` notmarek/LanguageBreak — https://github.com/notmarek/LanguageBreak
- `[forum/uncertain]` MobileRead — LanguageBreak thread —
  https://www.mobileread.com/forums/showthread.php?t=356872
- `[forum/uncertain]` MobileRead — 5.6.5 jailbreak — https://www.mobileread.com/forums/showthread.php?t=270651
- `[RE/documented]` kindlemodding.org — recovering from a reset —
  https://kindlemodding.org/jailbreaking/recovering-from-a-reset.html
- `[RE/documented]` kindlemodding.org — firmware & flashing —
  https://kindlemodding.org/firmware-and-flashing/index.html

## Package managers & apps

- `[RE/documented]` KindleModding/KPM (GPL-3.0) — https://github.com/KindleModding/KPM
  · repo: https://repo.kindlemodding.org/ · docs: https://kindlemodding.org/kindle-dev/kpm/index.html
- `[RE/documented]` NiLuJe/KUAL_Booklet — https://github.com/NiLuJe/KUAL_Booklet
- `[RE/documented]` kasparcode/kuala (native GTK C++ KUAL) — https://github.com/kasparcode/kuala
- `[forum/uncertain]` MobileRead — MRPI — https://www.mobileread.com/forums/showthread.php?t=251143
- `[RE/documented]` KindleTweaks/KindleForge — https://github.com/KindleTweaks/KindleForge
- `[RE/documented]` KindleTweaks/Awesome-Kindle (CC0) — https://github.com/KindleTweaks/Awesome-Kindle
- `[RE/documented]` KindleModding/kindle-sdk (GPL-3.0) — https://github.com/KindleModding/kindle-sdk
  · docs: https://kindlemodding.org/kindle-dev/kindle-sdk.html
- `[RE/documented]` koreader/koxtoolchain — https://github.com/koreader/koxtoolchain

## Readers & alternate UI

- `[RE/documented]` KOReader (AGPL-3.0) — https://github.com/koreader/koreader
  · Kindle device layer: https://github.com/koreader/koreader/blob/master/frontend/device/kindle/device.lua
- `[RE/documented]` baskerville/plato (AGPL-3.0) — https://github.com/baskerville/plato
  · OGKevin/cadmus: https://github.com/OGKevin/cadmus
- `[RE/documented]` Quill OS (Rust + Slint, PineNote) — https://quill-os.org/ · https://github.com/Quill-OS/quill
- `[RE/documented]` InkBox (Szybet) — https://github.com/Szybet · guide: https://github.com/Szybet/niAudio/blob/main/inkbox.md

## Rust-on-Kindle & e-ink dev

- `[RE/documented]` sverrejb — "Rust on Kindle" blog — https://sverre.me/blog/rust-on-kindle/
- `[RE/documented]` sverrejb/slint-kindle-backend (MIT OR Apache-2.0; depends on Slint) —
  https://github.com/sverrejb/slint-kindle-backend · crates.io: https://crates.io/crates/slint-backend-kindle
- `[RE/documented]` Szybet/fbink-sys — https://github.com/Szybet/fbink-sys
- `[RE/documented]` sublipri/fbink-rs — https://github.com/sublipri/fbink-rs
- `[RE/documented]` ciscoriordan/kindling — https://github.com/ciscoriordan/kindling
- `[RE/documented]` Squill-OS — see Quill OS above.
- `[RE/documented]` Soldered Inkplate — https://soldered.com/inkplate/
  · https://github.com/SolderedElectronics/Inkplate-Arduino-library

## Terminals, networking, utilities

- `[RE/documented]` bfabiszewski/kterm (GPL-3.0+) — https://github.com/bfabiszewski/kterm ·
  http://www.fabiszewski.net/kindle-terminal/
- `[RE/documented]` notmarek/kindle-usbnetlite — https://github.com/notmarek/kindle-usbnetlite
- `[RE/documented]` MobileRead — kindle-python snapshot — https://www.mobileread.com/forums/showthread.php?t=225030
- `[RE/documented]` schuhumi/alpine_kindle — https://github.com/schuhumi/alpine_kindle

---

## Device probe (our own PW3)

All `[dev]` facts in the book come from a read-only probe of a Kindle Paperwhite 3 running
FW 5.16.2.1.1. The full transcript — kernel, config, sysfs, `/proc`, input capabilities, upstart
jobs, LIPC schema, partitions, processes — is `_notes/C-device.md`. No files were written and no
services were started or stopped during the probe.

Every identifier that would tie the transcript to one physical unit or one network has been masked:
serials, board ids, MAC addresses, private addresses, network names, SSH key paths and ports. The
technical content is unchanged; only the fingerprints are gone.
