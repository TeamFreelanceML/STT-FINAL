from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz

from .config import PHONETIC_THRESHOLD


def normalize_token(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.lower()
    s = re.sub(r"[^\w\s]", "", s)
    return s.strip()


def _consonant_skeleton(s: str) -> str:
    """Cheap accent/homophone helper without native metaphone deps (Py3.14-safe)."""
    s = normalize_token(s)
    return re.sub(r"[aeiouy]+", "", s)


def phonetic_similarity(expected: str, spoken: str) -> float:
    """
    Score in [0,1]. Uses fuzzy ratios + consonant skeleton boost for homophones/accents.
    Threshold 0.7 recommended.
    """
    e = normalize_token(expected)
    g = normalize_token(spoken)
    if not e or not g:
        return 0.0
    ratio = fuzz.ratio(e, g) / 100.0
    partial = fuzz.partial_ratio(e, g) / 100.0
    token_sort = fuzz.token_sort_ratio(e, g) / 100.0
    base = max(ratio, partial * 0.96, token_sort * 0.94)
    sk_e, sk_g = _consonant_skeleton(e), _consonant_skeleton(g)
    if sk_e and sk_g and sk_e == sk_g:
        return float(min(1.0, max(base, 0.78)))
    if sk_e and sk_g and fuzz.ratio(sk_e, sk_g) >= 88:
        return float(min(1.0, max(base, 0.72)))
    return float(base)


def is_word_match(expected: str, spoken: str, threshold: float = PHONETIC_THRESHOLD) -> bool:
    return phonetic_similarity(expected, spoken) >= threshold
