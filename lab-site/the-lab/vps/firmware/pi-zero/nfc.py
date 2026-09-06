"""NFC reader abstraction for the Pi Zero.

The concrete reader hardware varies (PN532 over I2C/SPI/UART, MFRC522 over SPI, ...), so the
door logic depends only on `NfcReader.read_uid()`. Pick the driver via config `nfc.driver`.
A `mock` driver lets the door software run and be tested without hardware.

read_uid() returns the card code as a str, or None if no card is present this poll.
"""


class NfcReader:
    """Interface every driver implements."""

    def read_uid(self):
        """Return the current card UID/code as str, or None if no card is presented."""
        raise NotImplementedError


class MockReader(NfcReader):
    """Test/dev driver. Replays codes from a list, or reads them from a file/queue."""

    def __init__(self, codes=None):
        """`codes` is an iterable of strings; each read_uid() yields the next, then None forever."""
        self._codes = list(codes or [])
        self._i = 0

    def read_uid(self):
        if self._i < len(self._codes):
            code = self._codes[self._i]
            self._i += 1
            return code
        return None


class PN532Reader(NfcReader):
    """Adafruit PN532 (I2C) driver. Requires `adafruit-circuitpython-pn532` + board/busio."""

    def __init__(self, cfg):
        # Lazy import so the module loads on a box without the hardware libs.
        import board
        import busio
        from adafruit_pn532.i2c import PN532_I2C

        i2c = busio.I2C(board.SCL, board.SDA)
        self._pn = PN532_I2C(i2c, debug=False)
        self._pn.SAM_configuration()
        self._timeout = cfg.get("read_timeout", 0.5)

    def read_uid(self):
        uid = self._pn.read_passive_target(timeout=self._timeout)
        if uid is None:
            return None
        # Normalize to a stable hex string (matches how codes are enrolled).
        return "".join("%02X" % b for b in uid)


def make_reader(cfg):
    """Factory: build the NFC reader from the `nfc` config block. Defaults to the mock driver."""
    nfc_cfg = cfg.get("nfc", {})
    driver = nfc_cfg.get("driver", "mock")
    if driver == "pn532":
        return PN532Reader(nfc_cfg)
    if driver == "mock":
        return MockReader(nfc_cfg.get("codes"))
    raise ValueError("unknown nfc.driver: %s" % driver)
