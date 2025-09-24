import { NextResponse } from "next/server";

import { getSession } from "auth/server";
import { agentRepository, usageLogRepository } from "lib/db/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession().catch(() => null);
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hasAccess = await agentRepository.checkAccess(id, session.user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await usageLogRepository.getEmbeddingUsageSummaryForAgent(id);
  return NextResponse.json(summary);
}
