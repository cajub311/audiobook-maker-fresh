# Audiobook Maker Fresh

A clean rebuild of the audiobook maker: paste text, choose a voice, generate chunked MP3 narration, and download one combined file in the browser.

## Why this exists

The old repo had useful ideas, but too many competing paths: Python desktop code, VoiceForge experiments, serverless routes, service workers, premium voice experiments, generated caches, and several branches of UI behavior. This rebuild keeps one working path first.

## Features

- Static browser UI served by a tiny Node server.
- `GET /api/voices` for a curated voice list.
- `POST /api/tts` for one chunk of MP3 audio using Microsoft Edge neural voices through `msedge-tts`.
- Browser-side chunking and sequential progress so failures are easy to see.
- Downloadable combined MP3 blob.
- Fake TTS mode for reliable local tests: `ABM_FAKE_TTS=1`.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8010.

## Test

```bash
npm test
```

The tests use fake TTS mode and do not call external speech services.
