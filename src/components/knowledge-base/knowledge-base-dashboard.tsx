"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import {
  KnowledgeBaseDocumentWithStatus,
  KnowledgeBaseSummary,
} from "app-types/knowledge-base";
import {
  useKnowledgeBaseDetail,
  useKnowledgeBases,
} from "@/hooks/queries/use-knowledge-bases";
import { handleErrorWithToast } from "ui/shared-toast";
import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";
import { Badge } from "ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
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
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "destructive" | "warning"
> = {
  pending: "secondary",
  processing: "warning",
  completed: "success",
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

type KnowledgeBaseDashboardProps = {
  initialKnowledgeBases: KnowledgeBaseSummary[];
};

type KnowledgeBaseFormState = {
  name: string;
  description: string;
  visibility: "private" | "readonly" | "public";
};

const DEFAULT_FORM_STATE: KnowledgeBaseFormState = {
  name: "",
  description: "",
  visibility: "private",
};

export default function KnowledgeBaseDashboard({
  initialKnowledgeBases,
}: KnowledgeBaseDashboardProps) {
  const t = useTranslations("KnowledgeBase");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<KnowledgeBaseFormState>(DEFAULT_FORM_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshingDocument, setRefreshingDocument] = useState(false);

  const {
    data: knowledgeBases,
    mutate: mutateKnowledgeBases,
    isLoading,
  } = useKnowledgeBases({
    fallbackData: initialKnowledgeBases,
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    knowledgeBases?.[0]?.id ?? null,
  );

  useEffect(() => {
    if (!knowledgeBases?.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !knowledgeBases.some((kb) => kb.id === selectedId)) {
      setSelectedId(knowledgeBases[0].id);
    }
  }, [knowledgeBases, selectedId]);

  const {
    data: detail,
    isLoading: isLoadingDetail,
    mutate: mutateDetail,
  } = useKnowledgeBaseDetail(selectedId ?? undefined, {
    refreshInterval: 5000,
  });

  const selectedKnowledgeBase = detail?.knowledgeBase;
  const documents = detail?.documents ?? [];

  const handleCreateKnowledgeBase = useCallback(async () => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/knowledge-base", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createForm),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to create knowledge base");
      }

      const created: KnowledgeBaseSummary = await response.json();
      await mutateKnowledgeBases();
      toast.success(t("messages.created"));
      setCreateDialogOpen(false);
      setCreateForm(DEFAULT_FORM_STATE);
      setSelectedId(created.id);
    } catch (error) {
      handleErrorWithToast(error);
    } finally {
      setIsSaving(false);
    }
  }, [createForm, mutateKnowledgeBases, t]);

  const handleUpdateKnowledgeBase = useCallback(
    async (updates: Partial<KnowledgeBaseFormState>) => {
      if (!selectedId) return;
      try {
        setIsSaving(true);
        const response = await fetch(`/api/knowledge-base/${selectedId}`, {
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

        await Promise.all([mutateKnowledgeBases(), mutateDetail()]);
        toast.success(t("messages.updated"));
      } catch (error) {
        handleErrorWithToast(error);
      } finally {
        setIsSaving(false);
      }
    },
    [mutateDetail, mutateKnowledgeBases, selectedId, t],
  );

  const handleDeleteKnowledgeBase = useCallback(async () => {
    if (!selectedId) return;
    const confirmDelete = window.confirm(t("confirm.deleteKnowledgeBase"));
    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/knowledge-base/${selectedId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to delete knowledge base");
      }

      await mutateKnowledgeBases();
      toast.success(t("messages.deleted"));
    } catch (error) {
      handleErrorWithToast(error);
    }
  }, [mutateKnowledgeBases, selectedId, t]);

  const handleUploadDocument = useCallback(
    async (file: File | null) => {
      if (!file || !selectedId) return;
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(
          `/api/knowledge-base/${selectedId}/documents`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Failed to upload document");
        }

        await mutateDetail();
        toast.success(t("messages.documentUploaded", { file: file.name }));
      } catch (error) {
        handleErrorWithToast(error);
      }
    },
    [mutateDetail, selectedId, t],
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

        await mutateDetail();
        toast.success(t("messages.documentDeleted"));
      } catch (error) {
        handleErrorWithToast(error);
      }
    },
    [mutateDetail, t],
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
        handleErrorWithToast(error);
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

  return (
    <div className="flex h-full flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("actions.newKnowledgeBase")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {t("list.heading")}
            </CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => mutateKnowledgeBases()}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
              <span className="sr-only">{t("actions.refresh")}</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2 p-4">
                {knowledgeBases?.map((kb) => {
                  const isActive = kb.id === selectedId;
                  return (
                    <button
                      key={kb.id}
                      type="button"
                      className={cn(
                        "w-full rounded-md border border-transparent bg-muted/40 p-3 text-left transition hover:border-border",
                        isActive && "border-border bg-muted",
                      )}
                      onClick={() => setSelectedId(kb.id)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{kb.name}</p>
                        <Badge variant="secondary">{kb.documentCount}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {kb.description || t("list.noDescription")}
                      </p>
                    </button>
                  );
                })}
                {!knowledgeBases?.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t("list.empty")}
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {selectedKnowledgeBase?.name ?? t("detail.placeholderTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingDetail ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : selectedKnowledgeBase ? (
              <div className="space-y-6">
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        {t("detail.settings")}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t("detail.settingsDescription")}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteKnowledgeBase}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("actions.deleteKnowledgeBase")}
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="kb-name">
                        {t("form.name")}
                      </label>
                      <Input
                        id="kb-name"
                        defaultValue={selectedKnowledgeBase.name}
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
                        defaultValue={selectedKnowledgeBase.visibility}
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
                        defaultValue={selectedKnowledgeBase.description ?? ""}
                        rows={3}
                        onBlur={(event) =>
                          handleUpdateKnowledgeBase({
                            description: event.currentTarget.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <Card className="border-dashed border-border/60 bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("detail.metrics.totalDocuments")}
                      </p>
                      <p className="text-xl font-semibold">
                        {selectedKnowledgeBase.documentCount}
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
                </section>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        {t("documents.heading")}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t("documents.description")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={refreshDocuments}
                        disabled={refreshingDocument}
                      >
                        <RefreshCw
                          className={cn(
                            "h-4 w-4",
                            refreshingDocument && "animate-spin",
                          )}
                        />
                        <span className="sr-only">{t("actions.refresh")}</span>
                      </Button>
                      <Button onClick={handleFilePicker}>
                        <Upload className="mr-2 h-4 w-4" />
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
                  </div>

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
                </section>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-10 text-center text-sm text-muted-foreground">
                {t("detail.placeholderDescription")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("dialog.createTitle")}</DialogTitle>
            <DialogDescription>
              {t("dialog.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="create-name">
                {t("form.name")}
              </label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setCreateForm((prev) => ({
                    ...prev,
                    name: value,
                  }));
                }}
                placeholder={t("form.namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="create-description"
              >
                {t("form.description")}
              </label>
              <Textarea
                id="create-description"
                value={createForm.description}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setCreateForm((prev) => ({
                    ...prev,
                    description: value,
                  }));
                }}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="create-visibility"
              >
                {t("form.visibility")}
              </label>
              <Select
                value={createForm.visibility}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    visibility: value as KnowledgeBaseFormState["visibility"],
                  }))
                }
              >
                <SelectTrigger id="create-visibility">
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
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleCreateKnowledgeBase}
              disabled={isSaving || !createForm.name.trim()}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("actions.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
