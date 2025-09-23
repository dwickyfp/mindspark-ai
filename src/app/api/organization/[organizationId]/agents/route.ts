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
  const isManager = membership.role === "owner" || membership.role === "admin";

  const payload = UpdateShareSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 },
    );
  }

  const agentIds = payload.data.agentIds;

  const ownedAgents = await agentRepository.selectAgentsByUserId(
    session.user.id,
  );
  const ownedAgentMap = new Map(ownedAgents.map((agent) => [agent.id, agent]));

  const privateOwned = agentIds.filter((id) => {
    const agent = ownedAgentMap.get(id);
    return agent?.visibility === "private";
  });
  if (privateOwned.length) {
    return NextResponse.json(
      { error: "Only read-only or public agents can be shared" },
      { status: 400 },
    );
  }

  const ownedShareableIds = agentIds.filter((id) => ownedAgentMap.has(id));
  const sanitizedAgentIds = isManager ? agentIds : ownedShareableIds;

  const currentSharedAgents =
    await organizationRepository.listSharedAgentsWithDetails(organizationId);

  if (isManager) {
    await organizationRepository.setSharedAgentIds(
      organizationId,
      sanitizedAgentIds,
    );
    return NextResponse.json({ success: true });
  }

  const currentlySharedOwned = currentSharedAgents
    .filter((agent) => agent.userId === session.user.id)
    .map((agent) => agent.id);

  const desired = new Set(sanitizedAgentIds);
  const existing = new Set(currentlySharedOwned);

  const toAdd = sanitizedAgentIds.filter((id) => !existing.has(id));
  const toRemove = currentlySharedOwned.filter((id) => !desired.has(id));

  await Promise.all(
    toAdd.map((id) => organizationRepository.addSharedAgent(organizationId, id)),
  );

  await Promise.all(
    toRemove.map((id) =>
      organizationRepository.removeSharedAgent(organizationId, id),
    ),
  );

  return NextResponse.json({ success: true });
}
