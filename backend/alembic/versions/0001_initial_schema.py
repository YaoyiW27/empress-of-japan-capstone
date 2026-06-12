"""initial schema (generated from backend/db/schema.sql)

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-12

This is the initial migration, mirroring ``backend/db/schema.sql`` (the canonical
DDL) statement-for-statement so the two do not diverge. Alembic owns migrations
from here forward. ``alembic upgrade head`` on an empty database must produce the
same schema as ``schema.sql`` (tables, enums, indexes incl. HNSW, and the
``retrievable_chunks`` view).
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # --- Enums ---------------------------------------------------------------
    op.execute(
        """
        CREATE TYPE source_type_enum AS ENUM (
            'vmm_catalogue',
            'vmm_digitized_sample',
            'external_historical'
        )
        """
    )
    op.execute(
        """
        CREATE TYPE ship_enum AS ENUM (
            'ship_i',
            'ship_ii',
            'undetermined',
            'other'
        )
        """
    )
    op.execute(
        """
        CREATE TYPE era_enum AS ENUM (
            'empress_of_japan',
            'empress_of_scotland',
            'hanseatic',
            'na'
        )
        """
    )
    op.execute(
        """
        CREATE TYPE sensitivity_enum AS ENUM (
            'public',
            'passenger_archival'
        )
        """
    )

    # --- documents -----------------------------------------------------------
    op.execute(
        """
        CREATE TABLE documents (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

            source_type     source_type_enum NOT NULL,
            title           TEXT NOT NULL,
            object_identifier TEXT,
            source_url      TEXT,
            public_url      TEXT,
            author_publisher TEXT,
            license         TEXT,
            source_file     TEXT,
            content_hash    TEXT NOT NULL,
            metadata        JSONB NOT NULL DEFAULT '{}',

            ship            ship_enum,
            era             era_enum,
            material_type   TEXT,
            category        TEXT,
            object_type     TEXT,
            materials       TEXT,
            measurements    TEXT,
            place_made      TEXT,
            made_by         TEXT,
            previous_numbers TEXT,
            exhibitions     TEXT,

            sensitivity     sensitivity_enum NOT NULL DEFAULT 'public',
            voyage_date     DATE,
            in_scope        BOOLEAN NOT NULL DEFAULT TRUE,

            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_documents_object_identifier
            ON documents (object_identifier)
            WHERE object_identifier IS NOT NULL
        """
    )
    op.execute(
        """
        ALTER TABLE documents ADD CONSTRAINT chk_external_license
            CHECK (source_type <> 'external_historical' OR license IS NOT NULL)
        """
    )
    op.execute("CREATE INDEX idx_documents_source_type   ON documents (source_type)")
    op.execute("CREATE INDEX idx_documents_ship          ON documents (ship)")
    op.execute("CREATE INDEX idx_documents_material_type ON documents (material_type)")
    op.execute("CREATE INDEX idx_documents_sensitivity   ON documents (sensitivity)")
    op.execute("CREATE INDEX idx_documents_in_scope      ON documents (in_scope)")

    # --- chunks --------------------------------------------------------------
    op.execute(
        """
        CREATE TABLE chunks (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            document_id     BIGINT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
            chunk_index     INT NOT NULL DEFAULT 0,
            source_field    TEXT NOT NULL,
            content         TEXT NOT NULL,

            embedding       vector(1024) NOT NULL,
            embedding_model TEXT NOT NULL DEFAULT 'amazon.titan-embed-text-v2:0',
            token_count     INT,
            embedded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

            UNIQUE (document_id, chunk_index)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX idx_chunks_embedding_hnsw
            ON chunks USING hnsw (embedding vector_cosine_ops)
        """
    )
    op.execute("CREATE INDEX idx_chunks_document_id ON chunks (document_id)")

    # --- retrievable_chunks view ---------------------------------------------
    op.execute(
        """
        CREATE VIEW retrievable_chunks AS
        SELECT
            c.id            AS chunk_id,
            c.document_id,
            c.content,
            c.embedding,
            c.source_field,
            d.source_type,
            d.title,
            d.ship,
            d.era,
            d.material_type,
            d.object_identifier,
            d.public_url,
            d.source_url,
            d.author_publisher,
            d.license
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE d.in_scope = TRUE
          AND (
                d.sensitivity = 'public'
                OR (
                    d.sensitivity = 'passenger_archival'
                    AND d.voyage_date IS NOT NULL
                    AND d.voyage_date < DATE '1945-01-01'
                )
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS retrievable_chunks")
    op.execute("DROP TABLE IF EXISTS chunks")
    op.execute("DROP TABLE IF EXISTS documents")
    op.execute("DROP TYPE IF EXISTS sensitivity_enum")
    op.execute("DROP TYPE IF EXISTS era_enum")
    op.execute("DROP TYPE IF EXISTS ship_enum")
    op.execute("DROP TYPE IF EXISTS source_type_enum")
