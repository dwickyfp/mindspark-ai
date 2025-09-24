import { createRequire } from "module";

const localRequire = createRequire(import.meta.url);

async function loadPdfParse() {
  const cached = localRequire("pdf-parse");
  return cached.default ?? cached;
}

async function loadMammoth() {
  const mod = await import("mammoth");
  return mod.default ?? mod;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function bufferToUtf8(buffer: Buffer): string {
  return buffer.toString("utf8");
}

export async function extractTextFromDocument(options: {
  buffer: Buffer;
  mimeType?: string | null;
  fileName?: string;
}): Promise<string> {
  const { buffer, mimeType, fileName } = options;
  const lowerMime = (mimeType ?? "").toLowerCase();
  const extension = fileName?.split(".").pop()?.toLowerCase();

  try {
    if (lowerMime === "application/pdf" || extension === "pdf") {
      const pdfParse = await loadPdfParse();
      const result = await pdfParse(buffer);
      return normalizeText(result.text || "");
    }

    if (
      lowerMime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      extension === "docx"
    ) {
      const mammoth = await loadMammoth();
      const result = await mammoth.extractRawText({ buffer });
      return normalizeText(result.value || "");
    }

    if (
      lowerMime.startsWith("text/") ||
      ["txt", "md", "markdown", "csv", "json"].includes(extension ?? "")
    ) {
      const raw = bufferToUtf8(buffer);
      return normalizeText(raw);
    }

    if (lowerMime === "application/json") {
      const jsonText = bufferToUtf8(buffer);
      try {
        const parsed = JSON.parse(jsonText);
        return normalizeText(JSON.stringify(parsed, null, 2));
      } catch (_error) {
        return normalizeText(jsonText);
      }
    }

    const fallback = bufferToUtf8(buffer);
    return normalizeText(fallback);
  } catch (error) {
    console.error("Failed to extract text from document", {
      mimeType,
      fileName,
      error,
    });
    throw error;
  }
}
