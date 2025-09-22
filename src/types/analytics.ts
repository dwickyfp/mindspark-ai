export type ModelUsageLogInsert = {
  userId: string;
  threadId?: string | null;
  messageId: string;
  provider?: string | null;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ToolUsageLogInsert = {
  userId: string;
  threadId?: string | null;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolSource: "mcp" | "workflow" | "default";
  mcpServerId?: string | null;
  mcpServerName?: string | null;
};

export type ModelUsageAggregate = {
  provider: string | null;
  model: string | null;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ToolUsageAggregate = {
  toolName: string;
  toolSource: "mcp" | "workflow" | "default";
  invocations: number;
  mcpServerId?: string | null;
  mcpServerName?: string | null;
};

export type TokenUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageLogRepository = {
  upsertModelUsage: (log: ModelUsageLogInsert) => Promise<void>;
  bulkUpsertToolUsage: (logs: ToolUsageLogInsert[]) => Promise<void>;
  getModelUsageAggregatesForUsers: (
    userIds: string[],
  ) => Promise<ModelUsageAggregate[]>;
  getTokenUsageTotalsForUsers: (userIds: string[]) => Promise<TokenUsageTotals>;
  getToolUsageAggregatesForUsers: (
    userIds: string[],
  ) => Promise<ToolUsageAggregate[]>;
};
