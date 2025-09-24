import { describe, expect, it } from "vitest";

import { chunkText, estimateTokenCount } from "./text-chunker";

describe("text chunker", () => {
  it("returns entire text when under token limit", () => {
    const text = "Hello world";
    const chunks = chunkText(text, { maxTokens: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Hello world");
  });

  it("splits long text into multiple overlapping chunks", () => {
    const longText = Array.from({ length: 120 })
      .map((_, index) => `Paragraph ${index}: Lorem ipsum dolor sit amet.`)
      .join("\n\n");
    const chunks = chunkText(longText, { maxTokens: 80, overlapTokens: 10 });

    expect(chunks.length).toBeGreaterThan(1);

    const firstChunk = chunks[0];
    const secondChunk = chunks[1];
    expect(firstChunk).not.toEqual(secondChunk);
    expect(estimateTokenCount(longText)).toBeGreaterThan(
      estimateTokenCount(firstChunk),
    );
  });
});
