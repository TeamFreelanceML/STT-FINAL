from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any
from difflib import SequenceMatcher

from .config import LONG_PAUSE_SEC, PHONETIC_THRESHOLD, VAD_THRESHOLD_DB
from .matcher import is_word_match, phonetic_similarity, normalize_token
from .story_hierarchy import ChunkRef
from .story_hierarchy import WordRef, compare_pointer_forward, pointer_tuple

from .live_engine import CpuLiveTrack

def _prefix_match_length(expected: str, spoken: str) -> int:
    expected_text = normalize_token(expected)
    spoken_text = normalize_token(spoken)
    if not expected_text or not spoken_text:
        return 0
    matched = 0
    for a, b in zip(expected_text, spoken_text):
        if a != b:
            break
        matched += 1
    return matched


def _align_buffer_to_chunk(stt_buffer: list[str], chunk_words: list[str]) -> dict[int, str]:
    """
    Use SequenceMatcher to align STT buffer to chunk words.
    Returns dict[word_in_chunk_idx] = status ('correct', 'skipped', 'wrong', or empty).
    """
    if not stt_buffer or not chunk_words:
        return {}

    normalized_stt = [normalize_token(w) for w in stt_buffer]
    normalized_chunk = [normalize_token(w) for w in chunk_words]

    matcher = SequenceMatcher(None, normalized_chunk, normalized_stt)
    matching_blocks = matcher.get_matching_blocks()

    word_status: dict[int, str] = {}
    matched_indices = set()

    for block in matching_blocks:
        for i in range(block.size):
            chunk_idx = block.a + i
            matched_indices.add(chunk_idx)

    intervening_indices = set()
    sorted_matched = sorted(matched_indices)
    for i in range(len(sorted_matched) - 1):
        current = sorted_matched[i]
        next_idx = sorted_matched[i + 1]
        for interv in range(current + 1, next_idx):
            intervening_indices.add(interv)

    for chunk_idx in matched_indices:
        word_status[chunk_idx] = "correct"

    for chunk_idx in intervening_indices:
        if chunk_idx not in word_status:
            word_status[chunk_idx] = "skipped"

    return word_status



@dataclass
class SessionController:
    session_id: str
    words: list[WordRef]
    chunks: list[ChunkRef]
    store: Any
    last_matched_global: int = -1
    attempts_on_target: int = 0
    last_chunk_boundary_monotonic: float = field(default_factory=time.monotonic)
    no_pause_between_chunks: bool = False
    max_silence_inside_chunk_ms: float = 0.0
    chunk_flags: dict[int, dict[str, bool]] = field(default_factory=dict)
    session_start_monotonic: float = field(default_factory=time.monotonic)
    long_pause_seconds_accumulated: float = 0.0
    _last_silence_start: float | None = None
    _chunk_boundary_cleared: bool = True
    _last_mispronounce_hyp: str = ""
    _current_chunk_idx: int = -1
    _chunk_word_status: dict[int, str] = field(default_factory=dict)

    def expected_word(self) -> WordRef | None:
        nxt = self.last_matched_global + 1
        if nxt >= len(self.words):
            return None
        return self.words[nxt]

    def get_current_chunk_words(self) -> list[str] | None:
        """Get the words in the current chunk starting from last_matched_global."""
        expected = self.expected_word()
        if expected is None:
            return None
        p_idx = expected.paragraph_idx
        s_idx = expected.sentence_idx
        c_idx = expected.chunk_idx
        chunk_words = []
        for word in self.words:
            if (word.paragraph_idx == p_idx and 
                word.sentence_idx == s_idx and 
                word.chunk_idx == c_idx):
                chunk_words.append(word.text)
        return chunk_words if chunk_words else None

    def hwm_tuple(self) -> tuple[int, int, int, int]:
        if self.last_matched_global < 0:
            return (-1, -1, -1, -1)
        w = self.words[self.last_matched_global]
        return pointer_tuple(w)

    def process_chunk_alignment(self, now: float, engine: CpuLiveTrack) -> list[dict]:
        """Perform chunk-level alignment using the STT buffer."""
        out: list[dict] = []
        
        chunk_words = self.get_current_chunk_words()
        if not chunk_words:
            return out
        
        stt_phrase = engine.get_stt_buffer_phrase()
        if not stt_phrase:
            return out
        
        stt_buffer = stt_phrase.split()
        word_status = _align_buffer_to_chunk(stt_buffer, chunk_words)
        
        if not word_status:
            return out
        
        expected = self.expected_word()
        if expected is None:
            return out
        
        p_idx = expected.paragraph_idx
        s_idx = expected.sentence_idx
        c_idx = expected.chunk_idx
        
        matched_words: list[dict] = []
        skipped_count = 0
        
        for word_in_chunk_idx, status in sorted(word_status.items()):
            for word in self.words:
                if (word.paragraph_idx == p_idx and 
                    word.sentence_idx == s_idx and 
                    word.chunk_idx == c_idx and 
                    word.word_in_chunk == word_in_chunk_idx):
                    
                    if status == "correct":
                        self.last_matched_global = word.global_word_index
                        matched_words.append(
                            {
                                "type": "word_matched",
                                "paragraph_idx": word.paragraph_idx,
                                "sentence_idx": word.sentence_idx,
                                "chunk_idx": word.chunk_idx,
                                "word_in_chunk": word.word_in_chunk,
                                "global_word_index": word.global_word_index,
                                "flat_sentence_index": word.flat_sentence_index,
                                "expected_word": word.text,
                                "score": 0.95,
                            }
                        )
                    elif status == "skipped":
                        skipped_count += 1
                    break
        
        out.extend(matched_words)
        
        if skipped_count > 0:
            out.append({
                "type": "skipped_words",
                "count": skipped_count,
            })
        
        processed_pct = len(word_status) / len(chunk_words) if chunk_words else 0
        if processed_pct >= 0.70:
            self._current_chunk_idx = c_idx
            engine.clear_stt_buffer()
            out.append({
                "type": "chunk_advance",
                "chunk_idx": c_idx,
            })
        
        return out


    def on_audio_tick(self, db: float, engine: CpuLiveTrack) -> list[dict]:
        out: list[dict] = []
        now = time.monotonic()
        expected = self.expected_word()
        if expected is None:
            return [{"type": "session_complete", "last_matched_global": self.last_matched_global}]

        # Long pause accounting (evaluation): silence streaks > LONG_PAUSE_SEC
        if db < engine.voice_db_threshold:
            if self._last_silence_start is None:
                self._last_silence_start = now
        else:
            if self._last_silence_start is not None:
                dur = now - self._last_silence_start
                if dur > LONG_PAUSE_SEC:
                    self.long_pause_seconds_accumulated += dur - LONG_PAUSE_SEC
                self._last_silence_start = None

        # Try chunk-level alignment
        if engine._stt_buffer:
            chunk_out = self.process_chunk_alignment(now, engine)
            if chunk_out:
                out.extend(chunk_out)
                return out

        # Fallback: word-by-word matching as before
        if engine._silence_run_ms > 50:
            self.max_silence_inside_chunk_ms = max(
                self.max_silence_inside_chunk_ms,
                engine._silence_run_ms,
            )

        hyp = engine.hypothesis_for_speech(expected.text)
        if hyp:
            char_index = _prefix_match_length(expected.text, hyp)
            out.append(
                {
                    "type": "word_progress",
                    "status": "partial",
                    "matched_index": expected.global_word_index,
                    "char_index": char_index,
                    "expected_word": expected.text,
                }
            )
            engine.add_to_stt_buffer(hyp)

        if not hyp:
            return out

        score = phonetic_similarity(expected.text, hyp)
        if is_word_match(expected.text, hyp, PHONETIC_THRESHOLD):
            self.attempts_on_target = 0
            cand = pointer_tuple(expected)
            prev_t = self.hwm_tuple()
            if prev_t == (-1, -1, -1, -1) or compare_pointer_forward(prev_t, cand):
                prev_g = self.last_matched_global
                self._update_chunk_metrics(prev_g, expected, now)
                self.last_matched_global = expected.global_word_index
                self._chunk_boundary_cleared = False
                engine.reset_speech_timer()
                out.append(
                    {
                        "type": "word_matched",
                        "paragraph_idx": expected.paragraph_idx,
                        "sentence_idx": expected.sentence_idx,
                        "chunk_idx": expected.chunk_idx,
                        "word_in_chunk": expected.word_in_chunk,
                        "global_word_index": expected.global_word_index,
                        "flat_sentence_index": expected.flat_sentence_index,
                        "expected_word": expected.text,
                        "score": round(score, 4),
                    }
                )
        else:
            self.attempts_on_target += 1
            if 0.2 < score < PHONETIC_THRESHOLD:
                if hyp != self._last_mispronounce_hyp:
                    out.append(
                        {
                            "type": "mispronounce",
                            "global_word_index": expected.global_word_index,
                            "expected_word": expected.text,
                            "heard": hyp,
                            "score": round(score, 4),
                        }
                    )
                    self._last_mispronounce_hyp = hyp
            if self.attempts_on_target >= 2:
                out.append(
                    {
                        "type": "repeat_attempt",
                        "global_word_index": expected.global_word_index,
                        "attempts": self.attempts_on_target,
                    }
                )

        return out

    def _update_chunk_metrics(self, prev_global: int, w: WordRef, now: float) -> None:
        if prev_global < 0:
            self.last_chunk_boundary_monotonic = now
            return
        prev_w = self.words[prev_global]
        same_chunk = (
            prev_w.paragraph_idx == w.paragraph_idx
            and prev_w.sentence_idx == w.sentence_idx
            and prev_w.chunk_idx == w.chunk_idx
        )
        if not same_chunk:
            gap = now - self.last_chunk_boundary_monotonic
            if gap < 0.05:
                self.no_pause_between_chunks = True
            self.last_chunk_boundary_monotonic = now
            self.max_silence_inside_chunk_ms = 0.0

    async def handle_assist_skip(self, reason: str) -> dict:
        expected = self.expected_word()
        if expected is None:
            return {"type": "assist_ack", "skipped": False}
        gid = expected.global_word_index
        ck = self._chunk_global_index_for_word(expected)
        self.chunk_flags.setdefault(ck, {})["skip"] = True
        await self.store.rpush_json(
            self.session_id,
            "eventlog",
            {
                "kind": "SKIPPED_ASSIST",
                "reason": reason,
                "global_word_index": gid,
                "hierarchy": {
                    "p": expected.paragraph_idx,
                    "s": expected.sentence_idx,
                    "c": expected.chunk_idx,
                    "w": expected.word_in_chunk,
                },
            },
        )
        prev_t = self.hwm_tuple()
        cand = pointer_tuple(expected)
        if prev_t == (-1, -1, -1, -1) or compare_pointer_forward(prev_t, cand):
            self.last_matched_global = gid
        self.attempts_on_target = 0
        return {
            "type": "assist_ack",
            "skipped": True,
            "global_word_index": gid,
            "tts_url": "/static/tts/voice_1_bm_lewis/assist.wav",
        }

    def _chunk_global_index_for_word(self, w: WordRef) -> int:
        for c in self.chunks:
            if (
                c.paragraph_idx == w.paragraph_idx
                and c.sentence_idx == w.sentence_idx
                and c.chunk_idx == w.chunk_idx
            ):
                return c.global_chunk_index
        return -1
