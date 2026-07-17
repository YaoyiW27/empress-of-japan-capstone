"""Scene registry for context prompts authored under ``data/ai/scenes``."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from app.config import get_settings

_FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
_CONTEXT_PROMPT_RE = re.compile(
    r"##\s*Scene Context Prompt.*?```\w*\n(.*?)\n```",
    re.DOTALL,
)


@dataclass(frozen=True)
class Scene:
    id: str
    name: str
    context_prompt: str


def _parse(text: str, source: str) -> Scene:
    frontmatter_match = _FRONTMATTER_RE.match(text)
    if not frontmatter_match:
        raise ValueError(f"{source}: missing YAML frontmatter")
    metadata = yaml.safe_load(frontmatter_match.group(1)) or {}

    prompt_match = _CONTEXT_PROMPT_RE.search(text)
    if not prompt_match:
        raise ValueError(f"{source}: no fenced block under '## Scene Context Prompt'")

    try:
        return Scene(
            id=str(metadata["id"]),
            name=str(metadata["name"]),
            context_prompt=prompt_match.group(1).strip(),
        )
    except KeyError as exc:
        raise ValueError(f"{source}: frontmatter missing {exc}") from exc


@lru_cache(maxsize=1)
def load_scenes(scene_dir: Path | None = None) -> dict[str, Scene]:
    """Parse every scene markdown file into a registry keyed by canonical ID."""
    resolved_dir = scene_dir or get_settings().scene_dir
    registry: dict[str, Scene] = {}
    for path in sorted(resolved_dir.glob("*.md")):
        scene = _parse(path.read_text(encoding="utf-8"), path.name)
        if scene.id in registry:
            raise ValueError(f"{path.name}: duplicate scene id {scene.id!r}")
        registry[scene.id] = scene
    if not registry:
        raise ValueError(f"no scene markdown files found in {resolved_dir}")
    return registry
