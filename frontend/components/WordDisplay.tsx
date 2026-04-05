"use client";

type WordDisplayProps = {
  word: string;
  /** 0–100; reserved for future character-level fill animation */
  highlight_percentage?: number;
};

export function WordDisplay({
  word,
  highlight_percentage = 0,
}: WordDisplayProps) {
  const pct = Math.min(100, Math.max(0, highlight_percentage));

  return (
    <span className="relative inline-block align-baseline rounded px-0.5">
      <span
        className="pointer-events-none absolute left-0 top-0 z-0 h-full rounded-sm bg-amber-300/60 dark:bg-amber-500/35"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className="relative z-10">{word}</span>
    </span>
  );
}
