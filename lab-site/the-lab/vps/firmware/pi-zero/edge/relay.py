"""Strike-relay actuator (S4b-3) — the edge's fail-secure door strike.

The edge node holds the door strike (the broker is a container with no GPIO, door-controller-wifi.md §2).
The fail-secure invariant (§3a): the strike is **de-energized/locked at rest** and energizes ONLY for a
brief pulse on a validated grant. Every driver here de-energizes at construction and on `close()`/exit, so
a crash or shutdown leaves the door locked, never held open.

`EdgeRuntime.pulse()` calls `relay.pulse()`; the runtime only calls it after a grant (online or the
signature-verified rung-3 offline decision) — the relay never decides access. UI/LED/buzzer feedback is a
separate concern (`ui.py`, wired in `run_edge`): this module drives ONLY the strike, single-responsibility.

Drivers:
  - `GpioRelay`  — real strike via `gpiozero.OutputDevice` (lazy-imported; only on a Pi). Supports
    active-high or active-low wiring; `initial_value=False` = de-energized.
  - `ConsoleRelay` / `MockRelay` — headless bench / tests (records pulses); no hardware.
"""

import threading


class Relay:
    """Interface: `pulse()` energizes the strike briefly; `close()` guarantees it is de-energized."""

    def pulse(self):
        """Energize the strike for the configured hold, then de-energize. Fail-secure on any error."""
        raise NotImplementedError

    def close(self):
        """De-energize and release the pin (idempotent). Called on graceful shutdown."""
        raise NotImplementedError


class MockRelay(Relay):
    """Test/bench driver: counts pulses, drives no hardware. Never holds the strike."""

    def __init__(self):
        self.pulses = 0
        self.closed = False

    def pulse(self):
        self.pulses += 1

    def close(self):
        self.closed = True


class ConsoleRelay(MockRelay):
    """Headless bring-up driver: prints the pulse (still no hardware). Extends MockRelay so bench tests
    can still assert `pulses`."""

    def __init__(self, cfg=None):
        super().__init__()
        self._hold_s = (cfg or {}).get("hold_s", 3)

    def pulse(self):
        super().pulse()
        print("[RELAY] STRIKE PULSE (%ss)" % self._hold_s)


class GpioRelay(Relay):
    """Real strike via gpiozero. Energizes for `hold_s` then de-energizes. De-energized at construction
    and on `close()` (fail-secure). A per-relay lock prevents overlapping pulses."""

    def __init__(self, cfg):
        # Lazy import so the module loads on a dev box without the GPIO lib; a missing lib on a driver
        # explicitly set to "gpio" is fail-LOUD (we must not silently no-op a real strike — that would
        # look like a working door that never opens, or worse mask a wiring fault).
        from gpiozero import OutputDevice

        pin = cfg["strike_pin"]
        # Bound the energize time (L2): an over-long hold could leave the strike open past the systemd
        # WatchdogSec/TimeoutStopSec SIGKILL, defeating fail-secure. Fail LOUD on a misconfig rather than
        # silently energizing a real strike for minutes.
        hold = cfg.get("hold_s", 3)
        if not isinstance(hold, (int, float)) or isinstance(hold, bool) or hold <= 0 or hold > 10:
            raise ValueError("relay hold_s must be a number in (0, 10] seconds (got %r)" % (hold,))
        self._hold_s = hold
        # active_high maps our logical energize→physical level. initial_value=False = de-energized at rest.
        self._dev = OutputDevice(pin, active_high=cfg.get("active_high", True), initial_value=False)
        self._lock = threading.Lock()

    def pulse(self):
        import time

        with self._lock:  # never overlap pulses; a second scan waits for the strike to settle
            try:
                self._dev.on()          # energize
                time.sleep(self._hold_s)
            finally:
                self._dev.off()         # de-energize on every path (fail-secure even if interrupted)

    def close(self):
        try:
            self._dev.off()
            self._dev.close()
        except Exception:  # noqa: BLE001 — teardown best-effort; the pin defaults low on release anyway
            pass


def make_relay(cfg):
    """Factory: build the strike relay from the `relay` config block. Defaults to the console driver so a
    headless bench run works. `driver: "gpio"` fails loudly if gpiozero is missing (see `GpioRelay`)."""
    relay_cfg = cfg.get("relay", {})
    driver = relay_cfg.get("driver", "console")
    if driver == "gpio":
        return GpioRelay(relay_cfg)
    if driver == "mock":
        return MockRelay()
    if driver == "console":
        return ConsoleRelay(relay_cfg)
    raise ValueError("unknown relay.driver: %s" % driver)
