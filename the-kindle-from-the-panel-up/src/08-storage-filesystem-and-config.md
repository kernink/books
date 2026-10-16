# 08 — Storage, filesystem, and configuration<a id="ch08"></a>

> The Kindle's storage model is three rings of persistence, and knowing which ring you are in is the
> difference between "my hack survived the update" and "my hack vanished." There is a read-only,
> nearly-full rootfs; a small writable state partition; and a large FAT user store mounted through
> FUSE. Everything we ship lives in the last one.

## 8.1 The partition map (as it actually is on our device)

`/proc/partitions` and `df` `[dev]` — each row is one device, its size, filesystem, mount point and
what lives there:

- **`mmcblk0`** — 3817472 KiB (3.6 GiB). No filesystem, no mount: the whole eMMC.
- **`mmcblk0boot0` / `boot1`** — 4096 KiB each. No filesystem, no mount: the **hardware boot.
  partitions** (the ROM reads boot0).
- **`mmcblk0p1`** — 460800 KiB (450 MB), **ext3**, mounted at `/` (**ro**): the rootfs, 93 % full.
- **`mmcblk0p2`** — 65536 KiB (64 MB), ext3, at `/usr/share/nh` — historically the diags slot.
- **`mmcblk0p3`** — 65536 KiB (64 MB), ext3, at `/var/local` (rw): writable state.
- **`mmcblk0p4`** — 3192832 KiB (3.0 GiB), **vfat**, at `/mnt/base-us` (rw): the user store.
- **(no device)** — the **FUSE (`fsp`)** view at **`/mnt/us`**: the user store as apps see it.

The public record's "diags/recovery on p2" (`02`) is `[forum/uncertain]` for this firmware (p2 is
`/usr/share/nh` here). What is certain: rootfs is **read-only**, `/var/local` is the small writable
persistent area, and `/mnt/us` is the big FAT store.

## 8.2 The read-only rootfs, and why it is 93 % full

```
/dev/root   437.4M  386.3M   29.1M  93%  /
```

The rootfs is mounted **ro** (`barrier=0,data=writeback`), and there is almost no free space.
Consequences:

- **You cannot casually write to `/`.** Anything you place there is (a) at risk of OTA wiping and.
  (b) fighting a full filesystem.
- **System content is packed into squashfs images** (`/proc/partitions` shows `loop0..loop8`), which.
  is how Amazon fits a full OS plus fonts into a small read-only partition `[dev]`:

- **`loop/2`** — `/usr/share/X11/xkb`. 384 KB.
- **`loop/3`** — `/usr/java/lib/fonts`. **80 MB**.
- **`loop/4`** — `/etc/kdb.src`. 128 KB.
- **`loop/5`** — `/usr/lib/locale`. 768 KB.
- **`loop/6`** — `/usr/share/keyboard`. 14.3 MB.
- **`loop/7`** — `/opt/var/local`. 2.0 MB.
- **`loop/8`** — `/etc/uks`. 128 KB.
- **`loop/0`** — `/mnt/base-us` (then FUSE→`/mnt/us`). 3.0 GiB (user store).

  Note the pattern: **read-only, compressed payloads** (fonts, locales, keyboard, keys, config
  source) are squashfs; **writable state** lives on `p3`; **user data** on `p4`.

- `/tmp` is a **symlink to `/var/tmp`** (which is `tmpfs`), and there are `tmpfs` mounts for `/dev`.
  (251 MB), `/var` (64 MB), and `/mnt/kfxcache` (250 MB) `[dev]`.

## 8.3 `/var/local` — the small writable ring

`p3`, 64 MB, ~71 % full `[dev]`. Contents are the *mutable* state of the appliance:

Contents of `/var/local/` `[dev]` — the framework's own databases and configuration:

- `appreg.db`, `cc.db`, `KWISClient.db`, `bw.db`, `WishList.db`.
- `CHROME_CONFIG`, `LIBRARY_CONFIG`, `BACCHUS_DEVICE_CONFIG`.
- `blanket/`, `archive/`, …
- (plus `kmc/` and `mkk/` after a jailbreak).

The two SQLite databases that matter to a frontend:

- **`appreg.db`** — the **application registry**: the union of the shipped `ServerConfig.db` and.
  `prereg.db`, mapping **handlers ↔ interfaces ↔ mimetypes ↔ URL associations**. This is how the OS
  knows which app opens what, and it is what the hotfix patches to register the hotfix booklet and
  shell integration `[RE/documented]`.
- **`cc.db`** — the **content/reading state**: `Entries.p_cdeKey` holds the current book's.
  `asin`/key. This is the practical source for "what was the user reading?" `[RE/documented]`.

`/var/local` is also where a jailbreak's persistence (`/var/local/kmc`, `/var/local/mkk`) lives
(`02`). It survives OTA, unlike `/`.

## 8.4 `/mnt/us` — the user store, and it is FUSE

The headline surprise for anyone who assumes "vfat USB drive":

```
/dev/loop/0   3.0G  440.7M  2.6G  14%  /mnt/base-us
fsp           3.0G  440.7M  2.6G  14%  /mnt/us        ← FUSE
$ ls -l /sbin/fsp
root 1315  0.2%  1484  fsp /mnt/base-us /mnt/us -o rw,nosuid,nodev,noatime,allow_other,…
```

- The raw FAT filesystem (`/dev/mmcblk0p4`, `vfat`, `codepage=cp437,iocharset=iso8859-1`) is mounted.
  at **`/mnt/base-us`**.
- A **userspace daemon (`/sbin/fsp`, FUSE)** re-exports it at **`/mnt/us`** with POSIX-ish semantics.
  (`allow_other`, case handling, metadata). PID 1315 `[dev]`.

Why this matters:

- **File operations on `/mnt/us` go through a userspace daemon** — semantics and performance differ.
  from raw FAT. Do not assume atomic renames, `mmap`-able executables behave normally, etc.
- `/MNTUS_EXEC` (created by the jailbreak, `02`) is what makes `/mnt/us` **executable** — without it,
  your binary there will not run.
- **It survives OTAs and factory resets** (it is user data). This is where everything we ship lives.

Top level on our device `[dev]`:

Contents of `/mnt/us/` `[dev]` — the user store, and where every homebrew package lands:

- `bin/`, `books/`, `documents/`, `extensions/`, `fonts/`, `kf-tls/`.
- `kindlehome/`, `kmc/`, `koreader/`, `kterm/`, `libkh/`, `system/`, `winterbreak2/`.
- `.active_content_sandbox/`, `.Spotlight-V100/`, `.fseventsd/`.

That is the whole homebrew ecosystem, coexisting with the reading library (`documents/`, `books/`).

## 8.5 The `/chroot` jail

`mount` additionally shows a **`/chroot`** tree (KOReader's jail) mirroring `/var`, `/sys`, `/mnt/us`,
fonts, etc. `[dev]`. It is a reminder that the device already hosts a documented pattern for
"a self-contained environment that shares the system's resources" — a pattern our tooling can reuse
if it ever needs a controlled root.

## 8.6 Configuration: `kdb`, and the shape of Amazon config

Two config systems coexist:

1. **`kdb`** — Amazon's key/value **config database**. Source tree is `/etc/kdb.src` (squashfs,
   read-only), forked at boot to the live `/etc/kdb` `[dev]`. Used by `powerd` (the timeouts in `06`),
   `wifid`, etc. The exact schema is `[forum/uncertain]` (the name collides with the kernel
   debugger), but the *files are readable on-device*.
2. **SQLite state** (`appreg.db`, `cc.db`, …) in `/var/local` — the *dynamic* registry and reading
   state (`08.3`).

Plus the **kernel's `/proc/bd`** boot bookkeeping (`02`), which is neither kdb nor SQLite but is
written the same way (echo to a file).

For a frontend, the practical stance: **read config from these sources; write only to `/var/local` or
`/mnt/us`.** Do not assume you own `/etc/kdb`.

## 8.7 Fonts — what is available, and what we may ship

- **`/usr/java/lib/fonts` (squashfs, 80 MB)** — Amazon **Ember**, **Bookerly**, Caecilia LT, Baskerville, Futura, Helvetica LT, DiwanMuna…. **Proprietary** — load at runtime, do **not** redistribute `[dev]`.
- **`/mnt/us/koreader/resources/fonts`** — only `Readme.txt` (KOReader bundles nothing here) `[dev]`.
- **`/mnt/us/system/fonts`, `/mnt/us/fonts`** — user-supplied font dirs `[dev]`.

Strategy: **load the system fonts at runtime** (Bookerly is the best free-ish, prose-quality face
present, and is *the* Kindle reading font), and **ship an OFL-licensed serif/sans of our own**
(Literata, EB Garamond, Inter, …) so kernink is self-contained and MIT-clean. Never bundle Amazon's
fonts. `[RE/documented]`

## 8.8 Runtimes present (and absent)

`[dev]`: **busybox 1.34.1** (+ its applets in `/bin`, `/usr/bin`, 483 entries), **`lua`**,
**`sqlite3`**, an **old `evtest`** (info-only, no `--query`), **`Xorg`/`awesome`/`blanket`**,
**`lipc-*`** tools, `iw`/`iwconfig`/`ifconfig`/`nc`, and the **Java (Juno/KPP)** stack.

**Absent:** python, perl, node, ruby, fbink (KOReader ships its own under `/mnt/us`), a compiler, and
any package manager beyond KPM's scriptlets. Anything we need, we bring — statically (`10`).

## 8.9 Where kernink lives, and how it survives

Three storage rings, and what each is good for:

- **Rootfs (ro)** — `/`. Survives an OTA? **No.** Suitable for nothing of ours, except temporarily.
- **State** — `/var/local`. Survives an OTA, but it is small. Suitable for a little state, maybe a.
  cache.
- **User store** — **`/mnt/us`**. **Yes**, it survives. Suitable for **the binary, assets, config.
  and logs**.

The deployment contract, in one line:

> **kernink ships to `/mnt/us/kernink/` (executable because of `/MNTUS_EXEC`), reinstalls itself via
> a KPM package/scriptlet, and hooks `framework_ready` to autostart — mirroring the hotfix's
> persistence model (`02`, `09`).**

## 8.10 Operational cautions

1. **`/` is read-only and full.** `mntroot rw` is a jailbreak affordance; don't build on it.
2. **`/mnt/us` is FUSE.** Expect daemon-mediated semantics; test file operations on-device.
3. **`/MNTUS_EXEC` must exist** for our binary to run from `/mnt/us`.
4. **Squashfs content (fonts, keys, kdb.src) is read-only by construction.**
5. **SQLite in `/var/local` is live state.** Reading is safe; writing is a commitment (back up first).
6. **`appreg.db` is the app registry.** Touching it changes what launches what; treat edits as
   surgery.
7. **No swap, no zram, no hibernation.** Memory pressure is fatal-ish (`06`); stay lean.
