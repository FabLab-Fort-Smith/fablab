# Edge node — systemd install (S4b-3)

`dooraccess-edge.service` runs `run_edge.py` as a hardened, watchdog-supervised, auto-restarting service.
It is `Type=notify`: the process sends `READY=1` at startup and `WATCHDOG=1` each supervisor tick, so a
stalled door is restarted rather than left silently dead (fail-secure — the strike de-energizes on stop).

## Layout (matches the unit file)
- Code:   `/opt/dooraccess/pi-zero/`  (this `firmware/pi-zero/` tree — read-only at runtime)
- Config: `/etc/dooraccess/config.json`  (copy from `config.example.json`; **not** world-readable)
- Keys/TLS: `/etc/dooraccess/{edge.crt,edge.key,ca.crt,edge.index.key,allowlist_verify_key.b64}`
  (from the CA bundle, `vps/pki/door-ca.sh issue-edge`) — `edge.key` + `edge.index.key` `0600`.
- Audit key: `/var/lib/dooraccess/audit_key.b64` (from `python -m edge.provision_audit_key`, `0600`).
- State (writable): `/var/lib/dooraccess/` (envelope cache, audit buffer, clock floor).

## Install
```bash
# 1) dedicated non-root user + state dir (GPIO/serial/I2C/SPI via GROUPS, not root)
sudo useradd --system --home /var/lib/dooraccess --shell /usr/sbin/nologin dooraccess
sudo usermod -aG gpio,i2c,spi,dialout dooraccess
sudo install -d -o dooraccess -g dooraccess -m 0750 /var/lib/dooraccess

# 2) code + deps (pin exactly + verify hashes — supply chain)
sudo install -d -o root -g root -m 0755 /opt/dooraccess/pi-zero
sudo cp -r ./* /opt/dooraccess/pi-zero/
sudo pip install --require-hashes -r /opt/dooraccess/pi-zero/requirements.txt

# 3) config + secrets (root-owned, tight perms)
sudo install -d -o root -g dooraccess -m 0750 /etc/dooraccess
sudo cp config.example.json /etc/dooraccess/config.json   # then edit it
sudo chmod 0640 /etc/dooraccess/config.json

# 4) provision the audit-signing key (prints the public key to register on the cloud)
sudo -u dooraccess python3 -m edge.provision_audit_key \
  --out /var/lib/dooraccess/audit_key.b64 --edge-id "$(jq -r .edge_id /etc/dooraccess/config.json)"

# 5) install + start
sudo cp systemd/dooraccess-edge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dooraccess-edge.service
journalctl -u dooraccess-edge -f
```

## Notes
- `WatchdogSec=30` must exceed `poll_interval_ms` and `relay.hold_s` so a normal strike pulse never trips
  it. Raise it if you set a long strike hold.
- `ProtectSystem=strict` makes everything read-only **except** `ReadWritePaths=/var/lib/dooraccess`. If you
  relocate state, update both the config `paths.*` and `ReadWritePaths`.
- The `DeviceAllow` lines scope the reader/relay device nodes. Adjust for your wiring (UART `ttyAMA0`,
  I2C `i2c-1`, SPI `spidev0.0`); `gpiomem` covers gpiozero pin access without full `/dev/mem`.
- OTA is **not** wired here (the `ota_poll` hook in `run_edge.py` is a documented no-op); OTA lands in its
  own slice (`docs/architecture/ota-updates.md`).
