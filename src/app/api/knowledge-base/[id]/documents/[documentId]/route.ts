import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "auth/server";
import { KnowledgeBaseDocumentUpdateSchema } from "app-types/knowledge-base";
import { knowledgeBaseRepository } from "lib/db/repository";
import { deleteObject } from "lib/storage/object-storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: knowledgeBaseId, documentId } = await params;
    const documents = await knowledgeBaseRepository.listKnowledgeBaseDocuments(
      knowledgeBaseId,
      session.user.id,
    );
    const existing = documents.find((doc) => doc.id === documentId);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const raw = await request.json();
    const payload = KnowledgeBaseDocumentUpdateSchema.parse(raw);
    const updated = await knowledgeBaseRepository.updateDocument(
      documentId,
      session.user.id,
      payload,
    );

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Failed to update document", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: knowledgeBaseId, documentId } = await params;

  const documents = await knowledgeBaseRepository.listKnowledgeBaseDocuments(
    knowledgeBaseId,
    session.user.id,
  );
  const existing = documents.find((doc) => doc.id === documentId);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await knowledgeBaseRepository.deleteDocument(documentId, session.user.id);
  } catch (error) {
    console.error("Failed to delete document", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }

  await deleteObject(existing.storageKey).catch((error) => {
    console.warn(
      `Failed to delete storage object for document ${existing.id}`,
      error,
    );
  });

  return NextResponse.json({ success: true });
}
