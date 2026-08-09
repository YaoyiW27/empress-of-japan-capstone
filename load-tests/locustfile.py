"""Bounded Locust scenarios for deployed demo-readiness checks.

Default behavior is intentionally low-cost: only `/health` and `/health/db`.
Set LOCUST_ENABLE_CHAT=true to exercise the live Bedrock-backed chat path.
"""

from __future__ import annotations

import os
import random
import uuid

from locust import HttpUser, between, task


def _enabled(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _weight(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return max(0, int(value))
    except ValueError:
        return default


ENABLE_CHAT = _enabled("LOCUST_ENABLE_CHAT")
ENABLE_RETRIEVE = _enabled("LOCUST_ENABLE_RETRIEVE")
ENABLE_VOICE = _enabled("LOCUST_ENABLE_VOICE")

HEALTH_WEIGHT = _weight("LOCUST_HEALTH_WEIGHT", 10)
DB_HEALTH_WEIGHT = _weight("LOCUST_DB_HEALTH_WEIGHT", 0)
CHAT_WEIGHT = _weight("LOCUST_CHAT_WEIGHT", 1) if ENABLE_CHAT else 0
RETRIEVE_WEIGHT = _weight("LOCUST_RETRIEVE_WEIGHT", 1) if ENABLE_RETRIEVE else 0
VOICE_WEIGHT = _weight("LOCUST_VOICE_WEIGHT", 1) if ENABLE_VOICE else 0


CHAT_CASES = [
    {
        "persona_id": "captain_sinclair",
        "scene": "bridge",
        "message": "What can you tell me about the Empress of Japan?",
    },
    {
        "persona_id": "eleanor_whitmore",
        "scene": "dining_saloon",
        "message": "What would a passenger notice in this room?",
    },
    {
        "persona_id": "ming_chen",
        "scene": "crew_mess_hall",
        "message": "What was daily life like for crew members?",
    },
]

RETRIEVE_CASES = [
    {"query": "Empress of Japan ocean liner", "top_k": 5},
    {"query": "Canadian Pacific steamship dining saloon", "top_k": 5},
    {"query": "crew life aboard Empress of Japan", "top_k": 5},
]

VOICE_CASES = [
    {
        "narrator_id": "captain_sinclair",
        "text": "Welcome aboard. Keep your eyes on the bridge and the horizon.",
    },
    {
        "narrator_id": "eleanor_whitmore",
        "text": "The saloon carries the feeling of a journey as much as a meal.",
    },
    {
        "narrator_id": "ming_chen",
        "text": "Below deck, the ship sounds different. Work has its own rhythm here.",
    },
]


class DemoReadinessUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self) -> None:
        self.session_id = f"locust-{uuid.uuid4()}"

    @task(HEALTH_WEIGHT)
    def health(self) -> None:
        self.client.get("/health", name="GET /health")

    @task(DB_HEALTH_WEIGHT)
    def health_db(self) -> None:
        self.client.get("/health/db", name="GET /health/db")

    @task(CHAT_WEIGHT)
    def chat(self) -> None:
        if not ENABLE_CHAT:
            return
        payload = random.choice(CHAT_CASES)
        self.client.post("/chat", json={**payload, "history": []}, name="POST /chat")

    @task(RETRIEVE_WEIGHT)
    def retrieve(self) -> None:
        if not ENABLE_RETRIEVE:
            return
        self.client.post("/retrieve", json=random.choice(RETRIEVE_CASES), name="POST /retrieve")

    @task(VOICE_WEIGHT)
    def synthesize_voice(self) -> None:
        if not ENABLE_VOICE:
            return
        self.client.post(
            "/voice/synthesize",
            json=random.choice(VOICE_CASES),
            name="POST /voice/synthesize",
        )
