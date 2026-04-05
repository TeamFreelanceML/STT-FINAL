import type { Sentence, Story } from "@/types/story";

export type FlatSentence = {
  paragraphIdx: number;
  sentenceIdx: number;
  sentence: Sentence;
};

export function flattenSentences(story: Story): FlatSentence[] {
  const out: FlatSentence[] = [];
  story.paragraphs.forEach((paragraph, paragraphIdx) => {
    paragraph.sentences.forEach((sentence, sentenceIdx) => {
      out.push({ paragraphIdx, sentenceIdx, sentence });
    });
  });
  return out;
}

export function wordsInSentence(sentence: Sentence): string[] {
  return sentence.chunks.flatMap((c) => c.words);
}

export function countStoryWords(story: Story): number {
  return flattenSentences(story).reduce(
    (acc, { sentence }) => acc + wordsInSentence(sentence).length,
    0,
  );
}

/** Map a global word index (flattened story order) to sentence + in-sentence word index */
export function locateGlobalWord(
  story: Story,
  globalIndex: number,
): { sentenceFlatIndex: number; wordInSentenceIndex: number } {
  const flat = flattenSentences(story);
  let g = 0;
  for (let si = 0; si < flat.length; si++) {
    const words = wordsInSentence(flat[si].sentence);
    if (globalIndex < g + words.length) {
      return {
        sentenceFlatIndex: si,
        wordInSentenceIndex: globalIndex - g,
      };
    }
    g += words.length;
  }
  const last = Math.max(0, flat.length - 1);
  return { sentenceFlatIndex: last, wordInSentenceIndex: 0 };
}
