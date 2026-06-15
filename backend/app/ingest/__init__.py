"""VMM ingest pipeline — CSV/external source → privacy filter → chunk → embed → pgvector.

Implements the six-stage outline in ``data/ingest-pipeline.md`` (issue #28),
grounded in the schema (``data/schema.md``) and audit (``data/audit-notes.md``).
"""
