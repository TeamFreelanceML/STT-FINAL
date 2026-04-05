"use client";

type WordDisplayProps = {
  word: string;
  /** Number of leading characters treated as matched (character-level growth) */
  matchedCharCount: number;
};

export function WordDisplay({ word, matchedCharCount }: WordDisplayProps) {
  const n = Math.max(0, Math.min(word.length, matchedCharCount));
  const matched = word.slice(0, n);
  const rest = word.slice(n);

  return (
    <span className="inline-block transition-all duration-700">
      <span className="text-blue-600">{matched}</span>
      <span className="text-gray-400">{rest}</span>
    </span>
  );
}
