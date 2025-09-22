import { getSession } from "auth/server";
import { OrganizationCreateSchema } from "app-types/organization";
import { organizationRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  const organizations = await organizationRepository.listOrganizationsForUser(
    session.user.id,
  );
  return NextResponse.json(organizations);
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = await request.json();
  const parseResult = OrganizationCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const organization = await organizationRepository.createOrganization({
    name: parseResult.data.name,
    ownerUserId: session.user.id,
  });

  return NextResponse.json(organization, { status: 201 });
}
