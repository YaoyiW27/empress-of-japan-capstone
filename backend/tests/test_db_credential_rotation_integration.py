"""End-to-end regression test for the #198 stale-password failure.

Reproduces the real thing against a live Postgres: rotate the role's password
out from under a running process and assert it recovers on the next physical
connection, with no restart and no engine rebuild.

Self-skips when no database is reachable (same pattern as
tests/test_ingest_integration.py), so CI without a DB stays green.

Run locally with `docker compose up -d` in backend/.
"""

import logging
import time

import psycopg
import pytest
from psycopg_pool import ConnectionPool
from sqlalchemy import create_engine, text

from app.config import Settings, get_settings
from app.db_credentials import (
    DbCredentialProvider,
    attach_credential_refresh,
    connection_class_factory,
    conninfo_factory,
)

ROLE = "eoj_rotation_test"
PW1 = "rotation-pw-one"
PW2 = "rotation-pw-two"


class MutableSecretsClient:
    """Stands in for Secrets Manager; `password` is flipped by the test."""

    def __init__(self, password):
        self.password = password
        self.calls = 0

    def get_secret_value(self, *, SecretId):  # noqa: N803 — boto3's parameter name
        self.calls += 1
        return {"SecretString": f'{{"username": "{ROLE}", "password": "{self.password}"}}'}


@pytest.fixture(scope="module")
def admin_engine():
    # Short connect timeout so the suite skips fast when no DB is present.
    eng = create_engine(get_settings().sqlalchemy_url, connect_args={"connect_timeout": 2})
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("no database reachable at DATABASE_URL")
    return eng


@pytest.fixture
def rotating_role(admin_engine):
    """A throwaway login role whose password the test can rotate."""
    url = admin_engine.url

    def run(sql):
        with admin_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text(sql))

    # GRANT CONNECT registers a dependency, so a bare DROP ROLE fails with
    # DependentObjectsStillExist. Revoke and drop owned objects first.
    drop = f"""
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROLE}') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON DATABASE "{url.database}" FROM {ROLE}';
        EXECUTE 'DROP OWNED BY {ROLE}';
        EXECUTE 'DROP ROLE {ROLE}';
      END IF;
    END $$;
    """

    run(drop)
    run(f"CREATE ROLE {ROLE} LOGIN PASSWORD '{PW1}'")
    run(f'GRANT CONNECT ON DATABASE "{url.database}" TO {ROLE}')
    try:
        yield url.set(username=ROLE, password=PW1)
    finally:
        run(drop)


def _rotate(admin_engine, new_password):
    with admin_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text(f"ALTER ROLE {ROLE} PASSWORD '{new_password}'"))


def _provider(client, ttl_seconds=0.0):
    return DbCredentialProvider(
        "arn:aws:secretsmanager:us-west-2:111122223333:secret:test",
        region="us-west-2",
        client=client,
        # 0.0 by default: always consult the client, so the test controls timing.
        ttl_seconds=ttl_seconds,
        min_refresh_interval_seconds=0.0,
    )


def test_engine_recovers_from_a_password_rotation_without_restart(admin_engine, rotating_role):
    client = MutableSecretsClient(PW1)
    engine = create_engine(
        rotating_role,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
        connect_args={"connect_timeout": 5},
    )
    attach_credential_refresh(engine, _provider(client))

    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1

    # Rotate out from under the running engine, exactly as RDS does.
    _rotate(admin_engine, PW2)
    client.password = PW2

    # Drop pooled connections so the next checkout opens a *new* physical
    # connection — the moment Postgres actually re-authenticates.
    engine.pool.dispose()

    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1

    engine.dispose()


def test_engine_still_fails_when_the_secret_is_also_stale(admin_engine, rotating_role):
    """Guards the retry: a rotation the provider doesn't know about must not loop."""
    client = MutableSecretsClient(PW1)
    engine = create_engine(
        rotating_role, pool_size=1, max_overflow=0, connect_args={"connect_timeout": 5}
    )
    attach_credential_refresh(engine, _provider(client))

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    _rotate(admin_engine, PW2)  # client deliberately left on PW1
    engine.pool.dispose()
    calls_before = client.calls

    with pytest.raises(Exception) as exc_info:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    assert isinstance(exc_info.value.orig, psycopg.OperationalError)
    # One TTL read plus one forced refresh per connect attempt — bounded, no storm.
    assert client.calls - calls_before <= 4
    engine.dispose()


def _pool_settings(url):
    return Settings(
        _env_file=None,
        db_host=url.host,
        db_port=url.port,
        db_name=url.database,
        db_user=ROLE,
        db_password=PW1,
    )


def _build_pool(settings, provider, **overrides):
    kwargs = {
        "conninfo": conninfo_factory(settings, provider),
        "connection_class": connection_class_factory(settings, provider),
        "min_size": 1,
        "max_size": 2,
        "open": True,
        "timeout": 10.0,
        "kwargs": {"connect_timeout": 5},
    }
    kwargs.update(overrides)
    return ConnectionPool(**kwargs)


def test_psycopg_pool_recovers_from_a_password_rotation(admin_engine, rotating_role):
    """The session-memory checkpointer path: callable conninfo, resolved per connect."""
    client = MutableSecretsClient(PW1)
    settings = _pool_settings(rotating_role)
    provider = _provider(client)
    assert callable(conninfo_factory(settings, provider))

    pool = _build_pool(settings, provider)
    try:
        with pool.connection() as conn:
            assert conn.execute("SELECT 1").fetchone()[0] == 1

        _rotate(admin_engine, PW2)
        client.password = PW2

        # drain() is the documented way to force a connection re-configuration;
        # relying on max_lifetime alone is not deterministic, since expiry is
        # only evaluated when a connection is returned to the pool.
        pool.drain()
        time.sleep(1.0)
        with pool.connection() as conn:
            assert conn.execute("SELECT 1").fetchone()[0] == 1
    finally:
        pool.close()


def test_psycopg_pool_recovers_from_a_rotation_inside_the_cache_ttl(
    admin_engine, rotating_role, caplog
):
    """The case a callable conninfo alone cannot handle.

    With a long TTL, `provider.current()` keeps serving the pre-rotation
    password, so every new physical connection would be rejected until the TTL
    lapsed — and ConnectionPool logs each failure verbatim, putting the literal
    "password authentication failed" into the log group whose metric filter
    fires the #218 force-redeploy Lambda. connection_class_factory's
    force-refresh-and-retry has to absorb it before the pool ever sees an error.
    """
    client = MutableSecretsClient(PW1)
    settings = _pool_settings(rotating_role)
    # Long TTL: current() will keep returning the stale password.
    provider = _provider(client, ttl_seconds=3600.0)

    pool = _build_pool(settings, provider)
    try:
        with pool.connection() as conn:
            assert conn.execute("SELECT 1").fetchone()[0] == 1

        _rotate(admin_engine, PW2)
        client.password = PW2  # Secrets Manager has it; the TTL cache does not.

        with caplog.at_level(logging.DEBUG, logger="psycopg.pool"):
            pool.drain()
            time.sleep(1.0)
            with pool.connection() as conn:
                assert conn.execute("SELECT 1").fetchone()[0] == 1

        # Verified non-vacuous: with the callable conninfo alone (no
        # connection_class) this same scenario raises PoolTimeout and logs the
        # alarm string three times.
        assert "password authentication failed" not in caplog.text.lower()
    finally:
        pool.close()
