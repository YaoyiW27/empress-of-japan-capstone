"""add lifecycle metadata for agent sessions

Revision ID: 0002_agent_sessions
Revises: 0001_initial
Create Date: 2026-07-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_agent_sessions"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE agent_sessions (
            session_id      TEXT PRIMARY KEY,
            last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at      TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX idx_agent_sessions_expires_at ON agent_sessions (expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agent_sessions")
