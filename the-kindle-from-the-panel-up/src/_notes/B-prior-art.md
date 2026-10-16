# B — Prior art: the Kindle hacking ecosystem (raw research notes)

> Research date: 2026-10-16. Target for kernink: **Kindle PW3 (Wario, i.MX6SoloLite, no GPU), FW 5.16.2.1.1**, mxc_epdc_fb Y8, evdev MT-B touch, MIT-licensed lean Rust launcher + reader.
> Method: web search + fetch of official wikis, GitHub repos, MobileRead threads, blog deep-dives. Licenses verified where the repo page showed an SPDX badge; otherwise flagged **[unverified]**.

---

## 0. TL;DR for kernink (read this first)

**The niche is genuinely open.** There is *no* widely-adopted third-party full home/launcher replacement for modern Kindle. Everyone either (a) lives inside KOReader, (b) SIGSTOPs the Amazon framework and runs fullscreen, or (c) uses KUAL as an app menu. That is kernink's whitespace.

**Rust-on-Kindle precedent exists and works on exactly our device.** `sverrejb/slint-kindle-backend` is Rust + Slint running on a **PW3**: mmap `/dev/fb0`, MXCFB ioctl with a damage rect, evdev MT-B input, idle `poll(2)`, suspend/wake schedule. Licensing of the *backend* is MIT/Apache-2.0 but it depends on Slint (GPL-3.0 / royalty-free), which is a trap for an MIT product. **Read it for the ioctl/evdev/suspend patterns; do not inherit Slint.**

**Constraints a new launcher must respect (confirmed by multiple independent projects):**
1. The Kindle app framework is an **X11 + `awesome` WM + `cvm` + `pillow` stack** on 5.x. You cannot just own the framebuffer while it runs — two EPDC writers cause ghosting/flash storms.
2. The accepted "own the screen" trick is **`SIGSTOP` the WM/CVM, `SIGCONT` on exit** (KOReader, kindle-home-assistant-panel). Reversible — but **if your process dies after STOP and never CONTs, the device is frozen**. Always `trap ... EXIT` a resume.
3. There *is* a "clean" alternative: become an **`awesome`-managed window with a specially-formatted title** and place yourself on the SCREENSAVER layer. More correct, more involved. Documented at kindlemodding.org.
4. **Rotating the fb from under X is explicitly warned against** by FBInk's author.
5. Rootfs is **wiped by OTA**; `/mnt/us` (vfat) survives. Everything user-facing lives on `/mnt/us`. The hotfix + OTA-block is the persistence contract.
6. **Do not link GPLv3 FBInk** if MIT matters. FBInk is GPL-3.0+ by design (its author warns the CLI/library is not LGPL). kernink should implement its own EPDC/ioctl layer (which also matches the "lean" principle).
7. `eips` (Amazon's own) uses *legacy* `FBIO_EINK_*` ioctls; modern mxc_epdc devices use `MXCFB_SEND_UPDATE` with damage rect + waveform. FBInk handles both.

---

## 1. Summary comparison table

| Project | What it is | How it works | License | Relevance to kernink |
|---|---|---|---|---|
| **WinterBreak** (KindleModding) | Modern jailbreak (Jan 1 2025) | Browser/WAF exploit via Kindle Store webapp ("Mesquito"); copies to `/mnt/us` incl `.active_content_sandbox`, gets root code exec | **[unverified]** (repo README no SPDX) | Context only — already jailbroken on our device |
| **KindleModding/Hotfix** + Universal Hotfix | Persistence layer after jailbreak | Signed OTA `.bin`; installs dev keys in `/etc/uks`, creates `/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC` + `/MNTUS_EXEC`, installs KMC/MKK to `/var/local`, sets up `gandalf`(=busybox `su`), installs fbink, runs on `framework_ready` upstart, restarts `lab126_gui` | **GPL-3.0** (repo "GPLify" commit) | Defines the file/upstart contract kernink integrates with |
| **KindleTool** (NiLuJe / KindleModding) | Pack/unpack/sign Kindle OTA | Bundles homebrew signing key (see `create.c`); convert `.bin` ↔ tar | **GPL-3.0+** (Yifan Lu) | Only if we ship OTA-formatted installers |
| **KUAL** (Kindle Unified App Launcher) + **KUAL Booklet** | App menu, not a home replacement | Java **Kindlet** (`.azw2`) on older FW; **Booklet** (native) on KOA+; reads `/mnt/us/extensions/*/menu.json` | **[unverified]** (community/GPL-ish) | The incumbent "launcher"; shows the extension-menu idiom we'd replace/absorb |
| **KUALA** (kasparcode/kuala) | **C++ rewrite of KUAL** using native GTK | Native GTK UI, no JVM | **[unverified]** | Closest prior art to "native launcher that replaces KUAL"; study its GTK use |
| **MRPI** (MobileRead Package Installer) | KUAL extension `.bin` installer | Installs packages from `/mnt/us/mrpackages` via OTA machinery | **[unverified]** | Predecessor to KPM; not needed by us |
| **KPM** (Kindle Package Manager) | On-device package manager | Scriptlets typed in search bar (`;kpm install ...`); static repos (GitHub Pages) | **GPL-3.0** (README CC0) | Distribution channel for closing kernink; `repo.kindlemodding.org` |
| **KindleForge** (KindleTweaks) | GUI package manager (Go) | Cross-compiled Go binary, on-device GUI | **[unverified]** | Competing GUI installer; Go cross-build recipe useful |
| **KOReader** | Full alternate reader/UI | LuaJIT + C; own einkfb drawing; bundles fbink; launched via `koreader.sh`; `--framework_stop`/no-framework = `SIGSTOP awesome`(+cvm), restart `lab126_gui` on exit | **AGPL-3.0** | The reference for "own the screen" + Kindle power/frontlight/lipc integration |
| **simpleui.koplugin** | KOReader home-screen/nav plugin | KOReader plugin (Lua) | **MIT** | Design reference for a home screen; MIT-clean to read |
| **Plato** (baskerville) | Rust document reader (Kobo) | Pure Rust, CPU rasteriser, draws via FBInk; no Qt | **AGPL-3.0** | **Best pure-Rust e-ink UI architecture reference**; AGPL = read-only for us |
| **Cadmus** (OGKevin) | Plato fork, modernised | Rust, adds sqlx/devenv/ci | **AGPL-3.0 [likely]** | Same as Plato, newer tooling |
| **InkBox / Quill OS** (Szybet → Quill-OS) | Full open OS for Kobo (+some Kindle) | Qt-based userland; Quill (PineNote) is Rust + Slint + Niri Wayland | **AGPL-3.0 [likely]** | Proof that a from-scratch e-ink OS/launcher is viable; Rust+Slint precedent |
| **FBInk** (NiLuJe) | Framebuffer inker (lib + CLI) | Handles i.MX EPDC + MTK; `MXCFB_SEND_UPDATE`; waveforms, dither, images, OT/TTF, daemon mode | **GPL-3.0+** | **The** EPDC reference; do **not** link it (GPL). Re-implement patterns |
| **eips** (Amazon, `/usr/sbin/eips`) | Stock text/image/refresh tool | Legacy `FBIO_EINK_*` ioctls | Proprietary (firmware) | Legacy path; useful for cheap fullscreen refresh/screenshots |
| **fbdepth** (FBInk util) | Set fb bitdepth/rotation | Direct ioctls; warns re: X | GPL-3.0+ | Rotation/bitdepth reference |
| **kterm** (bfabiszewski) | GTK+VTE terminal w/ on-screen keyboard | GTK2/3 + VTE; KUAL extension; dbus for rotation | **GPL-3.0-or-later** | Proves GTK stack is present on PW3; GPL |
| **USBNetwork / UsbNetLite** (NiLuJe / notmarek) | SSH over USB/WiFi | dropbear; `authorized_keys` at `/mnt/us/usbnet/etc/` | **[unverified]** | Our dev/deploy channel |
| **kindle-python** (NiLuJe) | Python 2.7/3 on device | Bundled interpreter + libs; fbink bindings | **[unverified]** (NiLuJe hacks usually GPL) | Scripted prototyping only |
| **libkh** (NiLuJe) | Kindle hacks lib/tools | Shared lib + CLI in `/mnt/us/libkh/bin` (its `fbink` **has image support**) | **[unverified]** | Handy tooling; not a dependency |
| **slint-kindle-backend** (sverrejb) | **Rust + Slint backend for Kindle** | Software renderer → mmap fb, MXCFB ioctl damage rect, evdev MT-B, idle poll, wake schedule, bilevel mode | **MIT OR Apache-2.0** (but depends on **Slint: GPL-3.0-only OR royalty-free**) | **Closest Rust precedent; tested on PW3.** Study patterns; Slint dep is the license problem |
| **fbink-sys** (Szybet) | Raw Rust bindgen to FBInk | Statically links FBInk (musl, armv7l) | **[unverified]** links GPL FBInk | Rust↔FBInk FFI reference |
| **fbink-rs** (sublipri) | Rust bindings for FBInk | bindgen + safe wrappers; `cross` | **[unverified]** links GPL FBInk | Same |
| **kindling / kindling-mobi** (ciscoriordan) | Rust MOBI/AZW3 builder + on-device thumbnail writer | Pure Rust | **[unverified]** (likely permissive) | Rust-on-Kindle tooling; useful for library thumbnails |
| **openlipc** (notmarek) | Reverse-engineered `liblipc` headers; `openlipclua` (NiLuJe) | C/Lua bindings to lipc | **[unverified]** | Direct lipc control instead of shelling out |
| **InkPlate** (Soldered) | ESP32 e-paper dev boards | Arduino/MicroPython/LVGL; open HW | MIT **[likely]** (HW open) | Adjacent e-ink blitting/dithering ideas only |
| **rmkit / InkVT** | reMarkable alt-UI toolkit; fbink terminal | C++/C | varies | e-ink dev notes at rmkit.dev |
| **Awesome-Kindle** (KindleTweaks) | Curated list of tweaks | — | **CC0-1.0** | Index of the whole ecosystem |

---

## 2. Jailbreaks & boot bypass

### Mechanism (generic, from the Modding wiki "Kindle Hacking" page)
Once you have **root code execution**, a jailbreak does exactly:
1. `mntroot rw` (mount rootfs read-write)
2. Install **developer keys** into `/etc/uks` or the `/etc/uks.sqsh` squashfs
3. Create `/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC` (enables debug features)
4. Create `/MNTUS_EXEC` (makes Kindle mount `/mnt/us` **exec**)
5. `mntroot ro`
Then a **hotfix** finalises it. Source: <https://kindlemodding.org/kindle-hacking/index.html>

**Why this matters to kernink:** step 4 (`/MNTUS_EXEC`) is the reason our binaries on `/mnt/us` can execute/service; step 2 is why homebrew signed OTA installs work.

### WinterBreak (current, FW ≤ 5.18.0; patched ≥ 5.18.1)
- Released **New Year's Day 2025** by **Hackerdude**. Built on **Mesquito** (a WAF/rocket-app exploit of the Kindle Store webapp). Works on nearly every Kindle back to the Paperwhite 2 (2013).
- Flow: fill storage/disable OTA → airplane mode → reboot → copy `WinterBreak.tar.gz` contents (incl. hidden `.active_content_sandbox`) to `/mnt/us` → open Kindle Store (Mesquito loads) → tap WinterBreak icon → ~30s → device "spews text" and **restarts the GUI**.
- Repo: <https://github.com/KindleModding/WinterBreak> · Guide: <https://kindlemodding.org/jailbreaking/WinterBreak/>
- **Patched in 5.18.1** — never update. Sibling/alternate methods: Véra, SpiderCat, SpringBreak, AdBreak, Nosebleed, Sanctuary, WinterBreak2 (all listed in the wiki nav).

### LanguageBreak (the relevant one for our FW 5.16.2.1.1)
- **Demo-mode exploit**. Steps (MobileRead thread <https://www.mobileread.com/forums/showthread.php?t=356872>): `;enter_demo` → reboot → configure demo → secret gesture → `;demo` → *Sideload Content* → copy LanguageBreak folder (merge/replace) → *Resell Device* → replug, copy again → power cycle → pick Chinese → logs appear → then `;uzb` (unrestricted USB) to copy `update_hotfix_languagebreak-*.bin` to root → *Update Your Kindle* → installs **custom hotfix**, leaves demo mode, cleans up.
- Works up to **5.16.2.1.1** — i.e. our device. This is the historical entry point for PW3 on this FW.

### Older
- **5.6.5 software-only jailbreak** (searchbar + `update.bin`): <https://www.mobileread.com/forums/showthread.php?t=270651> / <https://www.mobileread.com/forums/showthread.php?t=265675>
- **KindleBreak** ("almost any Kindle ≤ 5.13.3"): <https://www.mobileread.com/forums/showthread.php?t=338268>
- **Kindle Touch/PW1/PW2 5.0.x–5.4.4.2 + FW 5.x USBNetwork**: <https://www.mobileread.com/forums/showthread.php?t=186645>
- **Kindle 5.6.5 downgrade restriction**: "Kindles can only be downgraded if already jailbroken, latest jailbreakable version is 5.16.2.1.1" (<https://www.mobileread.com/forums/showthread.php?t=361822>).

### Hotfix (the persistence mechanism — understand this)
Distributed as a **signed OTA `.bin`** (that's why jailbreaks install new **OTA keys** first). The homebrew signing key is bundled in **KindleTool** (`create.c`): <https://github.com/KindleModding/KindleTool/blob/.../KindleTool/create.c#L49>
Structure: `install.sh`, `kmc.tar`, `libotautils6`, `mkk.tar`, `update-filelist.dat`.
`install.sh` (sources `libotautils6`) → creates `/var/local/kmc` + `/var/local/mkk`, extracts tars, sets perms, installs **`kmc.conf` upstart job that runs on `framework_ready`** (runs `/mnt/us/emergency.sh` if present, else fixes perms), symlinks `armhf/bin → bin`, links **`gandalf` → `su`** (busybox privilege escalation), copies `dispatch.sh` → `/usr/bin/logThis.sh`, modifies `appreg.db` to register the hotfix booklet + `sh_integration`.
**Run Hotfix** booklet elevates via `su`, runs each job, then **restarts `lab126_gui`**.
Notable jobs: `install_mkk_dev_keystore.sh` (Java keystore so legacy booklets like KUAL work), `setup_fbink.sh` (copies fbink to expected location).
Source: <https://kindlemodding.org/kindle-hacking/hotfix.html> · Repo: <https://github.com/KindleModding/Hotfix> (**GPL-3.0**)

**Why hotfix matters:** it is the thing that *reinstalls* our environment after OTA/reset, and it hooks `framework_ready`. A kernink autostart could piggyback the same `framework_ready` idiom (or the `kmc.conf` job runner) rather than fighting it.

### Bricking risk & recovery
- Beta testers did **brick devices** (wiki thanks list: "RIP bricked Kindles during beta-testing").
- Recovery tooling: **diags** partition boot, **MfgTool** (i.MX USB Serial Download; Windows) and **`imx_usb_loader`** (cross-platform) to push U-Boot/fastboot: <https://www.mobileread.com/forums/showthread.php?t=174916>, <https://imxdev.gitlab.io/tutorial/Using_the_imx_usb_loader_tool/>, i.MX6 recovery: <https://community.nxp.com/t5/i-MX-Processors/i-MX6-Recovery-Mode-with-HAB-and-MFG-tool/m-p/292096>
- Kindle-flavoured U-Boot hacking: <https://github.com/MollySophia/imx6_android_u-boot_kindle> (KT3).
- Also: <https://kindlemodding.org/jailbreaking/recovering-from-a-reset.html>, <https://kindlemodding.org/jailbreaking/bypassing-oobe.html>, <https://kindlemodding.org/firmware-and-flashing/index.html>.
- Removal: run `ota.sh` scriptlet → factory reset → push a (possibly same-version) update from <https://ftvdb.com/kindle/firmware/> → "every trace removed".

**Risk model for kernink:** We are already jailbroken. Our danger is not the jailbreak but (a) getting the EPDC into a bad state, (b) SIGSTOP-without-CONT freeze, (c) OTA wiping our rootfs pieces. Nothing we do in userspace on `/mnt/us` should be able to hard-brick (bootloader is untouched).

---

## 3. Package managers / app frameworks

### KUAL + extensions
- **Kindle Unified Applications Launcher.** Original at `bitbucket.org/ixtab/kindlelauncher` (mirrored as `coplate/KUAL_Booklet`, `NiLuJe/KUAL_Booklet`). Java **Kindlet** `.azw2` on older FW; **Booklet** (native) on KOA/KT3+ (Kindlets deprecated there).
- Reads `/mnt/us/extensions/*/` for `menu.json`/`config.xml`; runs shell commands. **Paginated, self-terminating menu.** Requires the **Mobileread Kindlet Kit** (dev keystore) for the Java variant.
- Repos: <https://github.com/NiLuJe/KUAL_Booklet>, <https://github.com/coplate/KUAL_Booklet>; stripped-down "just launch KOReader" fork: <https://github.com/yparitcher/KUAL_Booklet>; wiki thread <https://www.mobileread.com/forums/showthread.php?t=203326>.
- **KUALA** — C++ rewrite using the Kindle's **native GTK** (the Java KUAL stopped working on newer FW): <https://github.com/kasparcode/kuala>. *The most direct prior art for a native launcher.*

### MRPI (MobileRead Package Installer)
KUAL extension adding an "Install MR Packages" button; installs `.bin` from `/mnt/us/mrpackages`. Legacy (pre-K5) and modern variants. Thread <https://www.mobileread.com/forums/showthread.php?t=251143>; wiki <https://wiki.mobileread.com/wiki/MobileRead_Package_Installer>; install guide <https://kindlemodding.org/jailbreaking/Legacy/post-jailbreak/installing-kual-mrpi/>.

### KPM (Kindle Package Manager)
- **Recommended distribution method as of `hdnext`** (Hackerdude). Indexes homebrew; install on-device by typing **scriptlets** in the search bar: `;kpm install <pkg>`.
- Repos: <https://github.com/KindleModding/KPM> (**GPL-3.0**; README CC0), official repo <https://github.com/KindleModding/repo> (index at <https://repo.kindlemodding.org/>). Docs <https://kindlemodding.org/kindle-dev/kpm/index.html>; packaging <.../creating-a-package.html>, repo hosting <.../creating-a-repository.html>.
- **Scriptlets:** `.sh` files in `/mnt/us/documents` are tappable library items; `<.../whats-next/installing-homebrew.html>`. **This is the cheapest possible install UX and the obvious channel to ship kernink.**

### KindleForge (competing GUI PM, Go)
<https://github.com/KindleTweaks/KindleForge> — Go, `GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0`, stripped + UPX. Useful cross-build recipe.

### Ecosystem hubs
- **kindlemodding.org** wiki (jailbreak wizard, dev docs, apps & services, LIPC docs).
- Discord <http://discord.kindlemodding.org/>; r/kindlejailbreak; KindleModShelf <https://kindlemodshelf.me/>; Penguins' Mesquite Wiki <https://github.com/penguins184/Penguins-Kindle-Wiki>; **Awesome-Kindle** <https://github.com/KindleTweaks/Awesome-Kindle> (CC0).

### KOReader's install path
Shipped as a **KPM package** ("Getting KOReader" <https://kindlemodding.org/jailbreaking/whats-next/getting-koreader/>) or the old KUAL-extension zip. Lives at `/mnt/us/koreader`; entry `koreader.sh`; `platform/kindle/` holds scripts; menu at `platform/kindle/extensions/koreader/menu.json`. (The task's "koreader/kindle repo" is effectively this in-tree `platform/kindle` dir; the FBInk repo is separate.)

---

## 4. Readers / alternate UI

### KOReader (AGPL-3.0) — the reference implementation for Kindle
- **How it draws:** its own C einkfb code + optional FBInk (bundles its own fbink build; **image support compiled out** — use libkh's fbink for PNGs). No X, no GTK for the core.
- **How it handles the stock framework:** "no framework mode" runs `koreader.sh --framework_stop` which **`SIGSTOP`s `awesome`** (WM) — and on some builds `cvm` — then on exit `SIGCONT`s and restarts the GUI (`lipc-set-prop com.lab126.appmgrd start app://com.lab126.booklet.home`). Confirmed by reddit/answeroverflow/KOReader issues. Refs: <https://www.reddit.com/r/koreader/comments/1vehil2/>, <https://github.com/koreader/koreader/issues/11144>, <https://github.com/koreader/koreader/blob/master/frontend/device/kindle/device.lua>.
- **Power/frontlight** via `com.lab126.powerd` lipc (`preventScreenSaver`, `battLevel`, suspend). **Launching:** KUAL/KPM, or boot autostart via `kor.conf` (`sleep 80; exec /mnt/us/koreader/koreader.sh --kual --framework_stop`) — <https://www.answeroverflow.com/m/1359655622877909063>.
- Licensed **AGPL-3.0** — read for behaviour, do not copy code into an MIT product.

### Stock Kindle reader stack (what we're replacing/coexisting with)
- **`cvm`** = content view manager (dispatches touches, hosts keyboard); **`awesome`** = WM; **`pillow`** = status/top bar; **`lab126_gui`** = the upstart GUI service.
- Amazon's own reader is native (C) behind a Java "Kindlet" host on older FW; on 5.16+ (KPP) the old `app://com.lab126.booklet.reader` handler is **gone** — open a book with `lipc-set-prop com.lab126.kppReader openDocumentWithParams '{"asin":"…","type":"EBOK"}'`; current book/ASIN from `sqlite3 /var/local/cc.db` (`Entries.p_cdeKey`). Source: <https://github.com/rune-bk/kindle-home-assistant-panel/blob/main/docs/03-system-internals.md>.
- "Kindlets" (Java, Amazon KDK) are deprecated on new devices; the Modding wiki documents window-title conventions for `awesome` (<https://kindlemodding.org/kindle-dev/awesome-window-manager/>).
- Note on the task's "Reader for Kindle": there is no distinct well-known project by that name beyond the stock reader; the meaningful alternates are KOReader / Plato / Cadmus / InkBox.

### Plato (Rust, AGPL-3.0) — Kobo, but the architecture we want
- Pure **Rust** document reader; **CPU rasteriser**; draws via **FBInk** (links libfbink), not Qt. Supports PDF/EPUB/etc via MuPDF + own renderer. Repo <https://github.com/baskerville/plato>; thread <https://www.mobileread.com/forums/showthread.php?t=292914>.
- **Cadmus** fork (modern Rust tooling: sqlx, devenv, xtask, CI): <https://github.com/OGKevin/cadmus> (**AGPL-3.0 [likely]**).
- **License = AGPL** → reference architecture only.

### InkBox / Quill OS (from-scratch e-ink OS)
- Qt-based open OS for Kobo (+ some Kindle), by **Szybet**. Repos: <https://github.com/Quill-OS/quill>, <https://github.com/Quill-OS/user-applications>. Guide <https://github.com/Szybet/niAudio/blob/main/inkbox.md>.
- **Quill OS (PineNote)** is **Rust + Slint**, Niri Wayland compositor, "many eInk modes", "Recovery framework made with Rust and Slint UI", "almost exclusively Rust userspace": <https://quill-os.org/>. Another Rust+Slint-on-eink precedent. License **[likely AGPL]**.

---

## 5. Framebuffer / EPDC tooling

### FBInk (NiLuJe) — GPL-3.0+
Repo <https://github.com/NiLuJe/FBInk>; CLI manual (fetched) <https://github.com/NiLuJe/FBInk/blob/master/CLI.md>; Kindle thread <https://www.mobileread.com/forums/showthread.php?t=299620>.
Capabilities we care about:
- **Waveforms:** `-W A2|DU|GL16|GC16|AUTO` (+ Kindle extras `REAGL`, `REAGLD`, `GC16_FAST`, `GL16_FAST`, `DU4`, `GL4`, `GL16_INV`, `GCK16`, `GLKW16`, `DUNM`, `GCC16`, `GLRC16`, `GCCK16`, `GLRCK16` on some models). "Unsupported modes *should* downgrade to AUTO."
- **Partial refresh:** `-s [top,left,width,height]` refreshes without touching the fb; rectangle must fit on screen or the ioctl fails. `-f` = black **flash**; `-b` = **norefresh** (batch draws); `-w` = **wait** for completion (dependent on waveform); `-H` = hardware **nightmode**; `-D` = **dither**.
- **Images:** `-g file=...,x=,y=,halign=,valign=,w=,h=,dither` — JPEG/PNG/TGA/BMP/GIF/PNM + raw Gray8/RGB32 (±alpha). Example `fbink -g file=hello.png -W A2` = monochrome.
- **Text:** built-in bitmap fonts (IBM default; UNSCII, TERMINUS, COZETTE, VGA, …) **and** OpenType/TrueType (`-t regular=…,px=…`). Kindle system fonts: `/usr/java/lib/fonts/Caecilia_LT_65_Medium.ttf` etc.
- **Daemon mode** (`-d NUM_LINES`) writes to a FIFO `/tmp/fbink-fifo` (or `$FBINK_NAMED_PIPE`) — the pattern KOReader/Kobo MiniClock use for a long-running status line.
- **Build/tailoring:** `make kindle` (static), `MINIMAL=1` + `DRAW/BITMAP/IMAGE/OPENTYPE/FONTS` flags; C11, koxtoolchain recommended (<https://github.com/koreader/koxtoolchain>).
- **Rotation warning:** on FW 5.x "the stock GUI runs under X, and X will not like you rotating the fb from under its feet." `fbdepth` util handles bitdepth/rotation.
- **Bindings** (from README): Rust `fbink-sys` (Szybet), `fbink-rs` (sublipri); Go `go-fbink-v2` (shermp); LuaJIT `lua-fbink`; Python `py-fbink`; plus `fbink-xdamage` (X11 DAMAGE shim), `qt5-kobo-platform-plugin`, `InkVT` (terminal).

### `eips` (Amazon) — legacy
- `/usr/sbin/eips` writes text/images, refreshes, clears. Uses **legacy** ioctls: `FBIO_EINK_CLEAR_SCREEN = 0x46e1`, `FBIO_EINK_UPDATE_DISPLAY = 0x46db` (**param 0 = no flash/ghosts, 1 = clean black flash**). Wiki <https://wiki.mobileread.com/wiki/Eips>; deep-dive <https://www.sixfoisneuf.fr/posts/kindle-hacking-deeper-dive-internals/>.
- fb is `/dev/fb0`, `mmap` size = W×H (1 byte/px on 8bpp Y8), `FBIOGET_VSCREENINFO` = `0x4600`.

### Modern EPDC (our device)
`mxc_epdc_fb`, **8bpp Y8**, mmap + `MXCFB_SEND_UPDATE` ioctl with a **damage rect + waveform mode** is the modern path (FBInk + KOReader). FBInk also documents the `alt_buffer` (mxcfb) shim: <https://github.com/NiLuJe/FBInk/blob/master/utils/alt_buffer.c>. **kernink implements this directly.**

---

## 6. Terminals & utilities

- **kterm** (bfabiszewski, **GPL-3.0-or-later**): GTK+2/3 + VTE terminal with embedded virtual keyboard; KUAL extension; Kindle package at <http://www.fabiszewski.net/kindle-terminal/>; repo <https://github.com/bfabiszewski/kterm>. Proof that **GTK + VTE exist on PW3**, and a live example of screen rotation via dbus and a Kindle start script setting `terminfo`.
- **ktterm** (arkq, VTE-based, older): <https://github.com/arkq/ktterm>.
- **USBNetwork** (NiLuJe) / **UsbNetLite** (notmarek): SSH over USB/WiFi; `authorized_keys` at `/mnt/us/usbnet/etc/authorized_keys`; UsbNetLite creds `root`/`kindle`. <https://github.com/notmarek/kindle-usbnetlite>, mirror <https://github.com/azuwis/kindle-usbnetwork>, wiki <https://mip-wiki.pages.dev/database/usbnet/>. *(How kernink gets deployed during dev.)*
- **kindle-python** (NiLuJe): bundled Python 2.7/3 + libs; used by many dashboard hacks. Snapshot thread <https://www.mobileread.com/forums/showthread.php?t=225030>.
- **Alpine Linux on Kindle** (schuhumi/alpine_kindle): <https://github.com/schuhumi/alpine_kindle>.
- **gandalf** — busybox renamed `su`, installed by the hotfix for privilege escalation.
- Others from Awesome-Kindle: Textadept-kindle, KAnki/RAnki, KPomo, KinAMP, LARK, GnomeGames4Kindle, Gambatte-K2, KindleCraft (`gingrspacecadet/bareiron`), Tetris, KShips.
- **Illusion** — scriptlet to build **HTML/CSS/JS apps** for Kindle (runs in the device browser): <https://github.com/penguins184/Penguins-Kindle-Wiki/blob/main/Illusion-Guide.md>. Amusing: the Kindle already ships a usable web-app runtime.

---

## 7. Launchers / home replacements (the key section for kernink)

**There is no mature third-party full home replacement.** The space is occupied by:
- **KUAL / KUALA** — an *app menu* launched as a document; not a home screen. KUAL is Java (deprecated); KUALA is a native-GTK C++ rewrite (works where Java doesn't). Both are "list + run command", not a UI home.
- **KOReader-as-default** — the common "replace the home screen" move: autostart KOReader with `--framework_stop` on boot (kor.conf, sleep 80). It does **not** replace the launcher; it *suspends* the framework and takes over the screen. Failure mode reported: on sleep/wake the framework can come back and steal focus → user sees Amazon UI again (<https://www.reddit.com/r/koreader/comments/1vehil2/>, <https://www.reddit.com/r/koreader/comments/1vmahs3/>).
- **simpleui.koplugin** (**MIT**) — a home screen *inside* KOReader (home, nav bar, status bar, widgets). Design reference; not a framework replacement.
- **Custom screensaver** projects (e.g. <https://github.com/chengandre/kindle-custom-screensaver>) — gentler "replace the idle screen" angle that avoids fighting the WM.

**Why full replacement is hard (and what to do instead):**
1. **`awesome` owns window layout; `cvm` owns input dispatch; `pillow` owns chrome.** Drawing to fb underneath them = flicker/ghosting because two writers drive the EPDC.
2. **Two documented strategies:**
   - *Pragmatic (KOReader, kindle-home-assistant-panel):* `lipc-set-prop com.lab126.pillow disableEnablePillow disable; killall -STOP awesome; killall -STOP cvm; …run… ; killall -CONT cvm; killall -CONT awesome; lipc … enable; appmgrd start app://com.lab126.booklet.home`. **Reversible, no reboot. Must `trap … EXIT` a resume** or the device freezes.
   - *Correct:* become an **`awesome`-managed window** with a title like `L:A_N:application_PC:N_ID:org.example.kernink` and use the layer system (APP/CHROME/DIALOG/KB/**SCREENSAVER**). Cleaner, more involved. Docs: <https://kindlemodding.org/kindle-dev/awesome-window-manager/>.
3. **X owns the fb** — no fb rotation from under X (FBInk warning).
4. **Framework restarts** (`lab126_gui`) can yank the screen back; hook/respect the upstart lifecycle.

**Implication:** kernink should ship as (a) a **KPM scriptlet/package** that launches a fullscreen binary via the SIGSTOP/SIGCONT dance with a guaranteed resume trap, and (b) *optionally* an `awesome`-managed window variant for a "proper" home. Replacement of the stock home service itself is not required (and is fragile).

See also the thorough, recent write-up: <https://github.com/rune-bk/kindle-home-assistant-panel/blob/main/docs/03-system-internals.md> and its gotchas doc (frozen-device trap, fbink image-support gotcha, busybox `ash` `$((0x..))` note).

---

## 8. Libraries / SDKs

- **libkh** (NiLuJe): shared "Kindle hacks" lib + CLI tools under `/mnt/us/libkh/bin`; **its `fbink` has image support** (KOReader's doesn't).
- **Unofficial Kindle SDK** (KindleModding/kindle-sdk, **GPL-3.0**): sets up an SDK to complement **koxtoolchain**; cross-file for meson. <https://github.com/KindleModding/kindle-sdk>, docs <https://kindlemodding.org/kindle-dev/kindle-sdk.html>. koxtoolchain: <https://github.com/koreader/koxtoolchain>.
- **Amazon KDK (Kindle Development Kit)** — official Java "Active Content"/Kindlet SDK; **dead** (Kindlets deprecated). Mobileread Kindlet Kit (**MKK**) installs a Java keystore so legacy kindlets run (the hotfix does this via `install_mkk_dev_keystore.sh`). GTK tutorial for Kindle apps: <https://kindlemodding.org/kindle-dev/gtk-tutorial/index.html>.
- **openlipc** (notmarek) + **openlipclua** (NiLuJe): reverse-engineered `liblipc` headers / Lua wrapper, for direct lipc rather than shelling to `lipc-set-prop`. <https://github.com/notmarek/openlipc>, <https://github.com/NiLuJe/openlipclua>.
- **LuaJIT**: bundled with KOReader; the device's scripting workhorse.
- **KindleForge** (Go), **kindling** (Rust MOBI builder) as language precedents.

### Rust-on-Kindle — full inventory (this is the important part)
1. **`sverrejb/slint-kindle-backend`** — *the* precedent. Rust + **Slint software renderer** (`renderer-software`, no GPU) fed via a `LineBufferProvider::process_line()` that converts to grayscale and writes to mmapped `/dev/fb0`, then `ioctl` (libc) the dirty region. Touch: `read()` `/dev/input/event1`, MT protocol **type B**, accumulate X/Y/tracking-id, act on **SYN_REPORT**; tracking id `-1` = release. Extras: idle `poll(2)` (0% idle CPU), **wake schedule** (suspend-to-RAM between refreshes; WiFi returns in ~3–10 s), **bilevel** mode (threshold → flicker-free A2-ish updates), 0/90/180/270 rotation. **Tested on PW3, PW1, PW4, KT4, KOA3.** Cross: `rustup target add armv7-unknown-linux-musleabihf` + **`cargo-zigbuild`** (`cargo zigbuild --release --target armv7-unknown-linux-musleabihf`) — *exactly our build plan*. Blog: <https://sverre.me/blog/rust-on-kindle/> (May 2026); crate <https://crates.io/crates/slint-backend-kindle>; repo <https://github.com/sverrejb/slint-kindle-backend>. **License MIT OR Apache-2.0, but depends on Slint (GPL-3.0-only OR royalty-free).** → Borrow the framebuffer/evdev/suspend patterns; skip Slint.
2. **`Szybet/fbink-sys`** — raw bindgen Rust FFI to FBInk, statically linked, musl (built `make -j8 static MINIMAL=1 BITMAP=1 OPENTYPE=1 IMAGE=1 FONTS=1 CROSS_COMPILE=armv7l-linux-musleabihf-`). <https://github.com/Szybet/fbink-sys>. Links **GPL** FBInk.
3. **`sublipri/fbink-rs`** — bindgen + some safe wrappers, uses `cross`. <https://github.com/sublipri/fbink-rs>. Links **GPL** FBInk.
4. **`baskerville/plato`** (AGPL) + **`OGKevin/cadmus`** (AGPL) — full Rust e-ink readers (Kobo).
5. **Quill OS** (Rust + Slint, PineNote) — <https://quill-os.org/>.
6. **`ciscoriordan/kindling` / `kindling-mobi`** — pure-Rust MOBI/AZW3 builder with an **on-device thumbnail writer** for a mounted Kindle; not UI but Rust/Kindle tooling. <https://github.com/ciscoriordan/kindling>.
7. Generic Rust e-paper drivers (`embedded-graphics`-style, ESP32) exist but target MCUs, not Linux fbdev.

**Conclusion:** kernink would be the first *purpose-built, MIT-licensed, Rust EPDC launcher/reader* for Kindle. The ioctl/evdev/suspend/zigbuild mechanics are already proven on PW3 by slint-kindle-backend; only the Slint dependency and GPL FBInk are things to avoid.

---

## 9. Adjacent e-ink dev (worth learning from)

- **Plato (Rust, Kobo, AGPL)** — CPU rasteriser + FBInk backend; the closest "we already built this in Rust" reference for layout/render/input on e-ink.
- **Kobo `nickel`/`libnickel`** — closed; alt UIs **`killall -STOP nickel`**, mirroring the Kindle `awesome` trick. Same problem shape across vendors.
- **rmkit** (reMarkable alt-UI toolkit) — excellent low-level e-ink dev notes at <https://rmkit.dev/eink-dev-notes/>.
- **InkVT** (<https://github.com/llandsmeer/inkvt>) — terminal built on FBInk; refresh-strategy reference.
- **InkPlate / Soldered** (<https://soldered.com/inkplate/>, <https://github.com/SolderedElectronics/Inkplate-Arduino-library>) — ESP32 e-paper dev boards, Adafruit-GFX-compatible, MicroPython + LVGL; dithering/partial-refresh ideas only (MIT-ish HW).
- **Quill OS for PineNote** — Rust/Slint + Niri; e-ink "modes" and a Rust+Slint UI shipped in the wild.
- Task mentions "InkPlate / Soldered e-ink dev boards, Plato (Kobo, Rust!), Kobo's nickel/libnickel, and any Rust e-ink UI projects" — covered above; the standout Rust UI references are **Plato/Cadmus** and **Quill OS**.

---

## 10. Reliability lessons (what is safe / unsafe on-device)

1. **Secure boot & signatures:** Kindles boot signed images, but once rooted the jailbreak **installs developer keys** (`/etc/uks`) so *homebrew-signed OTA* installs work; the signing key ships inside KindleTool. You cannot re-flash the bootloader improperly, but you don't need to.
2. **OTAs blow away rootfs hacks.** Rootfs (`/app`, `/usr`, `/etc`) is read-only ext3 and wiped by OTA; `/mnt/us` (vfat) and `/var/local` survive. The **hotfix + OTA-block + `framework_ready` job** is the persistence contract. kernink must live entirely on `/mnt/us`.
3. **The freeze trap.** `SIGSTOP`-ing the WM without a guaranteed `SIGCONT` bricks the session (no touch, no WM). Always `trap '…CONT…' EXIT`.
4. **EPDC has one owner.** Multiple writers → ghosting and flash storms. Either SIGSTOP the framework or be a proper `awesome` window.
5. **X owns the fb on FW 5.x** — don't rotate/change bitdepth from under it.
6. **Exclusive input needs `EVIOCGRAB`**; passive evdev reads are non-blocking for others (so the framework also sees touches unless you grab).
7. **Factory reset removes the jailbreak** (`ota.sh` + reset + re-push update removes every trace) — plan for reinstall (`recovering-from-a-reset`).
8. **Waveform discipline:** use `A2`/`DU` for fast, flicker-free bilevel updates (black/white only); `GC16` for clean greyscale (flashes). Mismatched waveform for content = ugly ghosting. Bilevel thresholding (as slint-kindle-backend does) is why its UI felt near-instant.
9. **Power:** `com.lab126.powerd preventScreenSaver` to hold awake; two-stage inactivity (screensaver then suspend); deep suspend drops WiFi → expect reconnect delay on first wake.
10. **busybox quirks:** `ash` lacks `$((16#hex))` — use `$((0x…))`; the KOReader-bundled fbink lacks image support.

---

## 11. Licensing summary (MIT-safety)

**MIT-compatible / safe to build on:**
- `slint-kindle-backend` code — **MIT OR Apache-2.0** (⚠ but Slint itself is GPL-3.0/royalty-free — do not depend on Slint).
- `simpleui.koplugin` — **MIT** (KOReader plugin; reading its design is fine).
- `Awesome-Kindle` — **CC0-1.0**.
- InkPlate Arduino library — **MIT [likely]**.
- `kindling` (Rust) — **[unverified]** (likely permissive).

**Copyleft — read-only / avoid linking:**
- **FBInk — GPL-3.0+** (explicitly *not* LGPL). → implement our own EPDC/ioctl layer.
- **KOReader — AGPL-3.0**; **Plato — AGPL-3.0**; **Cadmus — AGPL-3.0 [likely]**; **InkBox/Quill — AGPL-3.0 [likely]**.
- **kterm — GPL-3.0-or-later**.
- **KindleTool — GPL-3.0+**; **kindle-sdk — GPL-3.0**; **KindleModding/Hotfix — GPL-3.0**; **KPM — GPL-3.0**.
- `fbink-sys` / `fbink-rs` — statically link GPL FBInk → treat as GPL.

**Unverified / no SPDX found (treat cautiously):** WinterBreak, KUAL/KUAL_Booklet/KUALA, MRPI, KindleForge, usbnetlite, usbnetworking, kindle-python, libkh, openlipc, Szybet `fbink-sys`.

**Takeaway:** Nothing we *must* link is MIT-clean if we take the easy path (FBInk/Slint). The clean path is: **own fbdev + MXCFB ioctl layer in Rust (MIT), own evdev input, own CPU rasteriser, own layout/theme, no FBInk, no Slint.** This is exactly the "lean, no bloat" architecture already chosen.

---

## 12. Gap analysis — what kernink can uniquely do

- **No MIT, Rust, purpose-built Kindle launcher exists.** Closest: KUALA (C++/GTK), slint-kindle-backend (Rust, but Slint + demo-scale), KOReader (AGPL, reader-first, no launcher).
- **No project attempts to be the *home screen*** outside KOReader's plugin or the SIGSTOP hack.
- **The PW3 specifically is a sweet spot:** slint-kindle-backend verified it, FBInk covers it, KOReader runs on it, kterm (GTK/VTE) runs on it, and it's still on a jailbreakable FW (5.16.2.1.1).
- **Distribution is solved by KPM scriptlets** (`;kpm`) — ship kernink as a KPM package + scriptlet with zero new infrastructure.
- **Autostart is solved by the `framework_ready` upstart idiom** (hotfix `kmc.conf`) or the `kor.conf`-style boot hook; kernel's job is a safe SIGSTOP/SIGCONT wrapper with a resume trap.

---

## 13. Primary sources (index)

- kindlemodding.org: <https://kindlemodding.org/> · jailbreaking <https://kindlemodding.org/jailbreaking/index.html> · hacking <https://kindlemodding.org/kindle-hacking/index.html> · hotfix <https://kindlemodding.org/kindle-hacking/hotfix.html> · awesome WM <https://kindlemodding.org/kindle-dev/awesome-window-manager/> · apps/services & LIPC <https://kindlemodding.org/kindle-apps-and-services/index.html> · SDK <https://kindlemodding.org/kindle-dev/kindle-sdk.html> · KPM <https://kindlemodding.org/kindle-dev/kpm/index.html>
- WinterBreak: <https://github.com/KindleModding/WinterBreak> · <https://kindlemodding.org/jailbreaking/WinterBreak/>
- Hotfix: <https://github.com/KindleModding/Hotfix> · KindleTool: <https://github.com/NiLuJe/KindleTool> (GPL-3.0+)
- KUAL: <https://github.com/NiLuJe/KUAL_Booklet> · KUALA: <https://github.com/kasparcode/kuala> · MRPI: <https://www.mobileread.com/forums/showthread.php?t=251143>
- KPM: <https://github.com/KindleModding/KPM> · repo <https://repo.kindlemodding.org/> · KindleForge <https://github.com/KindleTweaks/KindleForge>
- KOReader: <https://github.com/koreader/koreader> (AGPL-3.0) · Kindle device layer <https://github.com/koreader/koreader/blob/master/frontend/device/kindle/device.lua>
- FBInk: <https://github.com/NiLuJe/FBInk> (GPL-3.0+) · CLI <https://github.com/NiLuJe/FBInk/blob/master/CLI.md> · Kindle thread <https://www.mobileread.com/forums/showthread.php?t=299620>
- eips/internals: <https://wiki.mobileread.com/wiki/Eips> · <https://www.sixfoisneuf.fr/posts/kindle-hacking-deeper-dive-internals/> · system internals <https://github.com/rune-bk/kindle-home-assistant-panel/blob/main/docs/03-system-internals.md>
- kterm: <https://github.com/bfabiszewski/kterm> (GPL-3.0+) · <http://www.fabiszewski.net/kindle-terminal/>
- usbnet: <https://github.com/notmarek/kindle-usbnetlite> · <https://mip-wiki.pages.dev/database/usbnet/>
- Rust/Kindle: <https://sverre.me/blog/rust-on-kindle/> · <https://github.com/sverrejb/slint-kindle-backend> · <https://github.com/Szybet/fbink-sys> · <https://github.com/sublipri/fbink-rs> · <https://github.com/ciscoriordan/kindling>
- Plato/Cadmus/InkBox/Quill: <https://github.com/baskerville/plato> · <https://github.com/OGKevin/cadmus> · <https://github.com/Quill-OS/quill> · <https://quill-os.org/>
- Misc: <https://github.com/KindleTweaks/Awesome-Kindle> (CC0) · <https://soldered.com/inkplate/> · <https://rmkit.dev/eink-dev-notes/>
