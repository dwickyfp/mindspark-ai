import { encoding_for_model, Tiktoken } from "@dqbd/tiktoken";

let embeddingEncoding: Tiktoken | null = null;
const decoder =
  typeof TextDecoder !== "undefined" ? new TextDecoder() : undefined;

function getEncoding(): Tiktoken {
  if (!embeddingEncoding) {
    embeddingEncoding = encoding_for_model("text-embedding-3-small");
  }
  return embeddingEncoding;
}

export function estimateTokenCount(text: string): number {
  const encoding = getEncoding();
  return encoding.encode(text).length;
}

type ChunkOptions = {
  maxTokens?: number;
  overlapTokens?: number;
};

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxTokens: 700,
  overlapTokens: 100,
};

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxTokens, overlapTokens } = { ...DEFAULT_OPTIONS, ...options };
  const encoding = getEncoding();

  const decodeTokens = (tokens: number[]): string => {
    const decoded = encoding.decode(tokens);
    if (typeof decoded === "string") {
      return decoded;
    }
    if (decoder) {
      return decoder.decode(decoded);
    }
    return Buffer.from(decoded).toString("utf8");
  };

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentTokens: number[] = [];

  const flushChunk = () => {
    if (!currentTokens.length) return;
    const chunkText = decodeTokens(currentTokens).trim();
    if (chunkText) {
      chunks.push(chunkText);
    }
  };

  for (const paragraph of paragraphs) {
    const paragraphTokens = encoding.encode(paragraph);

    if (paragraphTokens.length > maxTokens) {
      if (currentTokens.length) {
        flushChunk();
        currentTokens = [];
      }

      let start = 0;
      while (start < paragraphTokens.length) {
        const slice = paragraphTokens.slice(start, start + maxTokens);
        const chunkText = decodeTokens(slice).trim();
        if (chunkText) {
          chunks.push(chunkText);
        }
        if (slice.length < maxTokens) {
          break;
        }
        start += Math.max(1, maxTokens - overlapTokens);
      }
      continue;
    }

    if (currentTokens.length + paragraphTokens.length > maxTokens) {
      flushChunk();
      currentTokens = [];
    }

    currentTokens.push(...paragraphTokens, ...encoding.encode("\n\n"));
  }

  flushChunk();

  if (!chunks.length && text.trim()) {
    chunks.push(text.trim());
  }

  return chunks;
}
