import { MCPServerInfo } from "app-types/mcp";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { mcpRepository } from "lib/db/repository";
import { getSession } from "auth/server";

export async function GET() {
  const session = await getSession();

  const [servers, memoryClients] = await Promise.all([
    mcpRepository.selectAccessibleForUser(session.user.id),
    mcpClientsManager.getClients(),
  ]);

  const allServers = await mcpRepository.selectAll();

  const memoryMap = new Map(
    memoryClients.map(({ id, client }) => [id, client] as const),
  );

  const addTargets = allServers.filter((server) => !memoryMap.has(server.id));

  const serverIds = new Set(allServers.map((s) => s.id));
  const removeTargets = memoryClients.filter(({ id }) => !serverIds.has(id));

  if (addTargets.length > 0) {
    // no need to wait for this
    Promise.allSettled(
      addTargets.map((server) => mcpClientsManager.refreshClient(server.id)),
    );
  }
  if (removeTargets.length > 0) {
    // no need to wait for this
    Promise.allSettled(
      removeTargets.map((client) =>
        mcpClientsManager.disconnectClient(client.id),
      ),
    );
  }

  const result = servers.map((server) => {
    const mem = memoryMap.get(server.id);
    const info = mem?.getInfo();
    const mcpInfo: MCPServerInfo & {
      id: string;
      scope: "personal" | "organization";
      organizationId?: string;
      organizationName?: string;
      canManage: boolean;
    } = {
      id: server.id,
      name: server.name,
      config: server.config,
      status: info?.status ?? "loading",
      error: info?.error,
      toolInfo: info?.toolInfo ?? [],
      scope: server.scope,
      organizationId: server.organizationId,
      organizationName: server.organizationName,
      canManage:
        server.scope === "personal" &&
        (!!server.ownerUserId ? server.ownerUserId === session.user.id : true),
    };
    return mcpInfo;
  });

  return Response.json(result);
}
