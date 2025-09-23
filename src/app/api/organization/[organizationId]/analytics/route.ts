import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { organizationRepository, usageLogRepository } from "lib/db/repository";

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

  const members = await organizationRepository.listMembers(organizationId);
  const userIds = members.map((member) => member.userId);

  const [
    modelAggregates,
    tokenTotals,
    toolAggregates,
    agentUsage,
  ] = await Promise.all([
    usageLogRepository.getModelUsageAggregatesForUsers(userIds),
    usageLogRepository.getTokenUsageTotalsForUsers(userIds),
    usageLogRepository.getToolUsageAggregatesForUsers(userIds),
    usageLogRepository.getAgentUsageForUsers(userIds),
  ]);

  return NextResponse.json({
    totals: tokenTotals,
    popularModels: modelAggregates,
    favoriteTools: toolAggregates,
    members: members.length,
    agentUsage,
  });
}
