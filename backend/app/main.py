from __future__ import annotations

import json
import logging
import os
import uuid
import wave
from dataclasses import dataclass
from typing import Any

import struct
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import evaluation
from .config import STORY_PATH, TTS_VOICE_DIR
from .live_engine import CpuLiveTrack
from .session_controller import SessionController
from .store import SessionStore
from .story_hierarchy import flatten_story, load_story

logger = logging.getLogger("guided_reading")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Guided Reading AI", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = SessionStore(os.getenv("REDIS_URL", "").strip() or None)


@dataclass
class ClientSession:
    controller: SessionController
    engine: CpuLiveTrack


CLIENT_SESSIONS: dict[str, ClientSession] = {}
EVALUATION_CACHE: dict[str, dict[str, Any]] = {}


def _ensure_word_wav(word: str) -> str:
    word_safe = "".join(c for c in word.lower() if c.isalnum()) or "word"
    os.makedirs(os.path.join(TTS_VOICE_DIR, "words"), exist_ok=True)
    path = os.path.join(TTS_VOICE_DIR, "words", f"{word_safe}.wav")
    if os.path.isfile(path) and os.path.getsize(path) > 100:
        return f"/static/tts/voice_1_bm_lewis/words/{word_safe}.wav"
    
    # Generate 0.5s silent placeholder (simulating TTS output)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16_000)
        for _ in range(8_000):
            wf.writeframes(struct.pack("<h", 0))
    return f"/static/tts/voice_1_bm_lewis/words/{word_safe}.wav"


@app.on_event("startup")
async def _startup() -> None:
    await store.connect()
    os.makedirs(TTS_VOICE_DIR, exist_ok=True)
    static_root = os.path.join(os.path.dirname(__file__), "..", "static")
    os.makedirs(static_root, exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_root), name="static")


@app.on_event("shutdown")
async def _shutdown() -> None:
    await store.close()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/sessions")
async def create_session() -> dict[str, str]:
    story = load_story(STORY_PATH)
    words, chunks = flatten_story(story)
    sid = str(uuid.uuid4())
    ctrl = SessionController(
        session_id=sid,
        words=words,
        chunks=chunks,
        store=store,
    )
    # TTS Pre-Warming: Ensure audio snippets exist for all unique words
    unique_words = {w.text for w in words}
    for uw in unique_words:
        _ensure_word_wav(uw)

    CLIENT_SESSIONS[sid] = ClientSession(controller=ctrl, engine=CpuLiveTrack())
    await store.hset_json(
        sid,
        "meta",
        {"story_title": story.get("title", ""), "word_count": len(words)},
    )
    return {"session_id": sid}


@app.get("/sessions/{session_id}/evaluation")
async def get_evaluation(session_id: str) -> JSONResponse:
    if session_id not in EVALUATION_CACHE:
        raise HTTPException(status_code=404, detail="evaluation not ready")
    return JSONResponse(EVALUATION_CACHE[session_id])


@app.post("/sessions/{session_id}/end")
async def end_session(session_id: str, body: dict[str, Any] | None = None) -> JSONResponse:
    if session_id not in CLIENT_SESSIONS:
        raise HTTPException(status_code=404, detail="unknown session")
    cs = CLIENT_SESSIONS.pop(session_id)
    events = await store.lrange_json(session_id, "eventlog")
    judge = evaluation.run_faster_whisper_judge(
        None,
        [w.text for w in cs.controller.words],
    )
    report = evaluation.summarize_session_for_eval(cs.controller, events)
    report["JUDGE_TRACK"] = judge
    reason = (body or {}).get("reason", "client_end")
    report["meta"]["end_reason"] = reason
    EVALUATION_CACHE[session_id] = report
    return JSONResponse(report)


@app.websocket("/ws/read/{session_id}")
async def ws_read(session_id: str, websocket: WebSocket) -> None:
    await websocket.accept()
    cs = CLIENT_SESSIONS.get(session_id)
    if cs is None:
        await websocket.close(code=4404)
        return
    ctrl, engine = cs.controller, cs.engine
    try:
        await websocket.send_json(
            {
                "type": "hello",
                "session_id": session_id,
                "word_count": len(ctrl.words),
            }
        )
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("type") != "websocket.receive":
                continue
            if msg.get("bytes") is not None:
                chunk: bytes = msg["bytes"]
                db = engine.ingest_pcm(chunk)
                out = ctrl.on_audio_tick(db, engine)
                for m in out:
                    if m.get("type") == "word_matched":
                        await store.rpush_json(
                            session_id,
                            "eventlog",
                            {
                                "kind": "WORD_MATCHED",
                                "global_word_index": m["global_word_index"],
                                "hierarchy": {
                                    "p": m["paragraph_idx"],
                                    "s": m["sentence_idx"],
                                    "c": m["chunk_idx"],
                                    "w": m["word_in_chunk"],
                                },
                                "score": m.get("score"),
                            },
                        )
                    elif m.get("type") == "repeat_attempt":
                        await store.rpush_json(
                            session_id,
                            "eventlog",
                            {
                                "kind": "REPEATED_WORD",
                                "payload": {
                                    "global_word_index": m["global_word_index"],
                                    "attempts": m["attempts"],
                                },
                            },
                        )
                    elif m.get("type") == "mispronounce":
                        await store.rpush_json(
                            session_id,
                            "eventlog",
                            {
                                "kind": "WRONG_WORD",
                                "payload": {
                                    "global_word_index": m["global_word_index"],
                                    "expected": m.get("expected_word"),
                                    "heard": m.get("heard"),
                                    "score": m.get("score"),
                                },
                            },
                        )
                    await websocket.send_json(m)
            elif msg.get("text") is not None:
                data = json.loads(msg["text"])
                t = data.get("type")
                if t == "ASSIST_REQ":
                    ack = await ctrl.handle_assist_skip(
                        data.get("reason", "watchdog"),
                    )
                    # Point to the specific pre-warmed word snippet
                    expected = ctrl.expected_word()
                    if expected:
                        word_safe = "".join(c for c in expected.text.lower() if c.isalnum()) or "word"
                        ack["tts_url"] = f"/static/tts/voice_1_bm_lewis/words/{word_safe}.wav"
                    
                    await websocket.send_json(ack)
                elif t == "PING":
                    await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        logger.info("ws disconnect %s", session_id)
    except Exception:
        logger.exception("ws error %s", session_id)
        raise


@app.get("/tts/voice_1_bm_lewis/{name}")
def tts_file(name: str) -> FileResponse:
    safe = os.path.basename(name)
    path = os.path.join(TTS_VOICE_DIR, safe)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="missing tts asset")
    return FileResponse(path, media_type="audio/wav")


# Legacy stream endpoint (PCM-only) kept for older clients
@app.websocket("/ws/stream/{session_id}")
async def ws_stream_legacy(session_id: str, websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_bytes()
            logger.info("[legacy %s] PCM %s bytes", session_id, len(data))
    except WebSocketDisconnect:
        pass
