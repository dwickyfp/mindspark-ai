import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "auth/server";
import { KnowledgeBaseUpdateSchema } from "app-types/knowledge-base";
import { knowledgeBaseRepository } from "lib/db/repository";
import { deleteObject } from "lib/storage/object-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const knowledgeBase = await knowledgeBaseRepository.getKnowledgeBaseById(
    id,
    session.user.id,
  );

  if (!knowledgeBase) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = await knowledgeBaseRepository.listKnowledgeBaseDocuments(
    id,
    session.user.id,
  );

  return NextResponse.json({ knowledgeBase, documents });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const raw = await request.json();
    const payload = KnowledgeBaseUpdateSchema.parse(raw);
    const updated = await knowledgeBaseRepository.updateKnowledgeBase(
      id,
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

    if (error instanceof Error && /Not authorized/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to update knowledge base", error);
    return NextResponse.json(
      { error: "Failed to update knowledge base" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const knowledgeBase = await knowledgeBaseRepository.getKnowledgeBaseById(
    id,
    session.user.id,
  );

  if (!knowledgeBase) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = await knowledgeBaseRepository.listKnowledgeBaseDocuments(
    id,
    session.user.id,
  );

  try {
    await knowledgeBaseRepository.deleteKnowledgeBase(id, session.user.id);
  } catch (error) {
    if (error instanceof Error && /Only owners/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Failed to delete knowledge base", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge base" },
      { status: 500 },
    );
  }

  await Promise.all(
    documents.map((document) =>
      deleteObject(document.storageKey).catch((error) => {
        console.warn(
          `Failed to delete object ${document.storageKey} from storage`,
          error,
        );
      }),
    ),
  );

  return NextResponse.json({ success: true });
}
