# Guided Reading (skeleton)

Monorepo: Next.js frontend, FastAPI backend, Dockerfiles under `docker/`.

## Run locally

**Backend** (from repo root):

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend**:

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env.local` if you need a custom WebSocket URL (`NEXT_PUBLIC_WS_URL`).

## Docker

Build from the repository root:

```bash
docker build -f docker/Dockerfile.backend -t guided-reading-backend .
docker build -f docker/Dockerfile.frontend -t guided-reading-frontend .
```

## Data model

See `schemas/story.schema.json` and `frontend/data/story.json`.
