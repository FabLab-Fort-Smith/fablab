"""Link-A mTLS uplink client (S4b-3) — the edge dials the on-site broker.

The edge is the mTLS **client**: it opens a single persistent TLS socket to the broker (`broker-server.js`
`startEdgeListener`) using its own CA-issued client cert/key, and **verifies the broker's server cert
against the INTERNAL CA** (never public roots — Link A is the internal LAN boundary, door-controller-wifi.md
§3a/§5). Newline-delimited JSON framing via `protocol.py` (the byte-exact contract shared with the broker).

`BrokerUplink` satisfies the two collaborators `EdgeRuntime` needs:
  - ``authorize(door_id, code) -> {"granted": bool, "reason": str} | None`` — send a `scan`, read the
    `result`, correlate it to the request we sent. **None means the broker is unreachable** (so the
    runtime falls to its rung-3 offline decision); a definite grant/deny is returned as a dict.
  - ``send_audit(line) -> ack_line: str | None`` — send an already-framed signed `audit` line, return the
    broker's raw `audit_ack` line (the runtime matches its own `batchId`), or None if unreachable.

**Fail-secure is absolute:** any socket/TLS/parse/timeout error closes the connection and returns None —
it NEVER raises out and NEVER laundered a malformed reply into a grant (`parse_result` is deny-by-default).
Pure stdlib `ssl` + `socket` (no new device dependency). The scanned ``code`` is Restricted/PII — it is
only ever placed inside the framed scan bytes sent over mTLS; it is never logged, stored, or returned.
"""

import json
import socket
import ssl
import time
import uuid

from .protocol import build_scan_msg, parse_result

_MAX_LINE_BYTES = 64 * 1024  # bound a newline-less server flood (CWE-400); a real reply is tiny
_RECV_CHUNK = 4096


class BrokerUplink:
    """A lazily-connected, auto-reconnecting mTLS line client to the broker's Link-A listener.

    One instance owns one socket; call `authorize`/`send_audit` from a single thread (the supervisor
    loop). `connected` lets the supervisor decide reconnect-vs-flush. Construction does no I/O — the TLS
    context is built eagerly (so a misconfigured cert/key path fails loudly at startup) but the socket is
    opened on the first `connect()`.
    """

    def __init__(self, *, host, port, cert_path, key_path, ca_path,
                 connect_timeout_s=5.0, read_timeout_s=3.0, log=lambda *a, **k: None):
        """@param host  the broker IP the edge dials — also the TLS `server_hostname`, so the broker's
            IP-SAN cert verifies against the internal CA (door-controller-wifi.md §3a).
        @param cert_path/key_path  this edge's CA-issued client cert + private key (mTLS).
        @param ca_path  the pinned INTERNAL CA root used to verify the broker server cert.
        @param connect_timeout_s  TCP+TLS handshake timeout. @param read_timeout_s  per-op reply budget.
        """
        self._host = host
        self._port = int(port)
        self._connect_timeout = float(connect_timeout_s)
        self._read_timeout = float(read_timeout_s)
        self._log = log
        self._sock = None      # the live ssl.SSLSocket, or None when disconnected
        self._buf = b""        # partial-line receive buffer (reset on every (re)connect)
        # Build the client-side TLS context once. PROTOCOL_TLS_CLIENT defaults to check_hostname=True and
        # verify_mode=CERT_REQUIRED — we assert them explicitly rather than rely on the default. The CA
        # root is the internal CA (pinned): the broker's server cert must chain to it (NOT public roots).
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        ctx.load_verify_locations(cafile=ca_path)   # pin the internal CA — reject anything it didn't sign
        ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)  # present the edge client cert (mTLS)
        self._ctx = ctx

    @property
    def connected(self):
        """True iff a live TLS socket is currently held (the supervisor's reconnect signal)."""
        return self._sock is not None

    def connect(self):
        """(Re)establish the mTLS socket. Idempotent, never raises — returns True on success, False on any
        failure (so the supervisor paces reconnects via backoff). `server_hostname=host` makes the broker's
        IP-SAN cert verify under the internal CA."""
        if self._sock is not None:
            return True
        raw = None
        try:
            raw = socket.create_connection((self._host, self._port), timeout=self._connect_timeout)
            tls = self._ctx.wrap_socket(raw, server_hostname=self._host)  # verifies the broker cert vs CA
            self._sock = tls
            self._buf = b""
            self._log("uplink.connected", {"host": self._host, "port": self._port})
            return True
        except (OSError, ssl.SSLError) as e:  # DNS/TCP/handshake/cert-verify failure → stay disconnected
            if raw is not None:
                try:
                    raw.close()
                except OSError:
                    pass
            self._log("uplink.connect-failed", {"reason": e.__class__.__name__})
            self._sock = None
            return False

    def close(self):
        """Close the socket if open (graceful shutdown / after any error). Never raises."""
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self._sock = None
        self._buf = b""

    def authorize(self, door_id, code):
        """Ask the broker to authorize a scan. Returns {"granted","reason"} on a correlated reply, or
        None when the broker is unreachable / the reply can't be trusted (→ runtime rung-3 fallback).

        Correlates the reply to the request by `requestId` (which the broker echoes). A fresh `nonce` is
        also sent (the broker's replay guard dedups on requestId+nonce); the broker does NOT echo the
        nonce, so if a reply *does* carry a nonce it must match — a mismatch is a desync → treat as no
        answer. The `code` never leaves this method except inside the mTLS-framed scan bytes.
        """
        if not self.connect():
            return None
        request_id = uuid.uuid4().hex
        nonce = uuid.uuid4().hex
        line = build_scan_msg(door_id=door_id, code=code, request_id=request_id, nonce=nonce)
        if not self._send(line):
            return None  # _send already closed the socket on failure
        deadline = time.monotonic() + self._read_timeout
        while True:
            raw = self._recv_line(deadline)
            if raw is None:
                self.close()  # timeout / EOF / oversize / socket error → unreachable, fail-secure
                return None
            # Skip non-`result` frames (a stray audit_ack/pong from an earlier op) without ending the read.
            try:
                probe = json.loads(raw)
            except (ValueError, TypeError):
                self.close()
                return None
            if not isinstance(probe, dict) or probe.get("t") != "result":
                continue
            res = parse_result(raw)  # deny-by-default on a malformed grant shape
            if res is None:
                self.close()
                return None
            # Correlate: requestId must match; a present-but-different nonce is a desync (fail-secure).
            if res.get("requestId") != request_id:
                self.close()
                return None
            reply_nonce = res.get("nonce")
            if reply_nonce is not None and reply_nonce != nonce:
                self.close()
                return None
            return {"granted": res["granted"] is True, "reason": res.get("reason")}

    def send_audit(self, line):
        """Send an already-framed, edge-signed `audit` line and return the broker's raw `audit_ack` line
        (the caller matches its own `batchId` before advancing its ack cursor), or None if unreachable.
        Fail-secure: any error → close + None (the edge keeps the records and retries — never a false ack).
        """
        if not self.connect():
            return None
        if not self._send(line if line.endswith("\n") else line + "\n"):
            return None
        deadline = time.monotonic() + self._read_timeout
        while True:
            raw = self._recv_line(deadline)
            if raw is None:
                self.close()
                return None
            try:
                probe = json.loads(raw)
            except (ValueError, TypeError):
                self.close()
                return None
            if not isinstance(probe, dict):
                self.close()
                return None
            if probe.get("t") != "audit_ack":
                continue  # skip a stray result/pong; keep reading for our ack
            return raw  # hand the raw line back; the runtime parses + batchId-matches it

    def _send(self, line):
        """Write a framed line. Returns True on success; on any error closes the socket + returns False."""
        if self._sock is None:
            return False
        try:
            self._sock.sendall(line.encode("utf-8"))
            return True
        except (OSError, ssl.SSLError):
            self.close()
            return False

    def _recv_line(self, deadline):
        """Read one newline-terminated line (newline stripped) before `deadline` (monotonic seconds).
        Returns the decoded str, or None on timeout / EOF / oversize / any socket error. Buffers any
        bytes past the newline for the next call."""
        while True:
            nl = self._buf.find(b"\n")
            if nl >= 0:
                raw = self._buf[:nl]
                self._buf = self._buf[nl + 1:]
                try:
                    return raw.decode("utf-8")
                except UnicodeDecodeError:
                    return None
            if len(self._buf) > _MAX_LINE_BYTES:
                self._log("uplink.line-overflow", {})  # a newline-less flood — drop the connection
                return None
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            if self._sock is None:
                return None
            try:
                self._sock.settimeout(remaining)
                chunk = self._sock.recv(_RECV_CHUNK)
            except (socket.timeout, ssl.SSLWantReadError):
                return None
            except (OSError, ssl.SSLError):
                return None
            if not chunk:  # EOF — the broker closed the connection
                return None
            self._buf += chunk
