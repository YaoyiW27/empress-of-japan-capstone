"""Unit tests for the backend voice endpoints and Polly cache adapter."""

from __future__ import annotations

from collections.abc import AsyncIterator
from io import BytesIO

from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.voice import (
    PollyS3VoiceSynthesizer,
    SynthesisResult,
    TranscriptMessage,
    VoiceSynthesizer,
    cache_key,
)


class FakeSynthesizer(VoiceSynthesizer):
    def __init__(self, result: SynthesisResult | None = None) -> None:
        self.calls: list[tuple[str, str]] = []
        self.result = result or SynthesisResult(
            audio_url="https://audio.example/cached.mp3",
            cached=True,
            expires_in=900,
        )

    def synthesize(self, *, narrator_id: str, text: str) -> SynthesisResult:
        self.calls.append((narrator_id, text))
        return self.result


def test_synthesize_endpoint_requires_bucket_config() -> None:
    client = TestClient(create_app(Settings(voice_cache_bucket=None)))

    resp = client.post(
        "/voice/synthesize",
        json={"narrator_id": "captain_sinclair", "text": "Welcome aboard."},
    )

    assert resp.status_code == 503
    assert resp.json()["detail"] == "VOICE_CACHE_BUCKET is not configured"


def test_synthesize_endpoint_rejects_unknown_narrator() -> None:
    synth = FakeSynthesizer()
    client = TestClient(
        create_app(Settings(voice_cache_bucket="voice-cache"), voice_synthesizer=synth)
    )

    resp = client.post(
        "/voice/synthesize",
        json={"narrator_id": "unknown", "text": "Welcome aboard."},
    )

    assert resp.status_code == 404
    assert synth.calls == []


def test_synthesize_endpoint_rejects_empty_text() -> None:
    client = TestClient(create_app(Settings(voice_cache_bucket="voice-cache")))

    resp = client.post(
        "/voice/synthesize",
        json={"narrator_id": "captain_sinclair", "text": "   "},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "text must not be empty"


def test_synthesize_endpoint_enforces_text_limit() -> None:
    client = TestClient(
        create_app(Settings(voice_cache_bucket="voice-cache", voice_max_text_length=5))
    )

    resp = client.post(
        "/voice/synthesize",
        json={"narrator_id": "captain_sinclair", "text": "too long"},
    )

    assert resp.status_code == 400
    assert "VOICE_MAX_TEXT_LENGTH" in resp.json()["detail"]


def test_synthesize_endpoint_uses_server_voice_mapping_only() -> None:
    synth = FakeSynthesizer()
    client = TestClient(
        create_app(Settings(voice_cache_bucket="voice-cache"), voice_synthesizer=synth)
    )

    resp = client.post(
        "/voice/synthesize",
        json={
            "narrator_id": "ming_chen",
            "text": "Can you hear the engines?",
            "voice_id": "Amy",
            "engine": "standard",
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "audio_url": "https://audio.example/cached.mp3",
        "cached": True,
        "expires_in": 900,
    }
    assert synth.calls == [("ming_chen", "Can you hear the engines?")]


class FakeS3Client:
    def __init__(self, *, exists: bool) -> None:
        self.exists = exists
        self.puts: list[dict] = []
        self.heads: list[dict] = []
        self.presigned: list[dict] = []

    def head_object(self, **kwargs) -> None:
        self.heads.append(kwargs)
        if not self.exists:
            raise ClientError(
                {"Error": {"Code": "404", "Message": "Not Found"}},
                "HeadObject",
            )

    def put_object(self, **kwargs) -> None:
        self.puts.append(kwargs)

    def generate_presigned_url(self, operation: str, *, Params: dict, ExpiresIn: int) -> str:
        self.presigned.append({"operation": operation, "params": Params, "expires": ExpiresIn})
        return f"https://audio.example/{Params['Key']}"


class FakePollyClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def synthesize_speech(self, **kwargs) -> dict:
        self.calls.append(kwargs)
        return {"AudioStream": BytesIO(b"mp3-bytes")}


def test_polly_cache_hit_returns_presigned_url_without_synthesizing() -> None:
    s3 = FakeS3Client(exists=True)
    polly = FakePollyClient()
    synth = PollyS3VoiceSynthesizer(
        bucket="voice-cache",
        prefix="polly-cache/",
        engine="neural",
        language_code="en-US",
        expires_in=900,
        region="us-west-2",
        s3_client=s3,
        polly_client=polly,
    )

    result = synth.synthesize(narrator_id="captain_sinclair", text="Welcome aboard.")

    assert result.cached is True
    assert result.expires_in == 900
    assert polly.calls == []
    assert s3.puts == []
    assert s3.presigned[0]["operation"] == "get_object"


def test_polly_cache_miss_synthesizes_and_uploads_mp3() -> None:
    s3 = FakeS3Client(exists=False)
    polly = FakePollyClient()
    synth = PollyS3VoiceSynthesizer(
        bucket="voice-cache",
        prefix="polly-cache/",
        engine="neural",
        language_code="en-US",
        expires_in=900,
        region="us-west-2",
        s3_client=s3,
        polly_client=polly,
    )

    result = synth.synthesize(narrator_id="eleanor_whitmore", text="Tea is at four.")

    assert result.cached is False
    assert polly.calls == [
        {
            "Engine": "neural",
            "OutputFormat": "mp3",
            "Text": "Tea is at four.",
            "VoiceId": "Amy",
        }
    ]
    assert s3.puts[0]["Bucket"] == "voice-cache"
    assert s3.puts[0]["Body"] == b"mp3-bytes"
    assert s3.puts[0]["ContentType"] == "audio/mpeg"


def test_cache_key_does_not_expose_visitor_text() -> None:
    key = cache_key(
        prefix="polly-cache/",
        voice_id="Matthew",
        engine="neural",
        language_code="en-US",
        text="My private question should not appear in the S3 key.",
    )

    assert key.startswith("polly-cache/v1/Matthew/neural/en-US/")
    assert key.endswith(".mp3")
    assert "private" not in key
    assert "question" not in key


class FakeTranscriber:
    async def transcribe(self, chunks: AsyncIterator[bytes]) -> AsyncIterator[TranscriptMessage]:
        seen = []
        async for chunk in chunks:
            seen.append(chunk)
            yield TranscriptMessage(transcript="part", is_final=False)
        if seen:
            yield TranscriptMessage(transcript="final", is_final=True)


def test_transcribe_websocket_streams_partial_and_final_transcripts() -> None:
    client = TestClient(create_app(Settings(), transcriber=FakeTranscriber()))

    with client.websocket_connect("/voice/transcribe") as ws:
        ws.send_bytes(b"\x00\x01")
        assert ws.receive_json() == {
            "type": "transcript",
            "transcript": "part",
            "is_final": False,
        }
        ws.send_text("end")
        assert ws.receive_json() == {
            "type": "transcript",
            "transcript": "final",
            "is_final": True,
        }


def test_transcribe_websocket_rejects_empty_audio_chunk() -> None:
    client = TestClient(create_app(Settings(), transcriber=FakeTranscriber()))

    with client.websocket_connect("/voice/transcribe") as ws:
        ws.send_bytes(b"")
        assert ws.receive_json() == {
            "type": "error",
            "detail": "audio chunk must not be empty",
        }


def test_transcribe_websocket_enforces_duration_limit() -> None:
    client = TestClient(create_app(Settings(), transcriber=FakeTranscriber()))

    with client.websocket_connect("/voice/transcribe") as ws:
        ws.send_bytes(bytes(16_000 * 2 * 16))
        assert ws.receive_json() == {
            "type": "error",
            "detail": "recording exceeded 15 seconds",
        }
