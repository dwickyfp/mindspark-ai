import { Agent } from "app-types/agent";
import { UserPreferences } from "app-types/user";
import { MCPServerConfig } from "app-types/mcp";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  json,
  uuid,
  boolean,
  unique,
  varchar,
  index,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";
import { isNotNull } from "drizzle-orm";
import { DBWorkflow, DBEdge, DBNode } from "app-types/workflow";
import { UIMessage } from "ai";
import { ChatMetadata } from "app-types/chat";

export const knowledgeBaseDocumentStatusEnum = pgEnum(
  "knowledge_base_document_status",
  ["pending", "processing", "completed", "failed"],
);

export const embeddingOperationEnum = pgEnum("embedding_usage_operation", [
  "ingest",
  "query",
  "delete",
]);

export const ChatThreadSchema = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ChatMessageSchema = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadSchema.id),
  role: text("role").notNull().$type<UIMessage["role"]>(),
  parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AgentSchema = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const BookmarkSchema = pgTable(
  "bookmark",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    itemType: varchar("item_type", {
      enum: ["agent", "workflow"],
    }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.itemId, table.itemType),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_item_idx").on(table.itemId, table.itemType),
  ],
);

export const McpServerSchema = pgTable(
  "mcp_server",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    config: json("config").notNull().$type<MCPServerConfig>(),
    enabled: boolean("enabled").notNull().default(true),
    ownerUserId: uuid("owner_user_id").references(() => UserSchema.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("mcp_server_owner_idx").on(table.ownerUserId)],
);

export const UserSchema = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const SessionSchema = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
});

export const AccountSchema = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const VerificationSchema = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

export const OrganizationSchema = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("organization_slug_unique").on(table.slug),
    index("organization_owner_idx").on(table.ownerUserId),
  ],
);

export const OrganizationMemberSchema = pgTable(
  "organization_member",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationSchema.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    role: varchar("role", {
      enum: ["owner", "admin", "member"],
    })
      .notNull()
      .default("member"),
    joinedAt: timestamp("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("organization_member_unique").on(table.organizationId, table.userId),
    index("organization_member_org_idx").on(table.organizationId),
    index("organization_member_user_idx").on(table.userId),
  ],
);

export const KnowledgeBaseSchema = pgTable(
  "knowledge_base",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    visibility: varchar("visibility", {
      enum: ["public", "private", "readonly"],
    })
      .notNull()
      .default("private"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => OrganizationSchema.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("knowledge_base_owner_name_unique").on(
      table.ownerUserId,
      table.name,
    ),
    index("knowledge_base_org_idx").on(table.organizationId),
    index("knowledge_base_visibility_idx").on(table.visibility),
  ],
);

export const KnowledgeBaseDocumentSchema = pgTable(
  "knowledge_base_document",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => KnowledgeBaseSchema.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(
      () => UserSchema.id,
      {
        onDelete: "set null",
      },
    ),
    organizationId: uuid("organization_id").references(
      () => OrganizationSchema.id,
      {
        onDelete: "set null",
      },
    ),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    checksum: text("checksum"),
    status: knowledgeBaseDocumentStatusEnum("status")
      .notNull()
      .default("pending"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    embeddingTokens: integer("embedding_tokens").notNull().default(0),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("knowledge_base_document_storage_key_unique").on(table.storageKey),
    index("knowledge_base_document_kb_idx").on(table.knowledgeBaseId),
    index("knowledge_base_document_status_idx").on(table.status),
  ],
);

export const KnowledgeBaseDocumentChunkSchema = pgTable(
  "knowledge_base_document_chunk",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => KnowledgeBaseDocumentSchema.id, {
        onDelete: "cascade",
      }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => KnowledgeBaseSchema.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("knowledge_base_chunk_document_idx").on(table.documentId),
    index("knowledge_base_chunk_kb_idx").on(table.knowledgeBaseId),
  ],
);

export const OrganizationMcpServerSchema = pgTable(
  "organization_mcp_server",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationSchema.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("organization_mcp_unique").on(
      table.organizationId,
      table.mcpServerId,
    ),
    index("organization_mcp_org_idx").on(table.organizationId),
    index("organization_mcp_server_idx").on(table.mcpServerId),
  ],
);

export const AgentKnowledgeBaseSchema = pgTable(
  "agent_knowledge_base",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentSchema.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => KnowledgeBaseSchema.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("agent_knowledge_base_unique").on(
      table.agentId,
      table.knowledgeBaseId,
    ),
    index("agent_knowledge_base_agent_idx").on(table.agentId),
    index("agent_knowledge_base_kb_idx").on(table.knowledgeBaseId),
  ],
);

export const OrganizationAgentSchema = pgTable(
  "organization_agent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => OrganizationSchema.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => AgentSchema.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("organization_agent_unique").on(table.organizationId, table.agentId),
    index("organization_agent_org_idx").on(table.organizationId),
    index("organization_agent_agent_idx").on(table.agentId),
  ],
);

export const ModelUsageLogSchema = pgTable(
  "model_usage_log",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => ChatThreadSchema.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").notNull(),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("model_usage_message_unique").on(table.messageId),
    index("model_usage_user_idx").on(table.userId),
    index("model_usage_thread_idx").on(table.threadId),
  ],
);

export const ToolUsageLogSchema = pgTable(
  "tool_usage_log",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => ChatThreadSchema.id, {
      onDelete: "set null",
    }),
    messageId: text("message_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolSource: varchar("tool_source", {
      enum: ["mcp", "workflow", "default"],
    }).notNull(),
    mcpServerId: uuid("mcp_server_id").references(() => McpServerSchema.id, {
      onDelete: "set null",
    }),
    mcpServerName: text("mcp_server_name"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique("tool_usage_call_unique").on(table.toolCallId),
    index("tool_usage_user_idx").on(table.userId),
    index("tool_usage_mcp_idx").on(table.mcpServerId),
  ],
);

export const EmbeddingUsageLogSchema = pgTable(
  "embedding_usage_log",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => OrganizationSchema.id,
      {
        onDelete: "set null",
      },
    ),
    agentId: uuid("agent_id").references(() => AgentSchema.id, {
      onDelete: "set null",
    }),
    knowledgeBaseId: uuid("knowledge_base_id").references(
      () => KnowledgeBaseSchema.id,
      { onDelete: "set null" },
    ),
    documentId: uuid("document_id").references(
      () => KnowledgeBaseDocumentSchema.id,
      { onDelete: "set null" },
    ),
    operation: embeddingOperationEnum("operation").notNull(),
    tokens: integer("tokens").notNull().default(0),
    model: text("model").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("embedding_usage_user_idx").on(table.userId),
    index("embedding_usage_agent_idx").on(table.agentId),
    index("embedding_usage_kb_idx").on(table.knowledgeBaseId),
    index("embedding_usage_org_idx").on(table.organizationId),
  ],
);

// Tool customization table for per-user additional instructions
export const McpToolCustomizationSchema = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationSchema = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

export const WorkflowSchema = pgTable("workflow", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  name: text("name").notNull(),
  icon: json("icon").$type<DBWorkflow["icon"]>(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const WorkflowNodeDataSchema = pgTable(
  "workflow_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    version: text("version").notNull().default("0.1.0"),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => WorkflowSchema.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    uiConfig: json("ui_config").$type<DBNode["uiConfig"]>().default({}),
    nodeConfig: json("node_config")
      .$type<Partial<DBNode["nodeConfig"]>>()
      .default({}),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("workflow_node_kind_idx").on(t.kind)],
);

export const WorkflowEdgeSchema = pgTable("workflow_edge", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => WorkflowSchema.id, { onDelete: "cascade" }),
  source: uuid("source")
    .notNull()
    .references(() => WorkflowNodeDataSchema.id, { onDelete: "cascade" }),
  target: uuid("target")
    .notNull()
    .references(() => WorkflowNodeDataSchema.id, { onDelete: "cascade" }),
  uiConfig: json("ui_config").$type<DBEdge["uiConfig"]>().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveSchema = pgTable("archive", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserSchema.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveItemSchema = pgTable(
  "archive_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => ArchiveSchema.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserSchema.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("archive_item_item_id_idx").on(t.itemId)],
);

export const McpOAuthSessionSchema = pgTable(
  "mcp_oauth_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerSchema.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    clientInfo: json("client_info"),
    tokens: json("tokens"),
    codeVerifier: text("code_verifier"),
    state: text("state").unique(), // OAuth state parameter for current flow (unique for security)
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("mcp_oauth_session_server_id_idx").on(t.mcpServerId),
    index("mcp_oauth_session_state_idx").on(t.state),
    // Partial index for sessions with tokens for better performance
    index("mcp_oauth_session_tokens_idx")
      .on(t.mcpServerId)
      .where(isNotNull(t.tokens)),
  ],
);

export type McpServerEntity = typeof McpServerSchema.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadSchema.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageSchema.$inferSelect;

export type AgentEntity = typeof AgentSchema.$inferSelect;
export type UserEntity = typeof UserSchema.$inferSelect;
export type ToolCustomizationEntity =
  typeof McpToolCustomizationSchema.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationSchema.$inferSelect;

export type ArchiveEntity = typeof ArchiveSchema.$inferSelect;
export type ArchiveItemEntity = typeof ArchiveItemSchema.$inferSelect;
export type BookmarkEntity = typeof BookmarkSchema.$inferSelect;
