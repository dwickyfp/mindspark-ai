import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "auth/server";
import { KnowledgeBaseCreateSchema } from "app-types/knowledge-base";
import { knowledgeBaseRepository } from "lib/db/repository";

export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const knowledgeBases =
    await knowledgeBaseRepository.listKnowledgeBasesForUser(session.user.id);
  return NextResponse.json(knowledgeBases);
}

export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const payload = KnowledgeBaseCreateSchema.parse(raw);
    const knowledgeBase = await knowledgeBaseRepository.createKnowledgeBase(
      session.user.id,
      payload,
    );
    return NextResponse.json(knowledgeBase, { status: 201 });
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

    console.error("Failed to create knowledge base", error);
    return NextResponse.json(
      { error: "Failed to create knowledge base" },
      { status: 500 },
    );
  }
}
