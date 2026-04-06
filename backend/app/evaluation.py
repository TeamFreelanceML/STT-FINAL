from __future__ import annotations

import time
from typing import Any

from .story_hierarchy import WordRef


def run_faster_whisper_judge(
    _pcm_bytes: bytes | None,
    _expected_words: list[str],
) -> dict[str, Any]:
    """
    Post-session judge track. In production, this would use a high-fidelity model.
    """
    return {"status": "available", "note": "Faster-Whisper judge track simulated"}


def generate_deep_report(
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
    """
    ReadAloud DeepReport: Pedagogical breakdown of reading performance.
    """
    # Error Categorization
    omissions = []     # Skipped words
    substitutions = [] # Mispronounced/Wrong words
    insertions = []    # Extra words detected
    repetitions = []   # Repeated attempts

    for ev in events:
        k = ev.get("kind")
        if k == "SKIPPED_ASSIST":
            omissions.append({
                "index": ev.get("global_word_index"),
                "text": words[ev["global_word_index"]].text if ev.get("global_word_index") is not None else "??",
                "reason": ev.get("reason")
            })
        elif k == "WRONG_WORD":
            payload = ev.get("payload", {})
            substitutions.append({
                "index": payload.get("global_word_index"),
                "expected": payload.get("expected"),
                "heard": payload.get("heard"),
                "score": payload.get("score")
            })
        elif k == "EXTRA_WORD":
            insertions.append(ev.get("payload", {}))
        elif k in ("REPEATED_WORD", "REPEATED_WORDS"):
            repetitions.append(ev.get("payload", {}))

    # Metric Synthesis
    total_words = len(words)
    accuracy = (correct_word_count / total_words * 100) if total_words > 0 else 0
    
    # Fluency: WCPM (Words Correct Per Minute)
    # Exclude long pauses from the time denominator for a 'pure' fluency measure
    effective_time_min = max(0.001, elapsed_sec - long_pause_seconds) / 60.0
    wcpm = correct_word_count / effective_time_min

    # Pronunciation Score (Average of matched word scores)
    matched_scores = [e.get("score") for e in events if e.get("kind") == "WORD_MATCHED" and e.get("score") is not None]
    avg_pronunciation = (sum(matched_scores) / len(matched_scores) * 100) if matched_scores else 0

    return {
        "deep_report": {
            "metrics": {
                "accuracy_percent": round(accuracy, 1),
                "wcpm": round(wcpm, 1),
                "pronunciation_score": round(avg_pronunciation, 1),
                "total_correct": correct_word_count,
                "total_words": total_words
            },
            "categorization": {
                "omissions": omissions,
                "substitutions": substitutions,
                "insertions": insertions,
                "repetitions": repetitions
            },
            "heatmap_data": {
                # Could maps global_word_index to struggle intensity
                "struggle_indices": [o["index"] for o in omissions] + [s["index"] for s in substitutions]
            }
        },
        "meta": {
            "elapsed_sec": round(elapsed_sec, 3),
            "long_pause_seconds_subtracted": round(long_pause_seconds, 3),
            "end_reason": "completed"
        }
    }


def summarize_session_for_eval(controller: Any, events: list[dict[str, Any]]) -> dict[str, Any]:
    elapsed = max(0.001, time.monotonic() - controller.session_start_monotonic)
    correct = sum(1 for e in events if e.get("kind") == "WORD_MATCHED")
    return generate_deep_report(
        events,
        controller.words,
        elapsed_sec=elapsed,
        long_pause_seconds=controller.long_pause_seconds_accumulated,
        correct_word_count=correct,
        chunk_mistake_flags=controller.chunk_flags,
        no_pause_between_chunks=controller.no_pause_between_chunks,
        max_silence_inside_chunk_ms=controller.max_silence_inside_chunk_ms,
    )
