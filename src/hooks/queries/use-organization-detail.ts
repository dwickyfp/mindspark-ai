"use client";
import useSWR, { SWRConfiguration } from "swr";
import {
  Organization,
  OrganizationMemberWithUser,
  OrganizationSharedAgent,
  OrganizationSharedMcpServer,
} from "app-types/organization";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

export type OrganizationDetailResponse = {
  organization: Organization;
  membership: {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    joinedAt: string;
  };
  members: OrganizationMemberWithUser[];
  sharedMcpServerIds: string[];
  sharedMcpServers: OrganizationSharedMcpServer[];
  sharedAgentIds: string[];
  sharedAgents: OrganizationSharedAgent[];
};

export function useOrganizationDetail(
  organizationId?: string,
  options?: SWRConfiguration,
) {
  return useSWR<OrganizationDetailResponse>(
    organizationId ? `/api/organization/${organizationId}` : null,
    fetcher,
    {
      onError: handleErrorWithToast,
      revalidateOnFocus: false,
      ...options,
    },
  );
}
