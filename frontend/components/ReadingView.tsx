"use client";

import { useEffect, useMemo } from "react";
import { useReading, useReadingProgressHelpers, useTargetSentenceIndex } from "@/context/ReadingProvider";
import { flattenSentences, wordsInSentence } from "@/lib/story";
import { WordDisplay } from "@/components/WordDisplay";

export function ReadingView() {
  const { story, lastMatchedGlobal } = useReading();
  const targetSentenceIndex = useTargetSentenceIndex();
  const { matchedLengthForWord } = useReadingProgressHelpers();

  const blocks = useMemo(() => {
    const flat = flattenSentences(story);
    let g = 0;
    return flat.map((item) => ({
      key: `${item.paragraphIdx}-${item.sentenceIdx}`,
      words: wordsInSentence(item.sentence).map((text) => ({
        text,
        g: g++,
      })),
    }));
  }, [story]);

  useEffect(() => {
    const el = document.getElementById(`gr-sentence-${targetSentenceIndex}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetSentenceIndex, lastMatchedGlobal]);

  return (
    <article className="mx-auto max-w-2xl space-y-6 text-lg leading-relaxed text-zinc-900 dark:text-zinc-100">
      {blocks.map(({ key, words }, blockIndex) => {
        let visual = "blur-md opacity-30 transition-all duration-700";
        if (blockIndex < targetSentenceIndex) {
          visual = "opacity-50 transition-all duration-700";
        } else if (blockIndex === targetSentenceIndex) {
          visual = "opacity-100 transition-all duration-700";
        }
        return (
          <p key={key} id={`gr-sentence-${blockIndex}`} className={visual}>
            {words.map(({ text, g }) => (
              <span key={g} className="mr-1 inline">
                <WordDisplay
                  word={text}
                  matchedCharCount={matchedLengthForWord(g, text)}
                />
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}
