export type Chunk = {
  words: string[];
};

export type Sentence = {
  chunks: Chunk[];
};

export type Paragraph = {
  sentences: Sentence[];
};

export type Story = {
  title?: string;
  paragraphs: Paragraph[];
};
