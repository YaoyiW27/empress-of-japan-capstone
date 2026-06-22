"""Persona registry — load the system prompts authored under ``data/ai/personas``.

Each persona is a markdown file with YAML frontmatter (``id``, ``name``, ``scenes``)
and a fenced code block under ``## System Prompt`` (PR #68). We parse those into a
``Persona`` and expose a registry keyed by id plus a ``scene -> personas`` index.

Routing is scene/explicit (issue #31 decision): ``persona_id`` is the primary
selector; ``scene`` is only a hint, since some scenes (e.g. ``loading_dock``,
``promenade_deck``) are shared by more than one persona.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

# data/ai/personas/, resolved relative to the repo root (this file is at
# <root>/backend/app/agents/personas.py).
PERSONA_DIR = Path(__file__).resolve().parents[3] / "data" / "ai" / "personas"

_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
# First fenced ``` block following the "## System Prompt" heading.
_SYSTEM_PROMPT_RE = re.compile(r"##\s*System Prompt.*?```\w*\n(.*?)\n```", re.DOTALL)


@dataclass(frozen=True)
class Persona:
    id: str
    name: str
    scenes: tuple[str, ...]
    system_prompt: str


def _parse(text: str, source: str) -> Persona:
    fm_match = _FRONTMATTER_RE.match(text)
    if not fm_match:
        raise ValueError(f"{source}: missing YAML frontmatter")
    meta = yaml.safe_load(fm_match.group(1)) or {}

    sp_match = _SYSTEM_PROMPT_RE.search(text)
    if not sp_match:
        raise ValueError(f"{source}: no fenced block under '## System Prompt'")
    system_prompt = sp_match.group(1).strip()

    try:
        return Persona(
            id=str(meta["id"]),
            name=str(meta["name"]),
            scenes=tuple(meta.get("scenes") or ()),
            system_prompt=system_prompt,
        )
    except KeyError as exc:
        raise ValueError(f"{source}: frontmatter missing {exc}") from exc


@lru_cache(maxsize=1)
def load_personas(persona_dir: Path = PERSONA_DIR) -> dict[str, Persona]:
    """Parse every ``*.md`` under ``persona_dir`` into a {id: Persona} registry."""
    registry: dict[str, Persona] = {}
    for path in sorted(persona_dir.glob("*.md")):
        persona = _parse(path.read_text(encoding="utf-8"), path.name)
        registry[persona.id] = persona
    if not registry:
        raise ValueError(f"no persona markdown files found in {persona_dir}")
    return registry


@lru_cache(maxsize=1)
def scene_to_personas(persona_dir: Path = PERSONA_DIR) -> dict[str, tuple[str, ...]]:
    """Map each scene to the persona ids that appear in it (frontmatter ``scenes``)."""
    index: dict[str, list[str]] = {}
    for persona in load_personas(persona_dir).values():
        for scene in persona.scenes:
            index.setdefault(scene, []).append(persona.id)
    return {scene: tuple(ids) for scene, ids in index.items()}
