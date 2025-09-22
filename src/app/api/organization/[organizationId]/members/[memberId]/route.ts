import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { organizationRepository } from "lib/db/repository";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; memberId: string }> },
) {
  const session = await getSession();
  const { organizationId, memberId } = await params;

  const actingMembership = await organizationRepository.findMember(
    organizationId,
    session.user.id,
  );
  if (!actingMembership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (actingMembership.role !== "owner" && actingMembership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetMembership = await organizationRepository.findMember(
    organizationId,
    memberId,
  );
  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (targetMembership.role === "owner") {
    return NextResponse.json(
      { error: "Cannot remove organization owner" },
      { status: 400 },
    );
  }

  await organizationRepository.removeMember(organizationId, memberId);
  return NextResponse.json({ success: true });
}
