# 01 — Hardware<a id="ch01"></a>

> Everything in this chapter was either read off our device (`[dev]`) or from Amazon's GPL kernel
> drop / documented reverse-engineering. Where the public record and the device disagree, the device
> wins.

## 1.1 The SoC: i.MX6SoloLite

The Paperwhite 2 and 3 are built on **Freescale/NXP i.MX 6SoloLite** (`i.MX6SL`), a member of the
i.MX6 family that Amazon chose precisely because it *lacks* the parts the other i.MX6 variants have:

- **Core** — 1× ARM Cortex-A9 (`CPU part 0xc09`), up to ~1 GHz `[dev]`. Single core, no SMP.
- **ISA** — ARMv7l, Neon + VFPv3, `swp half thumb fastmult edsp` `[dev]`. Hardware float, no LPAE.
- **GPU** — **none** — no Vivante GC `[dev]`/`[GPL source]`. No `/dev/dri`, no DRM/KMS.
- **IPU** — **none** (no LCD display controller). This is *why* the EPDC drives the panel.
- **RAM** — 512 MB LPDDR2 (PW3), ≈503 MB usable `[dev]`. PW2 = 256 MB.
- **Display controller** — **EPDC** (Electrophoretic Display Controller), in-SoC. The centre of the design.
- **2D engine** — **PXP** (`imx-pxp`) — pixel pipeline: blit/rotate/colour. `/dev/pxp_device`, IRQ 130 `[dev]`.
- **Video DMA** — `mxc_vdoa` (frame DMA + error correction) `[dev]`.
- **DMA** — SDMA.
- **Watchdog** — `imx2-wdt`, `CONFIG_WATCHDOG_NOWAYOUT=y` `[dev]`. IRQ 112 (never fired).

The consequence is architectural and total: **there is no GPU and no display pipeline of the kind
Linux normally expects.** The i.MX6SL's EPDC is a first-class block whose whole job is to drive an
E Ink panel, and Amazon's kernel exposes it as an ordinary **framebuffer** (`/dev/fb0`) with an
E Ink-specific ioctl surface. Every pixel on screen, from the boot splash to the reader, is written
into that framebuffer in CPU code (or DMA'd into it) and then handed to the EPDC as a damage
rectangle + a waveform. There is no other path.

`[dev]` `Hardware: Freescale i.MX 6SoloLite based Wario Board`, `Revision: 60000`, and the SoC
string `muscat` appears in the firmware version (`002-juno_16020101_muscat_wario-409747`).

## 1.2 The board: "Wario"

Our board reports itself as **Wario** (`/proc/cpuinfo`). The public record is muddier here: forum
dmesg dumps map "Wario"/`PINOT_WFO` to the Paperwhite 2 and "Muscat WFO" to the Paperwhite 3, while
our device reports **Wario** on a Paperwhite 3. Treat codename↔model mapping as `[forum/uncertain]`;
the only thing that matters operationally is what `/proc/cpuinfo` and LIPC report, and those are
authoritative on the device in hand.

Board identity is exposed three ways, none of them a device tree:

- `/proc/cpuinfo`: `Hardware`, `Revision` (`60000`), `Serial` (a 16-character `G0…` unit serial), `BoardId` (a board string) `[dev]`.
- LIPC `com.lab126.system`: `boardid`, `usid`, `guid`, `panelCode`, `waveformversion` `[dev]`.
- sysfs platform devices (i2c/spi/mmc enumerated by the **board file**).

## 1.3 Memory and storage

- **RAM** — LPDDR2, 512 MB (MemTotal 514724 kB). `[dev]`.
- **eMMC** — ~3.6 GiB (`mmcblk0` = 3817472 KiB). `[dev]`.
- **Boot partitions** — `mmcblk0boot0` / `mmcblk0boot1`, 4096 KiB each. `[dev]`.
- **Rootfs (`p1`)** — 460800 KiB (450 MB), ext3, mounted **ro**. `[dev]`.
- **`p2`** — 65536 KiB (64 MB) — `/usr/share/nh`, and the diags slot historically. `[dev]`.
- **`p3`** — 65536 KiB (64 MB) — `/var/local`, writable state. `[dev]`.
- **`p4`** — 3192832 KiB (3.0 GiB) — userstore → `/mnt/base-us` (vfat) → `/mnt/us` (**FUSE**). `[dev]`.

The public record (`[GPL source]`) calls the storage "eMMC, Micron MMC02G ≈1.83 GiB" — that is the
PW2-class module. On our PW3 the eMMC reports a larger user area (3.6 GiB) with the two hardware
boot partitions. The important structural facts are constant: **hardware boot partitions** (the boot
ROM reads them), a **read-only rootfs**, a small **writable `/var/local`**, and a large **FAT user
store** mounted through **FUSE**, not raw.

## 1.4 Power: the MAX77696A

The system PMIC is a **Maxim MAX77696A** — an unusually integrated part that Amazon leans on hard.
It sits on `i2c-0` at address `0x3C` (`0-003c`) and exposes, as separate kernel subsystems `[dev]`:

- **Bucks** `buck1`–`buck6` (core/soc/IO rails).
- **LDOs** `ldo1`–`ldo10`.
- **Fuel gauge + battery + charger** → `/sys/class/power_supply/max77696-battery|charger|eh|uic`.
- **ONKEY** → the power button (`max77696-onkey` → `/dev/input/event0`, `KEY_POWER`) `[dev]`.
- **RTC** (`max77696-rtc`) — plus a second RTC in the SoC (`snvs_rtc`).
- **Backlight / LED drivers** → `max77696-bl`, 2× `max77696-leds` (the frontlight) `[dev]`.
- **ADC** (`max77696-adc` → `hwmon0`).
- **EPD rails** → `vpos`, `vneg`, `vcom`, `vee`, `vddh` (plus a separate `max17135-reg` / `epd-vreg` driver family) `[dev]`/`[GPL source]`.
- GPIO expander (`max77696-gpio`), energy-harvesting/boost block.

The EPD rails deserve a note: E Ink panels need **bipolar high-voltage supplies** for the
source/gate drivers and a stable **VCOM** reference. The driver exposes them readably:

`mxc_epdc_voltcontrol` reports the panel rail setpoints in microvolts `[dev]`:

- `VCOM_BIT_0x19` = `0`.
- `VPOS` = `+15000000` µV, `VNEG` = `-15000000` µV.
- `VDDH` = `+25000000` µV, `VEE` = `-20000000` µV.
- `VCOM_OFFSET` = `+0` µV.

This is the hardware reason an e-ink "display" is nothing like an LCD: to move pigment you push
±15 V and a 25 V rail around, and the controller sequences that per waveform.

### Battery, honestly

Two independent battery interfaces exist, and they **disagree by design** `[dev]`:

- `/sys/class/power_supply/max77696-battery/` — driver-decoded, with inconsistent units.
  (`charge_full=1408` vs `charge_full_design=790000`, i.e. mAh vs µAh mixed).
- `/sys/devices/system/wario_battery/wario_battery0/` — a **Maxim ModelGauge** fuel gauge with a.
  learning state (`battery_mAH=780`, `battery_lmd_mAH=1408`, `battery_temperature=89`, plus
  `fg_cdata_check = *** Data Valid ***`).

For a UI, the right sources are `wario_battery` for real capacity in mAh and
`lipc-get-prop com.lab126.powerd battLevel` for the user-facing percentage. Do not trust the
`max77696-battery` numbers to be consistent with anything.

## 1.5 The E Ink panel

- **Part** — **ED060KD1C4** (`panelCode = R169_ED060KD1C4`). `[dev]`.
- **Class** — E Ink **Carta**, 6", 300 ppi. `[RE/documented]`.
- **Resolution** — 1072 × 1448 visible (stride 1088). `[dev]`.
- **Grey levels** — 16 (8 bpp Y8 framebuffer). `[dev]`.
- **Waveform pack** — `320_R169_AE4141_ED060KD1C4_TC`. `[dev]`.
- **Temperature input** — `mxc_epdc_temperature = 4097`, `displayTemperature = 30`. `[dev]`.

Details of how the EPDC drives this panel are in **`04-display-and-epdc.md`**; the hardware takeaway
is that the panel ships with a **waveform table** (a per-transition voltage/timing program, selected
by temperature) that the controller plays back for whatever waveform mode you request.

## 1.6 Touch: Cypress TrueTouch Gen4

The touch panel is a **Cypress `cyttsp4`** controller on `i2c-1` at address `0x24`, driver stack
`cyttsp4_i2c` → `cyttsp4_core` → `cyttsp4_mt_b` (**MT-B** protocol B) `[dev]`. It appears as
`/dev/input/event1`, IRQ GPIO 355. Full capability decoding is in **`05-input-and-gestures.md`**;
the headline is that it is a *clean modern multitouch* device with **no pressure** and coordinates
already in framebuffer pixel space.

## 1.7 Wi-Fi: Atheros AR6003, and nothing else

- **Chip** — **Atheros AR6803G** (AR6003 core, SDIO). `[RE/documented]`.
- **Driver** — `ath6kl_sdio` on `mmc1`. `[dev]`.
- **Interface** — `wlan0`, managed, 2.4 GHz (channel 10/2457 observed). `[dev]`.
- **Userspace** — `wpa_supplicant -D nl80211`, busybox `udhcpc`. `[dev]`.
- **Bluetooth** — **none at all** — no HCI device, no stack. `[dev]`.
- **Audio** — **none on PW3** — no codec, no `/dev/snd`. `[dev]`/`[RE/documented]`.

Wi-Fi driver params worth knowing: `suspend_mode=1`, `wow_mode=0`, `recovery_enable=1`,
calibration file `/opt/ar6k/.../AR6003_wfo_calfile.bin`. `wow_mode=0` means **no wake-on-Wi-Fi**: the
radio is dead during suspend, which is why the device "goes offline" and why LAN access has a
multi-second reconnect gap after a wake.

The radio is the *only* network path. There is no Bluetooth, no cellular, no Ethernet. USB exists
only as a gadget: currently `g_file_storage` (mass storage) and optionally **RNDIS/`usbnet`**
(`/sys/class/udc` is absent because this is the pre-gadget-configfs API).

## 1.8 Sensor inventory — what exists, and what does not

This is the single most decision-relevant table in the book for anyone imagining "gestures" or
"context awareness." The answer is: **the device is nearly sensor-blind.** `[dev]`

- **Magnetic cover (hall)** — **Yes**. `wario_hall`, IRQ GPIO 359, `/dev/hall` (misc 10:163), `hall_detect`, `hall_trig_wkup`.
- **Battery gauge + temperature** — **Yes**. `max77696-battery`, `wario_battery` (ModelGauge).
- **RTC (3, two with alarm)** — **Yes**. `rtc0`/`rtc1` (max77696), `rtc2` (snvs).
- **Frontlight** — **Yes**. `max77696-bl` (0–4095), 2× `max77696-leds` (0–127); LIPC `flIntensity` (0–25).
- **Touch (capacitive, multi-touch)** — **Yes**. `cyttsp4_mt`.
- **Power button** — **Yes**. `max77696-onkey` → `KEY_POWER`.
- **Accelerometer / G-sensor** — **No**. Module not loaded; `CONFIG_INPUT_ADXL34X` off; `winmgr.accelerometer = U`.
- **Ambient light sensor** — **No (inactive)**. `CONFIG_INPUT_ALS_MAX44009=m` but module **never loaded**.
- **Proximity** — **No (inactive)**. `CONFIG_INPUT_PROX_PIC12LF1822=m` but **not loaded**.
- **Magnetometer** — **No**.
- **Thermal zone / IIO** — **No**. `/sys/class/thermal` empty; `CONFIG_THERMAL` off; no IIO.
- **Lid / hinge switch** — n/a. Covered by the hall sensor.
- **Haptics** — (platform device `haptics` referenced in upstart). Not exposed to us as an input/output node.

Two subtleties:

1. **Orientation is permanently portrait.** Because there is no accelerometer, `winmgr.orientation`
   and `orientationLock` are pinned to `U`. Any design that assumes auto-rotation is wrong on this
   device (though a user-driven rotate is still possible by reconfiguring the fb/EPDC, see `04`).
2. **Temperature is display-only.** There is no thermal subsystem, but the EPDC has its own
   temperature input used to pick waveforms. This is a *display* parameter, not a health metric.

## 1.9 Accelerators you can actually use

Even without a GPU, the SoloLite gives you two genuinely useful blocks:

- **PXP** (`imx-pxp`, `/dev/pxp_device`, IRQ 130, 2 open clients `[dev]`): a 2D pixel pipeline.
  capable of block copies, format conversion, and rotation. This is the obvious place to offload a
  CPU rasteriser's blits/scrolls, or to rotate a rendered buffer without touching the EPDC config.
- **VDOA** (`mxc_vdoa`): video/frame DMA with error correction — relevant if you ever stream large.
  buffer updates.

Neither is required to build a launcher. But if a rasteriser ever becomes the bottleneck on a
single 1 GHz A9, PXP is the escape hatch, and it is worth remembering that it exists *and is
already driven by an in-tree driver*.

## 1.10 Clocks and CPU frequency

`/sys/devices/system/cpu/cpu0/cpufreq/`: driver `imx`, governor `ondemand`, `min=396000`,
`max=996000`, observed `cur=996000` `[dev]`. The kernel carries a Lab126 cpufreq override
(`CONFIG_CPU_FREQ_OVERRIDE_LAB126` `[GPL source]`) and `powerd` can clamp frequency. For a lean
frontend this mostly matters in reverse: **you will not need to fight the governor**, and because
your process idles in `poll(2)` it will let the CPU drop, which is how you reach "~0% idle CPU."

## 1.11 What the hardware dictates

- **No GPU, no compositor pipeline** → everything is CPU rasterisation into an 8-bit greyscale.
  framebuffer. Pick a rasteriser that is *cheap and correct*, not a GPU-era graphics stack.
- **E Ink + EPDC + waveforms** → refresh is a first-class design material (`04`).
- **A near-blind sensor set** → "context" comes from the **cover (hall)**, **power button**,
  **touch**, **RTC**, and **battery**, and nothing else. Design gestures around touch; design
  sleep/wake around hall + RTC + power.
- **Read-only 93 %-full rootfs** → ship on `/mnt/us` (FUSE) or `/var/local`; never assume you can.
  write `/` (`08`).
- **Wi-Fi only, dead during suspend** → treat the network as an *optional, intermittent* luxury.
