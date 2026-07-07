# AI-Assisted Development Log

Name: Steven Fang
Week: Week 6 (July 2 - July 8, 2026)
Date: 2026-07-07

## 1. Task / Goal
This week I focused on wiring the frontend to the new backend Polly synthesis endpoint and debugging the integration end to end:

- Implemented the frontend side of narrator speech synthesis, replacing the browser's `speechSynthesis` fallback with calls to the backend's new `/voice/synthesize` endpoint.
- Diagnosed a chain of backend configuration issues (missing S3 bucket, wrong bucket value, missing signature version) that surfaced only when actually testing playback end to end.
- Revised the per-narrator Polly voice mapping to better match each persona.
- Fixed a stale-async-playback bug in the voice component surfaced during code review.
- Analyzed reviewer feedback against the actual state of both voice-related tickets and put the findings into a coverage report distinguishing what was actually completed from what still remained open.

## 2. AI Tools Used
Claude was used as a development partner for implementing the frontend voice integration, reading and cross-referencing the backend and infrastructure code to diagnose runtime errors, explaining the root cause of each failure before proposing a fix, and cross-checking completed work against ticket requirements.

## 3. Prompts / Agent Workflow
I started by asking Claude to compare the new backend voice endpoint against the existing frontend to figure out what needed to change. It read both codebases, identified that `NarratorOverlay.tsx` only used the browser's built-in `speechSynthesis` and never called the backend, and proposed a new `lib/voice.ts` helper plus a rewritten `speak()` function that calls the backend and falls back to browser TTS on failure.

When I actually tested it, I hit a sequence of runtime errors one at a time, and worked through each with Claude rather than guessing: a `VOICE_CACHE_BUCKET is not configured` error, then a generic `failed to synthesize narrator audio` error once the bucket was set, then a `NotSupportedError` from the browser's audio element once the backend calls started succeeding. For each one, I fed Claude the error screenshot and it walked back through the actual backend/infra source (`config.py`, `voice.py`, and eventually the Terraform files) rather than guessing generically, which is how we found that my `.env` had a raw Terraform resource reference instead of the real bucket name, and later that the presigned URL was failing because boto3 defaults to SigV2 signing for S3 in `us-west-2`, which S3 rejects for our SSE-KMS encrypted objects.

Separately, a reviewer left two comments on the PR: a failing backend test that still expected the old `Joanna` voice, and a suggestion to guard against stale audio playback if a request resolves after the component unmounts. I asked Claude to explain the race condition in plain terms before implementing anything, pushed back once when its first explanation described a scenario (double message submission) that wasn't actually reachable given the UI's existing button guard, and had it re-diagnose the real reachable case (navigating away mid-request) before applying the fix.

Toward the end of the week, I had Claude go back through the two open voice-related tickets item by item and check each requirement against what had actually been built and reviewed so far, rather than assuming everything discussed was covered. That produced a clear breakdown of what was done, what was only partially done, and what hadn't been touched at all.

## 4. Useful Output
- `src/lib/voice.ts`: a new helper that calls `POST /voice/synthesize` and returns the presigned audio URL.
- An updated `NarratorOverlay.tsx` that plays real Polly audio, keeps the old browser TTS as a fallback on failure, and guards against playing stale audio into an unmounted component.
- A corrected `VOICE_CACHE_BUCKET` value and a one-line backend fix (`Config(signature_version="s3v4")`) that resolved a `400 Bad Request` from S3 on every presigned URL.
- A revised `NARRATOR_VOICES` mapping (Brian, Amy, Arthur) better matched to each narrator's persona.
- A corrected backend test expectation and a cleaned-up file with a leftover commented-out draft removed.
- A ticket-coverage report identifying that the Transcribe/listening half of both voice tickets (backend Transcribe adapter, recording limits, no-persistence, and the Listening/Transcribing UI states) remained unaddressed, distinct from the Polly/speaking half that was complete.

## 5. Human Review / Changes
- I caught that Claude's first explanation of the async playback bug described a scenario (rapid double message submission) that the UI's existing `disabled={isListening || isLoading}` guard already prevented, and asked for the actual reachable case instead.
- I traced the real bucket name through the Terraform output rather than guessing at a naming convention, since the `.env` value on hand was a Terraform resource reference, not a usable bucket name.
- I decided which of the two review comments needed a code change versus which was a one-line test update, and asked for each to be explained separately before touching anything.
- I reviewed the final diff against the two review comments to confirm both the test fix and the unmount guard were narrowly scoped, and caught that the initial guard only covered the success path, not the fallback's `catch` block, before it went out.
- I directed the ticket-coverage analysis myself by supplying both ticket descriptions, then used the resulting breakdown to decide the Transcribe/listening work still needs to be scoped as separate follow-up rather than folded into this PR.

## 6. Reflection
Almost every bug this week was a configuration or environment problem, not a logic problem: a missing bucket, a copy-pasted Terraform expression instead of a real value, and a default AWS signing behavior that only breaks under a specific encryption setting. None of these would have shown up in code review, only in actually running the integration end to end, which reinforced that "the code looks right" and "the feature works" are different bars to clear once AWS services are involved.

The stale-playback bug was a good reminder to verify a proposed fix against the actual UI before accepting it. The first version of the explanation was for a bug that couldn't happen given the button's disabled state, and only became correct after checking what could actually trigger it in this app. Getting explanations before implementation, rather than accepting a diff outright, kept the fix scoped to a real problem instead of solving an imagined one.

