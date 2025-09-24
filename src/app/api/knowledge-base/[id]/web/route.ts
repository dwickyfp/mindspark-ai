import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "auth/server";
import { knowledgeBaseRepository } from "lib/db/repository";
import {
  deleteObject,
  generateDocumentStorageKey,
  uploadObject,
} from "lib/storage/object-storage";
import { generateUUID } from "lib/utils";
import { createHash } from "node:crypto";
import {
  ExaRequestError,
  extractTextFromExaResult,
  fetchExaContentsByUrls,
} from "lib/exa/client";

const ImportWebsiteSchema = z.object({
  url: z.string().url(),
  maxCharacters: z.number().int().min(500).max(12000).optional(),
  livecrawl: z.enum(["always", "fallback", "preferred"]).optional(),
});

function buildFileName(title: string | null | undefined, url: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const urlObj = new URL(url);
  const fallback = `${urlObj.hostname}${urlObj.pathname}`
    .replace(/\s+/g, " ")
    .trim();

  const base = title?.trim() || fallback || "web-page";
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || "web-page"}-${timestamp}.txt`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: knowledgeBaseId } = await params;

  let payload: z.infer<typeof ImportWebsiteSchema>;
  try {
    const json = await request.json();
    payload = ImportWebsiteSchema.parse(json);
  } catch (_error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const targetUrl = payload.url;

  let contentText = "";
  let pageTitle: string | null | undefined;

  try {
    const response = await fetchExaContentsByUrls([targetUrl], {
      maxCharacters: payload.maxCharacters,
      livecrawl: payload.livecrawl,
    });
    const result = response.results?.[0];
    pageTitle = result?.title;
    contentText = extractTextFromExaResult(result);
  } catch (error) {
    if (error instanceof ExaRequestError) {
      const status = error.status === 401 ? 502 : (error.status ?? 502);
      return NextResponse.json({ error: error.message }, { status });
    }

    console.error("Failed to fetch content from Exa", error);
    return NextResponse.json(
      { error: "Failed to fetch website content" },
      { status: 502 },
    );
  }

  if (!contentText.trim()) {
    return NextResponse.json(
      { error: "No textual content found at the provided URL" },
      { status: 422 },
    );
  }

  const buffer = Buffer.from(contentText, "utf8");
  const checksum = createHash("sha256").update(buffer).digest("base64");
  const fileName = buildFileName(pageTitle, targetUrl);

  const randomKeyId = generateUUID();
  const storageKey = generateDocumentStorageKey({
    knowledgeBaseId,
    documentId: randomKeyId,
    fileName,
  });

  try {
    await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: "text/plain; charset=utf-8",
      checksum,
      metadata: {
        "original-url": targetUrl,
        source: "exa",
      },
    });
  } catch (error) {
    console.error("Failed to upload crawled content", error);
    return NextResponse.json(
      { error: "Failed to store website content" },
      { status: 500 },
    );
  }

  try {
    const document = await knowledgeBaseRepository.insertDocumentPlaceholder(
      session.user.id,
      {
        knowledgeBaseId,
        fileName,
        fileSize: buffer.length,
        mimeType: "text/plain",
        storageKey,
        checksum,
      },
    );

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Failed to register crawled document", error);
    try {
      await deleteObject(storageKey);
    } catch (cleanupError) {
      console.warn(
        `Failed to remove uploaded object after DB failure: ${storageKey}`,
        cleanupError,
      );
    }
    if (error instanceof Error && /Not authorized/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to register document" },
      { status: 500 },
    );
  }
}
