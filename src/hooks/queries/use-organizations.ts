"use client";
import useSWR, { SWRConfiguration } from "swr";
import { OrganizationWithMembershipRole } from "app-types/organization";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

export function useOrganizations(options?: SWRConfiguration) {
  return useSWR<OrganizationWithMembershipRole[]>(
    "/api/organization",
    fetcher,
    {
      fallbackData: [],
      onError: handleErrorWithToast,
      revalidateOnFocus: false,
      ...options,
    },
  );
}
