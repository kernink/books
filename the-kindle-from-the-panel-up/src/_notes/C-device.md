# Device probe — Kindle Paperwhite 3 (Wario / i.MX6SoloLite)

**Session:** hands-on read-only SSH probe of live device.
**Connection:** `ssh -o ConnectTimeout=8 -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/<key> -p <port> root@<device-ip>`
All commands below were run over that SSH as `root`. Wrapped as `ssh ... 'sh -s' <<'OUTER' ... OUTER`.
Nothing was written/created/modified on the device. No services started/stopped.
Where a read failed, it is marked **unavailable: <why>**.

> **Scrubbed.** This transcript is published alongside the book, so everything that would tie it to
> one physical unit or one network has been masked: `<masked>` for serials, board ids, GUIDs and MAC
> addresses; `<device-ip>`/`<host-ip>`/`<gateway>` for private addresses; `<ssid>` for the network
> name; `<key>`/`<port>` for the SSH path and port; `<lifeline>` for the user-added SSH lifeline
> service and its directory. No technical content was altered — only the fingerprints.

> Headline: this is an **old board-file kernel (3.0.35-lab126), no device tree**. Touch is a
> clean **MT-B** protocol device (slots + tracking id) with **no pressure, no major/minor, no legacy
> ABS_X/Y**. There is **no accelerometer, no ambient-light, no magnetometer, no thermal zone**, but
> there **is** a magnetic-cover **hall** sensor and a **PXP** 2D blitter (`/dev/pxp_device`).

---

## 1. Identity / kernel

Commands:
```
uname -a; cat /proc/version; cat /proc/version_signature; head -40 /proc/cpuinfo
cat /proc/cmdline; cat /proc/modules; zcat /proc/config.gz; cat /proc/devices; cat /proc/misc
cat /proc/interrupts; cat /proc/iomem
```

```
$ uname -a
Linux kindle 3.0.35-lab126 #8 PREEMPT Tue Aug 1 12:49:59 UTC 2023 armv7l GNU/Linux

$ cat /proc/version
Linux version 3.0.35-lab126 (builder@eink-builds) (gcc version 4.9.1 (GCC) ) #8 PREEMPT Tue Aug 1 12:49:59 UTC 2023

$ cat /proc/version_signature
unavailable: No such file or directory

$ head -40 /proc/cpuinfo
Processor       : ARMv7 Processor rev 10 (v7l)
BogoMIPS        : 1987.37
Features        : swp half thumb fastmult vfp edsp neon vfpv3
CPU implementer : 0x41            # ARM
CPU architecture: 7
CPU variant     : 0x2
CPU part        : 0xc09           # Cortex-A9
CPU revision    : 10
Hardware        : Freescale i.MX 6SoloLite based Wario Board
Revision        : 60000
Serial          : "<masked>"
BoardId         : "<masked>"
```
Single core (Cortex-A9, part 0xc09), Neon + VFPv3, no LPAE, **no SMP** (`CONFIG_BROKEN_ON_SMP=y`).

```
$ cat /proc/cmdline
rootwait log_pos_goal=0x8fff0000 console=ttymxc0,115200 root=/dev/mmcblk0p1 ro ip=off quiet video=mxcepdcfb:E60,bpp=8,x_mem=3M
```
Notable: `video=mxcepdcfb:E60,bpp=8,x_mem=3M` → EPDC framebuffer, **8bpp (Y8)**, **3 MB** video mem pool. Root fs mounted **ro**.

```
$ cat /proc/modules
ath6kl_sdio 198006 0 - Live 0xbf13c000
cfg80211 171623 1 ath6kl_sdio, Live 0xbf106000
g_file_storage 35771 0 - Live 0xbf082000
arcotg_udc 26418 1 g_file_storage, Live 0xbf076000
cyttsp4_mt_b 8204 0 - Live 0xbf06f000
cyttsp4_core 41388 2 - Live 0xbf05d000
cyttsp4_i2c 2587 1 - Live 0xbf059000
fuse 60392 2 - Live 0xbf043000
ehci_hcd 54008 0 - Live 0xbf02f000
fsl_otg_arc 15637 3 ehci_hcd, Live 0xbf027000
mxc_epdc_fb 90805 3 - Live 0xbf006000
mxc_epdc_eink 8771 1 mxc_epdc_fb, Live 0xbf000000 (P)
```
Only 12 modules loaded. Display driver `mxc_epdc_fb` with `mxc_epdc_eink` (waveform/TC helper) underneath.
Touch = `cyttsp4_i2c` + `cyttsp4_core` + `cyttsp4_mt_b` (Cypress TrueTouch Gen4, **MT-B** variant).

```
$ cat /proc/devices            (trimmed)
Character devices:
  1 mem  2 pty  3 ttyp  4 vc  5 tty/console/ptmx  7 vcs  10 misc  13 input
 29 fb  66 fsl-usb2-otg  89 i2c  116 alsa  128 ptm  136 pts  180 usb  189 usb_device
207 ttymxc  254 rtc
Block devices:  259 blkext  7 loop  179 mmc

$ cat /proc/misc
  0 touch        229 fuse        59 network_throughput  60 network_latency
 61 cpu_dma_latency  130 watchdog  223 uinput  62 ushrink  163 hall
 63 pxp_device  162 frontlight
```
Misc devices that matter: **touch(0)**, **watchdog(130)**, **uinput(223)**, **hall(163)**, **pxp_device(63)**, **frontlight(162)**, **ushrink(62)**.

```
$ cat /proc/interrupts          (trimmed to relevant)
 55: 163557 GIC mmc0          56: 79776 GIC mmc1
 68: 48707  GIC imx-i2c       69: 23038 GIC imx-i2c
 87: 90052  GIC i.MX Timer Tick
 112: 0     GIC imx2-wdt                # watchdog IRQ (never fired)
 129: 3139  GIC fb_dma                  # EPDC DMA
 130: 1129  GIC pxp-irq                 # PXP blitter
 150..168: max77696-irq domain (topsys/gauge/gpio/rtc/charger/uic/epd/eh + onkey press/rel)
 301: 489 GPIO max77696-epd
 355: 648 GPIO main_ttsp_core.cyttsp4_i2c_adapter   # TOUCH irq
 359: 0   GPIO wario_hall                # hall (cover) irq
 372: 18  GPIO max77696-irq
```
Touch IRQ = **GPIO 355**; hall = GPIO 359; EPDC DMA = IRQ 129; PXP = IRQ 130.

```
$ cat /proc/iomem             (trimmed)
020f0000-020f3fff : imx-pxp         (pxp-mem)
020f4000-020f7fff : imx_epdc_fb
02184000-021841ff : fsl-usb2-udc / fsl-ehci.0
02194000-02197fff : sdhci-esdhc-imx.1 -> mmc0
02198000-0219bfff : sdhci-esdhc-imx.2 -> mmc1
021a0000/i4000/8000 : imx-i2c.0/.1/.2
80000000-9fffffff : System RAM  (text @8020a000)
```

### Kernel config (`/proc/config.gz`, IKCONFIG_PROC=y) — relevant subset
```
CONFIG_LOCALVERSION="-lab126"
CONFIG_KERNEL_GZIP=y            # no initramfs (CONFIG_INITRD + RD_* all off)
CONFIG_SLAB off / CONFIG_SLUB=y
CONFIG_NO_HZ not shown; CONFIG_PREEMPT (TREE_PREEMPT_RCU=y)
CONFIG_VM_EVENT_COUNTERS=y      # /proc/vmstat
# --- display ---
CONFIG_FB=y ; CONFIG_FB_DEFERRED_IO=y ; CONFIG_FB_MXC=y
CONFIG_FB_MXC_EINK_PANEL=m      # built as module -> mxc_epdc_fb
CONFIG_FB_MXC_EINK_REAGL=m      # REGAL (reduced ghosting) waveform support
# CONFIG_FB_MXC_EINK_WORK_BUFFER_* off ; # CONFIG_FB_MXC_EINK_AUTO_UPDATE_MODE off
CONFIG_BACKLIGHT_LCD_SUPPORT=y ; CONFIG_BACKLIGHT_MAX77696=y
# --- input ---
CONFIG_INPUT=y ; CONFIG_INPUT_EVDEV=y
# CONFIG_INPUT_MOUSEDEV off ; # CONFIG_INPUT_JOYDEV off ; # CONFIG_INPUT_TABLET off
CONFIG_INPUT_TOUCHSCREEN=y
CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4=m ; CONFIG_CYPRESS_CYTTSP4_BUS=y
CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4_MT_B=m          # MT-B
CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4_USE_FW_BIN_FILE=y
CONFIG_TOUCHSCREEN_CYPRESS_CYTTSP4_DEVICE_ACCESS=m
CONFIG_INPUT_MAX77696_ONKEY=y                       # power button
CONFIG_INPUT_UINPUT=y                               # available for injecting input
CONFIG_INPUT_ALS_MAX44009=m         # ambient light (NOT loaded -> inactive)
CONFIG_INPUT_PROX_PIC12LF1822=m     # proximity  (NOT loaded -> inactive)
# CONFIG_INPUT_ADXL34X off           # NO accelerometer
# CONFIG_INPUT_ISL29023 off
# --- power / clocks / buses ---
CONFIG_POWER_SUPPLY=y ; CONFIG_BATTERY_MAX77696=y
CONFIG_RTC_CLASS=y ; CONFIG_RTC_DRV_MAX77696=y ; CONFIG_RTC_DRV_SNVS=y
CONFIG_WATCHDOG=y ; CONFIG_WATCHDOG_NOWAYOUT=y
CONFIG_I2C=y ; CONFIG_I2C_IMX=y ; CONFIG_I2C_CHARDEV=y
CONFIG_SPI_MASTER=y ; CONFIG_SPI_IMX=y ; # CONFIG_SPI_SPIDEV off
CONFIG_MMC=y ; CONFIG_MMC_SDHCI_ESDHC_IMX=y
# --- NO thermal, NO IIO ---
# CONFIG_THERMAL is not set
CONFIG_USB=y ; CONFIG_USB_EHCI_HCD=m ; CONFIG_USB_GADGET=m ; CONFIG_USB_FILE_STORAGE=m
CONFIG_USB_ETH=m (RNDIS=y)          # usbnet/RNDIS gadget available
# CONFIG_BLUETOOTH_PWRCTRL is not set ; # CONFIG_SENSORS_LIS3_I2C off
CONFIG_GPIO_MAX77696=y ; CONFIG_MFD max17135-reg present (epd-vreg) 
```

---

## 2. Device tree / board

```
$ ls -la /proc/device-tree
unavailable: No such file or directory
$ ls -la /sys/firmware/devicetree
unavailable: No such file or directory
```
**No device tree at all** — 3.0.35 i.MX6 kernel with a statically-compiled board file
(`arch/arm/mach-mx6/board-mx6sl_wario…`). Everything is discovered via platform devices / i2c
`0-003c` (PMIC at I2C addr 0x3C) and `imx-i2c.1/1-0024` (touch at 0x24).

Board identity comes from `/proc/cpuinfo` (Hardware/Revision/Serial/BoardId) and LIPC
(`com.lab126.system boardid` = `<masked>`, `usid` = `<masked>`).

---

## 3. Power / PMIC / battery / sensors

```
$ ls /sys/class/power_supply/
max77696-battery  max77696-charger  max77696-eh  max77696-uic   (all on i2c-0/0-003c)

$ ls /sys/class/rtc/          -> rtc0, rtc1 (max77696-rtc.0), rtc2 (snvs_rtc.0)   # 3 RTCs
$ ls /sys/class/thermal/      -> (empty)                                        # NO thermal zone
$ ls /sys/class/hwmon/        -> hwmon0 (max77696-adc.0)  [only uevent/power, no values]
```

**Battery / charger** (`/sys/class/power_supply/max77696-battery/*`):
```
capacity=55  status=Discharging  present=1  online=1  cycle_count=38  type=Battery
temp=89  voltage_now=3830(mV)  voltage_avg=3829  current_now=-290  current_avg=-43
charge_full=1408  charge_now=783  charge_full_design=790000
uevent: POWER_SUPPLY_CAPACITY=55 POWER_SUPPLY_TEMP=89 POWER_SUPPLY_CURRENT_NOW=-290
```
`max77696-charger` present=0/online=0; `max77696-eh` (external power) 0; `max77696-uic` (USB) present=0.
**Odd/interesting:** `charge_full=1408` vs `charge_full_design=790000` — inconsistent unit scaling
(fuel-gauge mAh vs driver-decoded µAh). Treat battery sysfs numbers as vendor-specific.
`max77696-adc.0` → hwmon0 with no readable attributes (empty).

**Dedicated fuel-gauge node** `/sys/devices/system/wario_battery/wario_battery0/` (much richer):
```
battery_capacity=55  battery_capacity_mix=55  battery_capacity_rep=55
battery_current=-58  battery_cycle=38  battery_error=0  battery_id_valid=1
battery_lmd_mAH=1408  battery_mAH=780  battery_mAH_av=773  battery_mAH_mix=781
battery_temperature=89  battery_voltage=3828
fg_cdata_check=ModelGauge Data Verification *** Data Valid ***
fg_learn_cycles=3995 ... fg_learn_fullcap=2816 ...
```
This is a **Maxim ModelGauge** fuel gauge (MAX170xx-style learning state exposed).

**Hall sensor (magnetic cover)** — exists, `wario_hall`:
```
$ for f in /sys/devices/system/wario_hall/wario_hall0/*; do echo "$f = $(cat $f)"; done
hall_debug=0  hall_detect=0  hall_enable=1  hall_gpio_pullup=0  hall_trig_wkup=0
```
Also exposed as misc char dev `/dev/hall` (10:163) and `/sys/class/misc/hall`.
`hall_detect=0` = cover open. Used for **cover close→sleep / open→wake**.

**Frontlight / backlight (`max77696-bl`)**:
```
/sys/class/backlight/max77696-bl/max_brightness = 4095
/sys/class/backlight/max77696-bl/brightness = 78
/sys/class/backlight/max77696-bl/actual_brightness = 78
/sys/class/backlight/max77696-bl/bl_power = 0   type=raw
```
(There is also a legacy `pwm-backlight.0` platform device, driver `pwm-backlight` **not bound** —
inactive. Kindle PW3 frontlight actually goes through the MAX77696 LED drivers below.)

**LEDs (frontlight channels)**:
```
/sys/class/leds/max77696-leds.0  brightness=15  max_brightness=127
/sys/class/leds/max77696-leds.1  brightness=15  max_brightness=127
```
Two LED strings (frontlight segments). `max_brightness=127` here vs `4095` for the backlight node.

**Frontlight control via LIPC (`com.lab126.powerd`)**:
```
flIntensity=8   flMaxIntensity=25   flRawIntensity=78   flTurboBrightnessIntensity=1   flAuto=0
```
So the user-facing frontlight has **25 levels**, mapped to raw 12-bit (0..4095) PWM.

**Sensors — what EXISTS vs what DOESN'T:**

| Sensor | Exists? | Evidence |
|---|---|---|
| Magnetic cover / hall | **YES** | `wario_hall`, IRQ 359, `/dev/hall` (10:163) |
| Battery gauge + temp | **YES** | `max77696-battery`, `wario_battery` ModelGauge |
| RTC / alarm | **YES** (3) | rtc0/rtc1 max77696, rtc2 snvs |
| Frontlight | **YES** | `max77696-bl`, 2× `max77696-leds` |
| **Accelerometer / g-sensor** | **NO** | not in `/proc/modules`, `CONFIG_INPUT_ADXL34X off`; winmgr `accelerometer` → `U` (fixed) |
| **Ambient light (ALS)** | **NO (inactive)** | `CONFIG_INPUT_ALS_MAX44009=m` but module **not loaded** |
| **Proximity** | **NO (inactive)** | `CONFIG_INPUT_PROX_PIC12LF1822=m` but not loaded |
| **Magnetometer** | **NO** | — |
| **Thermal zone** | **NO** | `/sys/class/thermal` empty; `CONFIG_THERMAL off` |
| Lid-gpio switch | n/a | hall covers this |

`find /sys -iname '*accel*' ... '*light*'` returned only `max77696-bl.0/backlight`, `pwm-backlight.0`,
`wario_hall`, `frontlight` — i.e. **no accelerometer/ALS/prox nodes**. Orientation is permanently
`U` (portrait only): `com.lab126.winmgr orientation = U`, `orientationLock = U`, `setAccOrientation = 0`.

---

## 4. Display / EPDC

```
$ cat /proc/fb
0 mxc_epdc_fb
$ ls -la /dev/fb0
crw-rw---- 1 root video 29, 0 /dev/fb0          # only ONE framebuffer, no /dev/fb1, no DRM
$ /sys/class/graphics/fb0/*
bits_per_pixel = 8          # Y8 grayscale
stride         = 1088       # 1072 visible → 16px padding
rotate         = 3          # 270° (counter-clockwise) — Xorg logs "rotating ... counter-clockwise"
virtual_size   = 1088,6144  # 6144 = 6 pages of 1448? (triple/double-buffer window)
pan            = 0,0        state = 0
modes          = U:1072x1448p-0  /  U:1448x1072p-0
dev            = 29:0       name = mxc_epdc_fb
```
Visible size **1072 × 1448**, 8bpp, stride 1088, rotation 3. **No** `/sys/class/drm`, **no** `/dev/dri*`.

**EPDC driver debug nodes** `/sys/devices/platform/imx_epdc_fb/` (driver `imx_epdc_fb`):
```
mxc_epdc_temperature   = 4097                      # raw ADC/temp code fed to waveform picker
mxc_epdc_waveform_modes:
    mode_version:0x19
    init:0x0   du:0x1   du4:0x7   gc16f:0x2   gc16:0x2   gc4:0x2
    gl4:0x7    gl16inv:0x2  gl16f:0x3  gl16:0x3  reagld:0x5  reagl:0x4
mxc_epdc_voltcontrol:
    VCOM_BIT_0x19: 0
    VPOS:+15000000uV  VNEG:-15000000uV  VDDH:+25000000uV  VEE:-20000000uV  VCOM_OFFSET:+0uV
mxc_epdc_wvaddr   = 0x81800000     # waveform buffer phys addr
mxc_epdc_update   = 1
mxc_epdc_reagl=0  mxc_epdc_powerup=0  mxc_epdc_pwrdown=0  mxc_epdc_regs (present)
```
This is the **waveform-mode → EPDC LUT** mapping you'd drive for A2/DU vs GC16 waveform selection
(`du`=A2-ish fast, `gc16`=full clean, `gl16`=partial, `reagl`/`reagld`=REGAL ghost-free).

**Panel identity (LIPC `com.lab126.system`):**
```
panelCode            = R169_ED060KD1C4
waveformversion      = 320_R169_AE4141_ED060KD1C4_TC
panelWaveformversion = 320_R169_AE4141_ED060KD1C4_TC
displayTemperature   = 30
version              = System Software Version: 002-juno_16020101_muscat_wario-409747 ... com.lab126.eink.muscat.os
```
Panel = **ED060KD1C4** (6", 1072×1448, 300ppi, Carta). Firmware codename "juno"/"muscat"/"wario".

`/proc/bd/panel_params` (lab126 custom):
```
mode:416x622-16,active,hsynclen:28,right:34,left:34,vsynclen:25,upper:0,lower:2,hsync:1,
vsync:1,pixclock:59800,pixclockpol:0,acbias:24
/proc/bd/panel_size = 00000000
```

**Other display-related blocks:** `imx-pxp` (2D blit/rotate engine, `/dev/pxp_device` misc 63),
`mxc_vdoa` (video DMA / error correction), `epd-vreg` ×6 regulators (EPD rails) + `max17135-reg`
driver present. Platform `pwm-backlight.0` exists but unbound.

**dmesg / boot log:**
```
$ dmesg | wc -l   -> 454
$ dmesg | sed -n '1,20p'
: undefined instruction: pc=40f967d0
[ 1737.309578] Code: ... (e7f000f0)
[ 1737.974022] Thread-190 (15819) segfault pc: 40e94bf8 addr:400f3000
[ 1739.502032] IndexerThread (15050) segfault pc: 40fc0204 addr:400f3000
[ 1742.458120] lab126.todo.kaf (14968) segfault pc: 40e8ded8 addr:400f3000
[ 1797.943648] devcap-get-feat (16388): undefined instruction: pc=4045a228
...
[ 2133.402507] cfg80211: Calling CRDA to update world regulatory domain
[ 2178.8...] max77696-rtc ... PM: Preparing system for mem sleep ... PM: Entering mem sleep
[ 2178.9...] KERNEL: I pmic:fg suspend battinfo:current=-18mA, volt=3850mV, capav=059%, mAh=830mAh
[ 2178.9...] imx2_wdt_reinit re-initializing wdog
```
`dmesg` **is readable**, but the ring buffer **has wrapped** — earliest retained line is ~t=1737s
(uptime 5h). **Boot-time EPDC/cyttsp/ath6kl probe messages are gone**; grep for
`epdc|waveform|cyttsp|ath6kl|panel` in dmesg returned **nothing**. (`/dev/kmsg` is `10:11`, not read.)
Notable: many **JVM/Java stack faults** (`undefined instruction ... ec510f1e`) and segfaults from
`lab126.todo.kaf`, `IndexerThread`, `devcap-get-feat` — the Java side is noisy but this is
not our target. Watchdog is **re-initialised on resume** (`imx2_wdt_reinit`).

---

## 5. Input devices  ⭐ (critical for gesture recognition)

```
$ cat /proc/bus/input/devices
I: Bus=0000 Vendor=0000 Product=0000 Version=0000
N: Name="max77696-onkey"
P: Phys=max77696-onkey/input0
S: Sysfs=/devices/platform/imx-i2c.0/i2c-0/0-003c/max77696-onkey.0/input/input0
H: Handlers=kbd event0
B: PROP=0
B: EV=3
B: KEY=100000 0 0 0

I: Bus=0000 Vendor=0000 Product=0000 Version=0000
N: Name="cyttsp4_mt"
P: Phys=cyttsp4_mt.main_ttsp_core
S: Sysfs=/devices/platform/imx-i2c.1/i2c-1/1-0024/main_ttsp_core.cyttsp4_i2c_adapter/cyttsp4_mt.main_ttsp_core/input/input1
H: Handlers=event1
B: PROP=0
B: EV=f
B: KEY=6420 0 0 0 0 0 0 0 0 0 0
B: REL=0
B: ABS=2608000 0
```

```
$ ls -la /dev/input /dev/input/by-path
event0  (13,64)  ; event1 (13,65)  ; uinput (10,223)   [mode 0640 root:root]
by-path/platform-imx-i2c.0-platform-max77696-onkey.0-event -> ../event0
by-path/platform-imx-i2c.1-event -> ../event1
$ ls -la /sys/class/input/      -> event0 event1 input0 input1
```

`evtest` presence:
```
$ ls -la /usr/bin/evtest
-rwxr-xr-x 1 root root 12328 Aug 1 2023 /usr/bin/evtest       # PRESENT
```
But it is an **old build with no `--help`/`--query`** (usage string: `Usage: evtest [info] /dev/input/eventX`;
`strings` shows no `--query`). Running it pipes to stdout which is **fully buffered**, so the
capability dump is lost when killed. Workaround used (read-only):
`script -q -c "timeout 2 /usr/bin/evtest /dev/input/eventN" /dev/null` → the PTY makes stdout
line-buffered and the dump is captured before the read loop. Caveat: while in the read loop a short
timeout can consume a few live events from other readers (shared evdev queue). Use sparingly.

### Decoding the bitmaps

`/proc/bus/input/devices` prints bitmaps **MSW-first** (highest word left, word0/bits 0-31 **last**),
32-bit longs (8 hex digits) on this 32-bit kernel.

**event0 — `max77696-onkey` (power button)**
- `EV=3` → bit0 EV_SYN, bit1 EV_KEY.
- `KEY=100000 0 0 0` → word3 (bits 96-127) = `0x100000` → **bit 116 = `KEY_POWER`**. Others 0.

**event1 — `cyttsp4_mt` (touchscreen)**

`EV=0xf` → bits 0-3: `EV_SYN`(0), `EV_KEY`(1), `EV_REL`(2), `EV_ABS`(3). (REL advertised but `REL=0` — no rel codes.)

`KEY=6420 0 0 0 0 0 0 0 0 0 0` → 11 words ⇒ highest nonzero word is word10 (bits 320-351) = `0x6420`:
```
0x6420 = bits 5,10,13,14  →  KEY codes 325, 330, 333, 334
```
Confirmed by evtest (`script …` dump, names below):
```
KEY  325 (ToolFinger)   = BTN_TOOL_FINGER      0x145
KEY  330 (Touch)        = BTN_TOUCH            0x14a
KEY  333 (Tool Doubletap)= BTN_TOOL_DOUBLETAP  0x14d
KEY  334 (Tool Tripletap)= BTN_TOOL_TRIPLETAP  0x14e
```
`ABS=2608000 0` → word1 (bits 32-63) = `0x2608000`, word0 (bits 0-31) = `0`:
```
0x2608000 = bits 15,21,22,25  →  ABS codes 32+{15,21,22,25} = 47, 53, 54, 57
```

### Touch capabilities with ranges (from evtest PTY dump; Xorg log agrees)

| Type | Code | Name | Value | Min | Max |
|---|---|---|---|---|---|
| EV_ABS | 47 (0x2f) | `ABS_MT_SLOT` | 0 | **0** | **10** (11 slots) |
| EV_ABS | 53 (0x35) | `ABS_MT_POSITION_X` | 0 | **0** | **1071** |
| EV_ABS | 54 (0x36) | `ABS_MT_POSITION_Y` | 0 | **0** | **1447** |
| EV_ABS | 57 (0x39) | `ABS_MT_TRACKING_ID` | 0 | **0** | **65535** |
| EV_KEY | 325 | `BTN_TOOL_FINGER` | — | — | — |
| EV_KEY | 330 | `BTN_TOUCH` | — | — | — |
| EV_KEY | 333 | `BTN_TOOL_DOUBLETAP` | — | — | — |
| EV_KEY | 334 | `BTN_TOOL_TRIPLETAP` | — | — | — |

Corroboration — `Xorg.0.log`:
```
(II) imx(0): hardware: mxc_epdc_fb (video memory: 6624kB)
(**) imx(0): Option "FormatEPDC" "Y8"
(**) imx(0): rotating EPDC frame buffer output counter-clockwise
(II) multitouch: devname: cyttsp4_mt
(II) multitouch: 5: min: 0 max: 1071
(II) multitouch: 6: min: 0 max: 1447
(II) multitouch: 9: min: 0 max: 65535
```

**Protocol / annotations for gesture recognition:**
- **MT-B (protocol B)**: uses `ABS_MT_SLOT` + `ABS_MT_TRACKING_ID` (+ `ABS_MT_POSITION_X/Y`).
  `ABS_MT_SLOT` max = **10 ⇒ up to 11 contacts** can be addressed by slot, but only
  `BTN_TOOL_FINGER/DOUBLETAP/TRIPLETAP` are advertised (the driver's contact-count fallback tops out at
  3); real usable finger count for this panel is small (typically 2 on Cyttsp4). Don't assume 11.
- **No `ABS_MT_TOUCH_MAJOR`, no `ABS_MT_PRESSURE`, no `ABS_MT_WIDTH/ORIENTATION`, no legacy `ABS_X/ABS_Y`.**
  ⇒ There is **no pressure** to work with; gestures must be built from positions, timing, slot/track ids,
  and the tool buttons only.
- Coordinates are already in **framebuffer pixel space** (`X: 0..1071`, `Y: 0..1447`), matching the
  1072×1448 visible area **1:1** — no scaling/rotation needed in userspace (rotation is done by the
  fb `rotate=3` + EPDC, not by the touch axis mapping).
- A single-finger tap sequence captured live by the installed `kindlehome` launcher
  (`/mnt/us/kindlehome/touch.log`) confirms ordering:
  ```
  KEY code=0x14a val=1     # BTN_TOUCH down
  ABS code=0x39 val=0      # ABS_MT_TRACKING_ID
  ABS code=0x35 val=635    # X
  ABS code=0x36 val=351    # Y
  SYN code=0x0 val=0
  KEY code=0x145 val=1     # BTN_TOOL_FINGER
  SYN code=0x0 val=0
  ABS code=0x35 val=634    # subsequent X updates ...
  ```
  Note: for a single contact the driver does **not** emit `ABS_MT_SLOT=0` (slot 0 is implicit); a
  robust reader should treat a missing slot as slot 0, and a `TRACKING_ID = -1` (0xffffffff) as lift.
- `EV_SYN` framing is used (`SYN_REPORT`), and `REL` is advertised but never used — ignore it.

---

## 6. Connectivity

**Wi-Fi (only network interface):**
```
$ ls /sys/class/net/
lo   wlan0 -> .../sdhci-esdhc-imx.2/mmc_host/mmc1/mmc1:0001/mmc1:0001:1/net/wlan0
wlan0: address=<masked>  operstate=up  mtu=1500  type=1
$ iw dev wlan0 info   -> type managed  wiphy 0
$ iw dev wlan0 link
Connected to <masked> (on wlan0)
    SSID: <ssid>    freq: 2457
    RX: 2721109 bytes (9311 packets)   TX: 1216348 bytes (7411 packets)
    signal: -34 dBm    tx bitrate: 72.2 MBit/s MCS 7 short GI
$ iwconfig wlan0      -> "wlan0  no wireless extensions."   (old-style WE not supported; use iw)
```
Chipset: **Atheros AR6003 (SDIO)**, driver `ath6kl_sdio` on mmc1. Driver params:
```
board_data_file = /opt/ar6k/target/AR6003/hw2.1.1/bin/AR6003_wfo_calfile.bin
heart_beat_poll=2000  recovery_enable=1  suspend_mode=1  wow_mode=0  ath6kl_p2p=0  testmode=0
```
`/proc/net/wireless` exists but lists **no interface** (WE not wired to the new cfg80211 path).
Also present: `udhcpc` (busybox DHCP), `wpa_supplicant -D nl80211`.

**Bluetooth: NONE.**
```
$ ls /sys/class/bluetooth         -> unavailable
$ ls /proc/net/bluetooth          -> unavailable
$ which hciconfig hcitool bluetoothd -> none
```
No BT at all (not just off) — no HCI device, no stack (`btd`/`btfd` upstart jobs are stop/waiting).

**USB:**
```
$ lsusb
Bus 001 Device 001: ID 1d6b:0002      # root hubs only (EHCI)
Bus 002 Device 001: ID 1d6b:0002
$ ls /sys/bus/usb/devices -> 1-0:1.0 2-0:1.0 usb1 usb2
```
Two EHCI host controllers (`fsl-ehci.0/.1`), one dual-role OTG/UDC (`fsl-usb2-udc`,
`arcotg_udc`). **`/sys/class/udc` absent** (old gadget API). Gadget via `g_file_storage` (mass storage)
and `CONFIG_USB_ETH` (RNDIS) for **usbnet**:
```
g_file_storage params: luns=0 buflen=16384 transport=BBB protocol=SCSI removable=Y stall=Y
usb-wakeup.0 / usb-wakeup.1 platform devices present (drivers bound)
Kernel thread: [otg_switch], [file-storage-ga]
Upstart: usbnetd / usbnet-autostart (SD /mnt/base-us/ENABLE_USBNET)
```

**Net tables:**
```
$ cat /proc/net/arp
<gateway>   0x1 0x2 <masked>  * wlan0
<host-ip> 0x1 0x2 <masked>  * wlan0
$ cat /proc/net/route -> default via <gateway> on wlan0 ; /24 directly connected
$ cat /proc/net/tcp  -> listener on 0.0.0.0:<port> (SSH, user-added) + 127.0.0.1:<port>
```

---

## 7. Storage

```
$ cat /proc/partitions
 179  0  3817472 mmcblk0        # ~3.6 GiB eMMC
 179  1   460800 mmcblk0p1      # root (ext3, /)
 179  2    65536 mmcblk0p2      # /usr/share/nh (ext3)
 179  3    65536 mmcblk0p3      # /var/local (ext3)
 179  4  3192832 mmcblk0p4      # userstore  → /mnt/base-us (vfat) → /mnt/us (fuse)
 179 16     4096 mmcblk0boot1
 179  8     4096 mmcblk0boot0
   7  0-8 loop0..loop8 (squashfs images)
```

```
$ df -h      (trimmed)
/dev/root           437.4M 386.3M  29.1M  93% /            # nearly full
tmpfs               251.3M 104.0K 251.2M   0% /dev
tmpfs                64.0M   6.1M  57.9M  10% /var
tmpfs               250.0M      0 250.0M   0% /mnt/kfxcache
/dev/loop/2         384.0K ... 100% /usr/share/X11/xkb
/dev/loop/3          80.0M ... 100% /usr/java/lib/fonts
/dev/loop/4         128.0K ... 100% /etc/kdb.src
/dev/loop/5         768.0K ... 100% /usr/lib/locale
/dev/loop/6          14.3M ... 100% /usr/share/keyboard
/dev/loop/7           2.0M ... 100% /opt/var/local
/dev/loop/8         128.0K ... 100% /etc/uks
/dev/mmcblk0p3       60.0M 40.3M 16.5M  71% /var/local
/dev/mmcblk0p2       62.2M  4.2M 54.9M   7% /usr/share/nh
/dev/loop/0           3.0G 440.7M  2.6G  14% /mnt/base-us
fsp                   3.0G 440.7M  2.6G  14% /mnt/us        # FUSE!
```
`mount` also shows a full **`/chroot`** jail (KOReader) mirroring `/var`, `/sys`, `/mnt/us`, fonts, etc.
`/proc/filesystems`: ext3/ext2/cramfs/squashfs/vfat/msdos/nfs/fuse/fuseblk/fusectl… **no swap, no zram**
(`/proc/swaps` empty; no `/dev/zram*`).

Notable: userstore is **not plain vfat** — `/mnt/us` is a **`fuse.fsp`** mount (`/sbin/fsp`,
`allow_other`, README.md-style) on top of `/mnt/base-us` (vfat, `codepage=cp437,iocharset=iso8859-1`).
Root fs is mounted **ro** (`barrier=0,data=writeback`). `/tmp` → symlink to `/var/tmp`.

---

## 8. Init / services (upstart)

```
$ initctl list          (trimmed to state highlights)
--- running ---
system, dbus, cron, dynconfig, console, syslog, printklogs, filesystems, filesystems_var_local,
<lifeline>, wifim, wifis, wifid, x, phd, tmd, todo, rcm, deviced, appmgrd, demd, perfd, archive,
volumd, stackdumpd, lipcd, bootactions, iohwlogs, system_setup, system_setup_after_shpm, ...
--- stop/waiting (NOT running) ---
framework, pillow, lab126_gui, lab126_gui_monitor, kfxreader, kb, blanket?, display, wi,
asr, btd, btfd, otaupd, kindle? ... 
```
Key observation: **the Amazon GUI/reader stack is currently DOWN** (`framework`, `pillow`,
`lab126_gui`, `kfxview`, `kfxreader`, `kb` all `stop/waiting`). `x` (lxinit + Xorg + awesome +
blanket) **is up**. The device is sitting on the "blankwindow"/screensaver from `blanket`. This is the
state a custom frontend would find itself replacing.

`/etc/upstart/` contains ~150 confs + helper scripts. Key confs (`start on` / `stop on` / respawn / exec):

| Job | start on | stop on | respawn | exec |
|---|---|---|---|---|
| `x` | `x_should_start` | `stopping dbus or stop_x` | – | `exec lxinit blanket -t "splash screensaver langpicker blankwindow"` (sets `LXINIT_REQUIRED_BLANKET_MODULES`) |
| `lab126_gui` | `n_ready and langpicker_ready` | `stopping x or ota-update` | – | watch-dog script (MAX_RESTARTS=3, MAX_REBOOTS=2; can reboot to CS screen) |
| `framework` | `contentpack_font_ready` | `stopping lab126_gui` | – | `exec /etc/upstart/framework` (Java CVM; run only if `/mnt/us/DONT_START_FRAMEWORK` absent) |
| `pillow` | `started lab126_gui or start_pillow` | `stopping lab126_gui` | **respawn** | `su framework -c "exec pillowd -f"` |
| `powerd` | `started lab126` | `stopping lab126` | **respawn** | `exec powerd -f` — comment: *"latent dependency on /dev/fb ioctl"* |
| `display` | `mounted_varLocal and loaded_modules_dependencies` | – | task | `/etc/upstart/display` → emits `display_ready` |
| `wifid` | `started lab126` | `stopping lab126` | **respawn** | `exec wifid -f` |
| `wi` | `started dynconfig and started dbus` | `stopping lab126` | **respawn** | `exec nice -n -4 /app/bin/WetInkHandler`; emits `x_should_start`; sleeps 2 for uinput |
| `<lifeline>` | `started filesystems_userstore` | `stopping filesystems_userstore` | respawn (10/60) | `exec /mnt/us/<lifeline>/start.sh` **(custom, user-added)** |
| `touch` | `mounted_varLocal and loaded_modules_dependencies` | – | task | `/etc/upstart/touch` → emits `loaded_touch` |
| `kindle` | `started poll_daemons and started kb and started pillow and started cmd` | – | – | final target (collapses shutdown) |
| `lab126` | `started system_setup_after_shpm and started demd` | `stopping dbus or ota-update` | – | non-X/non-framework daemon collapse point |

Other useful scripts seen: `battery`, `blanket_functions`, `cyttsp`/`cyttsp5`/`pt5`/`zforce`/`stylus`
(touch bring-up helpers), `display` (EPDC module/init), `framework`, `makexconfig` (generates
`xorg.conf` at boot — order of input devices is decided here), `shutdown_special`, `userstore`,
`wan`, `whiskey_button`, `haptics`. There is **no `blanket.conf`** — blanket is a *module* loaded by
`lxinit` (`blanket_functions` exists). `kaf` is referenced from `framework_setup.conf` (Java app framework).

---

## 9. LIPC schema (lab126 IPC)

`lipc-probe -a` lists all services. Service names observed (partial):
`com.lab126.{todo, BootActionsApplication, winmgr, winmgr.ligl, powerd, deviced, bootactions,
progressbar, blanket, archive, system, transfer, dynconfig, cmd, refreshCache, languagepicker,
wifid, lxinit, appmgrd, phd, volumd, sph, demd, tphv3, dpmManager, asrtutorial, usbnetd}`,
plus non-lab126: `AssetOwnership.SMD.Poll`.

**`com.lab126.powerd`** (r=read, w=write, rw):
```
r  state [active]           r  status [multi-line: see below]    r  battStateInfo [JSON]
r  battLevel [55]           r  battTemperature [89]              r  isCharging [0]
r  isLowTempState [0]       r  flMaxIntensity [25]               r  flIntensity [8]
r  flRawIntensity [78]      r  flTurboBrightnessIntensity [1]
rw preventScreenSaver [0]   rw disableScreenOff [0]              rw flAuto [0]
w  powerButton              w  touchScreenSaverTimeout           w  deferSuspend  w  suspendGrace
w  abortSuspend             w  wakeUp     w  rtcWakeup / rtcWakeup2
w  deviceRestart / deferRestart   w  sendPendingResume   w  addSuspendLevels  w  flStartup
```
`lipc-get-prop com.lab126.powerd status`:
```
Powerd state: Active
Remaining time in this state: 356.215064
defer_suspend:0
suspend_grace:0
prevent_screen_saver:0
drive_mode_state:1
PRIMARY BATTERY
Battery Level: 55%
Last batt event at: 55%
Charging: No
Battery logging: On
```

**`com.lab126.winmgr`** (the compositor/refresh manager — most relevant to us):
```
rw epdcMode [Y8]                rw lightboxMode [1]           rw chromeState [0]
r  orientation [U]              rw orientationLock [U]        rw setAccOrientation [0]
r  accelerometer [U]            r  winmgrReady                r  isScreenSaverLayerWindowActive
rw refreshOnTurn                r  activeDialogCount          r  getActiveAppTitle
w  getAllWindows / visibleWindows / focusChrome / createTrigger / clearTrigger
w  fakeTap / fakeKeyEvent       w  liglFlash                  rw liglPause
w  liglDebugParams / defineWipeCurve   w  extendDamageTimeout / extendAfterDamageTimeout
rw ASRMode   rw passwordDialogEnabled   rw pageTurnkeyConfig   rw enableDispalyEvents (sic)
r  timerRemainingTime           r  debugInfo                   rw grip_enabled   w  eatTapMode
```
(`lightboxMode`, `epdcMode`, `liglFlash`, damage timeouts = the EPDC refresh/waveform control surface.)

**`com.lab126.blanket`** (blanking/screensaver layer manager):
```
rw load   [langpicker blankwindow usb screensaver]
rw unload []
rw logMask [0x0fff0000]
```

**`com.lab126.system`** (device/panel metadata + actions):
```
r  version            [System Software Version: 002-juno_16020101_muscat_wario-409747 ...]
r  panelCode          [R169_ED060KD1C4]
r  waveformversion    [320_R169_AE4141_ED060KD1C4_TC]   r panelWaveformversion [same]
r  displayTemperature [30]     r  boardid [<masked>]   r  usid [<masked>]
r  guid [<masked>]   r orientation []   r isTimeAutoUpdateEnabled [true]
w  takeScreenShot  w  updateWaveform / deleteWaveform  w  sendEvent  w  executeDebugCommand
w  disableASR  w  startVoiceView / stopVoiceView  w  enableTimeAutoUpdate / disableTimeAutoUpdate
```

**`com.lab126.cmd`**: `activeInterface [wifi]`, `wirelessEnable [1]`, `ensureConnection`,
`interfaceProperties`, `availableInterfaces`, `disableInterfaces`.
**`com.lab126.volumd`**: `driveModeState [0]`, `userstoreTotalSpace [3188384]`,
`userstoreFreeSpace [2737136]`, `useUsbForNetwork`, `disableMounting`.
**`com.lab126.wifid`**: `signalStrength [5/5]`, `scanState [idle]`, `macAddress`, `setRegDomCC`,
`scan`, profiles/netConfig/cert stuff, `cm*` connection-manager verbs.
**`com.lab126.deviced`**: `usbaudioConnected`, `usbaudioSendEvent`, `enable_touch` (write-only; read
fails `lipcErrNoSuchProperty`).
(No dedicated `com.lab126.eink` service — EPDC control lives under `winmgr`.)

---

## 10. Processes

```
$ ps aux   (trimmed, RSS in kB)
root  1     0.3% 1968 /sbin/init.exe
root  641   [EPDC Submit]        root 642 [irq/129-fb_dma]
root  843  0.5% 2668 syslog-ng
root  885/886/1600  ./<lifeline>d -E -R -p <port> -P /var/run/<lifeline>.pid ...
root  1109  [Cyttsp4 startup]    root 1113 [irq/355-main_tt]
root  992   [otg_switch]         31202 [ksdioirqd/mmc1]
root  825  crond -f -c /etc/crontab
root  1315 0.2% 1484 fsp /mnt/base-us /mnt/us -o rw,nosuid,nodev,noatime,allow_other,...
root  1836 0.4% 2384 dbus-daemon --system --nofork      (uid 92)
root  1889 0.5% 2596 lipc-daemon -f -p /etc/lipc-daemon-props.conf -e /etc/lipc-daemon-events.conf
root  1897 demd   1898 perfd   1901 cmd -f (4200)   1909 archive   1910 todo (6832)
root  1912 volumd -f -d /dev/mmcblk0p4   1913 rcm   1915 stackdumpd
root  1920 1.0% 5304 powerd -f            1925 dpmd   1929 appmgrd
root  1942 tmd -f  1944 deviced -f  1991 dynconfig
root  2003 0.9% 4636 wifid -f
9000  2035 phd -f   7185 192 ./kindlehome → /mnt/us/kindlehome/kindlehome   (user/NEW)
root 10434 [ath6kl] 10435 [htc_rx] 10455 wpa_supplicant -t -c /etc/wpa_supplicant.conf -i wlan0 -d -s -D nl80211
root 11149 lxinit blanket -t screensaver langpicker blankwindow
root 11160 0.8% 4352 Xorg -nolisten tcp +bs -ardelay 0 -arinterval 0
root 11164 1.6% 8452 awesome
root 11165 0.9% 4848 blanket -t screensaver langpicker blankwindow
9000 31902 3.2% 16612 /app/bin/BootActionsApplication -c /app/EinkBootActions/config   (KPP)
```
`exe` links resolved: `/sbin/init.exe`, `/usr/sbin/syslog-ng`, `/sbin/fsp`, `/mnt/us/<lifeline>/<lifeline>d`,
`/usr/bin/lipc-daemon`, `/usr/sbin/cmd`, `/usr/bin/powerd`, `/usr/bin/appmgrd`,
`/mnt/us/kindlehome/kindlehome`, `/usr/bin/wpa_supplicant`.
Kernel threads of interest: `EPDC Submit`, `Cyttsp4 startup`, `irq/355-main_tt`, `irq/129-fb_dma`,
`irq/301-max7769`, `irq/372-max7769`, `otg_switch`, `ksdioirqd/mmc1`, `watchdog/0`.

Memory/CPU:
```
MemTotal 514724 kB (~503 MB)   MemFree ~70524 kB   Buffers 93140   Cached 260824
uptime 5:12   loadavg 0.69 0.52 0.63
cpufreq:  scaling_driver=imx  governor=ondemand  296→ actually 396000/996000
          cur=996000  max=996000  min=396000
```

---

## 11. Filesystem layout / runtimes

```
$ ls -la /
.  ..  MNTUS_EXEC  PRE_GM_DEBUGGING_FEATURES_ENABLED__REMOVE_AT_GMC
app/ bin/ chroot/ dev/ etc/ lib/ mnt/ opt/ proc/ sbin/ sys/ tmp->/var/tmp usr/ var/
$ ls /app
EinkBootActions/  KPPMainApp/  KPPMainAppCrashRecovery/  KPPOOBEMainApp/  bin/ include/ info/
kux/ lib/ registry/ standalonenotebook/ toolbar/  version_*.txt   # Juno/KPP Java artifacts
$ ls /opt
amazon/ ar6k/ config/ factory/ var/ wan/
$ ls /usr/java      -> bin/  lib/   (Java runtime; fonts are a separate squashfs loop below)
$ ls /usr/java/lib/fonts   (loop-backed, 80 MB)
Amazon-Ember-*.ttf  AmazonEmberBold-*.ttf  Baskerville-*.ttf  Bookerly-*.ttf  BookerlyDisplay-*.ttf
Caecilia_LT_*.ttf  DiwanMuna-*.ttf  Futura-*.ttf  Helvetica_LT_*.ttf ...
$ ls /etc/kdb/src -> /etc/kdb -> /etc/kdb.src/platform
/etc/kdb.src/platform/system/{daemon,driver}   # KDB (Kindle Device DB) — key/value config DB
$ ls /var/local     -> BACCHUS_DEVICE_CONFIG, CHROME_CONFIG, LIBRARY_CONFIG, appreg.db, cc.db,
                       bw.db, KWISClient.db, WishList.db, blanket/, archive/, ...
$ ls -la /etc/uks   -> pubdevkey01.pem pubprodkey01.pem pubprodkey02.pem
$ ls /usr/bin | wc -l -> 483   (busybox + amazon tools: appmgrd powerd wifid Xorg awesome blanket
                                lipc-* evtest sqlite3 lua iw iwconfig ifconfig nc ... )
$ /usr/local/bin   -> none
```
`/mnt/us` (userstore, via FUSE) top level:
```
.active_content_sandbox/ .Spotlight-V100/ .fseventsd/  bin/  books/  documents/  extensions/
fonts/  kf-tls/  kindlehome/  <lifeline>/  kmc/  koreader/  kterm/  libkh/  system/
winterbreak2/
  extensions/: kindlefetch/  koreader/
  bin/kindlefetch.sh  (TLS curl wrapper via /mnt/us/kf-tls)
  kindlehome/: kindlehome (369 KB), run.log, dry.log, touch.log  ← user's own launcher
```
**Fonts available to us:**
- System fonts: `/usr/java/lib/fonts` (squashfs loop3) — full Kindle set (Ember, Bookerly, Caecilia,
  Baskerville, Futura, Helvetica, DiwanMuna…). **Best free-ish, prose-quality face = Bookerly.**
- `/mnt/us/system/fonts` and `/mnt/us/fonts` exist (userstore); `/mnt/us/koreader/resources/fonts`
  contains only `Readme.txt` (no bundled fonts).

Runtimes present on device: **busybox 1.34.1**, `/usr/bin/lua`, `/usr/bin/evtest` (old),
`/usr/bin/sqlite3` (seen in bin list), Java (Juno/KPP) — **no python, no perl, no node, no ruby, no fbink**.

---

## 12. Anything surprising / worth flagging for architecture research

1. **No device tree** (board-file kernel 3.0.35). Any hardware description must come from `/proc/cpuinfo`,
   sysfs platform devices, LIPC, or the kernel source — not DT.
2. **`/proc/bd/`** — a lab126 custom proc directory (worth remembering for boot/shutdown integration):
   `boot_milestone`, `calibration_info` (`0,0,0`), `dirty_boot_flag` (`00000001`),
   `drvemode_screen_ready`, `framework_started` (`00000001`), `framework_running` (`00000000`),
   `framework_stopped` (`00000000`), `mw_flags`, `panel_params`, `panel_size`, `progress_count`,
   `rcs_flags`, `update_flag`. `framework.conf` writes `frame work_*` via `echo` to these. Our frontend
   must not fight this bookkeeping.
3. **PXP 2D blitter present** (`imx-pxp`, `/dev/pxp_device` misc 63, IRQ 130, 2 clients) — a hardware
   compositor/rotation/blit path that could offload the CPU rasteriser (blit, rotate, color-space).
   Also `mxc_vdoa` (frame DMA + error correction) and SDMA.
4. **Multiple EPDC waveform/refresh knobs already exposed**: `mxc_epdc_waveform_modes` maps all modes
   (du/du4/gc16/gc16f/gc4/gl4/gl16/gl16f/gl16inv/reagl/reagld) to LUT ids; `winmgr.epdcMode=Y8`,
   `lightboxMode`, `liglFlash`, `extendDamageTimeout` — i.e. **the refresh/waveform control surface we
   want is already LIPC-managed by `winmgr`**, and `powerd` has a *"latent dependency on /dev/fb ioctl"*.
5. **Watchdog registered but no device node**: misc major 130 `watchdog` exists, IRQ 112, `imx2_wdt.0`
   bound, `CONFIG_WATCHDOG_NOWAYOUT=y` — but **no `/dev/watchdog` node** was created by udev here
   (not in `/dev` listing). Watchdog is re-initialised on resume (`imx2_wdt_reinit`).
6. **Hall sensor is a first-class wake/sleep source** (`wario_hall`, IRQ 359, `/dev/hall`), separate
   from the power key (`max77696-onkey` → `KEY_POWER` 116). Cover open/close is available to us.
7. **Three RTCs** (2× max77696 with alarm, 1× SNVS) and `rtcWakeup`/`rtcWakeup2` LIPC props — RTC alarm
   wake is a supported sleep/wake path.
8. **User mode is the "blank/screensaver" state right now**: `framework`/`pillow`/`lab126_gui` are all
   **stopped**; only X0r + `awesome` + `blanket` compose the screen. This is exactly the takeover
   boundary for a custom frontend (and matches the installed `/mnt/us/kindlehome/kindlehome`, whose
   `run.log` shows it *stops framework → starts KOReader → restarts framework*).
9. **Userstore is FUSE (`fsp`)**, not raw vfat — file ops on `/mnt/us` go through a userspace daemon
   (PID 1315) and can be slower / have different semantics than vfat.
10. **No accelerometer** — the WP3 is portrait-only; `winmgr.accelerometer = U`, `orientationLock = U`.
    Do **not** design for auto-rotate.
11. **No thermal subsystem, no IIO** — but EPDC has its own temperature input
    (`mxc_epdc_temperature`, `com.lab126.system displayTemperature = 30`) used to pick waveforms.
12. **X also runs with `-nolisten tcp +bs`**, generated `xorg.conf` comes from `/etc/upstart/makexconfig`
    (`libinput`-era multitouch module `multitouch.so` used, not evdev) — if we co-exist with X we must
    share `/dev/input/event1`; if we replace X we must stop it cleanly (`x` job / `stop_x` event).
13. **`ushrink`** misc device (10:62) — lab126 memory-reclaim helper, unusual.
14. **No Bluetooth hardware/stack at all**; only Wi-Fi (AR6003 SDIO) and USB gadget (mass-storage
    currently `luns=0`; RNDIS/usbnet supported via `ENABLE_USBNET`).
15. **`/dev/uinput` (10:223, world-writable at `/dev/input/uinput`)** is available — we can *inject*
    synthetic input events (and `wi.conf` already depends on it: `WetInkHandler` waits for uinput).
16. **dmesg ring buffer wrapped** — boot logs are gone; do not expect EPDC/cyttsp probe traces without
    a reboot/logs directory (`/var/log/messages`, `printklogs` job). `/var/log` has `Xorg.0.log`,
    `messages`, `wpa_supplicant`, `netlog`, `udhcpc.log`.
17. **Battery sysfs units are inconsistent** (`charge_full=1408` vs `charge_full_design=790000`) — use
    `wario_battery` (ModelGauge) for real capacity in mAh, and `powerd` LIPC `battLevel` for a
    user-facing percentage.
18. **Root filesystem is mounted read-only and 93 % full** — any tooling we ship must live on `/var/local`
    (p3, 71 %) or `/mnt/us`, not `/`.

---

### Quick reference — touch event layout (for our own recogniser)

```
Device: /dev/input/event1   name=cyttsp4_mt   (MT-B, EV_SYN|EV_KEY|EV_REL(no rel)|EV_ABS)
Axes:  ABS_MT_SLOT 0..10 | ABS_MT_POSITION_X 0..1071 | ABS_MT_POSITION_Y 0..1447 | ABS_MT_TRACKING_ID 0..65535
Keys:  BTN_TOOL_FINGER(325)  BTN_TOUCH(330)  BTN_TOOL_DOUBLETAP(333)  BTN_TOOL_TRIPLETAP(334)
Power: /dev/input/event0  name=max77696-onkey  KEY_POWER(116) only
No pressure / no touch-major / no legacy ABS_X,Y. Coords are already 1:1 with the 1072x1448 framebuffer.
Missing ABS_MT_SLOT ⇒ treat as slot 0.  TRACKING_ID == -1 (0xffffffff) ⇒ contact lifted.
```
