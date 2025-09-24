import { ChatMetadata } from "app-types/chat";
import {
  EmbeddingUsageLogInsert,
  ModelUsageLogInsert,
  ToolUsageLogInsert,
} from "app-types/analytics";
import { usageLogRepository } from "lib/db/repository";

export async function logModelUsageFromMetadata(options: {
  userId: string;
  threadId?: string;
  messageId: string;
  metadata?: ChatMetadata;
}): Promise<void> {
  const { userId, threadId, messageId, metadata } = options;
  const usage = metadata?.usage;
  if (!usage) return;

  const payload: ModelUsageLogInsert = {
    userId,
    threadId,
    messageId,
    provider: metadata?.chatModel?.provider,
    model: metadata?.chatModel?.model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens:
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };

  await usageLogRepository.upsertModelUsage(payload);
}

export async function logToolUsageBatch(
  logs: ToolUsageLogInsert[],
): Promise<void> {
  if (!logs.length) return;
  await usageLogRepository.bulkUpsertToolUsage(logs);
}

export async function logEmbeddingUsage(
  log: EmbeddingUsageLogInsert,
): Promise<void> {
  await usageLogRepository.logEmbeddingUsage(log);
}

export function buildToolUsageLog(options: {
  userId: string;
  threadId?: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolSource: ToolUsageLogInsert["toolSource"];
  mcpServerId?: string | null;
  mcpServerName?: string | null;
}): ToolUsageLogInsert {
  return {
    userId: options.userId,
    threadId: options.threadId,
    messageId: options.messageId,
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    toolSource: options.toolSource,
    mcpServerId: options.mcpServerId ?? null,
    mcpServerName: options.mcpServerName ?? null,
  };
}
