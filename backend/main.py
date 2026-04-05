import logging
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("guided_reading")

app = FastAPI(title="Guided Reading API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Level 1: in-memory session state (dummy pointer)
session_state: dict[str, dict[str, Any]] = {}


def default_pointer() -> dict[str, int]:
    return {"paragraph_idx": 0, "sentence_idx": 0, "word_idx": 0}


@app.websocket("/ws/stream/{session_id}")
async def stream_audio(session_id: str, websocket: WebSocket) -> None:
    await websocket.accept()

    if session_id not in session_state:
        session_state[session_id] = {"current_pointer": default_pointer()}

    ptr = session_state[session_id]["current_pointer"]

    try:
        while True:
            data = await websocket.receive_bytes()
            n = len(data)
            logger.info("[%s] PCM chunk size: %s bytes", session_id, n)

            # Dummy advance (wrap) so state visibly changes during streaming
            ptr["word_idx"] = (ptr["word_idx"] + 1) % 256
    except WebSocketDisconnect:
        logger.info("[%s] client disconnected", session_id)
    except Exception:
        logger.exception("[%s] stream error", session_id)
        raise


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
