import {
  Agent,
  AgentKnowledgeBaseLink,
  AgentRepository,
  AgentSummary,
} from "app-types/agent";
import { pgDb as db } from "../db.pg";
import {
  AgentSchema,
  AgentKnowledgeBaseSchema,
  BookmarkSchema,
  KnowledgeBaseSchema,
  OrganizationAgentSchema,
  OrganizationMemberSchema,
  OrganizationSchema,
  UserSchema,
} from "../schema.pg";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { generateUUID } from "lib/utils";

type PgTransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PgClient = typeof db | PgTransactionClient;

async function ensureAccessibleKnowledgeBases(
  client: PgClient,
  userId: string,
  knowledgeBaseIds: string[] | undefined,
): Promise<AgentKnowledgeBaseLink[]> {
  const uniqueIds = Array.from(
    new Set((knowledgeBaseIds ?? []).filter((id): id is string => Boolean(id))),
  );

  if (!uniqueIds.length) {
    return [];
  }

  const rows = await client
    .select({
      id: KnowledgeBaseSchema.id,
      name: KnowledgeBaseSchema.name,
      ownerUserId: KnowledgeBaseSchema.ownerUserId,
      visibility: KnowledgeBaseSchema.visibility,
      organizationId: KnowledgeBaseSchema.organizationId,
      isMember: sql<boolean>`CASE WHEN ${OrganizationMemberSchema.id} IS NULL THEN false ELSE true END`,
    })
    .from(KnowledgeBaseSchema)
    .leftJoin(
      OrganizationMemberSchema,
      and(
        eq(
          OrganizationMemberSchema.organizationId,
          KnowledgeBaseSchema.organizationId,
        ),
        eq(OrganizationMemberSchema.userId, userId),
      ),
    )
    .where(inArray(KnowledgeBaseSchema.id, uniqueIds));

  const accessible = new Map<string, AgentKnowledgeBaseLink>();

  for (const row of rows) {
    const isOwner = row.ownerUserId === userId;
    const isMember = row.isMember;
    const isPublic = row.visibility === "public";
    const isReadonly = row.visibility === "readonly";
    const hasOrganization = row.organizationId !== null;

    if (isOwner || isPublic || isReadonly || (hasOrganization && isMember)) {
      accessible.set(row.id, { id: row.id, name: row.name });
    }
  }

  if (accessible.size !== uniqueIds.length) {
    throw new Error("One or more knowledge bases are not accessible");
  }

  return uniqueIds.map((id) => accessible.get(id)!);
}

async function syncAgentKnowledgeBases(
  client: PgClient,
  agentId: string,
  userId: string,
  knowledgeBaseIds: string[] | undefined,
): Promise<AgentKnowledgeBaseLink[]> {
  const knowledgeBases = await ensureAccessibleKnowledgeBases(
    client,
    userId,
    knowledgeBaseIds,
  );

  await client
    .delete(AgentKnowledgeBaseSchema)
    .where(eq(AgentKnowledgeBaseSchema.agentId, agentId));

  if (!knowledgeBases.length) {
    return [];
  }

  const insertValues = knowledgeBases.map((kb) => ({
    id: generateUUID(),
    agentId,
    knowledgeBaseId: kb.id,
    createdAt: new Date(),
  }));

  await client.insert(AgentKnowledgeBaseSchema).values(insertValues);

  return knowledgeBases;
}

async function loadAgentKnowledgeBaseMap(
  client: PgClient,
  agentIds: string[],
): Promise<Map<string, AgentKnowledgeBaseLink[]>> {
  if (!agentIds.length) {
    return new Map();
  }

  const rows = await client
    .select({
      agentId: AgentKnowledgeBaseSchema.agentId,
      knowledgeBaseId: AgentKnowledgeBaseSchema.knowledgeBaseId,
      name: KnowledgeBaseSchema.name,
      createdAt: AgentKnowledgeBaseSchema.createdAt,
    })
    .from(AgentKnowledgeBaseSchema)
    .innerJoin(
      KnowledgeBaseSchema,
      eq(AgentKnowledgeBaseSchema.knowledgeBaseId, KnowledgeBaseSchema.id),
    )
    .where(inArray(AgentKnowledgeBaseSchema.agentId, agentIds))
    .orderBy(asc(AgentKnowledgeBaseSchema.createdAt));

  const map = new Map<string, AgentKnowledgeBaseLink[]>();
  for (const row of rows) {
    const list = map.get(row.agentId) ?? [];
    list.push({ id: row.knowledgeBaseId, name: row.name });
    map.set(row.agentId, list);
  }
  return map;
}

export const pgAgentRepository: AgentRepository = {
  async insertAgent(agent) {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [result] = await tx
        .insert(AgentSchema)
        .values({
          id: generateUUID(),
          name: agent.name,
          description: agent.description,
          icon: agent.icon,
          userId: agent.userId,
          instructions: agent.instructions,
          visibility: agent.visibility || "private",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const knowledgeBases = await syncAgentKnowledgeBases(
        tx,
        result.id,
        agent.userId,
        agent.knowledgeBaseIds,
      );

      return {
        ...result,
        description: result.description ?? undefined,
        icon: result.icon ?? undefined,
        instructions: result.instructions ?? {},
        sharedOrganizations: [],
        scope: "personal",
        knowledgeBases,
      };
    });
  },

  async selectAgentById(id, userId): Promise<Agent | null> {
    const [agent] = await db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        instructions: AgentSchema.instructions,
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        isBookmarked: sql<boolean>`${BookmarkSchema.id} IS NOT NULL`,
      })
      .from(AgentSchema)
      .leftJoin(
        BookmarkSchema,
        and(
          eq(BookmarkSchema.itemId, AgentSchema.id),
          eq(BookmarkSchema.userId, userId),
          eq(BookmarkSchema.itemType, "agent"),
        ),
      )
      .where(eq(AgentSchema.id, id));

    if (!agent) return null;

    const isOwner = agent.userId === userId;
    const isPublic = agent.visibility === "public";

    const sharedOrgRows = await db
      .select({
        organizationId: OrganizationAgentSchema.organizationId,
        organizationName: OrganizationSchema.name,
        isMember: sql<boolean>`CASE WHEN ${OrganizationMemberSchema.id} IS NOT NULL THEN true ELSE false END`,
      })
      .from(OrganizationAgentSchema)
      .innerJoin(
        OrganizationSchema,
        eq(OrganizationAgentSchema.organizationId, OrganizationSchema.id),
      )
      .leftJoin(
        OrganizationMemberSchema,
        and(
          eq(
            OrganizationMemberSchema.organizationId,
            OrganizationAgentSchema.organizationId,
          ),
          eq(OrganizationMemberSchema.userId, userId),
        ),
      )
      .where(eq(OrganizationAgentSchema.agentId, id));

    const hasOrgAccess = sharedOrgRows.some((row) => row.isMember);

    if (!isOwner && !isPublic && !hasOrgAccess) {
      return null;
    }

    const sharedOrganizations = sharedOrgRows
      .filter((row) => row.isMember || isOwner)
      .map((row) => ({
        id: row.organizationId,
        name: row.organizationName,
      }));

    const primaryOrg = sharedOrgRows.find((row) => row.isMember);

    const scope: Agent["scope"] = isOwner
      ? "personal"
      : hasOrgAccess
        ? "organization"
        : isPublic
          ? "public"
          : "personal";

    const knowledgeBaseMap = await loadAgentKnowledgeBaseMap(db, [id]);
    const knowledgeBases = knowledgeBaseMap.get(id) ?? [];

    return {
      ...agent,
      description: agent.description ?? undefined,
      icon: agent.icon ?? undefined,
      instructions: agent.instructions ?? {},
      isBookmarked: agent.isBookmarked ?? false,
      sharedOrganizations,
      scope,
      organizationId: primaryOrg?.organizationId,
      organizationName: primaryOrg?.organizationName,
      knowledgeBases,
      knowledgeBaseIds: knowledgeBases.map((kb) => kb.id),
    };
  },

  async selectAgentsByUserId(userId) {
    const results = await db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        instructions: AgentSchema.instructions,
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        userName: UserSchema.name,
        userAvatar: UserSchema.image,
        isBookmarked: sql<boolean>`false`,
      })
      .from(AgentSchema)
      .innerJoin(UserSchema, eq(AgentSchema.userId, UserSchema.id))
      .where(eq(AgentSchema.userId, userId))
      .orderBy(desc(AgentSchema.createdAt));

    const agentIds = results.map((result) => result.id);
    const allShareMap = new Map<string, { id: string; name: string }[]>();

    if (agentIds.length > 0) {
      const allShareRows = await db
        .select({
          agentId: OrganizationAgentSchema.agentId,
          organizationId: OrganizationAgentSchema.organizationId,
          organizationName: OrganizationSchema.name,
        })
        .from(OrganizationAgentSchema)
        .innerJoin(
          OrganizationSchema,
          eq(OrganizationAgentSchema.organizationId, OrganizationSchema.id),
        )
        .where(inArray(OrganizationAgentSchema.agentId, agentIds));

      allShareRows.forEach((row) => {
        const existing = allShareMap.get(row.agentId) ?? [];
        if (!existing.some((org) => org.id === row.organizationId)) {
          existing.push({ id: row.organizationId, name: row.organizationName });
          allShareMap.set(row.agentId, existing);
        }
      });
    }

    const knowledgeBaseMap = await loadAgentKnowledgeBaseMap(db, agentIds);

    // Map database nulls to undefined and set defaults for owned agents
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      instructions: result.instructions ?? {},
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
      isBookmarked: false, // Always false for owned agents
      sharedOrganizations: allShareMap.get(result.id) ?? [],
      scope: "personal",
      knowledgeBases: knowledgeBaseMap.get(result.id) ?? [],
      knowledgeBaseIds:
        knowledgeBaseMap.get(result.id)?.map((kb) => kb.id) ?? [],
    }));
  },

  async updateAgent(id, userId, agent) {
    return db.transaction(async (tx) => {
      const { knowledgeBaseIds, ...agentPayload } = agent;

      const [result] = await tx
        .update(AgentSchema)
        .set({
          ...agentPayload,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(AgentSchema.id, id),
            or(
              eq(AgentSchema.userId, userId),
              eq(AgentSchema.visibility, "public"),
            ),
          ),
        )
        .returning();

      if (!result) {
        throw new Error("Unable to update agent");
      }

      if (result.visibility === "private") {
        await tx
          .delete(OrganizationAgentSchema)
          .where(eq(OrganizationAgentSchema.agentId, id));
      }

      if (knowledgeBaseIds !== undefined) {
        await syncAgentKnowledgeBases(tx, id, result.userId, knowledgeBaseIds);
      }

      const knowledgeBaseMap = await loadAgentKnowledgeBaseMap(tx, [id]);
      const knowledgeBases = knowledgeBaseMap.get(id) ?? [];

      return {
        ...result,
        description: result.description ?? undefined,
        icon: result.icon ?? undefined,
        instructions: result.instructions ?? {},
        sharedOrganizations: [],
        scope: result.userId === userId ? "personal" : undefined,
        knowledgeBases,
      };
    });
  },

  async deleteAgent(id, userId) {
    await db
      .delete(AgentSchema)
      .where(and(eq(AgentSchema.id, id), eq(AgentSchema.userId, userId)));
  },

  async selectAgents(
    currentUserId,
    filters = ["all"],
    limit = 50,
  ): Promise<AgentSummary[]> {
    const accessibleOrgShares = await db
      .select({
        agentId: OrganizationAgentSchema.agentId,
        organizationId: OrganizationAgentSchema.organizationId,
        organizationName: OrganizationSchema.name,
      })
      .from(OrganizationMemberSchema)
      .innerJoin(
        OrganizationAgentSchema,
        eq(
          OrganizationMemberSchema.organizationId,
          OrganizationAgentSchema.organizationId,
        ),
      )
      .innerJoin(
        OrganizationSchema,
        eq(OrganizationAgentSchema.organizationId, OrganizationSchema.id),
      )
      .where(eq(OrganizationMemberSchema.userId, currentUserId));

    const accessibleOrgAgentMap = new Map<
      string,
      { id: string; name: string }[]
    >();
    accessibleOrgShares.forEach((row) => {
      const existing = accessibleOrgAgentMap.get(row.agentId) ?? [];
      if (!existing.some((org) => org.id === row.organizationId)) {
        existing.push({ id: row.organizationId, name: row.organizationName });
        accessibleOrgAgentMap.set(row.agentId, existing);
      }
    });

    const ownedCondition = eq(AgentSchema.userId, currentUserId);
    const sharedOrgCondition = sql<boolean>`EXISTS (
      SELECT 1
      FROM ${OrganizationAgentSchema}
      INNER JOIN ${OrganizationMemberSchema}
        ON ${OrganizationAgentSchema.organizationId} = ${OrganizationMemberSchema.organizationId}
      WHERE ${OrganizationAgentSchema.agentId} = ${AgentSchema.id}
        AND ${OrganizationMemberSchema.userId} = ${currentUserId}
    )`;

    const accessibleCondition = or(
      eq(AgentSchema.visibility, "public"),
      sharedOrgCondition,
    );

    const sharedCondition = and(
      ne(AgentSchema.userId, currentUserId),
      accessibleCondition,
    );

    const bookmarkedCondition = and(
      ne(AgentSchema.userId, currentUserId),
      accessibleCondition,
      sql`${BookmarkSchema.id} IS NOT NULL`,
    );

    let orConditions: any[] = [];

    for (const filter of filters) {
      if (filter === "mine") {
        orConditions.push(ownedCondition);
      } else if (filter === "shared") {
        orConditions.push(sharedCondition);
      } else if (filter === "bookmarked") {
        orConditions.push(bookmarkedCondition);
      } else if (filter === "all") {
        orConditions = [or(ownedCondition, sharedCondition)];
        break;
      }
    }

    if (orConditions.length === 0) {
      orConditions = [or(ownedCondition, sharedCondition)];
    }

    const results = await db
      .select({
        id: AgentSchema.id,
        name: AgentSchema.name,
        description: AgentSchema.description,
        icon: AgentSchema.icon,
        userId: AgentSchema.userId,
        // Exclude instructions from list queries for performance
        visibility: AgentSchema.visibility,
        createdAt: AgentSchema.createdAt,
        updatedAt: AgentSchema.updatedAt,
        userName: UserSchema.name,
        userAvatar: UserSchema.image,
        isBookmarked: sql<boolean>`CASE WHEN ${BookmarkSchema.id} IS NOT NULL THEN true ELSE false END`,
      })
      .from(AgentSchema)
      .innerJoin(UserSchema, eq(AgentSchema.userId, UserSchema.id))
      .leftJoin(
        BookmarkSchema,
        and(
          eq(BookmarkSchema.itemId, AgentSchema.id),
          eq(BookmarkSchema.itemType, "agent"),
          eq(BookmarkSchema.userId, currentUserId),
        ),
      )
      .where(orConditions.length > 1 ? or(...orConditions) : orConditions[0])
      .orderBy(
        // My agents first, then other shared agents
        sql`CASE WHEN ${AgentSchema.userId} = ${currentUserId} THEN 0 ELSE 1 END`,
        desc(AgentSchema.createdAt),
      )
      .limit(limit);

    const agentIds = results.map((result) => result.id);

    const allShareMap = new Map<string, { id: string; name: string }[]>();

    if (agentIds.length > 0) {
      const allShareRows = await db
        .select({
          agentId: OrganizationAgentSchema.agentId,
          organizationId: OrganizationAgentSchema.organizationId,
          organizationName: OrganizationSchema.name,
        })
        .from(OrganizationAgentSchema)
        .innerJoin(
          OrganizationSchema,
          eq(OrganizationAgentSchema.organizationId, OrganizationSchema.id),
        )
        .where(inArray(OrganizationAgentSchema.agentId, agentIds));

      allShareRows.forEach((row) => {
        const existing = allShareMap.get(row.agentId) ?? [];
        if (!existing.some((org) => org.id === row.organizationId)) {
          existing.push({ id: row.organizationId, name: row.organizationName });
          allShareMap.set(row.agentId, existing);
        }
      });
    }

    const knowledgeBaseMap = await loadAgentKnowledgeBaseMap(db, agentIds);

    // Map database nulls to undefined
    return results.map((result) => ({
      ...result,
      description: result.description ?? undefined,
      icon: result.icon ?? undefined,
      userName: result.userName ?? undefined,
      userAvatar: result.userAvatar ?? undefined,
      sharedOrganizations:
        (result.userId === currentUserId
          ? allShareMap.get(result.id)
          : accessibleOrgAgentMap.get(result.id)) ?? [],
      scope:
        result.userId === currentUserId
          ? "personal"
          : accessibleOrgAgentMap.has(result.id)
            ? "organization"
            : result.visibility === "public"
              ? "public"
              : result.visibility === "readonly"
                ? "readonly"
                : "personal",
      organizationId:
        result.userId === currentUserId
          ? undefined
          : accessibleOrgAgentMap.get(result.id)?.[0]?.id,
      organizationName:
        result.userId === currentUserId
          ? undefined
          : accessibleOrgAgentMap.get(result.id)?.[0]?.name,
      knowledgeBases: knowledgeBaseMap.get(result.id) ?? [],
      knowledgeBaseIds:
        knowledgeBaseMap.get(result.id)?.map((kb) => kb.id) ?? [],
    }));
  },

  async checkAccess(agentId, userId, destructive = false) {
    const [agent] = await db
      .select({
        visibility: AgentSchema.visibility,
        userId: AgentSchema.userId,
      })
      .from(AgentSchema)
      .where(eq(AgentSchema.id, agentId));
    if (!agent) {
      return false;
    }
    if (userId == agent.userId) return true;
    if (!destructive) {
      if (agent.visibility === "public") {
        return true;
      }

      const [orgAccess] = await db
        .select({ exists: OrganizationAgentSchema.id })
        .from(OrganizationAgentSchema)
        .innerJoin(
          OrganizationMemberSchema,
          and(
            eq(
              OrganizationAgentSchema.organizationId,
              OrganizationMemberSchema.organizationId,
            ),
            eq(OrganizationMemberSchema.userId, userId),
          ),
        )
        .where(eq(OrganizationAgentSchema.agentId, agentId))
        .limit(1);

      if (orgAccess) {
        return true;
      }
    }
    return false;
  },
};
