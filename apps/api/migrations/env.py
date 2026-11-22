"""Alembic migration environment (SQLite WAL + Postgres compatible)."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from app.adapters.db.engine import create_db_engine, normalize_database_url
from app.adapters.db.models import Base
from app.core.config import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _get_url() -> str:
    # Prefer programmatic attribute (avoids ConfigParser % interpolation issues)
    attr_url = config.attributes.get("url")
    if isinstance(attr_url, str) and attr_url:
        return normalize_database_url(attr_url)
    ini_url = config.get_main_option("sqlalchemy.url")
    if ini_url:
        return normalize_database_url(ini_url)
    return normalize_database_url(get_settings().database_url)


def run_migrations_offline() -> None:
    url = _get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _get_url()
    connectable = create_db_engine(url)
    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=connection.dialect.name == "sqlite",
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
