"""Unit tests for connect-time DB credential refresh (#198).

No AWS and no database: the Secrets Manager client and the clock are injected.
"""

import json
import logging

import psycopg
import pytest
import sqlalchemy.exc
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db_credentials import (
    DbCredentialProvider,
    attach_credential_refresh,
    conninfo_factory,
    looks_like_auth_failure,
)

SECRET_ARN = "arn:aws:secretsmanager:us-west-2:111122223333:secret:rds!db-abc-def"
DB_ENV_NAMES = (
    "DATABASE_URL",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_PASSWORD_SECRET_ARN",
)


class StubSecretsClient:
    """Replays payloads (or raises them), counting calls."""

    def __init__(self, *payloads):
        self.payloads = list(payloads)
        self.calls = 0

    def get_secret_value(self, *, SecretId):  # noqa: N803 — boto3's parameter name
        self.calls += 1
        payload = self.payloads[min(self.calls - 1, len(self.payloads) - 1)]
        if isinstance(payload, Exception):
            raise payload
        return {"SecretString": json.dumps(payload)}


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class FakePgConn:
    def __init__(self, used_password):
        self.used_password = used_password


def _settings(**overrides):
    base = {
        "_env_file": None,
        "db_host": "rds.example.internal",
        "db_port": 5432,
        "db_name": "empress",
        "db_user": "empress_admin",
        "db_password": "boot-time-password",
    }
    base.update(overrides)
    return Settings(**base)


def _provider(*payloads, clock=None, **kwargs):
    return DbCredentialProvider(
        SECRET_ARN,
        region="us-west-2",
        client=StubSecretsClient(*payloads),
        clock=clock or FakeClock(),
        **kwargs,
    )


def _secret(password, username="empress_admin"):
    return {"username": username, "password": password}


def _auth_error(message='FATAL:  password authentication failed for user "empress_admin"'):
    return psycopg.OperationalError(f"connection failed: {message}", pgconn=FakePgConn(True))


# --- opt-in / disabled path -------------------------------------------------


def test_provider_is_disabled_without_secret_arn(monkeypatch):
    for name in DB_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    client = StubSecretsClient(_secret("never-read"))
    provider = DbCredentialProvider(None, region="us-west-2", client=client)

    assert provider.enabled is False
    assert provider.current() is None
    assert provider.force_refresh() is None
    assert client.calls == 0


def test_no_do_connect_listener_registered_when_disabled():
    """The byte-for-byte-unchanged guarantee for local dev, tests and CI."""
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")
    provider = DbCredentialProvider(None, region="us-west-2", client=StubSecretsClient())

    assert attach_credential_refresh(engine, provider) is False
    assert engine.dialect._has_events is False


def test_do_connect_listener_registered_when_enabled():
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")

    assert attach_credential_refresh(engine, _provider(_secret("pw"))) is True
    assert engine.dialect._has_events is True


# --- caching / TTL / throttle ------------------------------------------------


def test_current_caches_within_ttl():
    provider = _provider(_secret("pw1"), ttl_seconds=300.0)

    assert provider.current().password == "pw1"
    assert provider.current().password == "pw1"
    assert provider._client.calls == 1


def test_current_refetches_after_ttl_expires():
    clock = FakeClock()
    provider = _provider(_secret("pw1"), _secret("pw2"), clock=clock, ttl_seconds=300.0)

    assert provider.current().password == "pw1"
    clock.advance(400.0)  # past the TTL even with the +20% jitter ceiling
    assert provider.current().password == "pw2"
    assert provider._client.calls == 2


def test_force_refresh_bypasses_the_ttl():
    provider = _provider(
        _secret("pw1"), _secret("pw2"), ttl_seconds=300.0, min_refresh_interval_seconds=0.0
    )

    assert provider.current().password == "pw1"
    assert provider.force_refresh().password == "pw2"
    assert provider._client.calls == 2


def test_force_refresh_is_throttled():
    clock = FakeClock()
    provider = _provider(
        _secret("pw1"),
        _secret("pw2"),
        _secret("pw3"),
        clock=clock,
        min_refresh_interval_seconds=30.0,
    )

    assert provider.force_refresh().password == "pw1"
    # Inside the throttle window: returns the cache without another API call.
    assert provider.force_refresh().password == "pw1"
    assert provider._client.calls == 1

    clock.advance(31.0)
    assert provider.force_refresh().password == "pw2"
    assert provider._client.calls == 2


def test_fetch_failure_falls_back_to_cached_credential():
    provider = _provider(
        _secret("pw1"),
        RuntimeError("secrets manager unavailable"),
        min_refresh_interval_seconds=0.0,
    )

    assert provider.current().password == "pw1"
    # Must not raise — a Secrets Manager outage may not break DB connects.
    assert provider.force_refresh().password == "pw1"


def test_fetch_failure_without_cache_returns_none():
    """Falls back to the static URL password rather than failing the connect."""
    provider = _provider(RuntimeError("boom"))

    assert provider.current() is None


# --- error classification ---------------------------------------------------


def test_classifier_matches_password_authentication_failure():
    assert looks_like_auth_failure(_auth_error()) is True


def test_classifier_matches_no_password_supplied():
    assert looks_like_auth_failure(_auth_error("fe_sendauth: no password supplied")) is True


def test_classifier_rejects_connection_refused():
    """The nightly RDS stop window (22:00-05:00) must never look like a rotation."""
    exc = psycopg.OperationalError(
        'connection failed: connection to server at "10.0.1.5", port 5432 failed: '
        "could not receive data from server: Connection refused",
        pgconn=FakePgConn(False),
    )
    assert looks_like_auth_failure(exc) is False


def test_classifier_rejects_dns_failure():
    exc = psycopg.OperationalError("failed to resolve host 'nope.invalid': [Errno 8]")
    assert looks_like_auth_failure(exc) is False


def test_classifier_rejects_connection_timeout():
    exc = psycopg.errors.ConnectionTimeout("connection timeout expired")
    assert looks_like_auth_failure(exc) is False


def test_classifier_rejects_nonexistent_database():
    """`used_password` is True here too, so the message markers carry the decision."""
    exc = psycopg.OperationalError(
        'connection failed: FATAL:  database "no_such_db" does not exist',
        pgconn=FakePgConn(True),
    )
    assert looks_like_auth_failure(exc) is False


def test_classifier_unwraps_sqlalchemy_wrapper():
    wrapped = sqlalchemy.exc.OperationalError("SELECT 1", {}, _auth_error())
    assert looks_like_auth_failure(wrapped) is True


def test_classifier_matches_query_time_sqlstate():
    """Dead code at connect time (sqlstate is None there), but correct for queries."""
    exc = psycopg.errors.InvalidPassword("password authentication failed")
    assert exc.sqlstate == "28P01"
    assert looks_like_auth_failure(exc) is True


# --- the do_connect handler -------------------------------------------------


class FakeDialect:
    """Rejects every password except `good_password`."""

    def __init__(self, good_password):
        self.good_password = good_password
        self.attempts = []

    def connect(self, *cargs, **cparams):
        self.attempts.append(cparams.get("password"))
        if cparams.get("password") != self.good_password:
            raise _auth_error()
        return f"connection<{cparams['password']}>"


def _registered_handler(engine):
    return list(engine.dialect.dispatch.do_connect)[0]


def test_handler_retries_with_refreshed_password_after_rotation():
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")
    provider = _provider(
        _secret("pw1"), _secret("pw2"), ttl_seconds=300.0, min_refresh_interval_seconds=0.0
    )
    attach_credential_refresh(engine, provider)
    dialect = FakeDialect(good_password="pw2")

    result = _registered_handler(engine)(dialect, None, [], {"password": "stale"})

    assert result == "connection<pw2>"
    assert dialect.attempts == ["pw1", "pw2"]


def test_handler_does_not_retry_when_password_is_unchanged():
    """The RDS-stopped / wrong-static-credential guarantee: one attempt, then raise."""
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")
    provider = _provider(_secret("pw1"), ttl_seconds=300.0, min_refresh_interval_seconds=0.0)
    attach_credential_refresh(engine, provider)
    dialect = FakeDialect(good_password="something-else")

    with pytest.raises(psycopg.OperationalError):
        _registered_handler(engine)(dialect, None, [], {"password": "stale"})

    assert dialect.attempts == ["pw1"]


def test_handler_does_not_retry_non_auth_failures():
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")
    provider = _provider(_secret("pw1"), _secret("pw2"), min_refresh_interval_seconds=0.0)
    attach_credential_refresh(engine, provider)

    class RefusingDialect:
        def __init__(self):
            self.attempts = 0

        def connect(self, *cargs, **cparams):
            self.attempts += 1
            raise psycopg.OperationalError(
                "connection failed: could not receive data from server: Connection refused",
                pgconn=FakePgConn(False),
            )

    dialect = RefusingDialect()
    with pytest.raises(psycopg.OperationalError):
        _registered_handler(engine)(dialect, None, [], {"password": "stale"})

    assert dialect.attempts == 1
    # No forced refresh, so only the initial TTL fetch happened.
    assert provider._client.calls == 1


def test_recovered_path_never_logs_the_alarm_string(caplog):
    """infra/terraform/monitoring.tf greps the log group for this exact phrase and
    routes ALARM to the force-redeploy Lambda (PR #218). Logging it on a
    *successful* self-heal would trigger a redeploy on every rotation."""
    engine = create_engine("postgresql+psycopg://u:p@h:5432/db")
    provider = _provider(_secret("pw1"), _secret("pw2"), min_refresh_interval_seconds=0.0)
    attach_credential_refresh(engine, provider)
    dialect = FakeDialect(good_password="pw2")

    with caplog.at_level(logging.DEBUG):
        _registered_handler(engine)(dialect, None, [], {"password": "stale"})

    assert "password authentication failed" not in caplog.text.lower()


# --- conninfo factory -------------------------------------------------------


def test_conninfo_factory_returns_plain_string_when_disabled():
    settings = _settings()
    provider = DbCredentialProvider(None, region="us-west-2", client=StubSecretsClient())

    assert conninfo_factory(settings, provider) == settings.psycopg_conninfo


def test_conninfo_factory_swaps_in_the_current_password():
    settings = _settings()
    factory = conninfo_factory(settings, _provider(_secret("rotated-pw")))

    url = make_url(factory())

    assert url.password == "rotated-pw"
    assert url.drivername == "postgresql"
    assert url.username == "empress_admin"
    assert url.host == "rds.example.internal"
    assert url.port == 5432
    assert url.database == "empress"


def test_conninfo_factory_escapes_special_characters():
    """Mirrors the password shape asserted in test_config.py."""
    password = "pa@ss/word:with?chars#frag"
    factory = conninfo_factory(_settings(), _provider(_secret(password)))

    rendered = factory()

    assert make_url(rendered).password == password
    assert password not in rendered  # percent-encoded, not raw
