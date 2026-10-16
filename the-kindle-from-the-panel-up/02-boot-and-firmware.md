# 02 — Boot, firmware, and the security model<a id="ch02"></a>

> The purpose of this chapter is not to teach you to break the boot chain — the public record says
> nobody has — but to tell you exactly **which layers are immovable**, **which are cosmetic**, and
> **where a homebrew frontend is allowed to live**. Getting this wrong is how you brick a Kindle or,
> worse, waste weeks fighting a wall that is not there.

## 2.1 The chain, top to bottom

One step per line, in order. Each hands control to the next, and none can be skipped:

1. **i.MX6 Boot ROM** — reads the eMMC hardware boot partition (`mmcblk0boot0` / boot area).
2. **imximage verification** — the ROM verifies an imximage (IVT + DCD + u-boot) under HAB. This is
   the **cryptographically anchored** step.
3. **vendor u-boot** (`v2009.08`, Lab126 fork) — reads the `idme` variables (serial, mac, bootmode).
4. **Linux kernel** (`3.0.35-lab126`) — loaded from eMMC.
5. **rootfs** — `p1`, ext3, mounted **read-only**.
6. **`/sbin/init.exe`** — upstart 0.6.6.
7. **runlevel jobs** — `lab126` / `x` / `framework` / `pillow`.

The same stages again, this time asking the only question that matters for us — **can a homebrew
frontend move any of them?**

- **Boot ROM** — i.MX6 on-die ROM, HAB-enabled. Movable: **no**. `[official]`/`[RE/documented]`.
- **imximage** — u-boot wrapped with IVT/DCD, **signed**. Movable: **no** (it would break HAB).
  `[GPL source]`
- **u-boot** — vendor fork of **v2009.08**. Movable: **no**. `[GPL source]`.
- **`idme`** — identity store on the boot area (`pcbsn`, `serial`, `mac`, `bootmode`). Movable: no.
  (it is device-specific). `[GPL source]`/`[RE/documented]`
- **Kernel** — `3.0.35-lab126`, loaded from eMMC. Movable: not in practice. `[dev]`.
- **Rootfs** — ext3 on `p1`, mounted **read-only**. Movable: **wiped by an OTA**. `[dev]`.
- **Userspace on `/mnt/us`** — FAT user store via FUSE. Movable: **yes — this is ours**. `[dev]`.

**HAB (High Assurance Boot)** is the reason the boot chain has never fallen: the ROM verifies a
signature over the bootloader, whose keys live in OTP fuses. The community's *only* route past it is
the **USB Serial Download mode** (the device enumerates as `SE Blank MEGREZ`, a Freescale ROM USB
ID), which normally requires the eMMC to be unreadable — the classic trick is a hardware mod to
disable the eMMC so the ROM falls back to USB. That is a bench procedure with a soldering iron, not
something software can do `[RE/documented]`.

## 2.2 Diags, recovery, and the "two faces" of the device

The historical layout reserves a slot for **diags/recovery** (`p2`, an ext3 image), entered via a
`bootmode` `idme` variable or a factory key combination. It provides manufacturing tests and a
recovery shell `[RE/documented]`. On our device `p2` is mounted as `/usr/share/nh`, so treat the
"diags on p2" claim as `[forum/uncertain]` for this firmware — the *existence of a recovery path* is
certain, its current location is not something we need.

The practical implication: **userspace homebrew cannot hard-brick the device.** The bootloader and
its keys are untouched by anything we do. The realistic failure modes are all soft:

1. Freezing the session (`SIGSTOP` the WM without a matching `SIGCONT`).
2. Leaving the EPDC in an odd state (recoverable by a clean full refresh or a reboot).
3. An OTA wiping our rootfs-resident pieces (our fault for putting them there).
4. Draining the battery so far the device hard-shuts down (annoying, not fatal).

## 2.3 Firmware, version, and why "never update" is a jailbreak rule

Our device reports `System Software Version: 002-juno_16020101_muscat_wario-409747 …
com.lab126.eink.muscat.os` and runs **FW 5.16.2.1.1**. That version matters because it is the *last*
firmware the (then-current) jailbreaks support:

- **LanguageBreak** (2023) works up to **5.16.2.1.1** — exactly us `[RE/documented]`.
- **WinterBreak** (Jan 2025) works on a broad range, and is **patched in 5.18.1** `[RE/documented]`.
- A **Kindle can only be downgraded if already jailbroken**, and the latest jailbreakable version is.
  5.16.2.1.1 `[forum/uncertain]`.

So the device sits at the *top* of the jailbreakable ladder. The corollary is the ecosystem's first
commandment: **block OTA.** Updating is one-way (no downgrade without a jailbreak you'd be erasing),
and updates wipe rootfs hacks.

## 2.4 What a jailbreak actually does — and what it leaves behind

All known jailbreaks are **userspace** exploits: a factory-image downgrade (2016), a demo-mode /
language-pack path (LanguageBreak), a web-app/WAF exploit via the Kindle Store (WinterBreak via
"Mesquito"), an ad-path use-after-free (AdBreak) `[RE/documented]`. Once code execution is achieved,
the canonical payload is short and uniform `[RE/documented]`:

1. `mntroot rw` — remount rootfs read-write
2. install **developer keys** into `/etc/uks` (or the `/etc/uks.sqsh` squashfs)
3. create `/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC`
4. create **`/MNTUS_EXEC`** (makes `/mnt/us` executable)
5. `mntroot ro`

…then a **Hotfix** finalises persistence. This is the contract our frontend inherits.

### The Hotfix and the persistence model

The **Hotfix** is distributed as a **homebrew-signed OTA `.bin`** (the signing key ships inside
**KindleTool**). Its `install.sh` (sourcing `libotautils6`) `[RE/documented]`:

- creates `/var/local/kmc` and `/var/local/mkk`,
- installs **`gandalf`** (busybox linked as **`su`**) for privilege escalation,
- registers **`kmc.conf` as an upstart job that runs on `framework_ready`** — the persistence hook,
- patches `appreg.db` to register the hotfix booklet and shell integration.

**This is the single most important integration fact in the book:**

> The established "run my thing on boot" idiom on this device is **an upstart job that waits for
> `framework_ready`** (and/or the `kmc.conf` job runner). kernink should hook the same event rather
> than inventing a boot path.

It is also *where the stock framework hands over the screen*, which is exactly the moment a launcher
wants to act (`07`, `11`).

### Filesystem residue we can see on our device `[dev]`

- `/PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC` and `/MNTUS_EXEC` exist at `/`.
- `/var/local/` holds the writable state: `appreg.db`, `cc.db`, `bw.db`, `LIBRARY_CONFIG`,
  `CHROME_CONFIG`, `KWISClient.db`, `WishList.db`, `blanket/`, `archive/`.
- `/etc/uks/` holds `pubdevkey01.pem`, `pubprodkey01.pem`, `pubprodkey02.pem` — the dev key plus the.
  production keys, i.e. **homebrew-signed packages are accepted**.
- `/mnt/us/` carries the whole homebrew world: `koreader/`, `kterm/`, `libkh/`, `kindlehome/`,
  `winterbreak2/`, `extensions/`, `bin/`.

## 2.5 `/proc/bd` — Lab126's boot bookkeeping (do not fight it)

The kernel exposes a **custom `/proc/bd/` directory** that the framework uses to record boot
progress and to coordinate startup/shutdown `[dev]`:

Thirteen entries, all under `/proc/bd/`. The three the framework writes a *value* into are shown
with it:

- `boot_milestone`, `calibration_info`, `dirty_boot_flag`, `drvemode_screen_ready`.
- `panel_params`, `panel_size`, `mw_flags`, `progress_count`, `rcs_flags`, `update_flag`.
- `framework_started` (`00000001`), `framework_running` (`00000000`), `framework_stopped` (`00000000`).

`framework.conf` writes these via `echo`. A replacement frontend that squats in this space should
**read them and leave them alone** — they are how the rest of the system decides whether a boot was
dirty and whether the framework "started."

## 2.6 OTA: how updates arrive, and what they destroy

Updates are **signed `.bin` OTA packages** applied by `otaupd` (an upstart job; currently
`stop/waiting`). They replace rootfs content wholesale. There is also a **firmware lifecycle** note:
per the barebox project, Amazon stopped producing factory update images for these devices sometime
between 2021–2023 `[RE/documented]` — so the modern reality is "fewer updates, but the ones that
land are still destructive."

For kernink the OTA story reduces to three rules:

1. **Live on `/mnt/us`.** It survives OTAs and factory resets.
2. **Assume rootfs customisation is temporary.** Anything in `/etc` or `/usr` is a luxury.
3. **Reinstall gracefully.** Mirror the hotfix's `framework_ready` hook so that after an OTA or
   reset, a single package reinstall restores the environment.

## 2.7 The GPL source drops (and their gaps)

Amazon publishes the **GPL/LGPL** components of the firmware — the Linux kernel, u-boot, busybox,
upstart — under the "Source Code Notice for Kindle E-Readers and Fire Tablets." `[official]` The
official page is hostile to automated fetchers (503/403), so the community reads **mirrors**, e.g.
`github.com/katadelos/linux-3.0.35-lab126` `[GPL source]`.

What is **not** in the drops is everything that makes the Kindle a Kindle: the JVM (`cvm`), the
`mxc_epdc_eink` waveform module, WebKit/Pillow/blanket, and the reader UI. That asymmetry is why the
book leans on the kernel drop for the *hardware* truth and on reverse-engineering for the *userspace*
truth.

## 2.8 Summary: the immovable, the fragile, and the free

- **Boot ROM / HAB / u-boot** — Immovable (`[official]`). Don't touch; don't need to.
- **`idme`** — Immovable. Read-only curiosity.
- **Kernel (`3.0.35-lab126`)** — Effectively immovable. Program to its interfaces.
- **Rootfs (`/`, ro, 93 % full)** — Wiped by OTA. Read from it; don't depend on writing it.
- **`/var/local` (p3)** — Survives OTA, small. Spill space / small state only.
- **`/mnt/us` (FUSE)** — **Survives OTA; executable**. **Home base**.
- **`/proc/bd`, upstart, lipc** — System bookkeeping. **Read and cooperate**, esp. `framework_ready`.
- **The stock framework** — Stoppable/reversible. SIGSTOP/SIGCONT with a resume trap, or be an `awesome` window.
