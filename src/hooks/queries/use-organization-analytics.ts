"use client";
import useSWR, { SWRConfiguration } from "swr";
import {
  ModelUsageAggregate,
  TokenUsageTotals,
  ToolUsageAggregate,
} from "app-types/analytics";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

export type OrganizationAnalyticsResponse = {
  totals: TokenUsageTotals;
  popularModels: ModelUsageAggregate[];
  favoriteTools: ToolUsageAggregate[];
  members: number;
};

export function useOrganizationAnalytics(
  organizationId?: string,
  options?: SWRConfiguration,
) {
  return useSWR<OrganizationAnalyticsResponse>(
    organizationId ? `/api/organization/${organizationId}/analytics` : null,
    fetcher,
    {
      onError: handleErrorWithToast,
      revalidateOnFocus: false,
      ...options,
    },
  );
}
