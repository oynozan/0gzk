#!/usr/bin/env node
/**
 * stdio entry point. stdout is the MCP protocol channel — every diagnostic
 * goes to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { resolveContext } from "./context.js";
import { buildMcpServer } from "./server.js";

async function main(): Promise<void> {
  const ctx = await resolveContext(process.argv.slice(2));
  const server = buildMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const catalogNote = ctx.catalog ? `${ctx.catalog.circuits.length} circuits in catalog` : "no catalog (live registries only)";
  console.error(
    `0gzk-mcp: ${ctx.mode} mode, ${catalogNote}${ctx.repoRoot ? `, repo ${ctx.repoRoot}` : ""} — tools: ${ctx.toolNames.join(", ")}`,
  );
}

main().catch((err: unknown) => {
  console.error("0gzk-mcp failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
