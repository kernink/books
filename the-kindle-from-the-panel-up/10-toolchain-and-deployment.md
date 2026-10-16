# 10 — Toolchain and deployment<a id="ch10"></a>

> This is the pragmatic chapter: how we actually build a static ARM binary on a Mac, get it onto the
> device, run it, and iterate — with the cross-compilation pitfalls (glibc 2.20, old kernel, FUSE
> exec bits) already neutralised. The recipe here is **proven**: our POC launcher is a 360 KB
> static ARM EABI5 binary built exactly this way and running on the device.

## 10.1 The target triple

```
armv7-unknown-linux-musleabihf
```

Why:

- **`armv7` + `hardfloat`** — matches the i.MX6SoloLite (Cortex-A9, VFPv3/Neon `[dev]`).
- **`musl`** — a **fully static** binary that does **not** depend on the device's **glibc 2.20**.
  This is the single most important choice: the device's glibc is from 2014, and a binary linked
  against a modern glibc simply will not run. Static musl sidesteps the entire version-matching
  problem.
- **No dynamic loader on the device is needed** — copy the file, chmod, run.

The device can run this because it is a plain `armv7l` Linux (`03`).

## 10.2 Cross-linking with Zig

Rust can compile for the target, but linking the final static binary is easiest with **zig** as the
linker/`cc` (it ships its own libc/CRT and cross-linker):

- Install `zig` and `cargo-zigbuild`.
- Add the Rust target: `rustup target add armv7-unknown-linux-musleabihf`.
- Build with: `cargo zigbuild --release --target armv7-unknown-linux-musleabihf`.

Our POC used a slightly different but equivalent approach: a **`.cargo/config.toml`** that overrides
the linker/`cc` with a small `zigcc` wrapper script, then a plain `cargo build --target
armv7-unknown-linux-musleabihf`. Both spellings produce the same result; `cargo-zigbuild` is the
tidier default and is what `slint-kindle-backend` uses (`09.8`).

### `.cargo/config.toml` (shape)

```toml
[target.armv7-unknown-linux-musleabihf]
linker = "zigcc"          # wrapper that invokes `zig cc -target arm-linux-musleabihf`
rustflags = ["-C", "target-feature=+neon,+vfpv3"]
```

`zigcc` (executable script):

```sh
#!/bin/sh
exec zig cc -target arm-linux-musleabihf "$@"
```

### Zig-to-Rust path (alternative, no wrapper)

```sh
rustup target add armv7-unknown-linux-musleabihf
cargo install cargo-zigbuild
cargo zigbuild --release --target armv7-unknown-linux-musleabihf
```

Either way, verify the output:

```
$ file target/armv7-unknown-linux-musleabihf/release/kindlehome
ELF 32-bit LSB executable, ARM, EABI5 version 1 (SYSV), statically linked, stripped
$ ls -l …    # ~360 KB for the POC
```

**A few hundred KB static.** That number is the whole argument for the lean approach: it is the size
of *one* of the stock stack's fonts, and it replaces ~190 MB of resident processes (`07.7`).

## 10.3 Linking against nothing but libc

The dependency budget is deliberately tiny: **`libc`** (syscall/ioctl/evdev types), plus pure-Rust
crates you audit. For the first milestones you need no graphics crate at all:

- **fb** — `mmap` + a `struct` for `fb_var_screeninfo`/`fb_fix_screeninfo` + hand-rolled `ioctl`.
  numbers for `MXCFB_SEND_UPDATE` (`04.4`). `libc` gives you `ioctl`, `mmap`, `open`, `poll`.
- **input** — `read()` on `/dev/input/event1` decodes `struct input_event` (24 bytes on 32-bit;
  mind `timeval`). No crate needed.
- **text (later)** — one `ttf-parser` + one rasteriser (`fontdue` or `swash`), and **one** PNG crate.
  on the **host only** (for the PNG backend / sim). Keep all of it behind features.

Do **not** add `fbink-sys`/`fbink-rs` (GPL) or `slint` (GPL) (`09.11`).

## 10.4 Deployment to the device

The device is reached over SSH — dropbear listening on Wi-Fi `[dev]`:

```
ssh -o IdentitiesOnly=yes -i ~/.ssh/<key> -p <port> root@<device-ip>
```

Deploy loop:

```sh
# 1. copy the static binary to the user store
scp -i ~/.ssh/<key> -P <port> \
    target/armv7-unknown-linux-musleabihf/release/kindlehome \
    root@$IP:/mnt/us/kernink/kindlehome

# 2. ensure it is executable (FUSE user store)
ssh … 'chmod +x /mnt/us/kernink/kindlehome'

# 3. run
ssh -t … '/mnt/us/kernink/kindlehome'
```

Prerequisites, all already true on our device (`02`, `08`):

- **`/MNTUS_EXEC` exists** — otherwise `/mnt/us` is mounted noexec and nothing runs.
- **`/mnt/us` is FUSE** — copying works, but treat file semantics as POSIX-ish-with-caveats.
- **The device sleeps after ~10 min idle** and Wi-Fi drops — *tap the screen to wake* before.
  connecting; if SSH says "host down," wake it and retry.

## 10.5 The development loop, and why a host backend matters

Iterating on-device is slow (each build → copy → run → eyeball-e-ink cycle costs seconds to minutes,
and the display has latency). The mitigation is a **host-side backend** behind the same `Display`
trait the device uses (`11`):

- **`NativeEpdc`** — real device (mmap fb0 + MXCFB).
- **`FbInkCli`** — device, via the existing `fbink` CLI (the POC's first backend; no `libfbink.so`.
  ships, so we shell out to `/mnt/us/libkh/bin/fbink` or KOReader's).
- **`Png`** — **host**, render a frame to a PNG so you can *see* the layout without the device.
- **`Null`** — tests/CI (records damage rects without drawing).

This lets **90 % of UI work happen on the laptop**, with the device used for the truth check
(waveform feel, ghosting, touch timing). It is also what keeps the architecture honest: if your
display code needs the device, your abstraction is wrong.

## 10.6 Packaging for real users: KPM + `framework_ready`

Two distribution mechanisms, both already proven by the ecosystem (`09.4`):

1. **KPM package + scriptlet.** Ship a package to `repo.kindlemodding.org` (or our own static repo);
   users install with `;kpm install kernink`. The scriptlet drops files to `/mnt/us/kernink/` and
   registers the autostart job. **Cheapest possible install UX; zero new infrastructure.**
2. **`framework_ready` upstart job.** Register a tiny job (mirroring the hotfix's `kmc.conf`,
   `02`) that fires after the framework announces readiness and either:
   - launches the launcher via the **SIGSTOP/SIGCONT supervisor** (`11`), or.
   - launches it as an **`awesome` window** (`07.8`).

Both are "cooperate with the system" moves, not "replace the system" moves — which is why they
survive OTAs and resets.

## 10.7 An `xtask` for reproducibility

Keep a `xtask` (or `justfile`/`Makefile`) for the handful of repeated commands:

| Task | What it runs |
|---|---|
| `xtask build` | `cargo zigbuild --release --target armv7-unknown-linux-musleabihf` |
| `xtask deploy` | `scp` + `chmod +x` |
| `xtask run` | `ssh -t … /mnt/us/kernink/kindlehome` |
| `xtask sim` | host build, PNG backend, open the frame |
| `xtask size` | `cargo bloat` / size report (watch the default-not-yes budget) |

This is where the "lean" principle is *enforced*: `xtask size` in CI fails the build if the binary
crosses a threshold (e.g. 2 MB) — the same discipline that keeps embedded projects honest.

## 10.8 Gotchas that have already cost us time

- **glibc 2.20 on device** — dynamic binaries fail. **static musl**.
- **`/mnt/us` noexec without `/MNTUS_EXEC`** — binary won't run. Ensure marker exists (`02`).
- **FUSE user store** — odd file semantics. Test file ops on-device.
- **Device sleeps ~10 min** — SSH "host down". Wake (tap), retry.
- **busybox `ash`** — no `$((16#hex))`. Use `$((0x…))`.
- **KOReader's bundled fbink** — no image support. Use libkh's fbink if needed.
- **Display latency** — "did my change work?" delays. Host PNG backend for layout.
- **`MXCFB` struct layout** — wrong size → `EINVAL`. Copy field order/sizes from FBInk headers (`04.4`).
- **`.cargo/config.toml` + zig** — linker errors. Proven `zigcc` wrapper or `cargo-zigbuild`.

## 10.9 Summary

- **Target:** `armv7-unknown-linux-musleabihf`, **static**, built with **`cargo-zigbuild`** (or the.
  `zigcc` wrapper). ~360 KB for the POC.
- **Dependencies:** `libc` (+ audited pure-Rust crates); **no FBInk, no Slint**.
- **Deploy:** `scp` to `/mnt/us/kernink/`, `chmod +x`, run. It works because of `/MNTUS_EXEC`.
- **Iterate:** host **PNG backend** behind the same `Display` trait; device for truth.
- **Ship:** **KPM** package + **`framework_ready`** autostart job.
- **Enforce lean:** `xtask size` with a hard budget.
