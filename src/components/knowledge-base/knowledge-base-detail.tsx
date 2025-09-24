"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";

import {
  KnowledgeBaseDocumentWithStatus,
  KnowledgeBaseSummary,
} from "app-types/knowledge-base";
import { useKnowledgeBaseDetail } from "@/hooks/queries/use-knowledge-bases";
import { handleErrorWithToast } from "ui/shared-toast";
import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { ScrollArea } from "ui/scroll-area";
import { cn } from "lib/utils";
import {
  ArrowLeft,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  processing: "outline",
  completed: "default",
  failed: "destructive",
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

type KnowledgeBaseDetailProps = {
  knowledgeBaseId: string;
  initialKnowledgeBase: KnowledgeBaseSummary;
  initialDocuments: KnowledgeBaseDocumentWithStatus[];
};

type KnowledgeBaseFormState = {
  name: string;
  description: string;
  visibility: "private" | "readonly" | "public";
};

export default function KnowledgeBaseDetail({
  knowledgeBaseId,
  initialKnowledgeBase,
  initialDocuments,
}: KnowledgeBaseDetailProps) {
  const t = useTranslations("KnowledgeBase");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: mutateCache } = useSWRConfig();

  const [isSaving, setIsSaving] = useState(false);
  const [refreshingDocument, setRefreshingDocument] = useState(false);

  const {
    data: detail,
    isLoading,
    mutate: mutateDetail,
  } = useKnowledgeBaseDetail(knowledgeBaseId, {
    fallbackData: {
      knowledgeBase: initialKnowledgeBase,
      documents: initialDocuments,
    },
    refreshInterval: 5000,
  });

  const knowledgeBase = detail?.knowledgeBase ?? initialKnowledgeBase;
  const documents = detail?.documents ?? initialDocuments;

  const handleUpdateKnowledgeBase = useCallback(
    async (updates: Partial<KnowledgeBaseFormState>) => {
      try {
        setIsSaving(true);
        const response = await fetch(`/api/knowledge-base/${knowledgeBaseId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to update knowledge base");
        }

        await Promise.all([mutateDetail(), mutateCache("/api/knowledge-base")]);
        toast.success(t("messages.updated"));
      } catch (error) {
        handleErrorWithToast(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [knowledgeBaseId, mutateCache, mutateDetail, t],
  );

  const handleDeleteKnowledgeBase = useCallback(async () => {
    const confirmDelete = window.confirm(t("confirm.deleteKnowledgeBase"));
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/knowledge-base/${knowledgeBaseId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to delete knowledge base");
      }

      await mutateCache("/api/knowledge-base");
      toast.success(t("messages.deleted"));
      router.replace("/knowledge-base");
    } catch (error) {
      handleErrorWithToast(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, [knowledgeBaseId, mutateCache, router, t]);

  const handleUploadDocument = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          `/api/knowledge-base/${knowledgeBaseId}/documents`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to upload document");
        }

        await Promise.all([mutateDetail(), mutateCache("/api/knowledge-base")]);
        toast.success(t("messages.documentUploaded", { file: file.name }));
      } catch (error) {
        handleErrorWithToast(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [knowledgeBaseId, mutateCache, mutateDetail, t],
  );

  const handleDeleteDocument = useCallback(
    async (document: KnowledgeBaseDocumentWithStatus) => {
      const confirmDelete = window.confirm(
        t("confirm.deleteDocument", { file: document.fileName }),
      );
      if (!confirmDelete) return;

      try {
        const response = await fetch(
          `/api/knowledge-base/${document.knowledgeBaseId}/documents/${document.id}`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to delete document");
        }

        await Promise.all([mutateDetail(), mutateCache("/api/knowledge-base")]);
        toast.success(t("messages.documentDeleted"));
      } catch (error) {
        handleErrorWithToast(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [mutateCache, mutateDetail, t],
  );

  const handleRenameDocument = useCallback(
    async (document: KnowledgeBaseDocumentWithStatus, newName: string) => {
      if (!newName || newName === document.fileName) return;
      try {
        const response = await fetch(
          `/api/knowledge-base/${document.knowledgeBaseId}/documents/${document.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fileName: newName }),
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to update document");
        }

        await mutateDetail();
        toast.success(t("messages.documentRenamed"));
      } catch (error) {
        handleErrorWithToast(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    [mutateDetail, t],
  );

  const refreshDocuments = useCallback(async () => {
    try {
      setRefreshingDocument(true);
      await mutateDetail();
    } finally {
      setRefreshingDocument(false);
    }
  }, [mutateDetail]);

  const documentStatusGroups = useMemo(() => {
    const groups = {
      completed: 0,
      processing: 0,
      pending: 0,
      failed: 0,
    };
    for (const doc of documents) {
      if (doc.status === "completed") groups.completed += 1;
      else if (doc.status === "processing") groups.processing += 1;
      else if (doc.status === "failed") groups.failed += 1;
      else groups.pending += 1;
    }
    return groups;
  }, [documents]);

  const handleFilePicker = () => {
    fileInputRef.current?.click();
  };

  const visibility = knowledgeBase?.visibility ?? "private";

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/knowledge-base"
            className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium transition hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            {tCommon("back")}
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">
              {knowledgeBase?.name ?? t("detail.placeholderTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {knowledgeBase?.description || t("detail.placeholderDescription")}
            </p>
            <Badge variant="secondary" className="uppercase tracking-wide">
              {t(`visibility.${visibility}`)}
            </Badge>
          </div>
          <Button
            variant="destructive"
            onClick={handleDeleteKnowledgeBase}
            disabled={isSaving}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {t("actions.deleteKnowledgeBase")}
          </Button>
        </div>

        {isLoading && !knowledgeBase ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : knowledgeBase ? (
          <div className="flex flex-col gap-8 pb-10">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  {t("detail.settings")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {t("detail.settingsDescription")}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="kb-name">
                      {t("form.name")}
                    </label>
                    <Input
                      id="kb-name"
                      defaultValue={knowledgeBase.name}
                      onBlur={(event) =>
                        handleUpdateKnowledgeBase({
                          name: event.currentTarget.value.trim(),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="kb-visibility"
                    >
                      {t("form.visibility")}
                    </label>
                    <Select
                      defaultValue={visibility}
                      onValueChange={(value) =>
                        handleUpdateKnowledgeBase({
                          visibility:
                            value as KnowledgeBaseFormState["visibility"],
                        })
                      }
                    >
                      <SelectTrigger id="kb-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">
                          {t("visibility.private")}
                        </SelectItem>
                        <SelectItem value="readonly">
                          {t("visibility.readonly")}
                        </SelectItem>
                        <SelectItem value="public">
                          {t("visibility.public")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="kb-description"
                    >
                      {t("form.description")}
                    </label>
                    <Textarea
                      id="kb-description"
                      defaultValue={knowledgeBase.description ?? ""}
                      rows={3}
                      onBlur={(event) =>
                        handleUpdateKnowledgeBase({
                          description: event.currentTarget.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <Card className="border-dashed border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("detail.metrics.totalDocuments")}
                    </p>
                    <p className="text-xl font-semibold">
                      {knowledgeBase.documentCount}
                    </p>
                  </Card>
                  <Card className="border-dashed border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("detail.metrics.pending")}
                    </p>
                    <p className="text-xl font-semibold">
                      {documentStatusGroups.pending}
                    </p>
                  </Card>
                  <Card className="border-dashed border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("detail.metrics.processing")}
                    </p>
                    <p className="text-xl font-semibold">
                      {documentStatusGroups.processing}
                    </p>
                  </Card>
                  <Card className="border-dashed border-border/60 bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("detail.metrics.completed")}
                    </p>
                    <p className="text-xl font-semibold">
                      {documentStatusGroups.completed}
                    </p>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {t("documents.heading")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("documents.description")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDocuments}
                    disabled={refreshingDocument}
                    className="gap-2"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        refreshingDocument && "animate-spin",
                      )}
                    />
                    {t("actions.refresh")}
                  </Button>
                  <Button onClick={handleFilePicker} className="gap-2">
                    <Upload className="h-4 w-4" />
                    {t("actions.uploadDocument")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      void handleUploadDocument(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">
                          {t("documents.table.name")}
                        </th>
                        <th className="px-4 py-3 font-medium">
                          {t("documents.table.size")}
                        </th>
                        <th className="px-4 py-3 font-medium">
                          {t("documents.table.status")}
                        </th>
                        <th className="px-4 py-3 font-medium">
                          {t("documents.table.tokens")}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t("documents.table.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((document) => (
                        <tr
                          key={document.id}
                          className="border-t border-border/40 text-sm"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <Input
                                defaultValue={document.fileName}
                                onBlur={(event) =>
                                  handleRenameDocument(
                                    document,
                                    event.currentTarget.value.trim(),
                                  )
                                }
                                className="max-w-sm"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatBytes(document.fileSize)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                STATUS_VARIANT[document.status] ?? "secondary"
                              }
                            >
                              {t(`status.${document.status}`)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {document.embeddingTokens}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteDocument(document)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">
                                {t("actions.deleteDocument")}
                              </span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!documents.length ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            {t("documents.empty")}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-8 py-16 text-center text-sm text-muted-foreground">
            {t("detail.placeholderDescription")}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
