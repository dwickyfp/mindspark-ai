import { pgDb as db } from "../db.pg";
import { ModelUsageLogSchema, ToolUsageLogSchema } from "../schema.pg";
import {
  ModelUsageAggregate,
  ModelUsageLogInsert,
  TokenUsageTotals,
  ToolUsageAggregate,
  ToolUsageLogInsert,
  UsageLogRepository,
} from "app-types/analytics";
import { desc, inArray, sql } from "drizzle-orm";

export const pgUsageLogRepository: UsageLogRepository = {
  async upsertModelUsage(log: ModelUsageLogInsert) {
    await db
      .insert(ModelUsageLogSchema)
      .values({
        userId: log.userId,
        threadId: log.threadId ?? null,
        messageId: log.messageId,
        provider: log.provider ?? null,
        model: log.model ?? null,
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        totalTokens: log.totalTokens,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ModelUsageLogSchema.messageId,
        set: {
          provider: log.provider ?? null,
          model: log.model ?? null,
          inputTokens: log.inputTokens,
          outputTokens: log.outputTokens,
          totalTokens: log.totalTokens,
          threadId: log.threadId ?? null,
          userId: log.userId,
          createdAt: new Date(),
        },
      });
  },

  async bulkUpsertToolUsage(logs: ToolUsageLogInsert[]) {
    if (logs.length === 0) return;
    await db
      .insert(ToolUsageLogSchema)
      .values(
        logs.map((log) => ({
          userId: log.userId,
          threadId: log.threadId ?? null,
          messageId: log.messageId,
          toolCallId: log.toolCallId,
          toolName: log.toolName,
          toolSource: log.toolSource,
          mcpServerId: log.mcpServerId ?? null,
          mcpServerName: log.mcpServerName ?? null,
          createdAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: ToolUsageLogSchema.toolCallId,
        set: {
          toolName: sql`excluded.tool_name`,
          toolSource: sql`excluded.tool_source`,
          mcpServerId: sql`excluded.mcp_server_id`,
          mcpServerName: sql`excluded.mcp_server_name`,
          userId: sql`excluded.user_id`,
          threadId: sql`excluded.thread_id`,
          messageId: sql`excluded.message_id`,
          createdAt: new Date(),
        },
      });
  },

  async getModelUsageAggregatesForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];

    const rows = await db
      .select({
        provider: ModelUsageLogSchema.provider,
        model: ModelUsageLogSchema.model,
        invocations: sql<number>`COALESCE(COUNT(*), 0)`,
        inputTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.inputTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.outputTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.totalTokens}), 0)`,
      })
      .from(ModelUsageLogSchema)
      .where(inArray(ModelUsageLogSchema.userId, userIds))
      .groupBy(ModelUsageLogSchema.provider, ModelUsageLogSchema.model)
      .orderBy(desc(sql`COALESCE(SUM(${ModelUsageLogSchema.totalTokens}), 0)`));

    return rows as ModelUsageAggregate[];
  },

  async getTokenUsageTotalsForUsers(userIds: string[]) {
    if (userIds.length === 0) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }

    const [row] = await db
      .select({
        inputTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.inputTokens}), 0)`,
        outputTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.outputTokens}), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${ModelUsageLogSchema.totalTokens}), 0)`,
      })
      .from(ModelUsageLogSchema)
      .where(inArray(ModelUsageLogSchema.userId, userIds));

    return (row ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }) as TokenUsageTotals;
  },

  async getToolUsageAggregatesForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];

    const rows = await db
      .select({
        toolName: ToolUsageLogSchema.toolName,
        toolSource: ToolUsageLogSchema.toolSource,
        mcpServerId: ToolUsageLogSchema.mcpServerId,
        mcpServerName: ToolUsageLogSchema.mcpServerName,
        invocations: sql<number>`COALESCE(COUNT(*), 0)`,
      })
      .from(ToolUsageLogSchema)
      .where(inArray(ToolUsageLogSchema.userId, userIds))
      .groupBy(
        ToolUsageLogSchema.toolName,
        ToolUsageLogSchema.toolSource,
        ToolUsageLogSchema.mcpServerId,
        ToolUsageLogSchema.mcpServerName,
      )
      .orderBy(desc(sql`COALESCE(COUNT(*), 0)`));

    return rows as ToolUsageAggregate[];
  },
};
