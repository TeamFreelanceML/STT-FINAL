"use client";

type WordDisplayProps = {
  word: string;
  status: "pending" | "current" | "correct" | "skipped" | "wrong" | "repeated";
  /** Number of matched characters for the active word */
  progressChars?: number;
};

export function WordDisplay({ word, status, progressChars = 0 }: WordDisplayProps) {
  const safeProgress = Math.max(0, Math.min(progressChars, word.length));
  const matchedText = word.slice(0, safeProgress);
  const remainingText = word.slice(safeProgress);

  let textColor = "text-zinc-400 dark:text-zinc-600"; // pending
  let glow = "";

  if (status === "correct") {
    textColor = "text-emerald-600 dark:text-emerald-400";
  } else if (status === "current") {
    textColor = "text-blue-600 dark:text-blue-400 font-semibold";
    glow = "drop-shadow-[0_0_8px_rgba(37,99,235,0.4)]";
  } else if (status === "skipped") {
    textColor = "text-amber-500 dark:text-amber-400";
  } else if (status === "wrong") {
    textColor = "text-red-600 dark:text-red-400";
  } else if (status === "repeated") {
    textColor = "text-amber-600 dark:text-amber-400";
  }

  return (
    <span className={`inline-block transition-all duration-300 ${glow} ${textColor}`}>
      {progressChars > 0 ? (
        <>
          <span className="text-emerald-500 dark:text-emerald-400">{matchedText}</span>
          <span>{remainingText}</span>
        </>
      ) : (
        word
      )}
    </span>
  );
}
