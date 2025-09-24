import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

const embeddingModel = openai.textEmbeddingModel("text-embedding-3-small");

export type EmbedChunksResult = {
  embeddings: number[][];
  tokens: number;
};

export async function embedTextChunks(
  chunks: string[],
): Promise<EmbedChunksResult> {
  if (!chunks.length) {
    return { embeddings: [], tokens: 0 };
  }

  const result = await embedMany({
    model: embeddingModel,
    values: chunks,
  });

  return {
    embeddings: result.embeddings.map((embedding) => Array.from(embedding)),
    tokens: result.usage.tokens,
  };
}

export async function embedQuery(text: string): Promise<EmbedChunksResult> {
  return embedTextChunks([text]);
}
