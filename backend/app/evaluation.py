from __future__ import annotations

import time
from typing import Any

from .story_hierarchy import WordRef


def run_faster_whisper_judge(
    _pcm_bytes: bytes | None,
    _expected_words: list[str],
) -> dict[str, Any]:
    """
    Post-session judge track. Install `faster-whisper` + model weights in production.
    """
    try:
        from faster_whisper import WhisperModel  # type: ignore

        if _pcm_bytes and len(_pcm_bytes) > 1000:
            model = WhisperModel("base.en", device="cpu", compute_type="int8")
            # Would write temp wav; omitted to keep skeleton lightweight
            return {"status": "available", "transcript": "", "note": "wire temp wav + transcribe"}
    except Exception as exc:
        return {"status": "skipped", "error": str(exc)}
    return {"status": "skipped", "note": "no_pcm"}


def build_four_json_reports(
    events: list[dict[str, Any]],
    words: list[WordRef],
    *,
    elapsed_sec: float,
    long_pause_seconds: float,
    correct_word_count: int,
    chunk_mistake_flags: dict[int, dict[str, bool]],
    no_pause_between_chunks: bool,
    max_silence_inside_chunk_ms: float,
    long_pause_sec_threshold: float = 2.0,
) -> dict[str, Any]:
    wrong: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    extra: list[dict[str, Any]] = []
    repeated: list[dict[str, Any]] = []

    for ev in events:
        k = ev.get("kind")
        if k == "SKIPPED_ASSIST":
            skipped.append(
                {
                    "word_index": ev.get("global_word_index"),
                    "hierarchy": ev.get("hierarchy"),
                    "reason": ev.get("reason"),
                }
            )
        elif k == "WRONG_WORD":
            wrong.append(ev.get("payload", {}))
        elif k == "EXTRA_WORD":
            extra.append(ev.get("payload", {}))
        elif k in ("REPEATED_WORD", "REPEATED_WORDS"):
            repeated.append(ev.get("payload", {}))

    # Chunk scoring
    chunk_scores: list[dict[str, Any]] = []
    for ck, flags in chunk_mistake_flags.items():
        mistake = bool(flags.get("skip"))
        chunk_scores.append({"chunk_index": ck, "mistake": mistake, "flags": flags})

    if no_pause_between_chunks:
        chunk_scores.append(
            {
                "chunk_index": -1,
                "mistake": True,
                "flags": {"reason": "no_pause_between_chunks"},
            }
        )
    if max_silence_inside_chunk_ms > long_pause_sec_threshold * 1000:
        chunk_scores.append(
            {
                "chunk_index": -2,
                "mistake": True,
                "flags": {
                    "reason": "long_pause_inside_chunk",
                    "ms": max_silence_inside_chunk_ms,
                },
            }
        )

    denom = max(0.001, elapsed_sec - long_pause_seconds)
    wcpm = (correct_word_count / denom) * 60.0

    return {
        "WRONG_WORDS": wrong,
        "SKIPPED_WORDS": skipped,
        "EXTRA_WORDS": extra,
        "REPEATED_WORDS": repeated,
        "CHUNK_SCORES": chunk_scores,
        "WCPM": round(wcpm, 2),
        "meta": {
            "elapsed_sec": round(elapsed_sec, 3),
            "long_pause_seconds_subtracted": round(long_pause_seconds, 3),
            "correct_word_count": correct_word_count,
            "total_story_words": len(words),
        },
    }


def summarize_session_for_eval(controller: Any, events: list[dict[str, Any]]) -> dict[str, Any]:
    elapsed = max(0.001, time.monotonic() - controller.session_start_monotonic)
    correct = sum(1 for e in events if e.get("kind") == "WORD_MATCHED")
    return build_four_json_reports(
        events,
        controller.words,
        elapsed_sec=elapsed,
        long_pause_seconds=controller.long_pause_seconds_accumulated,
        correct_word_count=correct,
        chunk_mistake_flags=controller.chunk_flags,
        no_pause_between_chunks=controller.no_pause_between_chunks,
        max_silence_inside_chunk_ms=controller.max_silence_inside_chunk_ms,
    )
