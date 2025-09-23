"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "ui/button";
import { Badge } from "ui/badge";
import { FileIcon, X } from "lucide-react";
import { formatFileSize } from "lib/utils";
import { useTranslations } from "next-intl";
import type { SelectedAttachment, FileAttachmentPart } from "@/types/chat-attachments";

interface AttachmentPreviewProps {
  attachment: SelectedAttachment | null;
  onClose: () => void;
}

const getDownloadUrl = (part: FileAttachmentPart): string | undefined => {
  const data = (part as { data?: string }).data;
  return part.url ?? (data ? `data:${part.mediaType};base64,${data}` : undefined);
};

const getFileSize = (part: FileAttachmentPart): number | undefined => {
  const explicitSize = (part as { size?: number }).size;
  const fallbackSize = (part as { fileSize?: number }).fileSize;
  return explicitSize ?? fallbackSize;
};

const isPdf = (mediaType: string) =>
  mediaType === "application/pdf" || mediaType.endsWith("+pdf");

const isTextLike = (mediaType: string) =>
  mediaType.startsWith("text/") || mediaType.includes("json") || mediaType.includes("xml");

export function AttachmentPreview({ attachment, onClose }: AttachmentPreviewProps) {
  const t = useTranslations("Chat.Attachments");

  useEffect(() => {
    if (!attachment) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attachment, onClose]);

  const hasAttachment = Boolean(attachment);
  const filename = hasAttachment
    ? attachment!.part.filename || t("untitled")
    : "";
  const downloadUrl = hasAttachment
    ? getDownloadUrl(attachment!.part)
    : undefined;
  const fileSize = hasAttachment ? getFileSize(attachment!.part) : undefined;

  return (
    <>
      <AnimatePresence>
        {hasAttachment && attachment ? (
          <motion.aside
            key="attachment-preview-desktop"
            initial={{ opacity: 0, x: 120 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 120 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="hidden lg:flex w-[360px] shrink-0 px-4 py-6"
          >
            <div className="sticky top-6 w-full">
              <motion.div
                layout
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 32 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="flex h-[calc(100vh-120px)] min-h-[360px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl dark:border-white/40"
              >
                <header className="flex items-start gap-3 border-b border-border/80 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground" title={filename}>
                      {filename}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate" title={attachment.part.mediaType}>
                        {attachment.part.mediaType}
                      </span>
                      {fileSize ? <span>{formatFileSize(fileSize)}</span> : null}
                      <Badge variant="outline" className="uppercase tracking-wide text-[10px]">
                        {attachment.message.role}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={onClose}
                    aria-label={t("closePreview")}
                  >
                    <X className="size-4" />
                  </Button>
                </header>

                <div className="flex-1 overflow-auto bg-muted/10">
                  {renderPreviewContent({
                    part: attachment.part,
                    downloadUrl,
                    filename,
                    t,
                  })}
                </div>
              </motion.div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {attachment ? (
          <motion.div
            key="attachment-preview-mobile"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="lg:hidden fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur"
          >
            <button
              className="absolute inset-0"
              type="button"
              aria-label={t("closePreview")}
              onClick={onClose}
            />
            <motion.div
              layout
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 48 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="relative m-4 w-[min(95%,420px)] max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl dark:border-white/40"
            >
              <header className="flex items-start gap-3 border-b border-border/80 px-4 py-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground" title={attachment.part.filename ?? t("untitled")}>
                    {attachment.part.filename || t("untitled")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate" title={attachment.part.mediaType}>
                      {attachment.part.mediaType}
                    </span>
                    {fileSize ? <span>{formatFileSize(fileSize)}</span> : null}
                    <Badge variant="outline" className="uppercase tracking-wide text-[10px]">
                      {attachment.message.role}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={onClose}
                  aria-label={t("closePreview")}
                >
                  <X className="size-4" />
                </Button>
              </header>
              <div className="max-h-[55vh] overflow-auto bg-muted/10">
                {renderPreviewContent({
                  part: attachment.part,
                  downloadUrl,
                  filename: attachment.part.filename || t("untitled"),
                  t,
                })}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function renderPreviewContent({
  part,
  downloadUrl,
  filename,
  t,
}: {
  part: FileAttachmentPart;
  downloadUrl?: string;
  filename: string;
  t: ReturnType<typeof useTranslations>;
}): ReactNode {
  const mediaType = part.mediaType;

  if (!downloadUrl) {
    return <PreviewFallback mediaType={mediaType} t={t} />;
  }

  if (mediaType.startsWith("image/")) {
    return (
      <div className="grid h-full place-items-center bg-black/5 p-4">
        <img
          src={downloadUrl}
          alt={filename}
          className="max-h-[70vh] w-full rounded-lg object-contain"
        />
      </div>
    );
  }

  if (mediaType.startsWith("video/")) {
    return (
      <div className="grid h-full place-items-center bg-black/5 p-4">
        <video
          controls
          className="max-h-[70vh] w-full rounded-lg"
          src={downloadUrl}
        />
      </div>
    );
  }

  if (mediaType.startsWith("audio/")) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <audio controls src={downloadUrl} className="w-full" />
      </div>
    );
  }

  if (isPdf(mediaType)) {
    return (
      <iframe
        src={downloadUrl}
        title={`${filename} preview`}
        className="h-[70vh] w-full border-0"
      />
    );
  }

  if (isTextLike(mediaType)) {
    return (
      <iframe
        src={downloadUrl}
        title={`${filename} preview`}
        className="h-[70vh] w-full border-0 bg-background"
      />
    );
  }

  return <PreviewFallback mediaType={mediaType} t={t} />;
}

function PreviewFallback({
  mediaType,
  t,
}: {
  mediaType: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FileIcon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{t("previewUnavailable")}</p>
        <p className="text-xs text-muted-foreground/80">{mediaType}</p>
      </div>
    </div>
  );
}
