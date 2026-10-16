# 06 — Power, sleep, and the absence of thermal<a id="ch06"></a>

> On a battery device with a 2011 kernel and no thermal subsystem, power is not a background
> concern; it is the *primary* constraint on the user experience. A frontend that does not
> understand `powerd` will be screensavered, suspended, or killed mid-interaction. A frontend that
> *does* understand it can idle at ~0 % CPU, suspend between user actions, and wake instantly on
> touch, cover, or button.

## 6.1 `powerd`: the manager

`powerd -f` (`com.lab126.powerd`, `/usr/bin/powerd`, RSS ~5.3 MB `[dev]`) owns the device's power
state machine, battery reporting, frontlight, and suspend. You do not replace it; you **talk to it**
over LIPC.

Its upstart job carries a note that is the whole chapter in one line `[dev]`:

```
exec powerd -f        # comment: "latent dependency on /dev/fb ioctl"
```

Power is entangled with the display: `powerd` interacts with `/dev/fb` (for blanking/screensaver
coordination). That is why a display takeover and a power-policy change must be done together.

## 6.2 The state machine

`powerd` implements a staged inactivity model `[RE/documented]`/`[dev]`:

| State change | Trigger |
|---|---|
| Active → Screen Saver | timer **T1** elapses with no input (**600 s**) |
| Screen Saver → Ready-to-suspend | timer **T2** elapses (**60 s**) |
| Ready-to-suspend → Suspended | the `r2s_grace_timeout` window closes (**5 s**) |
| Suspended → Active | **any wake source**: touch, cover, power button |

![An isometric clock movement: a powerd mainspring barrel and ratchet drive a train of escapement wheels for the cover, the touch controller and the power key, a smaller stage-2 drum is geared off the same arbor behind them, a pawl stands ready to lock the great wheel, a vertical epoch scale rises to the left, and a back rail carries five wake stations with a rod reaching down to the panel](figures/fig-power-light.png)

> **Fig 6.1 — The idle clock.** `powerd` counts inactivity in two stages (§6.2), so the machine it runs is
> a clock movement. One winding of the barrel is one turn of the stage-1 drum — **600 s** — and it ends by
> lifting the screen-saver flag; the stage-2 drum is geared 30:3 off the same wheel, so its next turn
> arrives **60 s** later and suspends the machine to RAM.
>
> `preventScreenSaver` is the pawl dropped into the great wheel: while it holds, the train stops and stage
> one never fires — which is exactly why a takeover must release it, on every exit path (§6.3). The back
> rail carries the five things that can wake the device: the power key (`max77696-onkey`, `KEY_POWER`
> only), the hall cover (`wario_hall`), the touch controller (`cyttsp4_mt`), and an RTC alarm on two of the
> three RTCs. The fifth station is the accelerometer this Paperwhite does not have — welded shut. The
> network socket has no wake-on-WLAN: `ath6kl` runs with `wow_mode=0`, so the plug simply drops out when
> the machine suspends.
>
> Interactive version (hover a lever, drag the weight to rewind, `1`–`4` to trip, `Space` to hold the
> pawl): `figures/fig-power-light.html`.

Default timings on our device (from `/etc/kdb` powerd config; see `08`) `[dev]`:

- **`t1_timeout`** — **600 s**. Active → Screen Saver.
- **`t2_timeout`** — **60 s**. Screen Saver → Ready-to-suspend (then suspend).
- **`min_suspend_time`** — 90 s. Minimum time to stay suspended.
- **`shutdown_grace_timeout`** — 180 s. Grace before a forced shutdown path.
- **`r2s_grace_timeout`** — 5 s. "ready to suspend" grace window.
- **`batt_check_interval`** — 30 s. Battery polling.
- **`process_interval`** — 20 s. State-machine tick.
- **`POWERBUTTON`** — `max77696-onkey.0`. The key that maps to the power button.

Observable live state `[dev]`:

```
$ lipc-get-prop com.lab126.powerd state
active
$ lipc-get-prop com.lab126.powerd status
Powerd state: Active
Remaining time in this state: 356.215064
defer_suspend:0     suspend_grace:0     prevent_screen_saver:0
drive_mode_state:1
PRIMARY BATTERY
Battery Level: 55%
Last batt event at: 55%
Charging: No
```

Two things to internalise:

1. **After ~10 minutes idle the screen blanks, and ~1 minute later the device suspends.** When it
   suspends, Wi-Fi dies and the device is unreachable (our SSH "host down"). This is *normal*, not a
   crash.
2. The device is *designed* to spend most of its life suspended. A good frontend leans into that.

## 6.3 The LIPC control surface (this is how you hold the device awake)

`com.lab126.powerd` `[dev]`:

- **`state`** — read. `active`, etc.
- **`status`** — read. Multi-line human-readable state.
- **`battLevel`** — read. User-facing percentage (use this).
- **`battStateInfo`** — read. JSON detail.
- **`battTemperature`** — read. E.g. `89`.
- **`isCharging`, `isLowTempState`** — read.
- **`flIntensity`** — read. Frontlight level **0–25**.
- **`flMaxIntensity`** — read. `25`.
- **`flRawIntensity`** — read. Raw 12-bit (e.g. `78` of 4095).
- **`flTurboBrightnessIntensity`** — read.
- **`flAuto`** — read/write. Auto-brightness (no ALS present → of limited use).
- **`preventScreenSaver`** — **read/write**. **Hold-awake flag — set 1 while a foreground app runs**.
- **`disableScreenOff`** — **read/write**. Additional screen-off suppression.
- **`touchScreenSaverTimeout`** — **write**. Extend/reset the screen-saver timer on interaction.
- **`deferSuspend`, `abortSuspend`, `suspendGrace`, `deferRestart`** — write. Request deferrals/abort.
- **`wakeUp`, `sendPendingResume`** — write. Force wake / resume plumbing.
- **`powerButton`, `deviceRestart`** — write. Synthetic power actions.
- **`rtcWakeup`, `rtcWakeup2`** — write. **RTC alarm wake**.
- **`addSuspendLevels`, `flStartup`** — write.

**The practical recipe** for a foreground app that must not be screensavered/suspended:

- `lipc-set-prop com.lab126.powerd preventScreenSaver 1` — **hold awake**.
- … run the app …
- `lipc-set-prop com.lab126.powerd preventScreenSaver 0` — **release** (always, including on exit).

and, better, *also* bump `touchScreenSaverTimeout` on real user interaction so the ordinary
inactivity policy still applies when the user walks away.

> **Trap-and-release discipline is mandatory.** If your process sets `preventScreenSaver=1` and dies
> without clearing it, the device will not sleep and will drain flat. Clear it in an exit handler.

## 6.4 Suspend, wake sources, and the RTC

**Wake sources** `[RE/documented]`/`[dev]`:

1. **Power button** — `max77696-onkey` → `KEY_POWER`; the canonical resume.
2. **Hall sensor (cover open)** — `wario_hall`, `hall_trig_wkup=1`; opening the cover wakes it.
3. **RTC alarm** — three RTCs exist (`rtc0`/`rtc1` max77696, `rtc2` snvs); two support alarms.
   Exposed as `rtcWakeup`/`rtcWakeup2` LIPC. This is how a device might wake *itself* on a schedule.
4. **Touch** — the touch controller can wake the system (this is why "tap the screen to wake"
   works for us over SSH-liveness testing).

Sysfs: `/sys/power/state` = `standby mem` (so **suspend-to-RAM is available**; there is **no
hibernation** and **no swap/zram** — `/proc/swaps` is empty `[dev]`).

Because `ath6kl` runs with `wow_mode=0`, **there is no wake-on-Wi-Fi**. Consequences: the network is
gone during suspend; a network fetch must finish before the device sleeps, or be resumed on wake;
and "always-on connectivity" is not a thing on this device.

### The "wake schedule" idea

The Rust precedent (`slint-kindle-backend`, `09`) does something clever and worth stealing
conceptually: it **lets the SoC suspend between refreshes**, waking on input or a timer, rather than
staying awake at a high idle. On a device whose whole value proposition is a month of battery, an
application that is *event-driven and sleeps aggressively* is not just polite — it is the only way
to be a good citizen. (Whether to suspend the whole system or merely idle is a policy choice; the
kernel-side facility is there, and `powerd` will do it for you if you simply stop holding it awake.)

## 6.5 Battery: reporting you can trust

Three sources, in order of trust `[dev]`:

1. **`lipc-get-prop com.lab126.powerd battLevel`** — user-facing percentage (`55`). Stable, correct
   for UI. Prefer this.
2. **`/sys/devices/system/wario_battery/wario_battery0/`** — Maxim **ModelGauge** state:
   `battery_mAH=780`, `battery_lmd_mAH=1408`, `battery_temperature=89`, `battery_cycle=38`,
   `fg_cdata_check = *** Data Valid ***`. Use for *engineering* views (real mAh, temperature,
   cycles).
3. **`/sys/class/power_supply/max77696-battery/`** — driver-decoded, **units inconsistent**
   (`charge_full=1408` vs `charge_full_design=790000`, mAh vs µAh mixed). **Do not** build UI on
   this.

`powerd` logs a battery line at suspend, which is a handy ground truth from `dmesg` `[dev]`:

```
KERNEL: I pmic:fg suspend battinfo:current=-18mA, volt=3850mV, capav=059%, mAh=830mAh
```

## 6.6 The frontlight

The frontlight is a separate, well-exposed subsystem (not the e-ink panel itself — it is an LED
light-guide layer over the Carta panel):

- **`/sys/class/backlight/max77696-bl/brightness`** — 0–4095. Raw 12-bit PWM.
- **`/sys/class/leds/max77696-leds.0`** — 0–127. LED string 0.
- **`/sys/class/leds/max77696-leds.1`** — 0–127. LED string 1.
- **LIPC `flIntensity`** — **0–25**. The user-facing scale.
- **LIPC `flRawIntensity`** — 0–4095. The raw value the UI scale maps to.
- **`flMaxIntensity`** — 25.

A launcher can drive it either directly (sysfs/`/dev/frontlight` misc 10:162) or, preferably,
**through `powerd`'s `flIntensity`** so the value stays consistent with the system/status bar and
survives across apps. Frontlight is the one "sensor-like" output the device has; treat it as a
first-class control.

## 6.7 Thermal: there isn't any (except for the panel)

`/sys/class/thermal` is **empty** and `CONFIG_THERMAL` is **not set** `[dev]`. There is **no IIO
subsystem**. The only temperature in the system is:

- `mxc_epdc_temperature` (EPDC waveform input) `[dev]`.
- `com.lab126.system displayTemperature` `[dev]`.

So there is no thermal throttling surface to react to, and no thermal-health API to display. The
battery gauge reports its own `battery_temperature`, which is the closest thing to "device
temperature" a UI could show.

## 6.8 The config DB, and the interplay with `/proc/bd`

`powerd` (and others) read configuration from the **kdb** database under `/etc/kdb` (with a
read-only source at `/etc/kdb.src`, mounted from a squashfs `[dev]`). The exact key set is
`[forum/uncertain]` (the name collides with the kernel debugger in searches), but the *timings*
above are the parameters that matter and are inspectable on-device.

Meanwhile the kernel's `/proc/bd` carries boot/framework bookkeeping (`02`, `03`) — `framework_*`,
`update_flag`, `rcs_flags`. A frontend that changes power behaviour should leave `/proc/bd` alone.

## 6.9 What this means for kernink

1. **Hold awake deliberately, release reliably.** `preventScreenSaver` with an exit trap.
2. **Reset the inactivity timer on real interaction** (`touchScreenSaverTimeout`), so that "user is
   reading" and "user walked away" are distinguished.
3. **Embrace suspend.** Do not fight it; wake on touch/hall/button/RTC. Design for a device that is
   asleep 95 % of the time.
4. **Expect the network to vanish.** Any online feature must be resumable and tolerant.
5. **Use `powerd` for the frontlight and battery**, `wario_battery` for engineering detail, and
   **never** the inconsistent `max77696-battery` units.
6. **Cover close/open is a gesture and a power event at once** — wire it into both.
7. **The power button is shared.** Any "power button = home" behaviour (`12`) must negotiate with
   `powerd`, or it will double-fire.
