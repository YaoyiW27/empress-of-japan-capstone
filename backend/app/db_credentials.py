"""Connect-time database credential refresh for the rotating RDS master password.

The RDS master password is AWS-managed (``manage_master_user_password = true``)
and rotates roughly weekly. ECS injects ``DB_PASSWORD`` from that secret **only
at container start** and never refreshes a running task, so a task that outlives
a rotation authenticates with a dead password and every DB call fails (#198).
``pool_pre_ping`` does not help: it detects a dead *socket* and then reconnects
with the same stored credentials.

This module supplies the password at the moment a *new physical connection* is
opened, which is the only point where Postgres actually authenticates. Both
credential paths are covered:

* the SQLAlchemy engine in :mod:`app.db`, via the ``do_connect`` dialect event;
* the psycopg ``ConnectionPool`` in :mod:`app.session_memory`, via a callable
  ``conninfo`` (psycopg-pool >= 3.3 resolves it on every connect).

Everything here is **opt-in**. With ``DB_PASSWORD_SECRET_ARN`` unset — local
dev, tests, CI — :func:`attach_credential_refresh` registers nothing and
:func:`conninfo_factory` returns the same plain string as before, so the
existing behaviour is preserved exactly.
"""

from __future__ import annotations

import json
import logging
import random
import threading
import time
from collections.abc import Callable
from typing import Any, NamedTuple

import psycopg
from opentelemetry import trace
from sqlalchemy import Engine, event

from app.config import Settings

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

# Substrings that mark a genuine authentication rejection. Needed because
# `pgconn.used_password` alone over-matches (see `looks_like_auth_failure`).
_AUTH_MARKERS = (
    "password authentication failed",
    "authentication failed for user",
    "no password supplied",
)

# Connect-time failures that are emphatically *not* auth problems. The RDS
# instance is stopped nightly (22:00-05:00 America/Vancouver) by the cost-control
# schedules in infra/terraform/rds.tf, so this window must never be mistaken for
# a rotation or we would hammer Secrets Manager for seven hours.
_UNREACHABLE_MARKERS = (
    "connection refused",
    "could not connect to server",
    "could not translate host name",
    "failed to resolve host",
    "timeout expired",
)


class DbCredential(NamedTuple):
    """A username/password pair read from the RDS-managed secret."""

    username: str | None
    password: str


class DbCredentialProvider:
    """Fetch and cache the current DB password from AWS Secrets Manager.

    Thread-safe: the SQLAlchemy pool, the psycopg pool and ``asyncio.to_thread``
    callers all reach this from different threads. The lock is deliberately held
    *across* the network call so that N concurrent connects coalesce into a
    single ``GetSecretValue`` rather than stampeding the API.
    """

    def __init__(
        self,
        secret_arn: str | None,
        *,
        region: str,
        client: Any | None = None,
        ttl_seconds: float = 300.0,
        min_refresh_interval_seconds: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._secret_arn = secret_arn
        self._region = region
        self._client = client
        self._ttl_seconds = ttl_seconds
        self._min_refresh_interval_seconds = min_refresh_interval_seconds
        self._clock = clock
        self._lock = threading.RLock()
        self._cached: DbCredential | None = None
        self._expires_at = 0.0
        self._last_attempt_at: float | None = None

    @classmethod
    def from_settings(cls, settings: Settings) -> DbCredentialProvider:
        return cls(
            settings.db_password_secret_arn,
            region=settings.aws_region,
            ttl_seconds=float(settings.db_password_refresh_ttl_seconds),
            min_refresh_interval_seconds=float(settings.db_password_min_refresh_interval_seconds),
        )

    @property
    def enabled(self) -> bool:
        """Whether a secret ARN is configured at all."""
        return bool(self._secret_arn)

    def current(self) -> DbCredential | None:
        """Return the cached credential, re-fetching once the TTL has expired."""
        if not self.enabled:
            return None
        with self._lock:
            # Deliberately not gated on `self._cached is not None`: a failed
            # fetch also arms `_expires_at` (see `_fetch_locked`), so an outage
            # is negative-cached even before we have ever held a credential.
            # Without that, a Secrets Manager brownout after the TTL lapsed
            # would send every new connection through a fresh ~5s API call,
            # serialized under this lock — stalling connects instead of
            # degrading to a fast fallback.
            if self._clock() < self._expires_at:
                return self._cached
            return self._fetch_locked(reason="ttl")

    def force_refresh(self) -> DbCredential | None:
        """Re-fetch ignoring the TTL, but no more often than the throttle allows.

        Called when a connect looks like an auth rejection. The throttle bounds
        Secrets Manager traffic when the failure is *not* a rotation (a genuinely
        wrong static credential, or the nightly RDS-stopped window slipping past
        the classifier).
        """
        if not self.enabled:
            return None
        with self._lock:
            last = self._last_attempt_at
            if last is not None and self._clock() - last < self._min_refresh_interval_seconds:
                return self._cached
            return self._fetch_locked(reason="forced")

    def _fetch_locked(self, *, reason: str) -> DbCredential | None:
        """Fetch the secret. Caller must hold the lock."""
        self._last_attempt_at = self._clock()
        with tracer.start_as_current_span("db.credentials.fetch") as span:
            span.set_attribute("db.credentials.reason", reason)
            try:
                response = self._secrets_client().get_secret_value(SecretId=self._secret_arn)
                payload = json.loads(response["SecretString"])
                credential = DbCredential(
                    username=payload.get("username"),
                    password=payload["password"],
                )
            except Exception as exc:
                # Never let Secrets Manager break a connect: fall back to the
                # last good value, or to the static URL password when we have
                # nothing cached. Without this the fix could make availability
                # *worse* than the stale-password bug it replaces.
                span.record_exception(exc)
                span.set_attribute("db.credentials.failed", True)
                # Negative-cache the failure for the same interval that throttles
                # forced refreshes. Otherwise `current()` re-enters this branch on
                # every new connection once the TTL has lapsed, and each entry is
                # a bounded-but-slow API call holding the lock.
                self._expires_at = self._clock() + self._min_refresh_interval_seconds
                logger.warning(
                    "secrets manager fetch failed (%s); using cached credential",
                    type(exc).__name__,
                )
                return self._cached

            changed = self._cached is None or self._cached.password != credential.password
            span.set_attribute("db.credentials.changed", changed)
            self._cached = credential
            # Jitter the TTL so a fleet of tasks does not align its refetches.
            self._expires_at = self._clock() + self._ttl_seconds * (0.8 + 0.4 * random.random())
            if changed:
                logger.info("db credential refreshed from secrets manager (reason=%s)", reason)
            return credential

    def _secrets_client(self) -> Any:
        if self._client is None:
            # Imported lazily so tests and CI (no creds, no region) never touch
            # boto3, and so app.config stays free of AWS imports.
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "secretsmanager",
                region_name=self._region,
                # Bound the worst case: this call sits inside the connect path,
                # ahead of connect_args={"connect_timeout": 5}. A Secrets Manager
                # brownout must degrade to a slower 503, never a hang.
                config=Config(
                    connect_timeout=2,
                    read_timeout=3,
                    retries={"max_attempts": 2, "mode": "standard"},
                ),
            )
        return self._client


def looks_like_auth_failure(exc: BaseException) -> bool:
    """Whether a failed connect looks like the server rejecting our password.

    Deliberately *not* based on SQLSTATE. psycopg raises a bare
    ``OperationalError`` for connect failures with ``pgconn=`` but no ``info=``
    (``psycopg/generators.py``), and ``Error.__init__`` only derives ``sqlstate``
    when ``info`` is truthy — so ``exc.sqlstate`` is ``None`` even for a genuine
    ``28P01``. Verified against a live Postgres:

    ==========================  ==========  =====================
    case                        sqlstate    pgconn.used_password
    ==========================  ==========  =====================
    wrong password              None        True
    connection refused          None        False
    DNS failure                 None        (no pgconn)
    nonexistent database        None        True
    ==========================  ==========  =====================

    So ``used_password`` is a good *necessary* filter — it cleanly excludes the
    nightly RDS-stopped window — but not a sufficient one, hence the message
    markers. A misclassification either way is absorbed by the caller's
    compare-and-skip gate (retry only if the password actually changed).
    """
    orig = getattr(exc, "orig", None) or exc

    # Correct for query-time errors, and future-proof if libpq ever surfaces a
    # sqlstate on connect. Dead code at connect time today.
    if getattr(orig, "sqlstate", None) == "28P01":
        return True

    if isinstance(orig, psycopg.errors.ConnectionTimeout):
        return False

    message = str(orig).lower()
    if any(marker in message for marker in _UNREACHABLE_MARKERS):
        return False

    pgconn = getattr(orig, "pgconn", None)
    if pgconn is None or not getattr(pgconn, "used_password", False):
        return False

    return any(marker in message for marker in _AUTH_MARKERS)


def _conninfo_with(settings: Settings, password: str | None) -> str:
    """Render the driver-neutral conninfo, optionally overriding the password."""
    url = settings.sqlalchemy_url
    if password is not None:
        url = url.set(password=password)
    return url.set(drivername="postgresql").render_as_string(hide_password=False)


def _connect_retrying_on_rotation(
    provider: DbCredentialProvider,
    attempt: Callable[[], Any],
    retry: Callable[[DbCredential], Any | None],
) -> Any:
    """Connect, and on an auth rejection re-fetch the secret and try once more.

    Shared by both credential paths so they carry identical guarantees. ``retry``
    returns ``None`` to decline — that is the compare-and-skip gate: we only try
    again when the freshly fetched password actually differs from the one just
    rejected. For a stopped database or a genuinely wrong static credential the
    password is unchanged, so the original exception propagates untouched and
    nothing spins.

    On the recovered path we must NEVER log the underlying psycopg message.
    infra/terraform/monitoring.tf filters the whole backend log group for the
    literal "password authentication failed" and routes ALARM to the
    force-redeploy Lambda from PR #218, so echoing it after a *successful*
    self-heal would trigger a pointless redeploy on every rotation. When the
    retry fails the original error is raised (and logged by the caller) exactly
    as before, which is what keeps that alarm working as a genuine backstop.
    """
    try:
        return attempt()
    except psycopg.OperationalError as exc:
        if not looks_like_auth_failure(exc):
            raise
        refreshed = provider.force_refresh()
        if refreshed is None:
            raise
        connection = retry(refreshed)
        if connection is None:
            raise
        logger.info("db connect succeeded after credential refresh")
        return connection


def attach_credential_refresh(engine: Engine, provider: DbCredentialProvider) -> bool:
    """Make ``engine`` resolve its password per connection. Returns whether it did.

    Registers nothing when the provider is disabled, so with no secret ARN the
    engine keeps SQLAlchemy's default connect path untouched.
    """
    if not provider.enabled:
        return False

    @event.listens_for(engine, "do_connect")
    def _inject_current_password(dialect, conn_rec, cargs, cparams):  # type: ignore[no-untyped-def]
        # SQLAlchemy hands us a fresh dict(cparams) per connect, so mutating it
        # is per-connection and thread-safe. Returning a non-None DBAPI
        # connection short-circuits the dialect's own connect() — that is what
        # lets us retry here. Always go through dialect.connect(): cparams
        # carries the dialect's AdaptersMap in cparams["context"], which a bare
        # psycopg.connect() would drop.
        credential = provider.current()
        if credential is not None:
            cparams["password"] = credential.password

        def _retry(refreshed: DbCredential) -> Any | None:
            if refreshed.password == cparams.get("password"):
                return None
            cparams["password"] = refreshed.password
            return dialect.connect(*cargs, **cparams)

        return _connect_retrying_on_rotation(
            provider, lambda: dialect.connect(*cargs, **cparams), _retry
        )

    return True


def connection_class_factory(
    settings: Settings, provider: DbCredentialProvider
) -> type[psycopg.Connection]:
    """Return the ``connection_class`` for ``psycopg_pool.ConnectionPool``.

    The callable conninfo alone is not enough for the pool. It only ever serves
    ``provider.current()``, which is TTL-cached, so a rotation landing inside the
    TTL leaves the pool handing the stale password to every new physical
    connection until the TTL lapses. Worse, ``ConnectionPool._add_connection``
    logs the failure verbatim (``"error connecting in %r: %s"``), which puts the
    literal "password authentication failed" into the log group that
    monitoring.tf greps — firing the PR #218 redeploy this fix exists to avoid.

    Overriding ``connect`` gives this path the same force-refresh-and-retry as
    the engine, so a rotation is absorbed before the pool ever sees an error and
    nothing is logged. psycopg-pool calls
    ``self.connection_class.connect(conninfo, **kwargs)`` on every new physical
    connection, so this is the supported seam.
    """
    if not provider.enabled:
        return psycopg.Connection

    class CredentialRefreshingConnection(psycopg.Connection):
        @classmethod
        def connect(cls, conninfo: str = "", **kwargs: Any) -> Any:
            def _base(dsn: str) -> Any:
                return super(CredentialRefreshingConnection, cls).connect(dsn, **kwargs)

            def _retry(refreshed: DbCredential) -> Any | None:
                # Compare the rendered DSN rather than parsing the password back
                # out of `conninfo`; equivalent, and it also declines when only
                # the password we already tried would be reused.
                retry_conninfo = _conninfo_with(settings, refreshed.password)
                if retry_conninfo == conninfo:
                    return None
                return _base(retry_conninfo)

            return _connect_retrying_on_rotation(provider, lambda: _base(conninfo), _retry)

    return CredentialRefreshingConnection


def conninfo_factory(settings: Settings, provider: DbCredentialProvider) -> str | Callable[[], str]:
    """Return a conninfo for ``psycopg_pool.ConnectionPool``.

    A plain string when the provider is disabled (unchanged behaviour), else a
    zero-arg callable — psycopg-pool >= 3.3 resolves it on every new physical
    connection, so the pool picks up a rotated password on its own. Pair it with
    :func:`connection_class_factory`, which adds the retry for a rotation that
    lands inside the cache TTL.
    """
    if not provider.enabled:
        return settings.psycopg_conninfo

    def _current_conninfo() -> str:
        credential = provider.current()
        return _conninfo_with(settings, credential.password if credential else None)

    return _current_conninfo
