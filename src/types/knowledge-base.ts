import z from "zod";
import { VisibilitySchema } from "./util";

export const KnowledgeBaseVisibilitySchema = VisibilitySchema;

export const KnowledgeBaseDocumentStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const KnowledgeBaseCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    visibility: VisibilitySchema.optional().default("private"),
    organizationId: z.string().uuid().nullable().optional(),
  })
  .strip();

export const KnowledgeBaseUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    visibility: VisibilitySchema.optional(),
    organizationId: z.string().uuid().nullable().optional(),
  })
  .strip();

export const KnowledgeBaseDocumentCreateSchema = z
  .object({
    knowledgeBaseId: z.string().uuid(),
    fileName: z.string().min(1),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    storageKey: z.string().min(1),
    checksum: z.string().min(1).optional(),
  })
  .strip();

export const KnowledgeBaseDocumentUpdateSchema = z
  .object({
    fileName: z.string().min(1).optional(),
  })
  .strip();

export type KnowledgeBaseVisibility = z.infer<
  typeof KnowledgeBaseVisibilitySchema
>;
export type KnowledgeBaseDocumentStatus = z.infer<
  typeof KnowledgeBaseDocumentStatusSchema
>;

export type KnowledgeBase = {
  id: string;
  name: string;
  description?: string;
  visibility: KnowledgeBaseVisibility;
  ownerUserId: string;
  organizationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  documentCount: number;
  pendingCount: number;
  processingCount: number;
};

export type KnowledgeBaseSummary = KnowledgeBase & {
  organizationName?: string | null;
};

export type KnowledgeBaseDocument = {
  id: string;
  knowledgeBaseId: string;
  uploadedByUserId?: string | null;
  organizationId?: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  status: KnowledgeBaseDocumentStatus;
  error?: string | null;
  chunkCount: number;
  embeddingTokens: number;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeBaseDocumentWithStatus = KnowledgeBaseDocument & {
  uploadedByName?: string | null;
};

export type KnowledgeBaseSearchChunk = {
  knowledgeBaseId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
};

export type KnowledgeBaseRepository = {
  createKnowledgeBase: (
    userId: string,
    payload: z.infer<typeof KnowledgeBaseCreateSchema>,
  ) => Promise<KnowledgeBase>;
  updateKnowledgeBase: (
    knowledgeBaseId: string,
    userId: string,
    payload: z.infer<typeof KnowledgeBaseUpdateSchema>,
  ) => Promise<KnowledgeBase | null>;
  deleteKnowledgeBase: (
    knowledgeBaseId: string,
    userId: string,
  ) => Promise<void>;
  getKnowledgeBaseById: (
    knowledgeBaseId: string,
    userId: string,
  ) => Promise<KnowledgeBase | null>;
  listKnowledgeBasesForUser: (
    userId: string,
  ) => Promise<KnowledgeBaseSummary[]>;
  listKnowledgeBaseDocuments: (
    knowledgeBaseId: string,
    userId: string,
  ) => Promise<KnowledgeBaseDocumentWithStatus[]>;
  insertDocumentPlaceholder: (
    userId: string,
    payload: z.infer<typeof KnowledgeBaseDocumentCreateSchema>,
  ) => Promise<KnowledgeBaseDocument>;
  updateDocument: (
    documentId: string,
    userId: string,
    payload: z.infer<typeof KnowledgeBaseDocumentUpdateSchema>,
  ) => Promise<KnowledgeBaseDocument | null>;
  deleteDocument: (documentId: string, userId: string) => Promise<void>;
  markDocumentProcessing: (
    documentId: string,
  ) => Promise<KnowledgeBaseDocument | null>;
  markDocumentCompleted: (
    documentId: string,
    data: {
      chunkCount: number;
      embeddingTokens: number;
      processedAt?: Date;
    },
  ) => Promise<void>;
  markDocumentFailed: (documentId: string, error: string) => Promise<void>;
  upsertDocumentChunks: (
    documentId: string,
    knowledgeBaseId: string,
    chunks: Array<{
      chunkIndex: number;
      content: string;
      embedding: number[];
    }>,
  ) => Promise<void>;
  removeDocumentChunks: (documentId: string) => Promise<void>;
  findNextPendingDocument: () => Promise<KnowledgeBaseDocument | null>;
  searchKnowledgeBaseChunks: (options: {
    knowledgeBaseIds: string[];
    embedding: number[];
    limit?: number;
  }) => Promise<KnowledgeBaseSearchChunk[]>;
};

export type KnowledgeBaseEmbeddingUsage = {
  userId: string;
  organizationId?: string | null;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  documentId?: string | null;
  operation: "ingest" | "query" | "delete";
  tokens: number;
  model: string;
  metadata?: Record<string, unknown> | null;
};
