"use client";

import { useEffect, useRef } from "react";
import { useReading } from "@/context/ReadingProvider";
import { WordDisplay } from "@/components/WordDisplay";

export function ReadingView() {
  const { story, sessionState, wordResults, wordProgress } = useReading();
  const activeChunkRef = useRef<HTMLSpanElement>(null);

  const { currentParaIdx, currentSentIdx, currentChunkIdx, wordPtr } = sessionState;

  useEffect(() => {
    if (activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentParaIdx, currentSentIdx, currentChunkIdx]);

  let globalWordCounter = 0;

  return (
    <article className="mx-auto max-w-2xl space-y-12 py-20 text-zinc-900 dark:text-zinc-100">
      {story.paragraphs.map((para, pIdx) => {
        const isParaActive = pIdx === currentParaIdx;
        const isParaPast = pIdx < currentParaIdx;
        const isParaFuture = pIdx > currentParaIdx;

        let paraVisual = "transition-all duration-1000 ";
        if (isParaPast) paraVisual += "opacity-40 grayscale-[50%]";
        if (isParaFuture) paraVisual += "blur-sm opacity-20";
        if (isParaActive) paraVisual += "opacity-100 scale-[1.02]";

        return (
          <div key={pIdx} className={paraVisual}>
            {para.sentences.map((sent, sIdx) => {
              const isSentActive = isParaActive && sIdx === currentSentIdx;
              const isSentPast = isParaPast || (isParaActive && sIdx < currentSentIdx);
              const isSentFuture = isParaFuture || (isParaActive && sIdx > currentSentIdx);

              let sentVisual = "mb-4 flex flex-wrap gap-x-1.5 leading-relaxed text-2xl font-medium transition-all duration-700 ";
              if (isSentPast) sentVisual += "opacity-30 grayscale blur-[0.5px]";
              if (isSentFuture) sentVisual += "blur-[12px] opacity-[0.1] brightness-[0.2]";
              if (isSentActive) sentVisual += "opacity-100 scale-[1.03] transition-all duration-500";

              return (
                <div key={sIdx} className={sentVisual}>
                  {sent.chunks.map((chunk, cIdx) => {
                    const isChunkActive = isSentActive && cIdx === currentChunkIdx;
                    const isChunkPast = isSentPast || (isSentActive && cIdx < currentChunkIdx);
                    const isChunkFuture = !isChunkPast && !isChunkActive;

                    let chunkVisual = "transition-all duration-500 rounded-md px-1 -mx-1 ";
                    if (isChunkActive)
                      chunkVisual += "bg-blue-50/50 dark:bg-blue-900/20 ring-1 ring-blue-200/50 dark:ring-blue-800/30";
                    if (isChunkFuture) chunkVisual += "blur-[1.5px] opacity-40";

                    return (
                      <span
                        key={cIdx}
                        ref={isChunkActive ? activeChunkRef : null}
                        className={chunkVisual}
                      >
                        {chunk.words.map((word, wInCIdx) => {
                          const globalIdx = globalWordCounter++;
                          const result = wordResults[globalIdx];
                          let status = result?.status || "pending";

                          if (globalIdx === wordPtr && status === "pending") {
                            status = "current";
                          }

                          const progressChars =
                            wordProgress?.matchedIndex === globalIdx
                              ? wordProgress.charIndex
                              : 0;

                          return (
                            <span key={wInCIdx} className="inline-block">
                              <WordDisplay
                                word={word}
                                status={status}
                                progressChars={progressChars}
                              />
                              {wInCIdx < chunk.words.length - 1 ? "\u00A0" : ""}
                            </span>
                          );
                        })}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </article>
  );
}
