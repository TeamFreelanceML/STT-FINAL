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
