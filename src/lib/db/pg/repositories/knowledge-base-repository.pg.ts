import {
  KnowledgeBaseDocument,
  KnowledgeBaseDocumentWithStatus,
  KnowledgeBaseRepository,
  KnowledgeBaseSummary,
} from "app-types/knowledge-base";
import { pgDb as db } from "../db.pg";
import {
  KnowledgeBaseDocumentChunkSchema,
  KnowledgeBaseDocumentSchema,
  KnowledgeBaseSchema,
  OrganizationMemberSchema,
  OrganizationSchema,
  UserSchema,
} from "../schema.pg";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { KnowledgeBase } from "app-types/knowledge-base";
import { generateUUID } from "lib/utils";
import { isNotNull } from "drizzle-orm";

const DOCUMENT_STATUS_PENDING = "pending" as const;
const DOCUMENT_STATUS_PROCESSING = "processing" as const;
const DOCUMENT_STATUS_FAILED = "failed" as const;
const DOCUMENT_STATUS_COMPLETED = "completed" as const;

type KnowledgeBaseAccess = {
  knowledgeBase: KnowledgeBase;
  canRead: boolean;
  canWrite: boolean;
};

type KnowledgeBaseRow = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private" | "readonly";
  ownerUserId: string;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  organizationName: string | null;
  isMember: boolean;
};

type DocumentCountRow = {
  knowledgeBaseId: string;
  total: number;
  pending: number;
  processing: number;
};

async function mapDocumentCounts(
  knowledgeBaseIds: string[],
): Promise<Map<string, DocumentCountRow>> {
  if (!knowledgeBaseIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      knowledgeBaseId: KnowledgeBaseDocumentSchema.knowledgeBaseId,
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${KnowledgeBaseDocumentSchema.status} IN (${DOCUMENT_STATUS_PENDING}, ${DOCUMENT_STATUS_FAILED}) THEN 1 ELSE 0 END), 0)`,
      processing: sql<number>`COALESCE(SUM(CASE WHEN ${KnowledgeBaseDocumentSchema.status} = ${DOCUMENT_STATUS_PROCESSING} THEN 1 ELSE 0 END), 0)`,
    })
    .from(KnowledgeBaseDocumentSchema)
    .where(
      inArray(KnowledgeBaseDocumentSchema.knowledgeBaseId, knowledgeBaseIds),
    )
    .groupBy(KnowledgeBaseDocumentSchema.knowledgeBaseId);

  const map = new Map<string, DocumentCountRow>();
  for (const row of rows) {
    map.set(row.knowledgeBaseId, {
      knowledgeBaseId: row.knowledgeBaseId,
      total: Number(row.total ?? 0),
      pending: Number(row.pending ?? 0),
      processing: Number(row.processing ?? 0),
    });
  }
  return map;
}

function toKnowledgeBase(
  row: KnowledgeBaseRow,
  counts?: DocumentCountRow,
): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    ownerUserId: row.ownerUserId,
    organizationId: row.organizationId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    documentCount: counts?.total ?? 0,
    pendingCount: counts?.pending ?? 0,
    processingCount: counts?.processing ?? 0,
  };
}

async function loadKnowledgeBaseRow(
  knowledgeBaseId: string,
  userId: string,
): Promise<KnowledgeBaseAccess | null> {
  const [row] = await db
    .select({
      id: KnowledgeBaseSchema.id,
      name: KnowledgeBaseSchema.name,
      description: KnowledgeBaseSchema.description,
      visibility: KnowledgeBaseSchema.visibility,
      ownerUserId: KnowledgeBaseSchema.ownerUserId,
      organizationId: KnowledgeBaseSchema.organizationId,
      createdAt: KnowledgeBaseSchema.createdAt,
      updatedAt: KnowledgeBaseSchema.updatedAt,
      organizationName: OrganizationSchema.name,
      isMember: sql<boolean>`CASE WHEN ${OrganizationMemberSchema.id} IS NULL THEN false ELSE true END`,
    })
    .from(KnowledgeBaseSchema)
    .leftJoin(
      OrganizationSchema,
      eq(KnowledgeBaseSchema.organizationId, OrganizationSchema.id),
    )
    .leftJoin(
      OrganizationMemberSchema,
      and(
        eq(
          OrganizationMemberSchema.organizationId,
          KnowledgeBaseSchema.organizationId,
        ),
        eq(OrganizationMemberSchema.userId, userId),
      ),
    )
    .where(eq(KnowledgeBaseSchema.id, knowledgeBaseId));

  if (!row) {
    return null;
  }

  const base = {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    visibility: row.visibility,
    ownerUserId: row.ownerUserId,
    organizationId: row.organizationId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    organizationName: row.organizationName ?? null,
    isMember: row.isMember,
  } satisfies KnowledgeBaseRow;

  const counts = await mapDocumentCounts([row.id]);
  const mapped = toKnowledgeBase(base, counts.get(row.id));

  const isOwner = row.ownerUserId === userId;
  const isMember = row.isMember;
  const isPublic = row.visibility === "public";
  const isReadonly = row.visibility === "readonly";
  const hasOrganization = !!row.organizationId;

  const canRead =
    isOwner || isPublic || isReadonly || (hasOrganization && isMember);
  const canWrite =
    isOwner || (hasOrganization && isMember && row.visibility !== "readonly");

  if (!canRead) {
    return null;
  }

  return {
    knowledgeBase: mapped,
    canRead,
    canWrite,
  };
}

async function assertOrganizationMembership(
  organizationId: string,
  userId: string,
): Promise<void> {
  const [membership] = await db
    .select({ id: OrganizationMemberSchema.id })
    .from(OrganizationMemberSchema)
    .where(
      and(
        eq(OrganizationMemberSchema.organizationId, organizationId),
        eq(OrganizationMemberSchema.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error("Not authorized for organization");
  }
}

async function listAccessibleKnowledgeBases(
  userId: string,
): Promise<KnowledgeBaseSummary[]> {
  const rows = await db
    .select({
      id: KnowledgeBaseSchema.id,
      name: KnowledgeBaseSchema.name,
      description: KnowledgeBaseSchema.description,
      visibility: KnowledgeBaseSchema.visibility,
      ownerUserId: KnowledgeBaseSchema.ownerUserId,
      organizationId: KnowledgeBaseSchema.organizationId,
      createdAt: KnowledgeBaseSchema.createdAt,
      updatedAt: KnowledgeBaseSchema.updatedAt,
      organizationName: OrganizationSchema.name,
      isMember: sql<boolean>`CASE WHEN ${OrganizationMemberSchema.id} IS NULL THEN false ELSE true END`,
    })
    .from(KnowledgeBaseSchema)
    .leftJoin(
      OrganizationSchema,
      eq(KnowledgeBaseSchema.organizationId, OrganizationSchema.id),
    )
    .leftJoin(
      OrganizationMemberSchema,
      and(
        eq(
          OrganizationMemberSchema.organizationId,
          KnowledgeBaseSchema.organizationId,
        ),
        eq(OrganizationMemberSchema.userId, userId),
      ),
    )
    .where(
      or(
        eq(KnowledgeBaseSchema.ownerUserId, userId),
        eq(KnowledgeBaseSchema.visibility, "public"),
        eq(KnowledgeBaseSchema.visibility, "readonly"),
        isNotNull(OrganizationMemberSchema.id),
      ),
    )
    .orderBy(desc(KnowledgeBaseSchema.updatedAt));

  const ids = rows.map((row) => row.id);
  const counts = await mapDocumentCounts(ids);

  return rows.map((row) => {
    const kb = toKnowledgeBase(row, counts.get(row.id));
    return {
      ...kb,
      organizationName: row.organizationName ?? undefined,
    } satisfies KnowledgeBaseSummary;
  });
}

export const pgKnowledgeBaseRepository: KnowledgeBaseRepository = {
  async createKnowledgeBase(userId, payload) {
    if (payload.organizationId) {
      await assertOrganizationMembership(payload.organizationId, userId);
    }

    const [row] = await db
      .insert(KnowledgeBaseSchema)
      .values({
        id: generateUUID(),
        name: payload.name,
        description: payload.description,
        visibility: payload.visibility ?? "private",
        ownerUserId: userId,
        organizationId: payload.organizationId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      visibility: row.visibility,
      ownerUserId: row.ownerUserId,
      organizationId: row.organizationId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      documentCount: 0,
      pendingCount: 0,
      processingCount: 0,
    } satisfies KnowledgeBase;
  },

  async updateKnowledgeBase(knowledgeBaseId, userId, payload) {
    const access = await loadKnowledgeBaseRow(knowledgeBaseId, userId);
    if (!access) return null;

    const { knowledgeBase, canWrite } = access;
    if (!canWrite) {
      return null;
    }

    if (
      payload.organizationId &&
      knowledgeBase.organizationId !== payload.organizationId
    ) {
      await assertOrganizationMembership(payload.organizationId, userId);
    }

    const [updated] = await db
      .update(KnowledgeBaseSchema)
      .set({
        name: payload.name ?? knowledgeBase.name,
        description: payload.description ?? knowledgeBase.description,
        visibility: payload.visibility ?? knowledgeBase.visibility,
        organizationId:
          payload.organizationId !== undefined
            ? payload.organizationId
            : (knowledgeBase.organizationId ?? null),
        updatedAt: new Date(),
      })
      .where(eq(KnowledgeBaseSchema.id, knowledgeBaseId))
      .returning();

    if (!updated) return null;

    const counts = await mapDocumentCounts([knowledgeBaseId]);

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? undefined,
      visibility: updated.visibility,
      ownerUserId: updated.ownerUserId,
      organizationId: updated.organizationId ?? undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      documentCount:
        counts.get(updated.id)?.total ?? access.knowledgeBase.documentCount,
      pendingCount:
        counts.get(updated.id)?.pending ?? access.knowledgeBase.pendingCount,
      processingCount:
        counts.get(updated.id)?.processing ??
        access.knowledgeBase.processingCount,
    } satisfies KnowledgeBase;
  },

  async deleteKnowledgeBase(knowledgeBaseId, userId) {
    const access = await loadKnowledgeBaseRow(knowledgeBaseId, userId);
    if (!access) return;
    if (access.knowledgeBase.ownerUserId !== userId) {
      throw new Error("Only owners can delete knowledge bases");
    }
    await db
      .delete(KnowledgeBaseSchema)
      .where(eq(KnowledgeBaseSchema.id, knowledgeBaseId));
  },

  async getKnowledgeBaseById(knowledgeBaseId, userId) {
    const access = await loadKnowledgeBaseRow(knowledgeBaseId, userId);
    return access?.knowledgeBase ?? null;
  },

  async listKnowledgeBasesForUser(userId) {
    return listAccessibleKnowledgeBases(userId);
  },

  async listKnowledgeBaseDocuments(knowledgeBaseId, userId) {
    const access = await loadKnowledgeBaseRow(knowledgeBaseId, userId);
    if (!access) return [];

    const documents = await db
      .select({
        id: KnowledgeBaseDocumentSchema.id,
        knowledgeBaseId: KnowledgeBaseDocumentSchema.knowledgeBaseId,
        uploadedByUserId: KnowledgeBaseDocumentSchema.uploadedByUserId,
        organizationId: KnowledgeBaseDocumentSchema.organizationId,
        fileName: KnowledgeBaseDocumentSchema.fileName,
        fileSize: KnowledgeBaseDocumentSchema.fileSize,
        mimeType: KnowledgeBaseDocumentSchema.mimeType,
        storageKey: KnowledgeBaseDocumentSchema.storageKey,
        status: KnowledgeBaseDocumentSchema.status,
        error: KnowledgeBaseDocumentSchema.error,
        chunkCount: KnowledgeBaseDocumentSchema.chunkCount,
        embeddingTokens: KnowledgeBaseDocumentSchema.embeddingTokens,
        processedAt: KnowledgeBaseDocumentSchema.processedAt,
        createdAt: KnowledgeBaseDocumentSchema.createdAt,
        updatedAt: KnowledgeBaseDocumentSchema.updatedAt,
        uploadedByName: UserSchema.name,
      })
      .from(KnowledgeBaseDocumentSchema)
      .leftJoin(
        UserSchema,
        eq(UserSchema.id, KnowledgeBaseDocumentSchema.uploadedByUserId),
      )
      .where(eq(KnowledgeBaseDocumentSchema.knowledgeBaseId, knowledgeBaseId))
      .orderBy(desc(KnowledgeBaseDocumentSchema.createdAt));

    return documents.map((doc) => ({
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      uploadedByUserId: doc.uploadedByUserId ?? undefined,
      organizationId: doc.organizationId ?? undefined,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
      status: doc.status,
      error: doc.error ?? undefined,
      chunkCount: doc.chunkCount,
      embeddingTokens: doc.embeddingTokens,
      processedAt: doc.processedAt ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      uploadedByName: doc.uploadedByName ?? undefined,
    })) satisfies KnowledgeBaseDocumentWithStatus[];
  },

  async insertDocumentPlaceholder(userId, payload) {
    const access = await loadKnowledgeBaseRow(payload.knowledgeBaseId, userId);
    if (!access || !access.canWrite) {
      throw new Error("Not authorized to add documents");
    }

    const [doc] = await db
      .insert(KnowledgeBaseDocumentSchema)
      .values({
        id: generateUUID(),
        knowledgeBaseId: payload.knowledgeBaseId,
        uploadedByUserId: userId,
        organizationId: access.knowledgeBase.organizationId ?? null,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        storageKey: payload.storageKey,
        checksum: payload.checksum,
        status: DOCUMENT_STATUS_PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      uploadedByUserId: doc.uploadedByUserId ?? undefined,
      organizationId: doc.organizationId ?? undefined,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
      status: doc.status,
      chunkCount: doc.chunkCount,
      embeddingTokens: doc.embeddingTokens,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies KnowledgeBaseDocument;
  },

  async updateDocument(documentId, userId, payload) {
    const [docRow] = await db
      .select({
        id: KnowledgeBaseDocumentSchema.id,
        knowledgeBaseId: KnowledgeBaseDocumentSchema.knowledgeBaseId,
      })
      .from(KnowledgeBaseDocumentSchema)
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId))
      .limit(1);

    if (!docRow) return null;

    const access = await loadKnowledgeBaseRow(docRow.knowledgeBaseId, userId);
    if (!access || !access.canWrite) {
      return null;
    }

    const [updated] = await db
      .update(KnowledgeBaseDocumentSchema)
      .set({
        fileName: payload.fileName,
        updatedAt: new Date(),
      })
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId))
      .returning();

    if (!updated) return null;

    return {
      id: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      uploadedByUserId: updated.uploadedByUserId ?? undefined,
      organizationId: updated.organizationId ?? undefined,
      fileName: updated.fileName,
      fileSize: updated.fileSize,
      mimeType: updated.mimeType,
      storageKey: updated.storageKey,
      status: updated.status,
      error: updated.error ?? undefined,
      chunkCount: updated.chunkCount,
      embeddingTokens: updated.embeddingTokens,
      processedAt: updated.processedAt ?? undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    } satisfies KnowledgeBaseDocument;
  },

  async deleteDocument(documentId, userId) {
    const [docRow] = await db
      .select({
        id: KnowledgeBaseDocumentSchema.id,
        knowledgeBaseId: KnowledgeBaseDocumentSchema.knowledgeBaseId,
      })
      .from(KnowledgeBaseDocumentSchema)
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId))
      .limit(1);

    if (!docRow) return;

    const access = await loadKnowledgeBaseRow(docRow.knowledgeBaseId, userId);
    if (!access || !access.canWrite) {
      throw new Error("Not authorized to delete document");
    }

    await db
      .delete(KnowledgeBaseDocumentSchema)
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId));
  },

  async markDocumentProcessing(documentId) {
    const [doc] = await db
      .update(KnowledgeBaseDocumentSchema)
      .set({
        status: DOCUMENT_STATUS_PROCESSING,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(KnowledgeBaseDocumentSchema.id, documentId),
          eq(KnowledgeBaseDocumentSchema.status, DOCUMENT_STATUS_PENDING),
        ),
      )
      .returning();

    if (!doc) return null;

    return {
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      uploadedByUserId: doc.uploadedByUserId ?? undefined,
      organizationId: doc.organizationId ?? undefined,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
      status: doc.status,
      error: doc.error ?? undefined,
      chunkCount: doc.chunkCount,
      embeddingTokens: doc.embeddingTokens,
      processedAt: doc.processedAt ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies KnowledgeBaseDocument;
  },

  async markDocumentCompleted(documentId, data) {
    await db
      .update(KnowledgeBaseDocumentSchema)
      .set({
        status: DOCUMENT_STATUS_COMPLETED,
        chunkCount: data.chunkCount,
        embeddingTokens: data.embeddingTokens,
        processedAt: data.processedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId));
  },

  async markDocumentFailed(documentId, error) {
    await db
      .update(KnowledgeBaseDocumentSchema)
      .set({
        status: DOCUMENT_STATUS_FAILED,
        error,
        updatedAt: new Date(),
      })
      .where(eq(KnowledgeBaseDocumentSchema.id, documentId));
  },

  async upsertDocumentChunks(documentId, knowledgeBaseId, chunks) {
    if (!chunks.length) return;

    await db.insert(KnowledgeBaseDocumentChunkSchema).values(
      chunks.map((chunk) => ({
        id: generateUUID(),
        documentId,
        knowledgeBaseId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
        createdAt: new Date(),
      })),
    );
  },

  async removeDocumentChunks(documentId) {
    await db
      .delete(KnowledgeBaseDocumentChunkSchema)
      .where(eq(KnowledgeBaseDocumentChunkSchema.documentId, documentId));
  },

  async findNextPendingDocument() {
    const [doc] = await db
      .select({
        id: KnowledgeBaseDocumentSchema.id,
        knowledgeBaseId: KnowledgeBaseDocumentSchema.knowledgeBaseId,
        uploadedByUserId: KnowledgeBaseDocumentSchema.uploadedByUserId,
        organizationId: KnowledgeBaseDocumentSchema.organizationId,
        fileName: KnowledgeBaseDocumentSchema.fileName,
        fileSize: KnowledgeBaseDocumentSchema.fileSize,
        mimeType: KnowledgeBaseDocumentSchema.mimeType,
        storageKey: KnowledgeBaseDocumentSchema.storageKey,
        status: KnowledgeBaseDocumentSchema.status,
        chunkCount: KnowledgeBaseDocumentSchema.chunkCount,
        embeddingTokens: KnowledgeBaseDocumentSchema.embeddingTokens,
        createdAt: KnowledgeBaseDocumentSchema.createdAt,
        updatedAt: KnowledgeBaseDocumentSchema.updatedAt,
      })
      .from(KnowledgeBaseDocumentSchema)
      .where(eq(KnowledgeBaseDocumentSchema.status, DOCUMENT_STATUS_PENDING))
      .orderBy(asc(KnowledgeBaseDocumentSchema.createdAt))
      .limit(1);

    if (!doc) return null;

    return {
      id: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      uploadedByUserId: doc.uploadedByUserId ?? undefined,
      organizationId: doc.organizationId ?? undefined,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
      status: doc.status,
      chunkCount: doc.chunkCount,
      embeddingTokens: doc.embeddingTokens,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies KnowledgeBaseDocument;
  },

  async searchKnowledgeBaseChunks({ knowledgeBaseIds, embedding, limit = 5 }) {
    if (!knowledgeBaseIds.length || !embedding.length) {
      return [];
    }

    const vectorLiteral = sql.raw(
      `'[${embedding.map((value) => Number(value).toString()).join(",")}]'`,
    );
    const distanceExpr = sql<number>`(${KnowledgeBaseDocumentChunkSchema.embedding} <=> ${vectorLiteral}::vector)`;
    const scoreExpr = sql<number>`GREATEST(0, 1 - ${distanceExpr})`;

    const rows = await db
      .select({
        knowledgeBaseId: KnowledgeBaseDocumentChunkSchema.knowledgeBaseId,
        documentId: KnowledgeBaseDocumentChunkSchema.documentId,
        documentName: KnowledgeBaseDocumentSchema.fileName,
        content: KnowledgeBaseDocumentChunkSchema.content,
        score: scoreExpr,
      })
      .from(KnowledgeBaseDocumentChunkSchema)
      .innerJoin(
        KnowledgeBaseDocumentSchema,
        eq(
          KnowledgeBaseDocumentSchema.id,
          KnowledgeBaseDocumentChunkSchema.documentId,
        ),
      )
      .where(
        and(
          inArray(
            KnowledgeBaseDocumentChunkSchema.knowledgeBaseId,
            knowledgeBaseIds,
          ),
          eq(KnowledgeBaseDocumentSchema.status, DOCUMENT_STATUS_COMPLETED),
        ),
      )
      .orderBy(distanceExpr)
      .limit(limit);

    return rows.map((row) => ({
      knowledgeBaseId: row.knowledgeBaseId,
      documentId: row.documentId,
      documentName: row.documentName,
      content: row.content,
      score: Number(row.score ?? 0),
    }));
  },
};
