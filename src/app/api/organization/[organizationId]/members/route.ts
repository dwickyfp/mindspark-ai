import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { organizationRepository, userRepository } from "lib/db/repository";
import { z } from "zod";

const EditableMemberRoleSchema = z.union([
  z.literal("admin"),
  z.literal("member"),
]);

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: EditableMemberRoleSchema.optional(),
});

function ensureCanManageMembers(role: string) {
  if (role === "owner" || role === "admin") return;
  throw new Error("Forbidden");
}

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
  return NextResponse.json(members);
}

export async function POST(
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

  try {
    ensureCanManageMembers(membership.role);
  } catch (_error) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const result = AddMemberSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten() },
      { status: 400 },
    );
  }

  const user = await userRepository.findByEmail(result.data.email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const member = await organizationRepository.addMember(
    organizationId,
    user.id,
    result.data.role ?? "member",
  );

  return NextResponse.json(member, { status: 201 });
}
