import type { UIMessage } from "ai";

export type AttachmentSelection = {
  messageId: string;
  partIndex: number;
};

export type FileAttachmentPart = Extract<
  UIMessage["parts"][number],
  { type: "file" }
>;

export type SelectedAttachment = AttachmentSelection & {
  message: UIMessage;
  part: FileAttachmentPart;
};
