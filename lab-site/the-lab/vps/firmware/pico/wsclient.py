"""Minimal RFC 6455 WebSocket client for MicroPython (Pico W).

MicroPython has no built-in WebSocket, so this implements just enough of the client side:
the HTTP Upgrade handshake, client-masked TEXT frames out, and framed reads in (TEXT plus the
CLOSE/PING/PONG control frames). It is deliberately small — the door protocol only exchanges
short JSON text frames (see ../protocol.md).

Security: `wss://` only (TLS via ssl.wrap_socket). Callers must not pass secrets through the URL.
"""

import socket
import ssl
import struct
import os
import binascii


class WSError(Exception):
    """Raised on handshake failure or a protocol/transport error."""


_OP_TEXT = 0x1
_OP_CLOSE = 0x8
_OP_PING = 0x9
_OP_PONG = 0xA


def _parse_url(url):
    """Split a ws(s):// URL into (secure, host, port, path). Raises WSError on a bad scheme."""
    if url.startswith("wss://"):
        secure, rest = True, url[6:]
    elif url.startswith("ws://"):
        secure, rest = False, url[5:]
    else:
        raise WSError("URL must start with ws:// or wss://")
    slash = rest.find("/")
    host_port = rest if slash < 0 else rest[:slash]
    path = "/" if slash < 0 else rest[slash:]
    if ":" in host_port:
        host, port = host_port.split(":", 1)
        port = int(port)
    else:
        host, port = host_port, (443 if secure else 80)
    return secure, host, port, path


class WebSocket:
    """A single client WebSocket connection. Not thread-safe (single-loop firmware use)."""

    def __init__(self, url, connect_timeout=10):
        """Open and upgrade a connection to `url`. Blocks up to `connect_timeout` seconds."""
        secure, host, port, path = _parse_url(url)
        addr = socket.getaddrinfo(host, port)[0][-1]
        sock = socket.socket()
        sock.settimeout(connect_timeout)
        sock.connect(addr)
        if secure:
            # server_hostname enables SNI where the port supports it; ignored if unavailable.
            try:
                sock = ssl.wrap_socket(sock, server_hostname=host)
            except TypeError:
                sock = ssl.wrap_socket(sock)
        self._sock = sock
        self._handshake(host, port, path)

    def _handshake(self, host, port, path):
        """Perform the HTTP Upgrade handshake; raise WSError unless the server returns 101."""
        key = binascii.b2a_base64(os.urandom(16)).strip().decode()
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ) % (path, host, port, key)
        self._sock.write(req.encode())
        # Read the response headers up to the blank line.
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self._sock.read(1)
            if not chunk:
                raise WSError("connection closed during handshake")
            resp += chunk
            if len(resp) > 2048:
                raise WSError("handshake response too large")
        status = resp.split(b"\r\n", 1)[0]
        if b"101" not in status:
            raise WSError("handshake failed: %s" % status)

    def send(self, data):
        """Send `data` (str or bytes) as one masked TEXT frame."""
        if isinstance(data, str):
            data = data.encode()
        length = len(data)
        header = bytearray()
        header.append(0x80 | _OP_TEXT)  # FIN + text
        # Client frames MUST be masked (0x80 on the length byte).
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytearray(length)
        for i in range(length):
            masked[i] = data[i] ^ mask[i & 3]
        self._sock.write(bytes(header) + bytes(masked))

    def _read_exact(self, n):
        """Read exactly n bytes or raise WSError if the peer closes early."""
        buf = b""
        while len(buf) < n:
            chunk = self._sock.read(n - len(buf))
            if not chunk:
                raise WSError("connection closed")
            buf += chunk
        return buf

    def recv(self, timeout=None):
        """Return the next TEXT message as str, or None on timeout.

        Answers PINGs with PONGs transparently and raises WSError on a CLOSE frame. Only complete,
        unfragmented text frames are returned (sufficient for the door protocol).
        """
        self._sock.settimeout(timeout)
        try:
            b0 = self._sock.read(1)
        except OSError:
            return None  # timeout / would-block
        if not b0:
            raise WSError("connection closed")
        b0 = b0[0]
        opcode = b0 & 0x0F
        b1 = self._read_exact(1)[0]
        length = b1 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._read_exact(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._read_exact(8))[0]
        payload = self._read_exact(length) if length else b""

        if opcode == _OP_CLOSE:
            raise WSError("server closed connection")
        if opcode == _OP_PING:
            self._send_control(_OP_PONG, payload)
            return None
        if opcode == _OP_PONG:
            return None
        if opcode == _OP_TEXT:
            return payload.decode()
        return None  # ignore continuation/binary — unused by this protocol

    def _send_control(self, opcode, payload=b""):
        """Send a masked control frame (payload must be < 126 bytes per RFC 6455)."""
        header = bytearray([0x80 | opcode, 0x80 | len(payload)])
        mask = os.urandom(4)
        header += mask
        masked = bytes(payload[i] ^ mask[i & 3] for i in range(len(payload)))
        self._sock.write(bytes(header) + masked)

    def close(self):
        """Best-effort CLOSE + socket teardown; never raises."""
        try:
            self._send_control(_OP_CLOSE)
        except Exception:
            pass
        try:
            self._sock.close()
        except Exception:
            pass
