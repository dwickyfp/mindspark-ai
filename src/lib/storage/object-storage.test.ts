import { describe, expect, it } from "vitest";

import { generateDocumentStorageKey } from "./object-storage";

describe("generateDocumentStorageKey", () => {
  it("sanitizes special characters in file names", () => {
    const key = generateDocumentStorageKey({
      knowledgeBaseId: "kb-123",
      documentId: "doc-456",
      fileName: "Q4 Report (Final).pdf",
    });

    expect(key).toBe("knowledge-bases/kb-123/doc-456/Q4-Report-Final.pdf");
  });

  it("preserves safe characters", () => {
    const key = generateDocumentStorageKey({
      knowledgeBaseId: "kb_A",
      documentId: "doc_B",
      fileName: "notes_v1.2.txt",
    });

    expect(key).toBe("knowledge-bases/kb_A/doc_B/notes_v1.2.txt");
  });

  it("falls back to a generic name when the sanitized result is empty", () => {
    const key = generateDocumentStorageKey({
      knowledgeBaseId: "kb",
      documentId: "doc",
      fileName: "***",
    });

    expect(key).toBe("knowledge-bases/kb/doc/document");
  });
});
