import pytest
from sqlalchemy.engine import make_url

from app.config import LOCAL_DATABASE_URL, Settings

DB_ENV_NAMES = ("DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")


def _render(url) -> str:
    return url.render_as_string(hide_password=False)


def _read_sqlalchemy_url(settings: Settings):
    return settings.sqlalchemy_url


def _clear_db_env(monkeypatch) -> None:
    for name in DB_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


def test_database_url_takes_precedence_over_ecs_db_parts():
    settings = Settings(
        _env_file=None,
        database_url="postgresql://local_user:local_pass@localhost:15432/local_db",
        db_host="rds.example.internal",
        db_port=5432,
        db_name="empress_prod",
        db_user="ecs_user",
        db_password="ecs_password",
    )

    url = settings.sqlalchemy_url

    assert url.drivername == "postgresql+psycopg"
    assert url.username == "local_user"
    assert url.password == "local_pass"
    assert url.host == "localhost"
    assert url.port == 15432
    assert url.database == "local_db"


def test_ecs_db_parts_assemble_sqlalchemy_url_with_escaped_password():
    password = "pa@ss/word:with?chars#frag"
    settings = Settings(
        _env_file=None,
        db_host="rds.example.internal",
        db_port=5432,
        db_name="empress",
        db_user="app_user",
        db_password=password,
    )

    url = settings.sqlalchemy_url
    rendered = _render(url)

    assert url.drivername == "postgresql+psycopg"
    assert url.username == "app_user"
    assert url.password == password
    assert url.host == "rds.example.internal"
    assert url.port == 5432
    assert url.database == "empress"
    assert make_url(rendered).password == password
    assert password not in rendered


def test_partial_ecs_db_parts_fail_before_localhost_fallback(monkeypatch):
    _clear_db_env(monkeypatch)
    settings = Settings(_env_file=None, db_host="rds.example.internal", db_port=5432)

    with pytest.raises(ValueError) as exc_info:
        _read_sqlalchemy_url(settings)

    message = str(exc_info.value)
    assert "DB_NAME" in message
    assert "DB_USER" in message
    assert "DB_PASSWORD" in message


def test_local_database_url_is_fallback_when_no_db_settings_are_present(monkeypatch):
    _clear_db_env(monkeypatch)
    settings = Settings(_env_file=None)

    assert _render(settings.sqlalchemy_url) == _render(
        make_url(LOCAL_DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1))
    )
