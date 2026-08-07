"""drop external sources that are not about this ship

Four entries were removed from ``backend/external_sources.json``. Ingest is an
upsert and never deletes records dropped from a manifest, so the rows already
embedded in the deployed database stay until they are deleted here.

One was a duplicate. "RMS Empress of Japan (1930-1942) — project summary" was a
hand-written paraphrase whose ``source_url`` pointed at the very Wikipedia
article the manifest already fetches in full, so it added no source the
knowledge base lacked — only a shorter, fact-dense version that outranked the
full article on the questions the full article answers better.

The other three are articles about other vessels, kept for convoy context: SS
America, SS Manhattan, and RMS Empress of France. Of the 28 chunks they
contributed, 24 never mentioned the Empress of Japan at all, and together they
made up more than half of a 47-chunk external corpus whose subject is one ship.
The cost was measurable: asked where this ship was built and when she was
launched, retrieval returned SS Manhattan and SS America across the whole top
five and pushed the Empress of Japan's own article down to rank six.

This does thin the Singapore evacuation, which is genuinely part of this ship's
war service — but what thins is mostly the other ships' part in it. Company and
owner context stays (CP Ships, Hamburg Atlantic Line), as does the 1934 Babe
Ruth tour, because those are about this ship, its operators, and what happened
aboard her.

Revision ID: 0003_drop_off_subject_sources
Revises: 0002_agent_sessions
Create Date: 2026-08-07
"""

from collections.abc import Sequence

from sqlalchemy import text

from alembic import op

revision: str = "0003_drop_off_subject_sources"
down_revision: str | None = "0002_agent_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REMOVED_TITLES = (
    "RMS Empress of Japan (1930-1942) — project summary",
    "SS America / USS West Point Singapore convoy context — Wikipedia",
    "SS Manhattan / USS Wakefield Convoy BM 11 context — Wikipedia",
    "RMS Empress of France / Duchess of Bedford convoy context — Wikipedia",
)

# The three summaries that stay were attributed to the project team alone, so the
# source card read "External historical source · Empress of Japan Capstone team" --
# which a visitor reasonably takes for an outside reference when it is our own
# wording. Credit the publication the facts came from instead; the card links
# straight to it, so the visitor can read the original for themselves. The licence
# stays scoped to the summary text, which is what the row actually stores.
#
# Re-running ingest cannot apply this: content_hash covers title, source_url and
# body only, so an attribution-only edit hashes identical and the upsert skips the
# row. These have to be written directly.
_REATTRIBUTED = (
    ("RMS Empress of Scotland (1942-1957) — project summary", "The Great Ocean Liners"),
    ("TS Hanseatic (1958-1966) — project summary", "The Great Ocean Liners"),
    ("Empress of Japan 1934 baseball voyage — project summary", "Wanted on the Voyage"),
)
_SUMMARY_LICENSE = "Summary text CC BY 4.0"


def upgrade() -> None:
    bind = op.get_bind()
    # chunks.document_id is ON DELETE CASCADE, so the embeddings go with the rows.
    bind.execute(
        text(
            """
            DELETE FROM documents
            WHERE source_type = 'external_historical'
              AND title = ANY(:titles)
            """
        ),
        {"titles": list(_REMOVED_TITLES)},
    )
    for title, author_publisher in _REATTRIBUTED:
        bind.execute(
            text(
                """
                UPDATE documents
                SET author_publisher = :author_publisher,
                    license = :license
                WHERE source_type = 'external_historical'
                  AND title = :title
                """
            ),
            {"title": title, "author_publisher": author_publisher, "license": _SUMMARY_LICENSE},
        )


def downgrade() -> None:
    """Deliberately a no-op.

    The deleted entries went from the manifest in the same change, so there is
    nothing left in the repository to restore those rows from. To bring any of them
    back, restore the manifest entry and re-run ingest. The attribution change is
    left in place on the way down: the previous value credited only ourselves for
    facts drawn from someone else's publication, and is not worth restoring.
    """
