from __future__ import annotations

import math
import struct
from collections import deque

from .config import PCM_SAMPLE_RATE, VAD_THRESHOLD_DB


def pcm16_rms_db(chunk: bytes) -> float:
    if len(chunk) < 2:
        return -100.0
    n = len(chunk) // 2
    s = 0.0
    for i in range(n):
        v = struct.unpack_from("<h", chunk, i * 2)[0]
        s += v * v
    rms = math.sqrt(s / max(1, n))
    if rms <= 1e-9:
        return -100.0
    return 20.0 * math.log10(rms / 32768.0)


class RingBuffer:
    def __init__(self, max_bytes: int) -> None:
        self.max_bytes = max_bytes
        self._d: deque[bytes] = deque()
        self._size = 0

    def extend(self, data: bytes) -> None:
        self._d.append(data)
        self._size += len(data)
        while self._size > self.max_bytes and self._d:
            old = self._d.popleft()
            self._size -= len(old)


class CpuLiveTrack:
    """
    CPU-friendly live path: energy gate + stub streaming hypothesis.
    Swap `hypothesis_for_speech` for Sherpa-ONNX streaming + Silero VAD.
    """

    def __init__(self, voice_db_threshold: float | None = None) -> None:
        self.buffer = RingBuffer(max_bytes=PCM_SAMPLE_RATE * 2 * 4)
        self.voice_db_threshold = voice_db_threshold if voice_db_threshold is not None else VAD_THRESHOLD_DB
        self._speech_run_ms = 0.0
        self._silence_run_ms = 0.0

    def ingest_pcm(self, chunk: bytes) -> float:
        self.buffer.extend(chunk)
        db = pcm16_rms_db(chunk)
        chunk_ms = (len(chunk) / 2) / PCM_SAMPLE_RATE * 1000.0
        if db >= self.voice_db_threshold:
            self._speech_run_ms += chunk_ms
            self._silence_run_ms = 0.0
        else:
            self._silence_run_ms += chunk_ms
            self._speech_run_ms = 0.0
        return db

    def hypothesis_for_speech(self, expected_text: str) -> str:
        """Stub Zipformer partial — replace with Sherpa streaming result."""
        w = expected_text
        if self._speech_run_ms < 80:
            return ""
        # Faster matching (250ms for a full word) for better feel
        frac = min(1.0, self._speech_run_ms / 250.0)
        n = max(1, int(len(w) * frac))
        return w[:n]

    def reset_speech_timer(self) -> None:
        """Manual reset after word match to prevent chain-matches."""
        self._speech_run_ms = 0.0
