"""Pi Zero ⇄ Pico UART link — newline-delimited JSON (mirror of the Pico's ZeroLink).

See ../protocol.md (Link 2). The Zero sends `scan`/`ping`; it receives `result`/`status`.
"""

import json

try:
    import serial  # pyserial — present on the real Pi Zero
except ImportError:  # allow import on a dev box without pyserial (mock/testing)
    serial = None


class PicoLink:
    """Serial link to the Pico. Use as a context manager or call open()/close()."""

    def __init__(self, port, baud=115200, timeout=0.2):
        """Configure (do not open) the link. `port` e.g. /dev/serial0."""
        if serial is None:
            raise RuntimeError("pyserial not installed — cannot open a real UART link")
        self._port = port
        self._baud = baud
        self._timeout = timeout
        self._ser = None
        self._buf = b""

    def open(self):
        """Open the serial port."""
        self._ser = serial.Serial(self._port, self._baud, timeout=self._timeout)
        return self

    def close(self):
        """Close the serial port (best-effort)."""
        if self._ser:
            try:
                self._ser.close()
            except Exception:
                pass

    def __enter__(self):
        return self.open()

    def __exit__(self, *_):
        self.close()

    def send(self, obj):
        """Write one JSON object + newline to the Pico."""
        self._ser.write((json.dumps(obj) + "\n").encode())

    def scan(self, cred):
        """Forward a scanned credential to the Pico."""
        self.send({"t": "scan", "cred": cred})

    def read_line(self, block_ms=200):
        """Return one parsed JSON object from the Pico, or None if none is ready within the read timeout."""
        data = self._ser.read(256)
        if data:
            self._buf += data
        nl = self._buf.find(b"\n")
        if nl < 0:
            return None
        line, self._buf = self._buf[:nl], self._buf[nl + 1:]
        try:
            return json.loads(line)
        except Exception:
            return None
