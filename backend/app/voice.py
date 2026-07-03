"""AWS-backed visitor voice helpers.

The browser talks only to this backend. Polly, Transcribe, and S3 credentials
stay server-side through the ECS task role or local AWS profile.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

import boto3
from botocore.exceptions import ClientError

CACHE_VERSION = "v1"
VOICE_SAMPLE_RATE_HZ = 16_000
VOICE_BYTES_PER_SAMPLE = 2
VOICE_MAX_RECORDING_SECONDS = 15

NARRATOR_VOICES: dict[str, str] = {
    "captain_sinclair": "Matthew",
    "eleanor_whitmore": "Joanna",
    "ming_chen": "Kevin",
}


class VoiceConfigurationError(RuntimeError):
    """The deployed voice runtime is missing required server-side settings."""


class VoiceSynthesisError(RuntimeError):
    """Polly or S3 failed while preparing narrator audio."""


@dataclass(frozen=True)
class SynthesisResult:
    audio_url: str
    cached: bool
    expires_in: int


@dataclass(frozen=True)
class TranscriptMessage:
    transcript: str
    is_final: bool

    def payload(self) -> dict[str, str | bool]:
        return {
            "type": "transcript",
            "transcript": self.transcript,
            "is_final": self.is_final,
        }


class VoiceSynthesizer(Protocol):
    def synthesize(self, *, narrator_id: str, text: str) -> SynthesisResult: ...


class Transcriber(Protocol):
    async def transcribe(
        self, chunks: AsyncIterator[bytes]
    ) -> AsyncIterator[TranscriptMessage]: ...


def narrator_voice(narrator_id: str) -> str:
    """Resolve the backend-controlled Polly voice for a narrator."""
    return NARRATOR_VOICES[narrator_id]


def cache_key(
    *,
    prefix: str,
    voice_id: str,
    engine: str,
    language_code: str,
    text: str,
) -> str:
    normalized_prefix = prefix if prefix.endswith("/") else f"{prefix}/"
    digest = hashlib.sha256(
        json.dumps(
            {
                "version": CACHE_VERSION,
                "voice_id": voice_id,
                "engine": engine,
                "language_code": language_code,
                "text": text,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return f"{normalized_prefix}{CACHE_VERSION}/{voice_id}/{engine}/{language_code}/{digest}.mp3"


class PollyS3VoiceSynthesizer:
    def __init__(
        self,
        *,
        bucket: str | None,
        prefix: str,
        engine: str,
        language_code: str,
        expires_in: int,
        region: str,
        s3_client=None,
        polly_client=None,
    ) -> None:
        self.bucket = bucket
        self.prefix = prefix
        self.engine = engine
        self.language_code = language_code
        self.expires_in = expires_in
        self.region = region
        self.s3 = s3_client
        self.polly = polly_client

    def synthesize(self, *, narrator_id: str, text: str) -> SynthesisResult:
        if not self.bucket:
            raise VoiceConfigurationError("VOICE_CACHE_BUCKET is not configured")
        if self.s3 is None:
            self.s3 = boto3.client("s3", region_name=self.region)
        if self.polly is None:
            self.polly = boto3.client("polly", region_name=self.region)

        voice_id = narrator_voice(narrator_id)
        key = cache_key(
            prefix=self.prefix,
            voice_id=voice_id,
            engine=self.engine,
            language_code=self.language_code,
            text=text,
        )

        if self._cache_exists(key):
            return self._presigned(key, cached=True)

        try:
            response = self.polly.synthesize_speech(
                Engine=self.engine,
                OutputFormat="mp3",
                Text=text,
                VoiceId=voice_id,
            )
            stream = response["AudioStream"]
            audio = stream.read()
            close = getattr(stream, "close", None)
            if callable(close):
                close()
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=audio,
                ContentType="audio/mpeg",
            )
        except Exception as exc:
            raise VoiceSynthesisError("failed to synthesize narrator audio") from exc

        return self._presigned(key, cached=False)

    def _cache_exists(self, key: str) -> bool:
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise VoiceSynthesisError("failed to check voice cache") from exc

    def _presigned(self, key: str, *, cached: bool) -> SynthesisResult:
        try:
            url = self.s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=self.expires_in,
            )
        except Exception as exc:
            raise VoiceSynthesisError("failed to generate voice playback URL") from exc
        return SynthesisResult(audio_url=url, cached=cached, expires_in=self.expires_in)


class AmazonTranscribeAdapter:
    def __init__(
        self,
        *,
        language_code: str,
        region: str,
        sample_rate_hz: int = VOICE_SAMPLE_RATE_HZ,
    ) -> None:
        self.language_code = language_code
        self.region = region
        self.sample_rate_hz = sample_rate_hz

    async def transcribe(self, chunks: AsyncIterator[bytes]) -> AsyncIterator[TranscriptMessage]:
        from amazon_transcribe.client import TranscribeStreamingClient
        from amazon_transcribe.handlers import TranscriptResultStreamHandler
        from amazon_transcribe.model import TranscriptEvent

        client = TranscribeStreamingClient(region=self.region)
        stream = await client.start_stream_transcription(
            language_code=self.language_code,
            media_sample_rate_hz=self.sample_rate_hz,
            media_encoding="pcm",
        )
        queue: asyncio.Queue[TranscriptMessage | None] = asyncio.Queue()

        class QueueingHandler(TranscriptResultStreamHandler):
            async def handle_transcript_event(self, transcript_event: TranscriptEvent) -> None:
                results = transcript_event.transcript.results
                for result in results:
                    if not result.alternatives:
                        continue
                    transcript = result.alternatives[0].transcript
                    if transcript:
                        await queue.put(
                            TranscriptMessage(
                                transcript=transcript,
                                is_final=not result.is_partial,
                            )
                        )

        async def write_audio() -> None:
            try:
                async for chunk in chunks:
                    await stream.input_stream.send_audio_event(audio_chunk=chunk)
            finally:
                await stream.input_stream.end_stream()

        async def read_transcripts() -> None:
            try:
                handler = QueueingHandler(stream.output_stream)
                await handler.handle_events()
            finally:
                await queue.put(None)

        writers = asyncio.create_task(write_audio())
        readers = asyncio.create_task(read_transcripts())
        try:
            while True:
                message = await queue.get()
                if message is None:
                    break
                yield message
        finally:
            for task in (writers, readers):
                if not task.done():
                    task.cancel()
            await asyncio.gather(writers, readers, return_exceptions=True)


def chunk_seconds(
    chunk: bytes,
    *,
    sample_rate_hz: int = VOICE_SAMPLE_RATE_HZ,
    bytes_per_sample: int = VOICE_BYTES_PER_SAMPLE,
) -> float:
    return len(chunk) / float(sample_rate_hz * bytes_per_sample)
