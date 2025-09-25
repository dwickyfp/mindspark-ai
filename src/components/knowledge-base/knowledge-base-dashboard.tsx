"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { KnowledgeBaseSummary } from "app-types/knowledge-base";
import { useKnowledgeBases } from "@/hooks/queries/use-knowledge-bases";
import { handleErrorWithToast } from "ui/shared-toast";
import { Button } from "ui/button";
import { Card } from "ui/card";
import { Badge } from "ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
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
import { ArrowUpRight, Loader2, Plus, RefreshCw } from "lucide-react";

type KnowledgeBaseDashboardProps = {
  initialKnowledgeBases: KnowledgeBaseSummary[];
};

type KnowledgeBaseFormState = {
  name: string;
  description: string;
  visibility: "private" | "readonly" | "public";
};

const VISIBILITY_ORDER: Record<KnowledgeBaseFormState["visibility"], number> = {
  private: 2,
  readonly: 1,
  public: 0,
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
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<KnowledgeBaseFormState>(DEFAULT_FORM_STATE);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const {
    data: knowledgeBases,
    mutate: mutateKnowledgeBases,
    isLoading,
    isValidating,
  } = useKnowledgeBases({
    fallbackData: initialKnowledgeBases,
  });

  const sortedKnowledgeBases = useMemo(() => {
    const list = knowledgeBases ?? initialKnowledgeBases ?? [];
    const normalized = searchTerm.trim().toLowerCase();
    const filtered = normalized
      ? list.filter((kb) => {
          const haystack = [
            kb.name,
            kb.description ?? "",
            kb.organizationName ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalized);
        })
      : list;

    return [...filtered].sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        if (aTime !== bTime) {
          return bTime - aTime;
        }
      }

      if (a.visibility !== b.visibility) {
        return VISIBILITY_ORDER[a.visibility] - VISIBILITY_ORDER[b.visibility];
      }

      return a.name.localeCompare(b.name);
    });
  }, [initialKnowledgeBases, knowledgeBases, searchTerm]);

  const isRefreshing = isLoading || isValidating;

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
      router.push(`/knowledge-base/${created.id}`);
    } catch (error) {
      handleErrorWithToast(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      setIsSaving(false);
    }
  }, [createForm, mutateKnowledgeBases, router, t]);

  const renderMetrics = (kb: KnowledgeBaseSummary) => {
    const completedCount = Math.max(
      kb.documentCount - kb.pendingCount - kb.processingCount,
      0,
    );

    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("detail.metrics.totalDocuments")}
          </p>
          <p className="text-xl font-semibold">{kb.documentCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("detail.metrics.processing")}
          </p>
          <p className="text-xl font-semibold">{kb.processingCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("detail.metrics.completed")}
          </p>
          <p className="text-xl font-semibold">{completedCount}</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <ScrollArea className="h-full w-full">
        <div className="mx-auto flex h-full max-w-4xl flex-col gap-10 px-6 py-8">
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>
            <div className="flex flex-col gap-2 self-stretch md:self-auto md:flex-row md:items-center md:justify-end">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                placeholder={t("list.searchPlaceholder")}
                aria-label={t("list.searchPlaceholder")}
                className="w-full md:w-64"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutateKnowledgeBases()}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                />
                {t("actions.refresh")}
              </Button>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                {t("actions.newKnowledgeBase")}
              </Button>
            </div>
          </header>

          {isRefreshing && !sortedKnowledgeBases.length ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sortedKnowledgeBases.length ? (
            <div className="flex flex-col gap-4 pb-12">
              {sortedKnowledgeBases.map((kb) => {
                const description = kb.description || t("list.noDescription");
                return (
                  <Card
                    key={kb.id}
                    className="border-border/60 transition-shadow hover:shadow-md dark:border-white/20"
                  >
                    <Link
                      href={`/knowledge-base/${kb.id}`}
                      className="flex h-full flex-col gap-6 px-6"
                    >
                      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold">{kb.name}</h2>
                            <Badge variant="secondary">
                              {kb.documentCount}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(`visibility.${kb.visibility}`)}
                        </div>
                      </div>

                      {renderMetrics(kb)}

                      <div className="flex items-center justify-between pb-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {kb.organizationName ? (
                            <span className="rounded-full bg-muted px-2 py-1 text-xs">
                              {kb.organizationName}
                            </span>
                          ) : null}
                        </div>
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          {tCommon("continue")}
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 bg-muted/20 px-8 py-16 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                {searchTerm.trim()
                  ? t("list.noResults", { query: searchTerm.trim() })
                  : t("list.empty")}
              </p>
              {!searchTerm.trim() ? (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("actions.newKnowledgeBase")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>

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
    </>
  );
}
