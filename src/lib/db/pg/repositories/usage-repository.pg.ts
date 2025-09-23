import { pgDb as db } from "../db.pg";
import {
  AgentSchema,
  ChatMessageSchema,
  ChatThreadSchema,
  ModelUsageLogSchema,
  ToolUsageLogSchema,
  UserSchema,
} from "../schema.pg";
import {
  AgentUsageAnalytics,
  ModelUsageAggregate,
  ModelUsageLogInsert,
  TokenUsageTotals,
  ToolUsageAggregate,
  ToolUsageLogInsert,
  UsageLogRepository,
  UserUsageSummary,
} from "app-types/analytics";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

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

  async getAgentUsageForUsers(userIds: string[]) {
    if (userIds.length === 0) {
      return { totalInteractions: 0, topAgents: [] } satisfies AgentUsageAnalytics;
    }

    const agentIdExpr = sql<string>`(${ChatMessageSchema.metadata} ->> 'agentId')`;
    const agentIdUuidExpr = sql`(${ChatMessageSchema.metadata} ->> 'agentId')::uuid`;

    const rows = await db
      .select({
        agentId: agentIdExpr,
        usageCount: sql<number>`COUNT(*)`,
        agentName: AgentSchema.name,
        ownerUserId: AgentSchema.userId,
        ownerName: UserSchema.name,
        ownerAvatar: UserSchema.image,
      })
      .from(ChatMessageSchema)
      .innerJoin(
        ChatThreadSchema,
        eq(ChatMessageSchema.threadId, ChatThreadSchema.id),
      )
      .leftJoin(AgentSchema, sql`${AgentSchema.id} = ${agentIdUuidExpr}`)
      .leftJoin(UserSchema, eq(UserSchema.id, AgentSchema.userId))
      .where(
        and(
          inArray(ChatThreadSchema.userId, userIds),
          sql`${agentIdExpr} IS NOT NULL`,
        ),
      )
      .groupBy(
        agentIdExpr,
        AgentSchema.id,
        AgentSchema.name,
        AgentSchema.userId,
        UserSchema.id,
        UserSchema.name,
        UserSchema.image,
      )
      .orderBy(desc(sql`COUNT(*)`));

    const topAgents = rows
      .filter((row) => row.agentId)
      .map((row) => ({
        agentId: row.agentId,
        agentName: row.agentName ?? null,
        ownerUserId: row.ownerUserId ?? null,
        ownerName: row.ownerName ?? null,
        ownerAvatar: row.ownerAvatar ?? null,
        usageCount: Number(row.usageCount ?? 0),
      }));

    const totalInteractions = topAgents.reduce(
      (sum, item) => sum + item.usageCount,
      0,
    );

    return { totalInteractions, topAgents } satisfies AgentUsageAnalytics;
  },

  async getUserUsageSummary(userId, options) {
    const days = options?.days ?? 7;

    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

    const dateExpr = sql<string>`TO_CHAR(${ModelUsageLogSchema.createdAt}, 'YYYY-MM-DD')`;

    const dailyRows = await db
      .select({
        date: dateExpr,
        count: sql<number>`COUNT(*)`,
      })
      .from(ModelUsageLogSchema)
      .where(
        and(
          eq(ModelUsageLogSchema.userId, userId),
          gte(ModelUsageLogSchema.createdAt, startDate),
        ),
      )
      .groupBy(dateExpr)
      .orderBy(dateExpr);

    const dailyMap = new Map<string, number>();
    dailyRows.forEach((row) => {
      dailyMap.set(row.date, Number(row.count));
    });

    const daily: UserUsageSummary["daily"] = Array.from({ length: days }, (_, index) => {
      const current = new Date(startDate);
      current.setUTCDate(startDate.getUTCDate() + index);
      const isoDate = current.toISOString().slice(0, 10);
      return {
        date: isoDate,
        count: dailyMap.get(isoDate) ?? 0,
      };
    });

    const [summaryRow] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        first: sql<Date | null>`MIN(${ModelUsageLogSchema.createdAt})`,
        last: sql<Date | null>`MAX(${ModelUsageLogSchema.createdAt})`,
      })
      .from(ModelUsageLogSchema)
      .where(eq(ModelUsageLogSchema.userId, userId));

    const normalizeDate = (value: unknown): Date | null => {
      if (!value) return null;
      if (value instanceof Date) {
        return value;
      }
      const date = new Date(value as string);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    return {
      totalQueries: Number(summaryRow?.total ?? 0),
      firstActivityAt: normalizeDate(summaryRow?.first),
      lastActivityAt: normalizeDate(summaryRow?.last),
      daily,
    } satisfies UserUsageSummary;
  },
};
