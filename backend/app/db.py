"""SQLAlchemy engine + session wiring for the local/RDS Postgres database."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db_credentials import DbCredentialProvider, attach_credential_refresh

settings = get_settings()

# connect_timeout keeps /health/db (and any query) from hanging indefinitely when
# the database is down — it fails fast with a clear error instead.
#
# pool_recycle matches the checkpointer pool's max_lifetime in session_memory.py:
# it retires connections before AWS NAT can reap them (the idle-drop hazard
# documented there), and it makes the fleet converge onto a rotated RDS password
# even if the auth-failure classifier never fires.
engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    future=True,
    connect_args={"connect_timeout": 5},
)

# Resolve the password per connection so an RDS master-password rotation does not
# strand this process with the one baked into DATABASE_URL at container start
# (#198). Inert unless DB_PASSWORD_SECRET_ARN is set.
credential_provider = DbCredentialProvider.from_settings(settings)
attach_credential_refresh(engine, credential_provider)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
