"use client";

import type { Story } from "@/types/story";
import { flattenSentences, wordsInSentence } from "@/lib/story";
import { WordDisplay } from "@/components/WordDisplay";

type ReadingViewProps = {
  story: Story;
  active_sentence_index: number;
};

export function ReadingView({
  story,
  active_sentence_index,
}: ReadingViewProps) {
  const flat = flattenSentences(story);

  return (
    <article className="mx-auto max-w-2xl space-y-6 text-lg leading-relaxed text-zinc-900 dark:text-zinc-100">
      {flat.map((item, index) => {
        const isActive = index === active_sentence_index;
        const words = wordsInSentence(item.sentence);
        return (
          <p
            key={`${item.paragraphIdx}-${item.sentenceIdx}`}
            className={
              isActive
                ? "opacity-100 transition-[filter,opacity] duration-300"
                : "blur-sm opacity-50 transition-[filter,opacity] duration-300"
            }
          >
            {words.map((w, wi) => (
              <span key={wi} className="mr-1 inline">
                <WordDisplay word={w} highlight_percentage={0} />
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}
