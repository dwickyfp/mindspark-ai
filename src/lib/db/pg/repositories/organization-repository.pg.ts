import { pgDb as db } from "../db.pg";
import {
  AgentSchema,
  OrganizationMemberSchema,
  OrganizationMcpServerSchema,
  OrganizationAgentSchema,
  OrganizationSchema,
  UserSchema,
} from "../schema.pg";
import {
  OrganizationCreateInput,
  OrganizationMemberWithUser,
  OrganizationRepository,
  OrganizationRole,
  OrganizationWithMembershipRole,
} from "app-types/organization";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = slugify(name) || "organization";
  let candidate = baseSlug;
  let counter = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db
      .select({ id: OrganizationSchema.id })
      .from(OrganizationSchema)
      .where(eq(OrganizationSchema.slug, candidate))
      .limit(1);
    if (existing.length === 0) {
      return candidate;
    }
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

async function withMemberUser(
  members: {
    id: string;
    organizationId: string;
    userId: string;
    role: OrganizationRole;
    joinedAt: Date;
  }[],
): Promise<OrganizationMemberWithUser[]> {
  if (members.length === 0) return [];
  const userMap = new Map<string, OrganizationMemberWithUser>();
  const users = await db
    .select({
      id: UserSchema.id,
      name: UserSchema.name,
      email: UserSchema.email,
      image: UserSchema.image,
    })
    .from(UserSchema)
    .where(
      inArray(
        UserSchema.id,
        members.map((m) => m.userId),
      ),
    );

  members.forEach((member) => {
    const user = users.find((u) => u.id === member.userId);
    if (user) {
      userMap.set(member.id, {
        ...member,
        user,
      });
    }
  });
  return Array.from(userMap.values());
}

export const pgOrganizationRepository: OrganizationRepository = {
  async createOrganization(input: OrganizationCreateInput) {
    const slug = await generateUniqueSlug(input.name);

    const [organization] = await db
      .insert(OrganizationSchema)
      .values({
        id: generateUUID(),
        name: input.name,
        slug,
        ownerUserId: input.ownerUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const [ownerMember] = await db
      .insert(OrganizationMemberSchema)
      .values({
        id: generateUUID(),
        organizationId: organization.id,
        userId: input.ownerUserId,
        role: "owner",
        joinedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    const members = ownerMember ? await withMemberUser([ownerMember]) : [];

    return {
      ...organization,
      members,
    };
  },

  async listOrganizationsForUser(userId) {
    const organizations = await db
      .select({
        id: OrganizationSchema.id,
        name: OrganizationSchema.name,
        slug: OrganizationSchema.slug,
        ownerUserId: OrganizationSchema.ownerUserId,
        createdAt: OrganizationSchema.createdAt,
        updatedAt: OrganizationSchema.updatedAt,
        membershipRole: OrganizationMemberSchema.role,
      })
      .from(OrganizationMemberSchema)
      .innerJoin(
        OrganizationSchema,
        eq(OrganizationMemberSchema.organizationId, OrganizationSchema.id),
      )
      .where(eq(OrganizationMemberSchema.userId, userId))
      .orderBy(OrganizationSchema.createdAt);

    return organizations as OrganizationWithMembershipRole[];
  },

  async findOrganizationById(organizationId) {
    const [organization] = await db
      .select()
      .from(OrganizationSchema)
      .where(eq(OrganizationSchema.id, organizationId))
      .limit(1);
    return organization ?? null;
  },

  async findOrganizationBySlug(slug) {
    const [organization] = await db
      .select()
      .from(OrganizationSchema)
      .where(eq(OrganizationSchema.slug, slug))
      .limit(1);
    return organization ?? null;
  },

  async deleteOrganization(organizationId) {
    await db
      .delete(OrganizationSchema)
      .where(eq(OrganizationSchema.id, organizationId));
  },

  async addMember(organizationId, userId, role = "member") {
    const [member] = await db
      .insert(OrganizationMemberSchema)
      .values({
        id: generateUUID(),
        organizationId,
        userId,
        role,
        joinedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!member) {
      // Member already exists, fetch existing record
      const [existing] = await db
        .select()
        .from(OrganizationMemberSchema)
        .where(
          and(
            eq(OrganizationMemberSchema.organizationId, organizationId),
            eq(OrganizationMemberSchema.userId, userId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Failed to upsert organization member");
      const [result] = await withMemberUser([existing]);
      return result;
    }

    const [result] = await withMemberUser([member]);
    return result;
  },

  async updateMemberRole(organizationId, userId, role) {
    const [member] = await db
      .update(OrganizationMemberSchema)
      .set({ role })
      .where(
        and(
          eq(OrganizationMemberSchema.organizationId, organizationId),
          eq(OrganizationMemberSchema.userId, userId),
        ),
      )
      .returning();

    if (!member) {
      throw new Error("Organization member not found");
    }

    const [result] = await withMemberUser([member]);
    return result;
  },

  async removeMember(organizationId, userId) {
    await db
      .delete(OrganizationMemberSchema)
      .where(
        and(
          eq(OrganizationMemberSchema.organizationId, organizationId),
          eq(OrganizationMemberSchema.userId, userId),
        ),
      );
  },

  async listMembers(organizationId) {
    const rows = await db
      .select({
        id: OrganizationMemberSchema.id,
        organizationId: OrganizationMemberSchema.organizationId,
        userId: OrganizationMemberSchema.userId,
        role: OrganizationMemberSchema.role,
        joinedAt: OrganizationMemberSchema.joinedAt,
      })
      .from(OrganizationMemberSchema)
      .where(eq(OrganizationMemberSchema.organizationId, organizationId));

    return withMemberUser(rows);
  },

  async findMember(organizationId, userId) {
    const [member] = await db
      .select({
        id: OrganizationMemberSchema.id,
        organizationId: OrganizationMemberSchema.organizationId,
        userId: OrganizationMemberSchema.userId,
        role: OrganizationMemberSchema.role,
        joinedAt: OrganizationMemberSchema.joinedAt,
      })
      .from(OrganizationMemberSchema)
      .where(
        and(
          eq(OrganizationMemberSchema.organizationId, organizationId),
          eq(OrganizationMemberSchema.userId, userId),
        ),
      )
      .limit(1);

    return member ?? null;
  },

  async listSharedMcpServerIds(organizationId) {
    const rows = await db
      .select({
        serverId: OrganizationMcpServerSchema.mcpServerId,
      })
      .from(OrganizationMcpServerSchema)
      .where(eq(OrganizationMcpServerSchema.organizationId, organizationId));
    return rows.map((row) => row.serverId);
  },

  async setSharedMcpServerIds(organizationId, serverIds) {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          serverId: OrganizationMcpServerSchema.mcpServerId,
        })
        .from(OrganizationMcpServerSchema)
        .where(eq(OrganizationMcpServerSchema.organizationId, organizationId));

      const existingIds = new Set(existing.map((row) => row.serverId));
      const targetIds = new Set(serverIds);

      const toInsert = serverIds.filter((id) => !existingIds.has(id));
      const toDelete = existing
        .map((row) => row.serverId)
        .filter((id) => !targetIds.has(id));

      if (toDelete.length > 0) {
        await tx
          .delete(OrganizationMcpServerSchema)
          .where(
            and(
              eq(OrganizationMcpServerSchema.organizationId, organizationId),
              inArray(OrganizationMcpServerSchema.mcpServerId, toDelete),
            ),
          );
      }

      if (toInsert.length > 0) {
        await tx
          .insert(OrganizationMcpServerSchema)
          .values(
            toInsert.map((serverId) => ({
              id: generateUUID(),
              organizationId,
              mcpServerId: serverId,
              createdAt: new Date(),
            })),
          )
          .onConflictDoNothing();
      }

      await tx
        .update(OrganizationSchema)
        .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(OrganizationSchema.id, organizationId));
    });
  },

  async addSharedMcpServer(organizationId, serverId) {
    await db
      .insert(OrganizationMcpServerSchema)
      .values({
        id: generateUUID(),
        organizationId,
        mcpServerId: serverId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .update(OrganizationSchema)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(OrganizationSchema.id, organizationId));
  },

  async removeSharedMcpServer(organizationId, serverId) {
    await db
      .delete(OrganizationMcpServerSchema)
      .where(
        and(
          eq(OrganizationMcpServerSchema.organizationId, organizationId),
          eq(OrganizationMcpServerSchema.mcpServerId, serverId),
        ),
      );
    await db
      .update(OrganizationSchema)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(OrganizationSchema.id, organizationId));
  },

  async listSharedAgentIds(organizationId) {
    const rows = await db
      .select({ agentId: OrganizationAgentSchema.agentId })
      .from(OrganizationAgentSchema)
      .innerJoin(
        AgentSchema,
        eq(OrganizationAgentSchema.agentId, AgentSchema.id),
      )
      .where(
        and(
          eq(OrganizationAgentSchema.organizationId, organizationId),
          or(
            eq(AgentSchema.visibility, "public"),
            eq(AgentSchema.visibility, "readonly"),
          ),
        ),
      );
    return rows.map((row) => row.agentId);
  },

  async setSharedAgentIds(organizationId, agentIds) {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ agentId: OrganizationAgentSchema.agentId })
        .from(OrganizationAgentSchema)
        .where(eq(OrganizationAgentSchema.organizationId, organizationId));

      const sanitizedAgentIds =
        agentIds.length === 0
          ? []
          : (
              await tx
                .select({ id: AgentSchema.id })
                .from(AgentSchema)
                .where(
                  and(
                    inArray(AgentSchema.id, agentIds),
                    or(
                      eq(AgentSchema.visibility, "public"),
                      eq(AgentSchema.visibility, "readonly"),
                    ),
                  ),
                )
            ).map((row) => row.id);

      const existingIds = new Set(existing.map((row) => row.agentId));
      const targetIds = new Set(sanitizedAgentIds);

      const toInsert = sanitizedAgentIds.filter((id) => !existingIds.has(id));
      const toDelete = existing
        .map((row) => row.agentId)
        .filter((id) => !targetIds.has(id));

      if (toDelete.length > 0) {
        await tx
          .delete(OrganizationAgentSchema)
          .where(
            and(
              eq(OrganizationAgentSchema.organizationId, organizationId),
              inArray(OrganizationAgentSchema.agentId, toDelete),
            ),
          );
      }

      if (toInsert.length > 0) {
        await tx
          .insert(OrganizationAgentSchema)
          .values(
            toInsert.map((agentId) => ({
              id: generateUUID(),
              organizationId,
              agentId,
              createdAt: new Date(),
            })),
          )
          .onConflictDoNothing();
      }

      await tx
        .update(OrganizationSchema)
        .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(OrganizationSchema.id, organizationId));
    });
  },

  async addSharedAgent(organizationId, agentId) {
    const [agent] = await db
      .select({ visibility: AgentSchema.visibility })
      .from(AgentSchema)
      .where(eq(AgentSchema.id, agentId))
      .limit(1);

    if (!agent || agent.visibility === "private") {
      throw new Error("Cannot share private agents");
    }

    await db
      .insert(OrganizationAgentSchema)
      .values({
        id: generateUUID(),
        organizationId,
        agentId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await db
      .update(OrganizationSchema)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(OrganizationSchema.id, organizationId));
  },

  async removeSharedAgent(organizationId, agentId) {
    await db
      .delete(OrganizationAgentSchema)
      .where(
        and(
          eq(OrganizationAgentSchema.organizationId, organizationId),
          eq(OrganizationAgentSchema.agentId, agentId),
        ),
      );
    await db
      .update(OrganizationSchema)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(OrganizationSchema.id, organizationId));
  },
};
