/**
 * MCP wiring. This file (plus bin.ts) is the ONLY place that imports the MCP
 * SDK — tool logic stays transport-agnostic behind `ToolDef`.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ServerContext } from "./context.js";
import { GUIDE_TEXT } from "./guide.js";
import { allToolDefs, type ToolDef } from "./tools/index.js";

const require = createRequire(import.meta.url);
const PKG_VERSION: string = (require("../package.json") as { version: string }).version;

/**
 * Build the MCP server. `toolDefs` defaults to everything the context's mode
 * allows; pass an explicit subset to expose fewer tools — e.g. a hosted
 * deployment serving only the read-only discovery tools.
 */
export function buildMcpServer(
  ctx: ServerContext,
  toolDefs: ToolDef[] = allToolDefs(ctx.mode),
): McpServer {
  const server = new McpServer({ name: "0gzk", version: PKG_VERSION });

  for (const def of toolDefs) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: z.object(def.schema),
        annotations: { readOnlyHint: def.readOnly },
      },
      async (args: Record<string, unknown>) => {
        const result = await def.handler(ctx, args as never);
        return { content: result.content, isError: result.isError };
      },
    );
  }

  // NOTE: URI schemes must start with a letter (RFC 3986), so the resources
  // live under ogzk:// — a literal 0gzk:// URI is unparseable by clients.
  server.registerResource(
    "circom-authoring-guide",
    "ogzk://guide/circom-authoring",
    {
      title: "0gzk circuit authoring guide",
      description:
        "Bundle anatomy, metadata schema, the shared build pipeline, ptau sizing, example-input conventions, publishing, and public-signal ordering.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE_TEXT }],
    }),
  );

  if (ctx.mode === "repo" && ctx.catalog) {
    const catalog = ctx.catalog;
    const catalogPath = ctx.catalogPath;
    server.registerResource(
      "catalog",
      "ogzk://catalog",
      {
        title: "0gzk circuit catalog",
        description: "The generated circuits/index.json: every circuit with metadata, constraints, and publications.",
        mimeType: "application/json",
      },
      async (uri) => {
        // Serve the committed file verbatim when it exists; otherwise the
        // in-memory catalog generated at startup.
        let text: string;
        try {
          text = catalogPath ? readFileSync(catalogPath, "utf8") : JSON.stringify(catalog, null, 2) + "\n";
        } catch {
          text = JSON.stringify(catalog, null, 2) + "\n";
        }
        return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
      },
    );
  }

  return server;
}
