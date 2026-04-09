# STT-FINAL

Production-style reading fluency application with:

- a Next.js frontend for guided reading
- a FastAPI backend for final speech evaluation
- browser-side Sherpa ONNX live highlighting
- backend Whisper-based scoring
- optional external TTS helper service for 6-second stuck-word playback

## Overview

This project is designed for guided read-aloud assessment.

The current app does two different kinds of speech work:

1. Live reading assistance in the browser
- Uses Sherpa ONNX WASM in the frontend
- Moves the active word cursor while the learner reads
- Triggers helper prompts when the learner is silent

2. Final evaluation in the backend
- Records the full session audio in the browser
- Uploads the audio to FastAPI after the session ends
- Uses Whisper `base` to transcribe
- Uses a custom evaluator to score:
  - accuracy
  - WCPM
  - chunking
  - wrong/skipped/extra/repeated words

## High-Level Flow

### Frontend flow

1. The learner starts a reading session.
2. Sherpa ONNX starts listening in the browser for live cursor movement.
3. The browser also starts recording the full session audio as `webm/opus`.
4. The story is shown paragraph by paragraph.
5. Only the active paragraph stays clear; other paragraphs blur.
6. Inside the active paragraph:
- chunks progress one by one
- the active chunk gets a background highlight
- the active word gets word-level highlight
7. If the learner is silent for 6 seconds:
- the app plays a helper word
- after helper playback, that word is marked as skipped
- the app advances to the next word
8. At the end of the reading session:
- the browser stops recording
- the audio is uploaded to the evaluation backend
- results are shown in the report page

### Backend evaluation flow

1. FastAPI receives the audio file and expected story text.
2. The backend stores the upload temporarily.
3. Trailing silence is trimmed safely before transcription.
4. Whisper `base` transcribes the full session.
5. The evaluator:
- parses the story by paragraph and `[...]` chunk boundaries
- aligns expected words with spoken words
- identifies:
  - wrong words
  - skipped words
  - extra words
  - repeated words
- computes:
  - accuracy score
  - WCPM
  - chunking score
6. The backend returns:
- score summaries
- formula/proof details
- paragraph/chunk evaluation data
- client-facing compatibility fields

### TTS helper flow

The frontend supports a word-level helper TTS call after 6 seconds of silence.

Expected TTS flow:

1. Frontend sends `POST /narrate/word`
2. TTS backend returns `audio.url`
3. Frontend plays the returned WAV
4. If TTS fails, the frontend falls back to browser `speechSynthesis`

Important:
- the TTS service is external to this repo
- the current frontend expects a separate service on port `8001`

## Current Architecture

```text
Frontend (Next.js)
  ├─ Story rendering
  ├─ Sherpa ONNX live cursor/highlighting
  ├─ MediaRecorder full session capture
  ├─ 6-second helper flow
  └─ Results page
          │
          ├─ POST /evaluate  -> FastAPI backend (this repo)
          └─ POST /narrate/word -> external TTS backend

Backend (FastAPI)
  ├─ preprocess audio
  ├─ transcribe with Whisper base
  ├─ evaluate expected vs spoken words
  └─ return metrics + report payload
```

## Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Sherpa ONNX WASM

### Backend

- Python
- FastAPI
- Whisper (`openai-whisper`)
- ffmpeg

### External TTS service

Documented separately.

Expected stack:
- FastAPI
- Redis
- Celery
- Kokoro ONNX

## Repository Structure

```text
STT-FINAL/
  backend/
    main.py
    evaluator.py
    whisper_engine.py
    transcription_service.py
    evaluation_service.py
    audio_preprocess_service.py
    timing_utils.py
    tests/

  frontend/
    app/
      page.tsx
      results/page.tsx
    hooks/
      useSherpa.ts
      useAudioRecorder.ts
      useEvaluation.ts
    components/
      BlurGate.tsx
    lib/
      parseStory.ts
      storyData.ts
      types.ts
    public/
      sherpa-onnx/

  docker-compose.yml
  tts_word_generation_flow.md
```

## Models and Engines

### Frontend live engine

Used in:
- [useSherpa.ts](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/frontend/hooks/useSherpa.ts)

Model/runtime:
- Sherpa ONNX WASM

Current runtime assets:
- `sherpa-onnx.js`
- `sherpa-onnx-wasm-main-asr.js`
- `sherpa-onnx-wasm-main-asr.wasm`
- `sherpa-onnx-wasm-main-asr.data`

### Backend evaluation engine

Used in:
- [whisper_engine.py](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/backend/whisper_engine.py)

Model:
- Whisper `base`

Configured in:
- [main.py](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/backend/main.py)

### External helper TTS engine

Documented in:
- [tts_word_generation_flow.md](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/tts_word_generation_flow.md)

Expected:
- word-level narration endpoint
- cached WAV output
- low-latency synchronous response

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- ffmpeg installed and available on PATH

For Windows:

```powershell
winget install ffmpeg
```

## Frontend Setup

```powershell
cd frontend
npm install
npm run download-model
```

Frontend environment file:

Create `.env.local` or use defaults:

```env
NEXT_PUBLIC_EVALUATION_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_TTS_WORD_API_URL=http://localhost:8001/narrate/word
```

Sherpa model download:

You can also use the provided drive link if needed:

`https://drive.google.com/drive/folders/1NTYKExmHQWWqujWoEQVh6u9rwnBOcEgI?usp=sharing`

## Backend Setup

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend environment values are optional and default-safe:

```env
STT_MODEL_NAME=base
API_HOST=0.0.0.0
API_PORT=8000
```

## How To Run

### Run locally

Terminal 1:

```powershell
cd backend
venv\Scripts\activate
python main.py
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`

### Docker

Docker files are included for frontend and backend.

At the repo root:

```powershell
docker compose up --build
```

Notes:
- frontend and backend Dockerfiles are ready
- runtime Docker validation for the external TTS service is separate

## Backend API

### `POST /evaluate`

Evaluates a recorded reading session.

Request:
- `multipart/form-data`
- fields:
  - `audio`: uploaded session audio
  - `expected_text`: story text
  - `helper_skipped_words`: optional JSON array of helper-forced skipped words

Example request fields:

```text
audio = evaluation_session.webm
expected_text = <full story text>
helper_skipped_words = [{"expected_index": 14, "word": "forest"}]
```

Example response shape:

```json
{
  "accuracy_score": 82.4,
  "wcpm": 61.2,
  "chunking_score": 75.0,
  "wrong_words": [],
  "skipped_words": [],
  "extra_words": [],
  "repeated_words": [],
  "paragraph_reports": [],
  "story_evaluation": [],
  "metrics": {
    "wcpm": 61.2,
    "accuracy_score": 82.4,
    "chunking_score": 75.0
  },
  "timing": {
    "preprocess_ms": 55,
    "transcribe_ms": 1800,
    "evaluate_ms": 40,
    "total_ms": 1895
  }
}
```

### `GET /health`

Health endpoint for the evaluation API.

Example response:

```json
{
  "status": "healthy",
  "service": "judge-api-v2.0.1",
  "model": "whisper-base"
}
```

## External TTS API

The frontend expects a separate word-TTS service.

Expected endpoint:

### `POST /narrate/word`

Example request:

```json
{
  "voice": {
    "voice_id": "voice_1_bm_lewis",
    "language": "en-US"
  },
  "speech_config": {
    "wpm": 140
  },
  "word": "forest"
}
```

Example response:

```json
{
  "audio": {
    "url": "/audio/word_abcd1234.wav",
    "duration_ms": 1240
  },
  "metadata": {
    "wpm": 140,
    "voice_id": "voice_1_bm_lewis",
    "language": "en-US"
  }
}
```

See:
- [tts_word_generation_flow.md](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/tts_word_generation_flow.md)

## Evaluation Logic Summary

### Accuracy

Formula:

```text
(correct_story_words / total_story_words) * 100
```

### WCPM

Formula:

```text
(valid_spoken_words / total_reading_seconds) * 60
```

### Chunking score

A chunk becomes mistakeful when:

- it contains skipped story words
- the gap between adjacent chunks is `<= 1 second`, making both chunks mistakeful

Formula:

```text
(correct_chunks / total_chunks) * 100
```

## Test Commands

Backend tests:

```powershell
python -m pytest backend\tests -q
```

Frontend production build:

```powershell
cd frontend
npm run build
```

Python compile sanity check:

```powershell
python -m py_compile backend\main.py backend\evaluator.py backend\evaluation_service.py
```

## Known Issues / Current Notes

1. The external TTS service must be available separately on port `8001` or another configured URL.

2. Browser warning still exists in the current frontend:
- `ScriptProcessorNode` is deprecated in [useSherpa.ts](/c:/Users/Administrator/OneDrive/Desktop/STT-FINAL/frontend/hooks/useSherpa.ts)
- migration to `AudioWorkletNode` is still pending

3. Helper-played skipped words are now forwarded to the backend so they stay `skipped` instead of incorrectly showing up as `extra` in the reported evaluation path.

4. The live highlighting engine and the final grading engine are different:
- frontend live engine: Sherpa ONNX
- backend final evaluation engine: Whisper

So live cursor behavior and final grading are related, but not identical engines.

## Quick Start

If you just want to run the core app:

1. Install ffmpeg
2. Start backend on `8000`
3. Start frontend on `3000`
4. Ensure Sherpa frontend assets are present
5. Optionally start external TTS service on `8001`

Then open:

`http://localhost:3000`
