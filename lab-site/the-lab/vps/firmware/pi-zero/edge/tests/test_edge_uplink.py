"""S4b-3 BrokerUplink — the edge's Link-A mTLS client, proven against a throwaway in-process mTLS server
that speaks the broker's newline-JSON framing (openssl-minted certs, mirroring test/unit/vpsBrokerTls.test.js).

Asserts, fail-secure end to end:
  - authorize() returns the broker's grant on a reply whose requestId matches the scan we sent;
  - a mismatched requestId, a malformed reply, or a timeout → None (never a grant → offline fallback);
  - the client verifies the broker's server cert against the pinned CA — a rogue (non-CA) server → None,
    never a grant;
  - the scanned code is never logged (the log sink is captured and searched);
  - send_audit() returns the raw audit_ack line; unreachable → None.

Self-skips if openssl is unavailable.
"""

import json
import os
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time

import pytest

from edge.uplink_client import BrokerUplink

pytestmark = pytest.mark.skipif(shutil.which("openssl") is None, reason="openssl unavailable")

CODE = "SUPERSECRET-CARD-CODE-0xDEADBEEF"  # a distinctive code we assert never appears in logs


# --- certificate authority + leaf minting (openssl) ------------------------------------------------
def _mint_certs(d):
    """Mint a CA, a broker server cert with an IP:127.0.0.1 SAN, an edge client cert, and a rogue
    self-signed server cert (NOT chained to the CA). Returns True on success."""
    def ossl(*args):
        subprocess.run(["openssl", *args], cwd=d, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def key(n):
        ossl("genpkey", "-algorithm", "ed25519", "-out", f"{n}.key")

    def self_signed(n, cn, san=None):
        args = ["req", "-x509", "-key", f"{n}.key", "-out", f"{n}.crt", "-subj", f"/CN={cn}", "-days", "1"]
        if san:
            ext = os.path.join(d, f"{n}.ext")
            with open(ext, "w") as f:
                f.write(f"subjectAltName={san}\n")
            args += ["-extensions", "v3_req", "-addext", f"subjectAltName={san}"]
        ossl(*args)

    def signed(n, cn, san=None):
        ossl("req", "-new", "-key", f"{n}.key", "-subj", f"/CN={cn}", "-out", f"{n}.csr")
        args = ["x509", "-req", "-in", f"{n}.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
                "-out", f"{n}.crt", "-days", "1", "-CAcreateserial"]
        if san:
            ext = os.path.join(d, f"{n}.ext")
            with open(ext, "w") as f:
                f.write(f"subjectAltName={san}\n")
            args += ["-extfile", ext]
        ossl(*args)

    try:
        key("ca"); self_signed("ca", "test-door-ca")
        key("broker"); signed("broker", "broker", san="IP:127.0.0.1")   # server cert, IP-SAN
        key("edge"); signed("edge", "edge-front-01")                     # edge client cert
        key("rogue"); self_signed("rogue", "rogue", san="IP:127.0.0.1")  # NOT signed by our CA
        return True
    except (subprocess.CalledProcessError, OSError):
        return False


# --- a tiny in-process mTLS broker that speaks the Link-A framing -----------------------------------
class _FakeBroker:
    """Serves one connection at a time over mTLS, reading newline-JSON and replying per `behavior`."""

    def __init__(self, certdir, *, behavior="grant", use_rogue=False):
        self.certdir = certdir
        self.behavior = behavior
        self.use_rogue = use_rogue
        self.received = []  # raw request lines the server saw (to assert the code did cross the wire)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        cert = "rogue" if use_rogue else "broker"
        ctx.load_cert_chain(os.path.join(certdir, f"{cert}.crt"), os.path.join(certdir, f"{cert}.key"))
        if not use_rogue:
            ctx.verify_mode = ssl.CERT_REQUIRED  # demand the edge client cert (mTLS)
            ctx.load_verify_locations(os.path.join(certdir, "ca.crt"))
        self._ctx = ctx
        self._sock = socket.socket()
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind(("127.0.0.1", 0))
        self._sock.listen(4)
        self.port = self._sock.getsockname()[1]
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._serve, daemon=True)
        self._t.start()

    def _reply_for(self, msg):
        if msg.get("t") == "scan":
            if self.behavior == "grant":
                return {"t": "result", "requestId": msg.get("requestId"), "granted": True, "reason": "granted", "mode": "online"}
            if self.behavior == "deny":
                return {"t": "result", "requestId": msg.get("requestId"), "granted": False, "reason": "no-window", "mode": "online"}
            if self.behavior == "mismatch":
                return {"t": "result", "requestId": "WRONG-ID", "granted": True, "reason": "granted", "mode": "online"}
            if self.behavior == "malformed":
                return {"t": "result", "requestId": msg.get("requestId"), "granted": "yes", "reason": "x"}  # non-bool grant
            if self.behavior == "silent":
                return None
        if msg.get("t") == "audit":
            return {"t": "audit_ack", "batchId": msg.get("batchId"), "status": "accepted"}
        return None

    def _serve(self):
        self._sock.settimeout(0.3)
        while not self._stop.is_set():
            try:
                raw, _ = self._sock.accept()
            except (OSError, socket.timeout):
                continue
            try:
                conn = self._ctx.wrap_socket(raw, server_side=True)
            except (ssl.SSLError, OSError):
                try:
                    raw.close()
                except OSError:
                    pass
                continue
            try:
                conn.settimeout(1.0)
                buf = b""
                while not self._stop.is_set():
                    try:
                        chunk = conn.recv(4096)
                    except (ssl.SSLError, OSError):
                        break
                    if not chunk:
                        break
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        if not line:
                            continue
                        self.received.append(line.decode("utf-8"))
                        try:
                            msg = json.loads(line)
                        except ValueError:
                            continue
                        resp = self._reply_for(msg)
                        if resp is not None:
                            conn.sendall((json.dumps(resp) + "\n").encode("utf-8"))
            finally:
                try:
                    conn.close()
                except OSError:
                    pass

    def close(self):
        self._stop.set()
        try:
            self._sock.close()
        except OSError:
            pass


@pytest.fixture
def certdir():
    d = tempfile.mkdtemp(prefix="edge-mtls-")
    if not _mint_certs(d):
        shutil.rmtree(d, ignore_errors=True)
        pytest.skip("openssl cert minting failed")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def _uplink(certdir, broker, logs):
    return BrokerUplink(
        host="127.0.0.1", port=broker.port,
        cert_path=os.path.join(certdir, "edge.crt"), key_path=os.path.join(certdir, "edge.key"),
        ca_path=os.path.join(certdir, "ca.crt"),
        connect_timeout_s=2.0, read_timeout_s=1.5,
        log=lambda ev, f=None: logs.append((ev, f)),
    )


def _assert_no_code_logged(logs):
    blob = json.dumps(logs)
    assert CODE not in blob, "the scanned code must never appear in logs"


def test_authorize_grant_on_matching_requestid(certdir):
    broker = _FakeBroker(certdir, behavior="grant")
    logs = []
    up = _uplink(certdir, broker, logs)
    try:
        res = up.authorize("front", CODE)
        assert res == {"granted": True, "reason": "granted"}
        assert up.connected is True  # persistent socket kept open on success
        # the code DID cross the (encrypted) wire to the broker, but never appears in our logs
        assert any(CODE in r for r in broker.received)
        _assert_no_code_logged(logs)
    finally:
        up.close(); broker.close()


def test_authorize_honors_deny(certdir):
    broker = _FakeBroker(certdir, behavior="deny")
    logs = []
    up = _uplink(certdir, broker, logs)
    try:
        assert up.authorize("front", CODE) == {"granted": False, "reason": "no-window"}
        _assert_no_code_logged(logs)
    finally:
        up.close(); broker.close()


def test_mismatched_requestid_is_no_answer(certdir):
    broker = _FakeBroker(certdir, behavior="mismatch")
    up = _uplink(certdir, broker, [])
    try:
        assert up.authorize("front", CODE) is None       # desync → None (never a grant)
        assert up.connected is False                       # socket closed on desync (fail-secure)
    finally:
        up.close(); broker.close()


def test_malformed_grant_denied(certdir):
    # A well-formed `result` frame carrying a non-boolean `granted` ("yes") is deny-by-default: the broker
    # DID answer, so we honor it as a DENY (never laundered into a grant), not as a no-answer fallback.
    broker = _FakeBroker(certdir, behavior="malformed")   # granted:"yes" (non-bool)
    up = _uplink(certdir, broker, [])
    try:
        res = up.authorize("front", CODE)
        assert res is not None and res["granted"] is False   # fail-secure: no grant
    finally:
        up.close(); broker.close()


def test_timeout_is_no_answer(certdir):
    broker = _FakeBroker(certdir, behavior="silent")      # server never replies
    up = _uplink(certdir, broker, [])
    try:
        t0 = time.monotonic()
        assert up.authorize("front", CODE) is None
        assert time.monotonic() - t0 < 5                  # bounded by read_timeout, not hung
    finally:
        up.close(); broker.close()


def test_rogue_server_cert_rejected_never_grants(certdir):
    # A server presenting a cert NOT signed by our pinned CA must fail the handshake → None (no grant).
    broker = _FakeBroker(certdir, behavior="grant", use_rogue=True)
    logs = []
    up = _uplink(certdir, broker, logs)
    try:
        assert up.authorize("front", CODE) is None
        assert up.connected is False
        _assert_no_code_logged(logs)
    finally:
        up.close(); broker.close()


def test_send_audit_returns_ack_line(certdir):
    broker = _FakeBroker(certdir, behavior="grant")
    up = _uplink(certdir, broker, [])
    try:
        line = json.dumps({"t": "audit", "batchId": "b:0-1", "records": [{"seq": 0}], "signature": "x"}) + "\n"
        ack = up.send_audit(line)
        assert ack is not None
        parsed = json.loads(ack)
        assert parsed["t"] == "audit_ack" and parsed["batchId"] == "b:0-1" and parsed["status"] == "accepted"
    finally:
        up.close(); broker.close()


def test_send_audit_unreachable_returns_none(certdir):
    # Nothing listening on this port → connect fails → None (edge keeps the records).
    up = BrokerUplink(
        host="127.0.0.1", port=1,  # unroutable/closed
        cert_path=os.path.join(certdir, "edge.crt"), key_path=os.path.join(certdir, "edge.key"),
        ca_path=os.path.join(certdir, "ca.crt"), connect_timeout_s=0.5, read_timeout_s=0.5,
    )
    assert up.send_audit('{"t":"audit"}\n') is None
    assert up.authorize("front", CODE) is None
