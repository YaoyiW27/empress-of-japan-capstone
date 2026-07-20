"""Alembic environment.

The database URL comes from application settings (DATABASE_URL env var), never
from alembic.ini. Target metadata is the app's SQLAlchemy models so autogenerate
works for migrations after the initial one.
"""

from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app.config import get_settings
from app.models import Base

config = context.config

# The DB URL comes from app settings as a SQLAlchemy URL object. Do NOT route it
# through alembic's ConfigParser (set_main_option / the "sqlalchemy." section):
# a password containing "%" is read as ConfigParser interpolation syntax and
# raises "invalid interpolation syntax". Pass the URL object straight to the
# engine instead, which handles the password safely. (#128)
db_url = get_settings().sqlalchemy_url

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# These tables are created and migrated by langgraph-checkpoint-postgres.setup().
# Keep Alembic autogenerate from treating package-owned tables as removable extras.
LANGGRAPH_CHECKPOINT_TABLES = {
    "checkpoint_migrations",
    "checkpoints",
    "checkpoint_blobs",
    "checkpoint_writes",
}


def include_name(name: str | None, type_: str, _parent_names) -> bool:
    return not (type_ == "table" and name in LANGGRAPH_CHECKPOINT_TABLES)


def run_migrations_offline() -> None:
    context.configure(
        url=db_url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(db_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
