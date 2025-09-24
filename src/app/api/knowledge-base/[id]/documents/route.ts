import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "auth/server";
import { knowledgeBaseRepository } from "lib/db/repository";
import {
  deleteObject,
  generateDocumentStorageKey,
  uploadObject,
} from "lib/storage/object-storage";
import { generateUUID } from "lib/utils";
import { createHash } from "node:crypto";

const MAX_FILE_SIZE_BYTES = Number(
  process.env.KB_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: knowledgeBaseId } = await params;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes` },
      { status: 400 },
    );
  }

  const randomKeyId = generateUUID();
  const storageKey = generateDocumentStorageKey({
    knowledgeBaseId,
    documentId: randomKeyId,
    fileName: file.name,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("base64");

  try {
    await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      checksum,
      metadata: {
        originalFileName: file.name,
      },
    });
  } catch (error) {
    console.error("Failed to upload file to storage", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 },
    );
  }

  try {
    const document = await knowledgeBaseRepository.insertDocumentPlaceholder(
      session.user.id,
      {
        knowledgeBaseId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        storageKey,
        checksum,
      },
    );

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Failed to register document in database", error);
    try {
      await deleteObject(storageKey);
    } catch (cleanupError) {
      console.warn(
        `Failed to remove uploaded object after DB failure: ${storageKey}`,
        cleanupError,
      );
    }
    return NextResponse.json(
      { error: "Failed to register document" },
      { status: 500 },
    );
  }
}
