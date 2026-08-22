"""Door UI abstraction for the Pi Zero — shows Authorized / Unauthorized and link state.

Default drivers: a console UI (always available) and an optional GPIO LED/buzzer UI (gpiozero).
Concrete presentation (LCD, RGB, buzzer patterns) can be swapped without touching door logic.
"""


class DoorUI:
    """Interface: the reader loop calls these; drivers render however the hardware allows."""

    def authorized(self, mode=None):
        """Show an ALLOW result (green/beep). `mode` is 'online' | 'offline'."""
        raise NotImplementedError

    def denied(self, reason=None):
        """Show a DENY result (red/buzz)."""
        raise NotImplementedError

    def idle(self):
        """Return to the resting state (ready to scan)."""
        raise NotImplementedError

    def offline(self, connecting=False):
        """Indicate the door is offline / reconnecting."""
        raise NotImplementedError


class ConsoleUI(DoorUI):
    """Prints state to stdout. Always works; useful for dev and headless bring-up."""

    def authorized(self, mode=None):
        print("[UI] AUTHORIZED%s" % (" (offline)" if mode == "offline" else ""))

    def denied(self, reason=None):
        print("[UI] UNAUTHORIZED%s" % (" — " + reason if reason else ""))

    def idle(self):
        print("[UI] ready")

    def offline(self, connecting=False):
        print("[UI] %s" % ("connecting..." if connecting else "OFFLINE"))


class GpioUI(DoorUI):
    """Green/red LED + buzzer via gpiozero. Falls back to console if gpiozero is missing."""

    def __init__(self, cfg):
        from gpiozero import LED, Buzzer  # lazy — only on the Pi

        self._green = LED(cfg["green_pin"])
        self._red = LED(cfg["red_pin"])
        self._buzzer = Buzzer(cfg["buzzer_pin"]) if cfg.get("buzzer_pin") is not None else None
        self._hold = cfg.get("hold_s", 2)
        self.idle()

    def _flash(self, led, beep=False):
        import time

        self._green.off()
        self._red.off()
        led.on()
        if beep and self._buzzer:
            self._buzzer.on()
            time.sleep(0.15)
            self._buzzer.off()
        time.sleep(self._hold)
        self.idle()

    def authorized(self, mode=None):
        self._flash(self._green, beep=True)

    def denied(self, reason=None):
        self._flash(self._red, beep=True)

    def idle(self):
        self._green.off()
        self._red.off()

    def offline(self, connecting=False):
        # Steady red = offline. (Reader loop still functions via the Pico's offline fallback.)
        self._green.off()
        self._red.on()


def make_ui(cfg):
    """Factory: build the UI from the `ui` config block. Defaults to the console UI."""
    ui_cfg = cfg.get("ui", {})
    driver = ui_cfg.get("driver", "console")
    if driver == "gpio":
        try:
            return GpioUI(ui_cfg)
        except Exception as e:  # missing lib / not on a Pi → degrade, don't crash the door
            print("[UI] gpio unavailable (%s); using console" % e)
            return ConsoleUI()
    return ConsoleUI()
