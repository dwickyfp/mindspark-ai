"use server";
import { getSession } from "auth/server";
import { organizationRepository } from "lib/db/repository";

export async function deleteOrganizationAction(organizationId: string) {
  const session = await getSession();

  const membership = await organizationRepository.findMember(
    organizationId,
    session.user.id,
  );

  if (!membership || membership.role !== "owner") {
    throw new Error(
      "You must be an organization owner to delete this organization.",
    );
  }

  await organizationRepository.deleteOrganization(organizationId);
}
