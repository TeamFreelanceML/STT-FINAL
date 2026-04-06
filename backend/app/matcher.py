from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

from .config import PHONETIC_THRESHOLD


def normalize_token(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.lower()
    s = re.sub(r"[^\w\s]", "", s)
    return s.strip()


def metaphone(word: str) -> str:
    word = normalize_token(word).upper()
    if not word:
        return ""

    if word.startswith(("KN", "GN", "PN", "WR", "AE")):
        word = word[1:]
    if word.startswith("X"):
        word = "S" + word[1:]

    vowels = "AEIOUY"
    result: list[str] = []

    def append(code: str) -> None:
        if code and (not result or result[-1] != code):
            result.append(code)

    i = 0
    while i < len(word):
        ch = word[i]
        nxt = word[i + 1] if i + 1 < len(word) else ""
        nxt2 = word[i + 2] if i + 2 < len(word) else ""
        prev = word[i - 1] if i > 0 else ""

        if ch in vowels:
            if i == 0:
                append(ch)
        elif ch == "B":
            if not (prev == "M" and i == len(word) - 1):
                append("B")
        elif ch == "C":
            if nxt == "H":
                append("X")
                i += 1
            elif nxt in ("I", "E", "Y"):
                append("S")
            elif prev == "S" and nxt == "H":
                pass
            else:
                append("K")
        elif ch == "D":
            if nxt == "G" and nxt2 in ("E", "I", "Y"):
                append("J")
                i += 1
            else:
                append("T")
        elif ch == "F":
            append("F")
        elif ch == "G":
            if nxt == "H":
                if i + 2 < len(word) and word[i + 2] not in vowels:
                    pass
                else:
                    append("K")
                i += 1
            elif nxt == "N":
                if i + 1 == len(word) - 1 or (i + 2 == len(word) - 1 and word[i + 2] == "E"):
                    pass
                else:
                    append("K")
            elif prev == "G":
                append("K")
            elif nxt in ("E", "I", "Y"):
                append("J")
            else:
                append("K")
        elif ch == "H":
            if prev not in vowels or nxt not in vowels:
                pass
            else:
                append("H")
        elif ch == "J":
            append("J")
        elif ch == "K":
            if prev != "C":
                append("K")
        elif ch == "L":
            append("L")
        elif ch == "M":
            append("M")
        elif ch == "N":
            append("N")
        elif ch == "P":
            if nxt == "H":
                append("F")
                i += 1
            else:
                append("P")
        elif ch == "Q":
            append("K")
        elif ch == "R":
            append("R")
        elif ch == "S":
            if nxt == "H":
                append("X")
                i += 1
            elif nxt == "I" and nxt2 in ("O", "A"):
                append("X")
            else:
                append("S")
        elif ch == "T":
            if nxt == "I" and nxt2 in ("O", "A"):
                append("X")
            elif nxt == "H":
                append("0")
                i += 1
            elif not (nxt == "C" and nxt2 == "H"):
                append("T")
        elif ch == "V":
            append("F")
        elif ch == "W":
            if nxt in vowels:
                append("W")
        elif ch == "X":
            append("KS")
        elif ch == "Y":
            if nxt in vowels:
                append("Y")
        elif ch == "Z":
            append("S")

        i += 1

    return "".join(result)


def phonetic_similarity(expected: str, spoken: str) -> float:
    """
    Score in [0,1] using Metaphone + normalized Levenshtein similarity.
    This enforces stricter voice-to-word gating.
    """
    e = normalize_token(expected)
    g = normalize_token(spoken)
    if not e or not g:
        return 0.0

    met_e = metaphone(e)
    met_g = metaphone(g)
    if met_e and met_g:
        return float(Levenshtein.normalized_similarity(met_e, met_g))

    return float(Levenshtein.normalized_similarity(e, g))


def is_word_match(expected: str, spoken: str, threshold: float = PHONETIC_THRESHOLD) -> bool:
    return phonetic_similarity(expected, spoken) >= threshold
