import { organizationRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const session = await getSession();
  const { organizationId } = await params;

  const [organization, membership] = await Promise.all([
    organizationRepository.findOrganizationById(organizationId),
    organizationRepository.findMember(organizationId, session.user.id),
  ]);

  if (!organization || !membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [members, sharedMcpServerIds, sharedAgentIds] = await Promise.all([
    organizationRepository.listMembers(organizationId),
    organizationRepository.listSharedMcpServerIds(organizationId),
    organizationRepository.listSharedAgentIds(organizationId),
  ]);

  return NextResponse.json({
    organization,
    membership,
    members,
    sharedMcpServerIds,
    sharedAgentIds,
  });
}
