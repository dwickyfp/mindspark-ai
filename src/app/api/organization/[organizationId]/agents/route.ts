import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "auth/server";
import { agentRepository, organizationRepository } from "lib/db/repository";

const UpdateShareSchema = z.object({
  agentIds: z.array(z.string()).default([]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const session = await getSession();
  const { organizationId } = await params;

  const membership = await organizationRepository.findMember(
    organizationId,
    session.user.id,
  );
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const agentIds = await organizationRepository.listSharedAgentIds(
    organizationId,
  );
  return NextResponse.json({ agentIds });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const session = await getSession();
  const { organizationId } = await params;

  const membership = await organizationRepository.findMember(
    organizationId,
    session.user.id,
  );
  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = UpdateShareSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 },
    );
  }

  const agentIds = payload.data.agentIds;

  if (agentIds.length) {
    const ownedAgents = await agentRepository.selectAgentsByUserId(
      session.user.id,
    );
    const ownedAgentMap = new Map(ownedAgents.map((agent) => [agent.id, agent]));

    const unauthorized = agentIds.filter((id) => !ownedAgentMap.has(id));
    if (unauthorized.length) {
      return NextResponse.json(
        { error: "Cannot share agents you do not own" },
        { status: 403 },
      );
    }

    const nonShareable = agentIds.filter((id) => {
      const agent = ownedAgentMap.get(id);
      return agent?.visibility === "private";
    });
    if (nonShareable.length) {
      return NextResponse.json(
        { error: "Only read-only or public agents can be shared" },
        { status: 400 },
      );
    }
  }

  await organizationRepository.setSharedAgentIds(organizationId, agentIds);
  return NextResponse.json({ success: true });
}
