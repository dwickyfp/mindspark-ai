"use client";

import {
  AudioWaveformIcon,
  ChevronDown,
  CornerRightUp,
  FileAudio,
  FileIcon,
  Loader,
  PlusIcon,
  Square,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { UIMessage, UseChatHelpers } from "@ai-sdk/react";
import { SelectModel } from "./select-model";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { ChatMention, ChatModel } from "app-types/chat";
import dynamic from "next/dynamic";
import { ToolModeDropdown } from "./tool-mode-dropdown";

import { ToolSelectDropdown } from "./tool-select-dropdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { useTranslations } from "next-intl";
import { Editor } from "@tiptap/react";
import { WorkflowSummary } from "app-types/workflow";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import equal from "lib/equal";
import { MCPIcon } from "ui/mcp-icon";
import { DefaultToolName } from "lib/ai/tools";
import { DefaultToolIcon } from "./default-tool-icon";
import { OpenAIIcon } from "ui/openai-icon";
import { GrokIcon } from "ui/grok-icon";
import { ClaudeIcon } from "ui/claude-icon";
import { GeminiIcon } from "ui/gemini-icon";
import Image from "next/image";

import { EMOJI_DATA } from "lib/const";
import { AgentSummary } from "app-types/agent";
import { toast } from "sonner";
import { formatFileSize, generateUUID } from "lib/utils";

interface PromptInputProps {
  placeholder?: string;
  setInput: (value: string) => void;
  input: string;
  onStop: () => void;
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  toolDisabled?: boolean;
  isLoading?: boolean;
  model?: ChatModel;
  setModel?: (model: ChatModel) => void;
  voiceDisabled?: boolean;
  threadId?: string;
  disabledMention?: boolean;
  onFocus?: () => void;
}

const ChatMentionInput = dynamic(() => import("./chat-mention-input"), {
  ssr: false,
  loading() {
    return <div className="h-[2rem] w-full animate-pulse"></div>;
  },
});

export default function PromptInput({
  placeholder,
  sendMessage,
  model,
  setModel,
  input,
  onFocus,
  setInput,
  onStop,
  isLoading,
  toolDisabled,
  voiceDisabled,
  threadId,
  disabledMention,
}: PromptInputProps) {
  const t = useTranslations("Chat");

  const [globalModel, threadMentions, appStoreMutate] = appStore(
    useShallow((state) => [
      state.chatModel,
      state.threadMentions,
      state.mutate,
    ]),
  );

  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsT = useTranslations("Chat.Attachments");

  const mentions = useMemo<ChatMention[]>(() => {
    if (!threadId) return [];
    return threadMentions[threadId!] ?? [];
  }, [threadMentions, threadId]);

  const chatModel = useMemo(() => {
    return model ?? globalModel;
  }, [model, globalModel]);

  const editorRef = useRef<Editor | null>(null);

  const setChatModel = useCallback(
    (model: ChatModel) => {
      if (setModel) {
        setModel(model);
      } else {
        appStoreMutate({ chatModel: model });
      }
    },
    [setModel, appStoreMutate],
  );

  const deleteMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        const newMentions = mentions.filter((m) => !equal(m, mention));
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const addMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        if (mentions.some((m) => equal(m, mention))) return prev;

        const newMentions =
          mention.type == "agent"
            ? [...mentions.filter((m) => m.type !== "agent"), mention]
            : [...mentions, mention];

        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onSelectWorkflow = useCallback(
    (workflow: WorkflowSummary) => {
      addMention({
        type: "workflow",
        name: workflow.name,
        icon: workflow.icon,
        workflowId: workflow.id,
        description: workflow.description,
      });
    },
    [addMention],
  );

  const onSelectAgent = useCallback(
    (agent: AgentSummary) => {
      appStoreMutate((prev) => {
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: [
              {
                type: "agent",
                name: agent.name,
                icon: agent.icon,
                description: agent.description,
                agentId: agent.id,
              },
            ],
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onChangeMention = useCallback(
    (mentions: ChatMention[]) => {
      let hasAgent = false;
      [...mentions]
        .reverse()
        .filter((m) => {
          if (m.type == "agent") {
            if (hasAgent) return false;
            hasAgent = true;
          }

          return true;
        })
        .reverse()
        .forEach(addMention);
    },
    [addMention],
  );

  const hasTypedInput = useMemo(() => input?.trim().length > 0, [input]);
  const isBusy = isLoading || isPreparing;

  const submit = async () => {
    if (isBusy) return;
    const text = input?.trim() || "";
    if (!text && attachments.length === 0) return;

    setIsPreparing(true);
    try {
      const fileParts = attachments.map(
        (attachment) =>
          ({
            type: "file" as const,
            mediaType: attachment.mediaType,
            filename: attachment.name,
            url: attachment.dataUrl,
            data: attachment.base64,
          }) as UIMessage["parts"][number],
      );

      const parts: UIMessage["parts"] = [];
      if (text) {
        parts.push({ type: "text", text });
      }
      parts.push(...fileParts);

      const previousAttachments = attachments;
      const previousInput = input;

      setInput("");
      setAttachments([]);

      await sendMessage({
        role: "user",
        parts,
      }).catch((error) => {
        setInput(previousInput);
        setAttachments(previousAttachments);
        console.error(error);
        toast.error(t("thisMessageWasNotSavedPleaseTryTheChatAgain"));
        throw error;
      });
    } finally {
      setIsPreparing(false);
    }
  };

  // Handle ESC key to clear mentions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mentions.length > 0 && threadId) {
        e.preventDefault();
        e.stopPropagation();
        appStoreMutate((prev) => ({
          threadMentions: {
            ...prev.threadMentions,
            [threadId]: [],
          },
          agentId: undefined,
        }));
        editorRef.current?.commands.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mentions.length, threadId, appStoreMutate]);

  useEffect(() => {
    if (!editorRef.current) return;
  }, [editorRef.current]);

  useEffect(() => {
    setAttachments([]);
  }, [threadId]);

  const handleAttachmentRemove = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAttachmentClick = useCallback(() => {
    if (isBusy) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.warning(
        attachmentsT("limitReached", { count: MAX_ATTACHMENTS.toString() }),
      );
      return;
    }
    fileInputRef.current?.click();
  }, [isBusy, attachments.length, attachmentsT]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      const currentCount = attachments.length;
      const availableSlots = MAX_ATTACHMENTS - currentCount;
      if (availableSlots <= 0) {
        toast.warning(
          attachmentsT("limitReached", { count: MAX_ATTACHMENTS.toString() }),
        );
        return;
      }

      const files = Array.from(fileList).slice(0, availableSlots);
      const validFiles = files.filter((file) => {
        if (!isSupportedFile(file.type)) {
          toast.error(attachmentsT("unsupportedType"));
          return false;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast.error(
            attachmentsT("tooLarge", {
              limit: formatFileSize(MAX_FILE_SIZE_BYTES),
            }),
          );
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      setIsPreparing(true);
      try {
        const processed = await Promise.all(
          validFiles.map(async (file) => {
            const dataUrl = await toDataUrl(file);
            const { base64, mediaType } = parseDataUrl(dataUrl, file.type);
            return {
              id: generateUUID(),
              name: file.name,
              mediaType,
              size: file.size,
              dataUrl,
              base64,
              previewUrl: mediaType.startsWith("image/") ? dataUrl : undefined,
            } satisfies AttachmentPreview;
          }),
        );

        setAttachments((prev) => [...prev, ...processed]);
      } catch (error) {
        console.error(error);
        toast.error(attachmentsT("failedToAttach"));
      } finally {
        setIsPreparing(false);
      }
    },
    [attachments.length, attachmentsT],
  );

  const showVoiceButton =
    !isBusy && !hasTypedInput && attachments.length === 0 && !voiceDisabled;

  return (
    <div className="max-w-3xl mx-auto fade-in animate-in">
      <div className="z-10 mx-auto w-full max-w-3xl relative">
        <fieldset className="flex w-full min-w-0 max-w-full flex-col px-4">
          <div className="shadow-lg overflow-hidden rounded-4xl backdrop-blur-sm transition-all duration-200 bg-muted/60 relative flex w-full flex-col cursor-text z-10 items-stretch focus-within:bg-muted hover:bg-muted focus-within:ring-muted hover:ring-muted">
            {mentions.length > 0 && (
              <div className="bg-input rounded-b-sm rounded-t-3xl p-3 flex flex-col gap-4 mx-2 my-2">
                {mentions.map((mention, i) => {
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {mention.type === "workflow" ||
                      mention.type === "agent" ? (
                        <Avatar
                          className="size-6 p-1 ring ring-border rounded-full flex-shrink-0"
                          style={mention.icon?.style}
                        >
                          <AvatarImage
                            src={
                              mention.icon?.value ||
                              EMOJI_DATA[i % EMOJI_DATA.length]
                            }
                          />
                          <AvatarFallback>
                            {mention.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Button className="size-6 flex items-center justify-center ring ring-border rounded-full flex-shrink-0 p-0.5">
                          {mention.type == "mcpServer" ? (
                            <MCPIcon className="size-3.5" />
                          ) : (
                            <DefaultToolIcon
                              name={mention.name as DefaultToolName}
                              className="size-3.5"
                            />
                          )}
                        </Button>
                      )}

                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate">
                          {mention.name}
                        </span>
                        {mention.description ? (
                          <span className="text-muted-foreground text-xs truncate">
                            {mention.description}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant={"ghost"}
                        size={"icon"}
                        disabled={!threadId}
                        className="rounded-full hover:bg-input! flex-shrink-0"
                        onClick={() => {
                          deleteMention(mention);
                        }}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-3.5 px-5 pt-2 pb-4">
              {attachments.length > 0 && (
                <AttachmentList
                  attachments={attachments}
                  onRemove={handleAttachmentRemove}
                  isUser
                  removeLabel={attachmentsT("remove")}
                />
              )}
              <div className="relative min-h-[2rem]">
                <ChatMentionInput
                  input={input}
                  onChange={setInput}
                  onChangeMention={onChangeMention}
                  onEnter={submit}
                  placeholder={placeholder ?? t("placeholder")}
                  ref={editorRef}
                  disabledMention={disabledMention}
                  onFocus={onFocus}
                />
              </div>
              <div className="flex w-full items-center z-30">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      disabled={isBusy || attachments.length >= MAX_ATTACHMENTS}
                      className="rounded-full hover:bg-input! p-2!"
                      onClick={handleAttachmentClick}
                    >
                      <PlusIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {attachmentsT("tooltip", {
                      types: SUPPORTED_FILE_TYPE_SUMMARY,
                      limit: formatFileSize(MAX_FILE_SIZE_BYTES),
                    })}
                  </TooltipContent>
                </Tooltip>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,application/pdf,audio/*"
                  onChange={(event) => {
                    void handleFiles(event.target.files);
                    event.target.value = "";
                  }}
                />

                {!toolDisabled && (
                  <>
                    <ToolModeDropdown />
                    <ToolSelectDropdown
                      className="mx-1"
                      align="start"
                      side="top"
                      onSelectWorkflow={onSelectWorkflow}
                      onSelectAgent={onSelectAgent}
                      mentions={mentions}
                    />
                  </>
                )}

                <div className="flex-1" />

                <SelectModel onSelect={setChatModel} currentModel={chatModel}>
                  <Button
                    variant={"ghost"}
                    size={"sm"}
                    className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                    data-testid="model-selector-button"
                  >
                    {chatModel?.model ? (
                      <>
                        {chatModel.provider === "openai" ? (
                          <OpenAIIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "xai" ? (
                          <GrokIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "anthropic" ? (
                          <ClaudeIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : chatModel.provider === "google" ? (
                          <GeminiIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                        ) : null}
                        <span
                          className="text-foreground group-data-[state=open]:text-foreground  "
                          data-testid="selected-model-name"
                        >
                          {chatModel.model}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">model</span>
                    )}

                    <ChevronDown className="size-3" />
                  </Button>
                </SelectModel>
                {showVoiceButton ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size={"sm"}
                        onClick={() => {
                          appStoreMutate((state) => ({
                            voiceChat: {
                              ...state.voiceChat,
                              isOpen: true,
                              agentId: undefined,
                            },
                          }));
                        }}
                        className="rounded-full p-2!"
                      >
                        <AudioWaveformIcon size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("VoiceChat.title")}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div
                    onClick={() => {
                      if (isLoading) {
                        onStop();
                      } else if (!isPreparing) {
                        void submit();
                      }
                    }}
                    className="fade-in animate-in cursor-pointer text-muted-foreground rounded-full p-2 bg-secondary hover:bg-accent-foreground hover:text-accent transition-all duration-200"
                  >
                    {isLoading ? (
                      <Square
                        size={16}
                        className="fill-muted-foreground text-muted-foreground"
                      />
                    ) : isPreparing ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <CornerRightUp size={16} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

type AttachmentPreview = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  dataUrl: string;
  base64: string;
  previewUrl?: string;
};

const MAX_ATTACHMENTS = 6;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const GENERIC_IMAGE_PREFIX = "image/";
const GENERIC_AUDIO_PREFIX = "audio/";

const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/wave",
  "audio/flac",
]);

const SUPPORTED_FILE_TYPE_SUMMARY =
  "PNG, JPG, GIF, WebP, PDF, TXT/MD/CSV, JSON, MP3/WAV/M4A";

function isSupportedFile(mediaType: string) {
  if (!mediaType) return false;
  const normalized = mediaType.toLowerCase();
  if (normalized.startsWith(GENERIC_IMAGE_PREFIX)) return true;
  if (SUPPORTED_AUDIO_MIME_TYPES.has(normalized)) return true;
  if (normalized.startsWith(GENERIC_AUDIO_PREFIX)) return false;
  return SUPPORTED_DOCUMENT_MIME_TYPES.has(normalized);
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl: string, fallbackType: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      mediaType: match[1] || fallbackType || "application/octet-stream",
      base64: match[2],
    };
  }
  return {
    mediaType: fallbackType || "application/octet-stream",
    base64: dataUrl,
  };
}

function AttachmentList({
  attachments,
  onRemove,
  isUser,
  removeLabel,
}: {
  attachments: AttachmentPreview[];
  onRemove: (id: string) => void;
  isUser?: boolean;
  removeLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <AttachmentChip
          key={attachment.id}
          attachment={attachment}
          onRemove={() => onRemove(attachment.id)}
          alignEnd={isUser}
          removeLabel={removeLabel}
        />
      ))}
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
  alignEnd,
  removeLabel,
}: {
  attachment: AttachmentPreview;
  onRemove: () => void;
  alignEnd?: boolean;
  removeLabel: string;
}) {
  const { mediaType, name, size, previewUrl, dataUrl } = attachment;
  const isImage = mediaType.startsWith("image/");
  const isAudio = mediaType.startsWith("audio/");

  return (
    <div
      className={
        "flex items-center gap-3 rounded-2xl border border-border bg-background/80 px-3 py-2 shadow-sm" +
        (alignEnd ? " ml-auto" : "")
      }
    >
      {isImage ? (
        <div className="size-10 overflow-hidden rounded-xl border border-border">
          <Image
            src={previewUrl ?? dataUrl}
            alt={name}
            width={80}
            height={80}
            className="size-full object-cover"
            unoptimized
          />
        </div>
      ) : isAudio ? (
        <FileAudio className="size-5" />
      ) : (
        <FileIcon className="size-5" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium truncate max-w-[9rem]">{name}</p>
        <p className="text-[11px] text-muted-foreground">
          {formatFileSize(size)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
