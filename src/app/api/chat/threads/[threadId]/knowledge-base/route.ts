import { NextResponse } from "next/server";

import { generateObject, jsonSchema } from "ai";
import { format } from "date-fns";
import { createHash } from "node:crypto";

import { getSession } from "auth/server";
import { chatRepository, knowledgeBaseRepository } from "lib/db/repository";
import { customModelProvider } from "lib/ai/models";
import { generateUUID } from "lib/utils";
import {
  deleteObject,
  generateDocumentStorageKey,
  uploadObject,
} from "lib/storage/object-storage";

const MAX_PROMPT_CHARS = 16000;
const MAX_TRANSCRIPT_CHARS = 40000;

const summarizationSchema = jsonSchema({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summaryHeading",
    "summary",
    "keyPointsHeading",
    "keyPoints",
    "actionItemsHeading",
    "actionItems",
    "followUpsHeading",
    "followUpQuestions",
    "transcriptHeading",
    "language",
  ],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Concise descriptive title in conversation language",
    },
    summaryHeading: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      description: "Heading label for the summary section",
    },
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      description: "Narrative summary spanning 3-6 sentences",
    },
    keyPointsHeading: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    keyPoints: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 280,
      },
    },
    actionItemsHeading: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    actionItems: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 280,
      },
    },
    followUpsHeading: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    followUpQuestions: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 280,
      },
    },
    transcriptHeading: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    language: {
      type: "string",
      minLength: 2,
      maxLength: 32,
      description: "Language used within the summary output",
    },
  },
});

type SummarizationResult = {
  title: string;
  summaryHeading: string;
  summary: string;
  keyPointsHeading: string;
  keyPoints: string[];
  actionItemsHeading: string;
  actionItems: string[];
  followUpsHeading: string;
  followUpQuestions: string[];
  transcriptHeading: string;
  language: string;
};

type RequestBody = {
  knowledgeBaseId?: string;
};

type ConversationRender = {
  promptContent: string;
  transcriptMarkdown: string;
  isTruncated: boolean;
  transcriptTruncated: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

function extractTextFromParts(parts: any[]): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && typeof part === "object" && part.type === "text")
    .map((part) => String(part.text ?? ""))
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildConversation(
  messages: Array<{
    role: string;
    parts: any[];
    createdAt: Date;
  }>,
): ConversationRender {
  const entries: string[] = [];

  for (const message of messages) {
    const text = extractTextFromParts(message.parts);
    if (!text) continue;

    const label = ROLE_LABELS[message.role] ?? message.role;
    const timestamp = format(message.createdAt, "yyyy-MM-dd HH:mm");
    entries.push(`${label} (${timestamp}):\n${text}`);
  }

  const joined = entries.join("\n\n");
  const isTruncated = joined.length > MAX_PROMPT_CHARS;
  const promptContent = isTruncated
    ? joined.slice(joined.length - MAX_PROMPT_CHARS)
    : joined;

  const transcriptSource = entries.join("\n\n");
  let transcriptMarkdown = transcriptSource
    .split("\n\n")
    .map((entry) => entry.replace(/\r/g, "").trim())
    .filter(Boolean)
    .map((entry) => `> ${entry.replace(/\n/g, "\n> ")}`)
    .join("\n\n");

  let transcriptTruncated = false;
  if (transcriptMarkdown.length > MAX_TRANSCRIPT_CHARS) {
    transcriptTruncated = true;
    const truncatedContent = transcriptMarkdown.slice(
      transcriptMarkdown.length - MAX_TRANSCRIPT_CHARS,
    );
    transcriptMarkdown = `> …\n${truncatedContent}`;
  }

  return {
    promptContent,
    transcriptMarkdown,
    isTruncated,
    transcriptTruncated,
  };
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .replace(/[\\/\u0000]/g, " ")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length ? cleaned : "chat-summary";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const session = await getSession().catch(() => null);
    if (!session?.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = await params;
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    if (!body.knowledgeBaseId) {
      return NextResponse.json(
        { error: "knowledgeBaseId is required" },
        { status: 400 },
      );
    }

    const thread = await chatRepository.selectThreadDetails(threadId);
    if (!thread || thread.userId !== session.user.id) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const conversation = buildConversation(
      (thread.messages ?? []).map((message) => ({
        role: message.role,
        parts: message.parts,
        createdAt: new Date(message.createdAt),
      })),
    );

    if (!conversation.promptContent.trim()) {
      return NextResponse.json(
        { error: "Thread does not contain summarizable messages" },
        { status: 400 },
      );
    }

    const summarizationModel = customModelProvider.getModel();
    const prompt = `You curate conversation summaries for a long-term knowledge base.\n\nInstructions:\n- Read the chat transcript below.\n- Identify the primary language used and respond in that language (if uncertain, default to English).\n- Craft a title no longer than 80 characters.\n- Produce a 3-6 sentence narrative summary that captures context, main decisions, and outcomes.\n- Provide 3-8 concise key points (plain text, no numbering).\n- List actionable follow-up tasks if any exist; otherwise return an empty list.\n- List open questions or clarifications for future discussions; otherwise return an empty list.\n- Supply natural-language headings (same language as the summary) for each section provided in the schema.\n- Be factual, avoid speculation, and omit sensitive credentials.\n\nChat transcript:\n${conversation.promptContent}`;

    const { object } = await generateObject({
      model: summarizationModel,
      schema: summarizationSchema,
      prompt,
      maxRetries: 2,
    });
    const summary = object as SummarizationResult;

    const now = new Date();
    const formattedDate = format(now, "yyyy-MM-dd HH:mm");
    const threadTitle = thread.title?.trim() || "Untitled chat";

    const summarySection = [
      `# ${summary.title}`,
      "",
      `- Thread title: ${threadTitle}`,
      `- Thread ID: ${threadId}`,
      `- Generated at: ${formattedDate}`,
      summary.language ? `- Summary language: ${summary.language}` : undefined,
      conversation.isTruncated
        ? "- Note: Chat transcript truncated for prompt brevity"
        : undefined,
      conversation.transcriptTruncated
        ? "- Note: Transcript preview shortened for storage size"
        : undefined,
      "",
      `## ${summary.summaryHeading}`,
      summary.summary.trim(),
      "",
      `## ${summary.keyPointsHeading}`,
      ...summary.keyPoints.map((point) => `- ${point.trim()}`),
      "",
    ].filter((line): line is string => Boolean(line));

    if (summary.actionItems.length) {
      summarySection.push(`## ${summary.actionItemsHeading}`);
      summary.actionItems.forEach((item) => {
        summarySection.push(`- ${item.trim()}`);
      });
      summarySection.push("");
    }

    if (summary.followUpQuestions.length) {
      summarySection.push(`## ${summary.followUpsHeading}`);
      summary.followUpQuestions.forEach((item) => {
        summarySection.push(`- ${item.trim()}`);
      });
      summarySection.push("");
    }

    summarySection.push(`## ${summary.transcriptHeading}`);
    summarySection.push(conversation.transcriptMarkdown);
    summarySection.push("", "_Generated by Add Knowledge feature._");

    const finalMarkdown = summarySection.join("\n");
    const buffer = Buffer.from(finalMarkdown, "utf8");

    const documentKeyId = generateUUID();
    const safeName = sanitizeFileName(
      `${summary.title} - ${format(now, "yyyy-MM-dd")}`,
    );
    const fileName = `${safeName}.md`;
    const storageKey = generateDocumentStorageKey({
      knowledgeBaseId: body.knowledgeBaseId,
      documentId: documentKeyId,
      fileName,
    });

    const checksum = createHash("sha256").update(buffer).digest("base64");

    try {
      await uploadObject({
        key: storageKey,
        body: buffer,
        contentType: "text/markdown",
        checksum,
        metadata: {
          threadId,
          generatedAt: now.toISOString(),
          summaryLanguage: summary.language,
        },
      });
    } catch (error) {
      console.error("Failed to upload generated markdown", error);
      return NextResponse.json(
        { error: "Failed to store summary document" },
        { status: 500 },
      );
    }

    try {
      const document = await knowledgeBaseRepository.insertDocumentPlaceholder(
        session.user.id,
        {
          knowledgeBaseId: body.knowledgeBaseId,
          fileName,
          fileSize: buffer.length,
          mimeType: "text/markdown",
          storageKey,
          checksum,
        },
      );

      return NextResponse.json(
        {
          document,
          summary,
        },
        { status: 201 },
      );
    } catch (error) {
      console.error("Failed to register knowledge base document", error);
      try {
        await deleteObject(storageKey);
      } catch (cleanupError) {
        console.warn(
          `Failed to clean up uploaded summary document: ${storageKey}`,
          cleanupError,
        );
      }

      const message =
        error instanceof Error && /Not authorized/.test(error.message)
          ? "Not authorized to modify knowledge base"
          : "Failed to register summary document";

      const status = /Not authorized/.test((error as Error)?.message ?? "")
        ? 403
        : 500;

      return NextResponse.json({ error: message }, { status });
    }
  } catch (error) {
    console.error(
      "Unexpected error while adding chat to knowledge base",
      error,
    );
    return NextResponse.json(
      { error: "Failed to generate knowledge base entry" },
      { status: 500 },
    );
  }
}
