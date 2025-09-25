import { ExaContentsRequest } from "lib/ai/tools/web/web-search";

const EXA_API_KEY = process.env.EXA_API_KEY;
const EXA_BASE_URL = process.env.EXA_API_BASE_URL ?? "https://api.exa.ai";

export class ExaRequestError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ExaRequestError";
  }
}

async function exaRequest<T>(endpoint: string, body: unknown): Promise<T> {
  if (!EXA_API_KEY) {
    throw new ExaRequestError("EXA_API_KEY is not configured");
  }

  const response = await fetch(`${EXA_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": EXA_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new ExaRequestError(message || response.statusText, response.status);
  }

  return (await response.json()) as T;
}

export type ExaContentSection = {
  text?: string | null;
  html?: string | null;
};

export type ExaContentResult = {
  id: string;
  url: string;
  title?: string | null;
  text?: string | null;
  content?: {
    text?: string | null;
    html?: string | null;
    sections?: ExaContentSection[];
  };
  highlights?: Array<{ text?: string | null }>;
};

export type ExaContentsResponse = {
  results: ExaContentResult[];
};

export async function fetchExaContentsByUrls(
  urls: string[],
  options?: {
    maxCharacters?: number;
    livecrawl?: "always" | "fallback" | "preferred";
  },
): Promise<ExaContentsResponse> {
  const request: ExaContentsRequest = {
    ids: urls,
    contents: {
      text: {
        maxCharacters: options?.maxCharacters ?? 6000,
      },
      livecrawl: options?.livecrawl ?? "always",
    },
  };

  return exaRequest<ExaContentsResponse>("/contents", request);
}

export function extractTextFromExaResult(
  result: ExaContentResult | undefined,
): string {
  if (!result) return "";

  const segments: string[] = [];

  if (typeof result.text === "string") {
    segments.push(result.text);
  }

  const content = result.content;
  if (content) {
    if (typeof content.text === "string") {
      segments.push(content.text);
    }
    if (Array.isArray(content.sections)) {
      for (const section of content.sections) {
        if (typeof section?.text === "string") {
          segments.push(section.text);
        }
      }
    }
  }

  if (Array.isArray(result.highlights)) {
    for (const highlight of result.highlights) {
      if (typeof highlight?.text === "string") {
        segments.push(highlight.text);
      }
    }
  }

  const normalized = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("\n\n");

  return normalized;
}

export class MissingExaApiKeyError extends Error {
  constructor() {
    super("EXA_API_KEY is not configured");
  }
}

export function assertExaConfigured(): void {
  if (!EXA_API_KEY) {
    throw new MissingExaApiKeyError();
  }
}
