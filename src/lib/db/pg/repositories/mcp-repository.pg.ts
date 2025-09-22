import { pgDb as db } from "../db.pg";
import {
  McpServerSchema,
  OrganizationMemberSchema,
  OrganizationMcpServerSchema,
  OrganizationSchema,
} from "../schema.pg";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { generateUUID } from "lib/utils";
import type { MCPRepository, McpServerAccess } from "app-types/mcp";

export const pgMcpRepository: MCPRepository = {
  async save(server) {
    const ownerUserId = server.ownerUserId ?? null;
    const [result] = await db
      .insert(McpServerSchema)
      .values({
        id: server.id ?? generateUUID(),
        name: server.name,
        config: server.config,
        enabled: true,
        ownerUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [McpServerSchema.id],
        set: {
          config: server.config,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (
      server.ownerUserId !== undefined &&
      result.ownerUserId !== server.ownerUserId
    ) {
      await db
        .update(McpServerSchema)
        .set({ ownerUserId: server.ownerUserId })
        .where(eq(McpServerSchema.id, result.id));
      result.ownerUserId = server.ownerUserId ?? null;
    }

    return result;
  },

  async selectById(id) {
    const [result] = await db
      .select()
      .from(McpServerSchema)
      .where(eq(McpServerSchema.id, id));
    return result;
  },

  async selectAll() {
    const results = await db.select().from(McpServerSchema);
    return results;
  },

  async selectAccessibleForUser(userId) {
    const personalServers = await db
      .select()
      .from(McpServerSchema)
      .where(
        and(
          eq(McpServerSchema.enabled, true),
          or(
            eq(McpServerSchema.ownerUserId, userId),
            isNull(McpServerSchema.ownerUserId),
          ),
        ),
      );

    const sharedServers = await db
      .select({
        server: McpServerSchema,
        organizationId: OrganizationSchema.id,
        organizationName: OrganizationSchema.name,
      })
      .from(OrganizationMemberSchema)
      .innerJoin(
        OrganizationSchema,
        eq(OrganizationMemberSchema.organizationId, OrganizationSchema.id),
      )
      .innerJoin(
        OrganizationMcpServerSchema,
        eq(
          OrganizationMemberSchema.organizationId,
          OrganizationMcpServerSchema.organizationId,
        ),
      )
      .innerJoin(
        McpServerSchema,
        eq(OrganizationMcpServerSchema.mcpServerId, McpServerSchema.id),
      )
      .where(
        and(
          eq(OrganizationMemberSchema.userId, userId),
          eq(McpServerSchema.enabled, true),
        ),
      );

    const map = new Map<string, McpServerAccess>();

    personalServers.forEach((server) => {
      map.set(server.id, {
        ...server,
        scope: "personal",
      });
    });

    sharedServers.forEach(({ server, organizationId, organizationName }) => {
      if (!map.has(server.id)) {
        map.set(server.id, {
          ...server,
          scope: "organization",
          organizationId,
          organizationName,
        });
      }
    });

    return Array.from(map.values());
  },

  async deleteById(id) {
    await db.delete(McpServerSchema).where(eq(McpServerSchema.id, id));
  },

  async selectByServerName(name) {
    const [result] = await db
      .select()
      .from(McpServerSchema)
      .where(eq(McpServerSchema.name, name));
    return result;
  },
  async existsByServerName(name) {
    const [result] = await db
      .select({ id: McpServerSchema.id })
      .from(McpServerSchema)
      .where(eq(McpServerSchema.name, name));

    return !!result;
  },

  async selectByIds(ids) {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(McpServerSchema)
      .where(inArray(McpServerSchema.id, ids));
  },
};
