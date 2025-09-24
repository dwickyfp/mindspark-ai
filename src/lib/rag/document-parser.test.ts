import { describe, expect, it } from "vitest";

import { extractTextFromDocument } from "./document-parser";

describe("document parser", () => {
  it("returns utf8 text for plain text buffers", async () => {
    const buffer = Buffer.from("Hello Knowledge Base");
    const text = await extractTextFromDocument({
      buffer,
      mimeType: "text/plain",
      fileName: "sample.txt",
    });
    expect(text).toContain("Hello Knowledge Base");
  });
});
