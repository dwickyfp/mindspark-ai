import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import {
  chatRepository,
  organizationRepository,
  usageLogRepository,
  userRepository,
} from "lib/db/repository";

export async function GET() {
  const session = await getSession().catch(() => null);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [
    tokenTotals,
    toolAggregates,
    modelAggregates,
    agentUsage,
    usageSummary,
    organizations,
    totalChats,
    user,
  ] = await Promise.all([
    usageLogRepository.getTokenUsageTotalsForUsers([userId]),
    usageLogRepository.getToolUsageAggregatesForUsers([userId]),
    usageLogRepository.getModelUsageAggregatesForUsers([userId]),
    usageLogRepository.getAgentUsageForUsers([userId]),
    usageLogRepository.getUserUsageSummary(userId, { days: 7 }),
    organizationRepository.listOrganizationsForUser(userId),
    chatRepository.getThreadCountForUser(userId),
    userRepository.findById(userId),
  ]);

  const totalToolInvocations = toolAggregates.reduce(
    (total, tool) => total + tool.invocations,
    0,
  );

  const favoriteTools = toolAggregates.slice(0, 5);
  const topAgents = agentUsage.topAgents.slice(0, 5);
  const popularModels = modelAggregates.slice(0, 5);
  const queriesThisWeek = usageSummary.daily.reduce(
    (total, day) => total + day.count,
    0,
  );
  const averageTokensPerQuery =
    usageSummary.totalQueries > 0
      ? tokenTotals.totalTokens / usageSummary.totalQueries
      : 0;
  const firstActivityAt = usageSummary.firstActivityAt
    ? usageSummary.firstActivityAt.toISOString()
    : null;
  const lastActivityAt = usageSummary.lastActivityAt
    ? usageSummary.lastActivityAt.toISOString()
    : null;

  const accountCreatedAt = user?.createdAt ?? null;
  const accountCreatedAtIso = accountCreatedAt
    ? new Date(accountCreatedAt).toISOString()
    : null;
  const accountAgeDays = accountCreatedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(accountCreatedAt).getTime()) / 86_400_000,
        ),
      )
    : null;

  const modelDiversity = modelAggregates.reduce((unique, aggregate) => {
    const key = `${aggregate.provider ?? "unknown"}-${
      aggregate.model ?? "unknown"
    }`;
    unique.add(key);
    return unique;
  }, new Set<string>()).size;

  let currentStreak = 0;
  for (let index = usageSummary.daily.length - 1; index >= 0; index -= 1) {
    const day = usageSummary.daily[index];
    if (day.count === 0) {
      break;
    }
    currentStreak += 1;
  }

  return NextResponse.json({
    totals: {
      ...tokenTotals,
      totalQueries: usageSummary.totalQueries,
      averageTokensPerQuery,
      queriesThisWeek,
    },
    activity: {
      weekly: usageSummary.daily,
      firstActivityAt,
      lastActivityAt,
      currentStreak,
    },
    favoriteTools,
    topAgents,
    popularModels,
    organizationsJoined: organizations.length,
    totalChats,
    toolInvocations: totalToolInvocations,
    modelDiversity,
    account: {
      createdAt: accountCreatedAtIso,
      ageDays: accountAgeDays,
    },
  });
}
