"""S4b-3 relay + rtc adapters — hardware-free unit tests.

Relay: the factory picks the right driver; the mock/console drivers count pulses and are fail-secure
(de-energized on close). rtc: the `now_provider` returns (system_ms, rtc_ok) and its trust policy is
conservative + injectable (never on an unknown mode; assume=dev-only).
"""

import pytest

from edge.relay import ConsoleRelay, MockRelay, make_relay
from edge.rtc import make_now_provider


# --- relay -----------------------------------------------------------------------------------------
def test_make_relay_defaults_to_console():
    r = make_relay({})
    assert isinstance(r, ConsoleRelay)


def test_make_relay_mock_counts_pulses_and_closes():
    r = make_relay({"relay": {"driver": "mock"}})
    assert isinstance(r, MockRelay)
    assert r.pulses == 0 and r.closed is False
    r.pulse(); r.pulse()
    assert r.pulses == 2
    r.close()
    assert r.closed is True


def test_make_relay_unknown_driver_raises():
    with pytest.raises(ValueError):
        make_relay({"relay": {"driver": "nope"}})


def test_gpio_relay_fails_loud_without_lib():
    # driver="gpio" on a box without gpiozero must fail LOUD (never silently no-op a real strike).
    with pytest.raises((ImportError, ModuleNotFoundError, KeyError, Exception)):
        make_relay({"relay": {"driver": "gpio", "strike_pin": 23}})


# --- rtc / now_provider ----------------------------------------------------------------------------
def test_now_provider_never_mode_is_untrusted():
    np = make_now_provider({"rtc": {"trust": "never"}}, clock=lambda: 1_700_000.0)
    ms, ok = np()
    assert ms == 1_700_000_000 and ok is False


def test_now_provider_assume_mode_requires_env_flag(monkeypatch):
    # I1: rtc.trust="assume" is a fail-OPEN escape hatch — refused (fail-secure to never) unless the
    # deliberate env flag is ALSO set, so a stray config can't disable the F4 clock-floor on a real door.
    monkeypatch.delenv("DOOR_ALLOW_ASSUME_CLOCK", raising=False)
    np = make_now_provider({"rtc": {"trust": "assume"}}, clock=lambda: 1_700_000.0)
    _, ok = np()
    assert ok is False  # refused without the flag → untrusted clock (deny on rung-3)

    monkeypatch.setenv("DOOR_ALLOW_ASSUME_CLOCK", "1")
    np2 = make_now_provider({"rtc": {"trust": "assume"}}, clock=lambda: 1_700_000.0)
    _, ok2 = np2()
    assert ok2 is True  # honored only with the explicit bench/dev flag


def test_now_provider_systemd_reflects_sync_marker():
    synced = {"v": False}
    np = make_now_provider({"rtc": {"trust": "systemd"}}, clock=lambda: 1.0,
                           synced_check=lambda: synced["v"], rtc_check=lambda: False)
    assert np()[1] is False          # not synced yet → untrusted (LOCK offline)
    synced["v"] = True
    assert np()[1] is True           # gains NTP sync later → flips to trusted, no restart


def test_now_provider_auto_trusts_hwrtc_or_ntp():
    np = make_now_provider({"rtc": {"trust": "auto"}}, clock=lambda: 1.0,
                           synced_check=lambda: False, rtc_check=lambda: True)
    assert np()[1] is True           # hardware RTC present → trusted even without NTP


def test_now_provider_unknown_mode_fails_secure():
    np = make_now_provider({"rtc": {"trust": "bogus"}}, clock=lambda: 1.0,
                           synced_check=lambda: True, rtc_check=lambda: True)
    assert np()[1] is False          # unknown mode → untrusted (fail-secure)


def test_now_provider_default_mode_is_auto():
    # No rtc block → default "auto"; with both checks false, untrusted.
    np = make_now_provider({}, clock=lambda: 1.0, synced_check=lambda: False, rtc_check=lambda: False)
    assert np()[1] is False
