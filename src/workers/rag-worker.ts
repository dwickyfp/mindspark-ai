import "dotenv/config";

import { eq } from "drizzle-orm";

import { knowledgeBaseRepository } from "lib/db/repository";
import { pgDb as db } from "lib/db/pg/db.pg";
import { KnowledgeBaseSchema } from "lib/db/pg/schema.pg";
import { logEmbeddingUsage } from "lib/analytics/usage-logger";
import { extractTextFromDocument } from "lib/rag/document-parser";
import { embedTextChunks } from "lib/rag/embedder";
import { chunkText } from "lib/rag/text-chunker";
import { getObjectBuffer } from "lib/storage/object-storage";

const POLL_INTERVAL_MS = Number(process.env.KB_WORKER_POLL_INTERVAL_MS ?? 5000);
const MAX_CHUNKS = Number(process.env.KB_WORKER_MAX_CHUNKS ?? 40);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processDocument(documentId: string): Promise<void> {
  const claimed =
    await knowledgeBaseRepository.markDocumentProcessing(documentId);
  if (!claimed) {
    return;
  }

  console.info(`[RAG] Processing document ${claimed.id}`);

  try {
    const fileBuffer = await getObjectBuffer(claimed.storageKey);
    if (!fileBuffer.length) {
      throw new Error("Document is empty");
    }

    const text = await extractTextFromDocument({
      buffer: fileBuffer,
      mimeType: claimed.mimeType,
      fileName: claimed.fileName,
    });

    if (!text) {
      throw new Error("Unable to extract text from document");
    }

    const chunks = chunkText(text).slice(0, MAX_CHUNKS);

    await knowledgeBaseRepository.removeDocumentChunks(claimed.id);

    let totalEmbeddingTokens = 0;

    if (chunks.length) {
      const { embeddings, tokens } = await embedTextChunks(chunks);
      totalEmbeddingTokens = tokens;
      const payload = embeddings.map((embedding, index) => ({
        chunkIndex: index,
        content: chunks[index],
        embedding,
      }));
      await knowledgeBaseRepository.upsertDocumentChunks(
        claimed.id,
        claimed.knowledgeBaseId,
        payload,
      );
    }

    await knowledgeBaseRepository.markDocumentCompleted(claimed.id, {
      chunkCount: chunks.length,
      embeddingTokens: totalEmbeddingTokens,
      processedAt: new Date(),
    });

    const ownerInfo = await db
      .select({
        ownerUserId: KnowledgeBaseSchema.ownerUserId,
        organizationId: KnowledgeBaseSchema.organizationId,
      })
      .from(KnowledgeBaseSchema)
      .where(eq(KnowledgeBaseSchema.id, claimed.knowledgeBaseId))
      .limit(1);

    const primaryOwner = ownerInfo.at(0);
    const usageUserId =
      claimed.uploadedByUserId ?? primaryOwner?.ownerUserId ?? null;
    const usageOrganizationId =
      claimed.organizationId ?? primaryOwner?.organizationId ?? null;

    if (usageUserId && totalEmbeddingTokens > 0) {
      await logEmbeddingUsage({
        userId: usageUserId,
        organizationId: usageOrganizationId ?? undefined,
        agentId: null,
        knowledgeBaseId: claimed.knowledgeBaseId,
        documentId: claimed.id,
        operation: "ingest",
        tokens: totalEmbeddingTokens,
        model: "text-embedding-3-small",
        metadata: {
          fileName: claimed.fileName,
          chunkCount: chunks.length,
        },
      });
    }

    console.info(
      `[RAG] Completed document ${claimed.id} with ${chunks.length} chunks (tokens=${totalEmbeddingTokens})`,
    );
  } catch (error) {
    console.error(`[RAG] Failed to process document ${documentId}`, error);
    await knowledgeBaseRepository.markDocumentFailed(
      documentId,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

async function workerLoop(): Promise<void> {
  console.info("[RAG] Knowledge base worker started");
  while (true) {
    try {
      const pending = await knowledgeBaseRepository.findNextPendingDocument();
      if (!pending) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      await processDocument(pending.id);
    } catch (error) {
      console.error("[RAG] Worker iteration failed", error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

void workerLoop();
