"""SQLAlchemy models mirroring ``backend/db/schema.sql``.

``schema.sql`` is the canonical DDL; these models mirror it for application and
ingest use, and Alembic owns migrations going forward. Keep the three in sync.
"""

import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 1024
DEFAULT_EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0"


class Base(DeclarativeBase):
    pass


# --- Enums (mirror schema.sql) -------------------------------------------------
class SourceType(enum.StrEnum):
    vmm_catalogue = "vmm_catalogue"
    vmm_digitized_sample = "vmm_digitized_sample"
    external_historical = "external_historical"


class Ship(enum.StrEnum):
    ship_i = "ship_i"
    ship_ii = "ship_ii"
    undetermined = "undetermined"
    other = "other"


class Era(enum.StrEnum):
    empress_of_japan = "empress_of_japan"
    empress_of_scotland = "empress_of_scotland"
    hanseatic = "hanseatic"
    na = "na"


class Sensitivity(enum.StrEnum):
    public = "public"
    passenger_archival = "passenger_archival"


# Reuse existing PG types (created by the migration); don't re-emit CREATE TYPE.
source_type_enum = ENUM(SourceType, name="source_type_enum", create_type=False)
ship_enum = ENUM(Ship, name="ship_enum", create_type=False)
era_enum = ENUM(Era, name="era_enum", create_type=False)
sensitivity_enum = ENUM(Sensitivity, name="sensitivity_enum", create_type=False)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "source_type <> 'external_historical' OR license IS NOT NULL",
            name="chk_external_license",
        ),
        Index(
            "uq_documents_object_identifier",
            "object_identifier",
            unique=True,
            postgresql_where=text("object_identifier IS NOT NULL"),
        ),
        Index("idx_documents_source_type", "source_type"),
        Index("idx_documents_ship", "ship"),
        Index("idx_documents_material_type", "material_type"),
        Index("idx_documents_sensitivity", "sensitivity"),
        Index("idx_documents_in_scope", "in_scope"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    source_type: Mapped[SourceType] = mapped_column(source_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    object_identifier: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    public_url: Mapped[str | None] = mapped_column(Text)
    author_publisher: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
    source_file: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'")
    )

    ship: Mapped[Ship | None] = mapped_column(ship_enum)
    era: Mapped[Era | None] = mapped_column(era_enum)
    material_type: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    object_type: Mapped[str | None] = mapped_column(Text)
    materials: Mapped[str | None] = mapped_column(Text)
    measurements: Mapped[str | None] = mapped_column(Text)
    place_made: Mapped[str | None] = mapped_column(Text)
    made_by: Mapped[str | None] = mapped_column(Text)
    previous_numbers: Mapped[str | None] = mapped_column(Text)
    exhibitions: Mapped[str | None] = mapped_column(Text)

    sensitivity: Mapped[Sensitivity] = mapped_column(
        sensitivity_enum, nullable=False, server_default=text("'public'")
    )
    voyage_date: Mapped[Date | None] = mapped_column(Date)
    in_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index"),
        Index(
            "idx_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("idx_chunks_document_id", "document_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    source_field: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    embedding_model: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text(f"'{DEFAULT_EMBEDDING_MODEL}'")
    )
    token_count: Mapped[int | None] = mapped_column(Integer)
    embedded_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped[Document] = relationship(back_populates="chunks")
