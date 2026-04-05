# Guided Reading AI

Production-oriented monorepo for a **real-time guided reading assistant** (children’s reading): Next.js UI, FastAPI + WebSockets, optional Redis, CPU-friendly inference hooks.

## Architecture

| Track | Role | Implementation |
|--------|------|----------------|
| **Live** | UI highlighting, low latency | `CpuLiveTrack` + matcher (swap for **Sherpa-ONNX** streaming Zipformer + **Silero VAD**) |
| **Judge** | Post-session evaluation | `evaluation.run_faster_whisper_judge` (install **faster-whisper** + `base.en`) |
| **State** | Pointers / event log | `SessionController` **high-water mark** + Redis or in-memory `SessionStore` |

**Story hierarchy:** Paragraph → Sentence → Chunk → Word (`schemas/story.schema.json`, `backend/data/story.json`).

**Session end JSON:** `WRONG_WORDS`, `SKIPPED_WORDS`, `EXTRA_WORDS`, `REPEATED_WORDS`, plus `CHUNK_SCORES`, `WCPM`, `JUDGE_TRACK` — see `POST /sessions/{id}/end`.

## Run locally

**Redis (optional):** `docker run -p 6379:6379 redis:7-alpine` then `set REDIS_URL=redis://127.0.0.1:6379/0`.

**Backend** (from `backend/`):

```bash
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (`frontend/`):

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` (see `frontend/.env.example`). WebSocket path: `/ws/read/{session_id}` after `POST /sessions`.

## Docker Compose (API + Redis)

```bash
docker compose up --build
```

## CI / CPU Docker image

```bash
docker build -f docker/Dockerfile.backend -t guided-reading-api .
```

Add ONNX / Whisper layers in a derived image for Cloud Run.

## Publish to GitHub (TeamFreelanceML)

Target repo: **`guided-reading-ai`**.

```bash
git remote add origin https://github.com/TeamFreelanceML/guided-reading-ai.git
git push -u origin main
```
