"use client";

import useSWR, { SWRConfiguration } from "swr";

import {
  KnowledgeBaseDocumentWithStatus,
  KnowledgeBaseSummary,
} from "app-types/knowledge-base";
import { fetcher } from "lib/utils";
import { handleErrorWithToast } from "ui/shared-toast";

type KnowledgeBaseDetailResponse = {
  knowledgeBase: KnowledgeBaseSummary;
  documents: KnowledgeBaseDocumentWithStatus[];
};

export function useKnowledgeBases(options?: SWRConfiguration) {
  return useSWR<KnowledgeBaseSummary[]>("/api/knowledge-base", fetcher, {
    onError: handleErrorWithToast,
    revalidateOnFocus: false,
    ...options,
  });
}

export function useKnowledgeBaseDetail(
  knowledgeBaseId?: string,
  options?: SWRConfiguration,
) {
  return useSWR<KnowledgeBaseDetailResponse>(
    knowledgeBaseId ? `/api/knowledge-base/${knowledgeBaseId}` : null,
    fetcher,
    {
      onError: handleErrorWithToast,
      revalidateOnFocus: false,
      ...options,
    },
  );
}
