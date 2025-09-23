"use client";

import useSWR, { SWRConfiguration } from "swr";
import {
  AgentUsageAggregate,
  DailyUsageStat,
  ModelUsageAggregate,
  TokenUsageTotals,
  ToolUsageAggregate,
} from "app-types/analytics";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

export type UserAnalyticsTotals = TokenUsageTotals & {
  totalQueries: number;
  averageTokensPerQuery: number;
  queriesThisWeek: number;
};

export type UserAnalyticsResponse = {
  totals: UserAnalyticsTotals;
  activity: {
    weekly: DailyUsageStat[];
    firstActivityAt: string | null;
    lastActivityAt: string | null;
    currentStreak: number;
  };
  favoriteTools: ToolUsageAggregate[];
  topAgents: AgentUsageAggregate[];
  popularModels: ModelUsageAggregate[];
  organizationsJoined: number;
  totalChats: number;
  toolInvocations: number;
  modelDiversity: number;
  account: {
    createdAt: string | null;
    ageDays: number | null;
  };
};

export function useUserAnalytics(options?: SWRConfiguration) {
  return useSWR<UserAnalyticsResponse>("/api/me/analytics", fetcher, {
    onError: handleErrorWithToast,
    revalidateOnFocus: false,
    ...options,
  });
}
