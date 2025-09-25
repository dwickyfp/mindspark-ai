"use client";
import { deleteThreadAction, updateThreadAction } from "@/app/api/chat/actions";
import { appStore } from "@/app/store";
import { useToRef } from "@/hooks/use-latest";
import {
  Archive,
  BookPlus,
  ChevronRight,
  Loader,
  Loader2,
  PencilLine,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { safe } from "ts-safe";
import { Button } from "ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Input } from "ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { addItemToArchiveAction } from "@/app/api/archive/actions";
import { useShallow } from "zustand/shallow";
import { useKnowledgeBases } from "@/hooks/queries/use-knowledge-bases";
import { Label } from "ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";

type Props = PropsWithChildren<{
  threadId: string;
  beforeTitle?: string;
  onDeleted?: () => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "end" | "center";
}>;

export function ThreadDropdown({
  threadId,
  children,
  beforeTitle,
  onDeleted,
  side,
  align,
}: Props) {
  const router = useRouter();
  const t = useTranslations();
  const push = useToRef(router.push);

  const [currentThreadId, archiveList] = appStore(
    useShallow((state) => [state.currentThreadId, state.archiveList]),
  );

  const [open, setOpen] = useState(false);
  const [isAddKnowledgeOpen, setIsAddKnowledgeOpen] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (title: string) => {
    safe()
      .ifOk(() => {
        if (!title) {
          throw new Error(t("Chat.Thread.titleRequired"));
        }
      })
      .ifOk(() => updateThreadAction(threadId, { title }))
      .ifOk(() => mutate("/api/thread"))
      .watch(({ isOk, error }) => {
        if (isOk) {
          toast.success(t("Chat.Thread.threadUpdated"));
        } else {
          toast.error(error.message || t("Chat.Thread.failedToUpdateThread"));
        }
      });
  };

  const handleDelete = async (_e: React.MouseEvent) => {
    safe()
      .watch(() => setIsDeleting(true))
      .ifOk(() => deleteThreadAction(threadId))
      .watch(() => setIsDeleting(false))
      .watch(() => setOpen(false))
      .watch(({ isOk, error }) => {
        if (isOk) {
          toast.success(t("Chat.Thread.threadDeleted"));
        } else {
          toast.error(error.message || t("Chat.Thread.failedToDeleteThread"));
        }
      })
      .ifOk(() => onDeleted?.())
      .ifOk(() => {
        if (currentThreadId === threadId) {
          push.current("/");
        }
        mutate("/api/thread");
      })
      .unwrap();
  };

  const handleAddToArchive = async (archiveId: string) => {
    safe()
      .ifOk(() => addItemToArchiveAction(archiveId, threadId))
      .watch(({ isOk, error }) => {
        if (isOk) {
          toast.success(t("Archive.itemAddedToArchive"));
          if (location.pathname.startsWith(`/archive/${archiveId}`)) {
            router.refresh();
          }
        } else {
          toast.error(error.message || t("Archive.failedToCreateArchive"));
        }
      })
      .unwrap();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="p-0 w-[220px]" side={side} align={align}>
          <Command>
            <div className="flex items-center gap-2 px-2 py-1 text-xs pt-2 text-muted-foreground ml-1">
              {t("Chat.Thread.chat")}
            </div>

            <CommandList>
              <CommandGroup>
                <CommandItem className="cursor-pointer p-0">
                  <UpdateThreadNameDialog
                    initialTitle={beforeTitle ?? ""}
                    onUpdated={(title) => handleUpdate(title)}
                  >
                    <div className="flex items-center gap-2 w-full px-2 py-1 rounded">
                      <PencilLine className="text-foreground" />
                      <span className="mr-4">
                        {t("Chat.Thread.renameChat")}
                      </span>
                    </div>
                  </UpdateThreadNameDialog>
                </CommandItem>
                <CommandItem className="cursor-pointer p-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent">
                        <Archive className="text-foreground" />
                        <span className="mr-4">
                          {t("Archive.addToArchive")}
                        </span>
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      className="w-56"
                    >
                      {archiveList.length === 0 ? (
                        <DropdownMenuItem
                          disabled
                          className="text-muted-foreground"
                        >
                          {t("Archive.noArchives")}
                        </DropdownMenuItem>
                      ) : (
                        archiveList.map((archive) => (
                          <DropdownMenuItem
                            key={archive.id}
                            onClick={() => handleAddToArchive(archive.id)}
                            className="cursor-pointer"
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            <span className="truncate">{archive.name}</span>
                            {archive.itemCount > 0 && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                {archive.itemCount}
                              </span>
                            )}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CommandItem>
                <CommandItem
                  className="cursor-pointer p-0"
                  onSelect={() => {
                    setOpen(false);
                    setIsAddKnowledgeOpen(true);
                  }}
                >
                  <div className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-accent">
                    <BookPlus className="text-foreground" />
                    <span className="mr-4">
                      {t("Chat.Thread.addKnowledge")}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  disabled={isDeleting}
                  className="cursor-pointer p-0"
                >
                  <div
                    className="flex items-center gap-2 w-full px-2 py-1 rounded"
                    onClick={handleDelete}
                  >
                    <Trash className="text-destructive" />
                    <span className="text-destructive">
                      {t("Chat.Thread.deleteChat")}
                    </span>
                    {isDeleting && (
                      <Loader className="ml-auto h-4 w-4 animate-spin" />
                    )}
                  </div>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <AddKnowledgeDialog
        threadId={threadId}
        open={isAddKnowledgeOpen}
        onOpenChange={setIsAddKnowledgeOpen}
      />
    </>
  );
}

type AddKnowledgeDialogProps = {
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function AddKnowledgeDialog({
  threadId,
  open,
  onOpenChange,
}: AddKnowledgeDialogProps) {
  const t = useTranslations();
  const { data: knowledgeBases, isLoading } = useKnowledgeBases({
    revalidateOnFocus: false,
  });
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<
    string | undefined
  >();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedKnowledgeBase(undefined);
      setIsSubmitting(false);
      return;
    }

    if (!isLoading && !selectedKnowledgeBase && knowledgeBases?.length) {
      setSelectedKnowledgeBase(knowledgeBases[0]!.id);
    }
  }, [open, isLoading, knowledgeBases, selectedKnowledgeBase]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isSubmitting && !nextOpen) return;
      onOpenChange(nextOpen);
    },
    [isSubmitting, onOpenChange],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedKnowledgeBase) {
      toast.error(t("Chat.Thread.addKnowledgeSelectKnowledgeBase"));
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `/api/chat/threads/${threadId}/knowledge-base`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ knowledgeBaseId: selectedKnowledgeBase }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || t("Chat.Thread.addKnowledgeError"));
      }

      toast.success(t("Chat.Thread.addKnowledgeSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("Chat.Thread.addKnowledgeError"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedKnowledgeBase, threadId, t, onOpenChange]);

  const hasKnowledgeBases = (knowledgeBases?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{t("Chat.Thread.addKnowledgeTitle")}</DialogTitle>
          <DialogDescription>
            {t("Chat.Thread.addKnowledgeDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {hasKnowledgeBases ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="knowledge-base-select">
                {t("Chat.Thread.addKnowledgeSelectLabel")}
              </Label>
              <Select
                value={selectedKnowledgeBase}
                onValueChange={setSelectedKnowledgeBase}
                disabled={isLoading || isSubmitting}
              >
                <SelectTrigger id="knowledge-base-select">
                  <SelectValue
                    placeholder={
                      isLoading
                        ? t("Common.loading")
                        : t("Chat.Thread.addKnowledgeSelectPlaceholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases?.map((knowledgeBase) => (
                    <SelectItem key={knowledgeBase.id} value={knowledgeBase.id}>
                      {knowledgeBase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("Chat.Thread.addKnowledgeHint")}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="mb-3 font-medium">
                {t("Chat.Thread.addKnowledgeEmptyTitle")}
              </p>
              <p className="mb-4 text-xs">
                {t("Chat.Thread.addKnowledgeEmptySubtitle")}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/knowledge-base">
                  {t("Chat.Thread.addKnowledgeEmptyCta")}
                </Link>
              </Button>
            </div>
          )}

          {isSubmitting && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Chat.Thread.addKnowledgeProcessing")}
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={isSubmitting}>
              {t("Common.cancel")}
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={
              !hasKnowledgeBases || !selectedKnowledgeBase || isSubmitting
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("Chat.Thread.addKnowledgeProcessingShort")}
              </>
            ) : (
              t("Chat.Thread.addKnowledgeConfirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateThreadNameDialog({
  initialTitle,
  children,
  onUpdated,
}: PropsWithChildren<{
  initialTitle: string;
  onUpdated: (title: string) => void;
}>) {
  const [title, setTitle] = useState(initialTitle);
  const t = useTranslations();
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{t("Chat.Thread.renameChat")}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <Input
            type="text"
            value={title}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdated(title);
              }
            }}
            onInput={(e) => {
              setTitle(e.currentTarget.value);
            }}
          />
        </DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("Common.cancel")}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="outline" onClick={() => onUpdated(title)}>
              {t("Common.update")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
