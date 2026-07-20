-- Empress of Japan — knowledge base schema (Postgres + pgvector)
--
-- This is the RUNNABLE source of truth for the schema. It is the executable
-- mirror of data/schema.md §6 — see that doc for the full design rationale
-- (privacy model, column-fate mapping, embedding strategy, citation chain).
--
-- Applied automatically on first container start via docker-compose
-- (mounted into /docker-entrypoint-initdb.d/). Can also be run directly:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
--
-- Alembic migrations cumulatively mirror this file. A fresh database can be
-- created from either this DDL or `alembic upgrade head`.

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- agent_sessions — lifecycle metadata for LangGraph threads.
-- LangGraph owns its checkpoint_* tables; this table owns expiry only.
-- ============================================================
CREATE TABLE agent_sessions (
    session_id      TEXT PRIMARY KEY,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_agent_sessions_expires_at ON agent_sessions (expires_at);

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE source_type_enum AS ENUM (
    'vmm_catalogue',
    'vmm_digitized_sample',
    'external_historical'
);

CREATE TYPE ship_enum AS ENUM (
    'ship_i',          -- Empress of Japan (I)
    'ship_ii',         -- Empress of Japan (II) / Scotland / Hanseatic hull
    'undetermined',    -- ship unconfirmed
    'other'            -- not an Empress of Japan vessel
);

CREATE TYPE era_enum AS ENUM (
    'empress_of_japan',     -- 1930-1942
    'empress_of_scotland',  -- 1942-1957
    'hanseatic',            -- post-1957
    'na'
);

CREATE TYPE sensitivity_enum AS ENUM (
    'public',
    'passenger_archival'    -- public archival, post-1945 descendant gate
);

-- ============================================================
-- documents
-- ============================================================
CREATE TABLE documents (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    source_type     source_type_enum NOT NULL,
    title           TEXT NOT NULL,           -- cleaned, <i> markup stripped
    object_identifier TEXT,                  -- VMM PK (unique within catalogue); NULL for external
    source_url      TEXT,                    -- external origin URL
    public_url      TEXT,                    -- public VMM detail page, if any
    author_publisher TEXT,                   -- external author/publisher
    license         TEXT,                    -- required for external_historical
    source_file     TEXT,                    -- ingest provenance (which file/export)
    content_hash    TEXT NOT NULL,           -- dedup / change detection
    metadata        JSONB NOT NULL DEFAULT '{}',  -- source-specific extras

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
    voyage_date     DATE,                    -- enrichment; NULL until derived
    in_scope        BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- object_identifier is unique among catalogue rows but NULL elsewhere.
CREATE UNIQUE INDEX uq_documents_object_identifier
    ON documents (object_identifier)
    WHERE object_identifier IS NOT NULL;

-- External docs must carry a license (auditable attribution).
ALTER TABLE documents ADD CONSTRAINT chk_external_license
    CHECK (source_type <> 'external_historical' OR license IS NOT NULL);

CREATE INDEX idx_documents_source_type   ON documents (source_type);
CREATE INDEX idx_documents_ship          ON documents (ship);
CREATE INDEX idx_documents_material_type ON documents (material_type);
CREATE INDEX idx_documents_sensitivity   ON documents (sensitivity);
CREATE INDEX idx_documents_in_scope      ON documents (in_scope);

-- ============================================================
-- chunks
-- ============================================================
CREATE TABLE chunks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id     BIGINT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index     INT NOT NULL DEFAULT 0,
    source_field    TEXT NOT NULL,           -- e.g. 'composed', 'description', 'body'
    content         TEXT NOT NULL,           -- cleaned + redacted text that was embedded

    embedding       vector(1024) NOT NULL,   -- Bedrock Titan Text Embeddings V2
    embedding_model TEXT NOT NULL DEFAULT 'amazon.titan-embed-text-v2:0',
    token_count     INT,
    embedded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (document_id, chunk_index)
);

-- Approximate nearest-neighbour search (cosine matches Titan embeddings).
CREATE INDEX idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_chunks_document_id ON chunks (document_id);

-- ============================================================
-- retrievable_chunks — the ONLY surface the RAG layer queries.
-- Enforces ingest scope + the passenger-archival post-1945 gate (fail-closed).
-- ============================================================
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
  );
