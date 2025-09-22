import { z } from "zod";
import { User } from "./user";

export const OrganizationRoleEnum = z.union([
  z.literal("owner"),
  z.literal("admin"),
  z.literal("member"),
]);

export type OrganizationRole = z.infer<typeof OrganizationRoleEnum>;

export const OrganizationCreateSchema = z.object({
  name: z.string().min(1).max(120),
});

export type Organization = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  joinedAt: Date;
};

export type OrganizationMemberWithUser = OrganizationMember & {
  user: Pick<User, "id" | "name" | "email" | "image">;
};

export type OrganizationWithMembers = Organization & {
  members: OrganizationMemberWithUser[];
};

export type OrganizationRepository = {
  createOrganization: (
    input: OrganizationCreateInput,
  ) => Promise<Organization & { members: OrganizationMemberWithUser[] }>;
  listOrganizationsForUser: (
    userId: string,
  ) => Promise<OrganizationWithMembershipRole[]>;
  findOrganizationById: (
    organizationId: string,
  ) => Promise<Organization | null>;
  deleteOrganization: (organizationId: string) => Promise<void>;
  findOrganizationBySlug: (slug: string) => Promise<Organization | null>;
  addMember: (
    organizationId: string,
    userId: string,
    role?: Exclude<OrganizationRole, "owner">,
  ) => Promise<OrganizationMemberWithUser>;
  updateMemberRole: (
    organizationId: string,
    userId: string,
    role: Exclude<OrganizationRole, "owner">,
  ) => Promise<OrganizationMemberWithUser>;
  removeMember: (organizationId: string, userId: string) => Promise<void>;
  listMembers: (
    organizationId: string,
  ) => Promise<OrganizationMemberWithUser[]>;
  findMember: (
    organizationId: string,
    userId: string,
  ) => Promise<OrganizationMember | null>;
  listSharedMcpServerIds: (organizationId: string) => Promise<string[]>;
  setSharedMcpServerIds: (
    organizationId: string,
    serverIds: string[],
  ) => Promise<void>;
  addSharedMcpServer: (
    organizationId: string,
    serverId: string,
  ) => Promise<void>;
  removeSharedMcpServer: (
    organizationId: string,
    serverId: string,
  ) => Promise<void>;
  listSharedAgentIds: (organizationId: string) => Promise<string[]>;
  setSharedAgentIds: (
    organizationId: string,
    agentIds: string[],
  ) => Promise<void>;
  addSharedAgent: (
    organizationId: string,
    agentId: string,
  ) => Promise<void>;
  removeSharedAgent: (
    organizationId: string,
    agentId: string,
  ) => Promise<void>;
};

export type OrganizationCreateInput = {
  name: string;
  ownerUserId: string;
};

export type OrganizationWithMembershipRole = Organization & {
  membershipRole: OrganizationRole;
};
