# 03 — The lab126 kernel and the device model<a id="ch03"></a>

> This kernel is a 2011 vendor BSP with Amazon patches, built in 2023 for an appliance. It behaves
> like Linux in all the ways that matter to a userspace program (fbdev, evdev, sysfs, procfs,
> signals, sockets) and unlike any Linux a modern power user has touched in the ways that matter to
> *discovery*: there is **no device tree**, no DRM, no systemd, no udev-mediated hotplug you'd
> recognise, and a layer of Amazon-specific `/proc` and LIPC bolted on top.

## 3.1 Identity

```
$ uname -a
Linux kindle 3.0.35-lab126 #8 PREEMPT Tue Aug 1 12:49:59 UTC 2023 armv7l GNU/Linux
$ cat /proc/version
Linux version 3.0.35-lab126 (builder@eink-builds) (gcc version 4.9.1) #8 PREEMPT
```

- **`3.0.35-lab126`** — the `-lab126` LOCALVERSION marks Amazon's (Lab126's) patches on top of a.
  3.0.35 base. Built August 2023, i.e. the kernel was *refreshed* long after the hardware shipped.
- **`PREEMPT`** with `TREE_PREEMPT_RCU` — good for input latency on a single core.
- **`armv7l`**, single Cortex-A9, `CONFIG_BROKEN_ON_SMP=y` (`/proc/cpuinfo` has no `Processor : 1`).
- `CONFIG_KERNEL_GZIP=y` and **no initramfs** (`CONFIG_INITRD`/`RD_*` off): the kernel is a plain.
  self-decompressing image booted straight to the rootfs.

## 3.2 There is no device tree

```
$ ls /proc/device-tree           → No such file or directory
$ ls /sys/firmware/devicetree    → No such file or directory
```

The 3.0.35 i.MX6 kernel predates device-tree adoption on this board; hardware is described by a
**statically compiled board file** (`arch/arm/mach-mx6/board-mx6sl_*` in the GPL drop). The device
model we actually get is:

- **`/proc/cpuinfo`** for board identity (`Hardware`, `Revision`, `Serial`, `BoardId`).
- **sysfs platform devices**, populated by the board file: `imx_epdc_fb`, `imx-pxp`, `max17135-reg`,
  `mxc_vdoa`, `usb-wakeup.0/1`, `pwm-backlight.0`, `wario_hall`, `wario_battery`, …
- **i2c enumeration** by address: PMIC `0-003c`, touch `1-0024`.
- **LIPC `com.lab126.system`** for panel/waveform/serial metadata.

**Practical consequence:** you cannot introspect hardware the way you would on a modern board. To
know what exists you read `/proc/config.gz`, `/proc/modules`, `/proc/misc`, `/proc/devices`, and
sysfs — or you ask LIPC. There is no `of_node`, no `/sys/bus/i2c/devices/*/of_node`, no DT overlays.

## 3.3 Kernel config: what's on, what's deliberately off

`/proc/config.gz` is enabled (`IKCONFIG_PROC=y`), so the entire config is readable on-device. The
decision-relevant subset `[dev]`:

```
# allocator / preempt
CONFIG_SLUB=y ; CONFIG_PREEMPT ; CONFIG_TREE_PREEMPT_RCU=y ; CONFIG_VM_EVENT_COUNTERS=y

# display
CONFIG_FB=y ; CONFIG_FB_DEFERRED_IO=y ; CONFIG_FB_MXC=y
CONFIG_FB_MXC_EINK_PANEL=m          # -> mxc_epdc_fb
CONFIG_FB_MXC_EINK_REAGL=m          # REGAL (reduced-ghosting) waveforms
# CONFIG_FB_MXC_EINK_AUTO_UPDATE_MODE off
CONFIG_BACKLIGHT_LCD_SUPPORT=y ; CONFIG_BACKLIGHT_MAX77696=y

# input
CONFIG_INPUT=y ; CONFIG_INPUT_EVDEV=y
# CONFIG_INPUT_MOUSEDEV off ; # CONFIG_INPUT_JOYDEV off ; # CONFIG_INPUT_TABLET off
CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4=m ; CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4_MT_B=m
CONFIG_INPUT_MAX77696_ONKEY=y        # power button
CONFIG_INPUT_UINPUT=y                # << injection available
CONFIG_INPUT_ALS_MAX44009=m          # ambient light: built but NOT loaded
CONFIG_INPUT_PROX_PIC12LF1822=m      # proximity: built but NOT loaded
# CONFIG_INPUT_ADXL34X off           # no accelerometer

# power / buses
CONFIG_POWER_SUPPLY=y ; CONFIG_BATTERY_MAX77696=y
CONFIG_RTC_CLASS=y ; CONFIG_RTC_DRV_MAX77696=y ; CONFIG_RTC_DRV_SNVS=y
CONFIG_WATCHDOG=y ; CONFIG_WATCHDOG_NOWAYOUT=y
CONFIG_I2C_IMX=y ; CONFIG_I2C_CHARDEV=y
CONFIG_SPI_IMX=y ; # CONFIG_SPI_SPIDEV off
CONFIG_MMC_SDHCI_ESDHC_IMX=y

# NO thermal, NO IIO
# CONFIG_THERMAL is not set

# USB
CONFIG_USB_EHCI_HCD=m ; CONFIG_USB_GADGET=m ; CONFIG_USB_FILE_STORAGE=m
CONFIG_USB_ETH=m (RNDIS=y)           # usbnet gadget available
```

Read this table as an **inventory of intent**: Amazon built modules for an ambient-light sensor and a
proximity sensor and then **never loaded them** on this board. They built the accelerometer driver
*out entirely*. They enabled `uinput`. They left the thermal subsystem out. These are the design
decisions of a device that assumes you look at it and touch it, and nothing else.

## 3.4 Modules: only twelve

`/proc/modules` `[dev]`:

```
ath6kl_sdio  198006  cfg80211  171623
g_file_storage 35771  arcotg_udc 26418
cyttsp4_mt_b 8204  cyttsp4_core 41388  cyttsp4_i2c 2587
fuse 60392  ehci_hcd 54008  fsl_otg_arc 15637
mxc_epdc_fb 90805      ← the public fb/EPDC interface
mxc_epdc_eink 8771 (P) ← the closed companion; "(P)" = proprietary taint
```

Note the parenthesis `(P)` on `mxc_epdc_eink`: loading it **taints the kernel**, marking it
proprietary. This is the module believed to own the waveform/panel behaviour, and it is the crux of
the open question about *who really chooses the waveform* (`04`).

Everything else is built-in. There is no udev in the modern sense; `/dev` nodes are mostly static
(major/minor in `/proc/devices` and `/proc/misc`), which is why `evtest`-era assumptions hold.

## 3.5 Device topology from `/proc/misc` and `/proc/devices`

```
/proc/misc:  0 touch   59 network_throughput  60 network_latency  61 cpu_dma_latency
           130 watchdog  223 uinput  62 ushrink  163 hall  63 pxp_device  162 frontlight
/proc/char:  1 mem 13 input 29 fb 89 i2c 116 alsa 180 usb 189 usb_device 254 rtc 207 ttymxc
/proc/block: 259 blkext 7 loop 179 mmc
```

The unusual ones, and why they matter:

- **`touch`** (`10:0`) — cyttsp4 raw character interface. **Use:** firmware/self-test; we use evdev.
  instead.
- **`hall`** (`10:163`) — magnetic cover. **Use:** cover-open/closed wake and sleep events.
- **`pxp_device`** (`10:63`) — PXP blitter. **Use:** offload blits and rotation.
- **`frontlight`** (`10:162`) — frontlight control. **Use:** direct brightness, bypassing lipc.
- **`watchdog`** (`10:130`, `imx2-wdt`) — **node not actually present in `/dev`** on this image.
- **`uinput`** (`10:223`) — input injection. **Use:** synthesise touch and key events (also at.
  `/dev/input/uinput`).
- **`ushrink`** (`10:62`) — Lab126 memory-reclaim helper. **Use:** curiosity; avoid.
- **`alsa`** (`116`) — ALSA major registered. Vestigial — **no codec on the PW3**.

## 3.6 Interrupt map (what's actually firing)

`/proc/interrupts` `[dev]` — the highlights:

| IRQ / source | What it tells us |
|---|---|
| 55 `mmc0` (163557) · 56 `mmc1` (79776) | eMMC + SDIO (Wi-Fi) |
| 68/69 `imx-i2c` | PMIC + touch buses |
| 87 `i.MX Timer Tick` (90052) | the scheduler tick |
| 112 `imx2-wdt` (0) | watchdog: registered, never fired |
| 129 `fb_dma` (3139) | **EPDC DMA — display updates** |
| 130 `pxp-irq` (1129) | PXP |
| 301 `max77696-epd` (489) | EPD rails |
| 355 `main_ttsp_core.cyttsp4` (648) | **touch** |
| 359 `wario_hall` (0) | cover |
| 150–168 `max77696-irq` domain | onkey, gauge, rtc, charger, … |

`fb_dma` firing thousands of times is the display working; `wario_hall` at 0 means the cover has not
moved. The watchdog IRQ at 0 is normal — the watchdog is a timer that only matters if it is *not*
petted.

## 3.7 `/proc/bd` — the Lab126 proc surface

A custom directory used for boot/framework bookkeeping (`02`). Files: `boot_milestone`,
`dirty_boot_flag`, `framework_started/running/stopped`, `panel_params`, `panel_size`,
`progress_count`, `update_flag`, `mw_flags`, `rcs_flags`, `calibration_info`, `drvemode_screen_ready`.

`/proc/bd/panel_params` is genuinely useful panel timing `[dev]`:

```
mode:416x622-16,active,hsynclen:28,right:34,left:34,vsynclen:25,upper:0,lower:2,hsync:1,
vsync:1,pixclock:59800,pixclockpol:0,acbias:24
```

(It is a *controller-side* mode; the visible surface is still 1072×1448 through the EPDC.)

## 3.8 dmesg, logs, and the wrapped ring buffer

`dmesg` **is readable** (454 lines) but the ring buffer **has wrapped**: the earliest retained line
is at ~t=1737 s of a 5-hour uptime. Consequences:

- Boot-time probe messages for `mxc_epdc_fb`, `cyttsp4`, `ath6kl`, and the panel **are gone**.
  Grepping for `epdc|waveform|cyttsp|ath6kl|panel` returns nothing.
- To capture boot logs you need the `printklogs` job / `/var/log/messages`, or a fresh boot.

What *is* visible is instructive about the appliance's health `[dev]`:

```
: undefined instruction: pc=40f967d0
Thread-190 (15819) segfault pc: ... addr:400f3000
IndexerThread (15050) segfault pc: ...
lab126.todo.kaf (14968) segfault pc: ...
devcap-get-feat (16388): undefined instruction: pc=...
cfg80211: Calling CRDA to update world regulatory domain
max77696-rtc ... PM: Preparing system for mem sleep ... Entering mem sleep
KERNEL: I pmic:fg suspend battinfo:current=-18mA, volt=3850mV, capav=059%, mAh=830mAh
imx2_wdt_reinit re-initializing wdog
```

Two takeaways: (1) **the Java side is noisy and crashes routinely** — this is the stock stack
grinding, not a fault we care about; (2) **suspend/resume and watchdog re-init are visible in
dmesg**, which is a handy way to observe the power path while developing.

## 3.9 Watchdog, uinput, and the two hooks worth remembering

- **Watchdog**: `imx2-wdt` is bound, `CONFIG_WATCHDOG_NOWAYOUT=y` (once opened, it cannot be.
  stopped), and it is **re-initialised on resume** (`imx2_wdt_reinit`). No `/dev/watchdog` node was
  created on this image, so we cannot (and should not) pet it ourselves. Respect: **do not open it**;
  if a node ever appears, opening it means "if you hang, the device reboots."
- **uinput** is enabled and world-accessible at `/dev/input/uinput`. This is the **input injection**.
  path: a program can create a virtual input device and emit synthetic `KEY_POWER`, touch events, or
  arbitrary codes. `wi.conf` (`WetInkHandler`) already depends on it (it sleeps 2 s waiting for
  uinput). Useful for automation/testing; also a way to *feed* the stock stack events without
  grabbing the real device.

## 3.10 CPU frequency and the idle story

`ondemand` governor, 396–996 MHz. A well-behaved frontend that blocks in `poll(2)` and only wakes on
input or a timer will let the core drop to 396 MHz (or deeper C-states) between events. This is the
mechanical basis of the "~0 % idle CPU" goal: it is not a trick, it is *not polling*.

## 3.11 What the kernel forces into our design

1. **Discover via `/proc` + sysfs + LIPC + GPL source**, never via device tree.
2. **fbdev + evdev are the APIs**; there is no DRM/KMS and no modern input stack.
3. **`/dev/fb0` is 8-bit Y8**; your rasteriser must target greyscale (`04`).
4. **`mxc_epdc_eink` is closed**; assume you drive the *interface* and it does the *physics*.
5. **uinput gives you injection**; evdev `EVIOCGRAB` gives you exclusivity (`05`).
6. **`/proc/bd` is someone else's state machine** — read it, don't stomp it.
7. **Logs wrap; capture what you need now** or wire into `/var/log`/`printklogs`.
