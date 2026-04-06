import os

REDIS_URL = os.getenv("REDIS_URL", "").strip() or None
_default_story = os.path.join(os.path.dirname(__file__), "..", "data", "story.json")
STORY_PATH = os.getenv("STORY_PATH", _default_story)
TTS_VOICE_DIR = os.getenv(
    "TTS_VOICE_DIR",
    os.path.join(os.path.dirname(__file__), "..", "static", "tts", "voice_1_bm_lewis"),
)
PHONETIC_THRESHOLD = float(os.getenv("PHONETIC_THRESHOLD", "0.85"))
VAD_THRESHOLD_DB = float(os.getenv("VAD_THRESHOLD_DB", "-25.0"))
LONG_PAUSE_SEC = float(os.getenv("LONG_PAUSE_SEC", "2.0"))
PCM_SAMPLE_RATE = 16_000
