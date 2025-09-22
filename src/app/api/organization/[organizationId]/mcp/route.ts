import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "auth/server";
import { mcpRepository, organizationRepository } from "lib/db/repository";

const UpdateShareSchema = z.object({
  serverIds: z.array(z.string()).default([]),
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

  const serverIds =
    await organizationRepository.listSharedMcpServerIds(organizationId);
  return NextResponse.json({ serverIds });
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

  const serverIds = payload.data.serverIds;
  if (serverIds.length) {
    const servers = await mcpRepository.selectByIds(serverIds);
    if (servers.length !== serverIds.length) {
      return NextResponse.json(
        { error: "Invalid server ids" },
        { status: 400 },
      );
    }

    const unauthorized = servers.filter((server) => {
      if (!server.ownerUserId) return false;
      return server.ownerUserId !== session.user.id;
    });
    if (unauthorized.length) {
      return NextResponse.json(
        { error: "Cannot share servers you do not own" },
        { status: 403 },
      );
    }
  }

  await organizationRepository.setSharedMcpServerIds(organizationId, serverIds);
  return NextResponse.json({ success: true });
}
