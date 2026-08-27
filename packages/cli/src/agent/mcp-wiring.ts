import { allToolDefs, resolveContext, type ServerContext } from "@0gzk/mcp";

import type { AgentSdkModule } from "./load-sdk.js";

export interface WiredTools {
  /** In-process MCP server instance for query()'s mcpServers option. */
  server: unknown;
  /** Fully-qualified tool names for allowedTools (mcp__0gzk__<name>). */
  toolNames: string[];
  ctx: ServerContext;
}

/**
 * Mount the SAME tool definitions the standalone `0gzk-mcp` binary serves,
 * in-process — no subprocess, no stdio hop.
 */
export async function buildInProcessTools(
  sdk: AgentSdkModule,
  opts: { repoRoot?: string } = {},
): Promise<WiredTools> {
  const ctx = await resolveContext(opts);
  const defs = allToolDefs(ctx.mode);

  const tools = defs.map((def) =>
    sdk.tool(def.name, def.description, def.schema, async (args: unknown) => {
      const result = await def.handler(ctx, args as never);
      return { content: result.content, isError: result.isError };
    }),
  );

  const server = sdk.createSdkMcpServer({ name: "0gzk", tools });
  return {
    server,
    toolNames: defs.map((d) => `mcp__0gzk__${d.name}`),
    ctx,
  };
}
