from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WordRef:
    paragraph_idx: int
    sentence_idx: int
    chunk_idx: int
    word_in_chunk: int
    global_word_index: int
    text: str
    flat_sentence_index: int


@dataclass(frozen=True)
class ChunkRef:
    paragraph_idx: int
    sentence_idx: int
    chunk_idx: int
    global_chunk_index: int
    word_start_global: int
    word_end_global: int  # exclusive


def load_story(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def flatten_story(story: dict[str, Any]) -> tuple[list[WordRef], list[ChunkRef]]:
    words: list[WordRef] = []
    chunks: list[ChunkRef] = []
    g = 0
    g_chunk = 0
    flat_sentence_index = 0
    for p_i, para in enumerate(story.get("paragraphs", [])):
        for s_i, sent in enumerate(para.get("sentences", [])):
            for c_i, chunk in enumerate(sent.get("chunks", [])):
                w_list = chunk.get("words", [])
                start_g = g
                for w_i, w in enumerate(w_list):
                    words.append(
                        WordRef(
                            paragraph_idx=p_i,
                            sentence_idx=s_i,
                            chunk_idx=c_i,
                            word_in_chunk=w_i,
                            global_word_index=g,
                            text=str(w),
                            flat_sentence_index=flat_sentence_index,
                        )
                    )
                    g += 1
                chunks.append(
                    ChunkRef(
                        paragraph_idx=p_i,
                        sentence_idx=s_i,
                        chunk_idx=c_i,
                        global_chunk_index=g_chunk,
                        word_start_global=start_g,
                        word_end_global=g,
                    )
                )
                g_chunk += 1
            flat_sentence_index += 1
    return words, chunks


def pointer_tuple(w: WordRef) -> tuple[int, int, int, int]:
    return (w.paragraph_idx, w.sentence_idx, w.chunk_idx, w.word_in_chunk)


def compare_pointer_forward(
    current: tuple[int, int, int, int], candidate: tuple[int, int, int, int]
) -> bool:
    """True if candidate is strictly ahead of current (high-water mark advance)."""
    return candidate > current
