import * as os from "node:os";
import * as path from "node:path";

import { clientToolDefs, resolveContext, type ServerContext } from "@0gzk/mcp";

/**
 * Local execution of the tools the hosted agent delegates. These are the same
 * `ToolDef`s the MCP server exposes — run here, in the user's process, against
 * the user's filesystem. Private inputs and generated witnesses stay on this
 * machine; only the tool's summary goes back to the model.
 */

let contextPromise: Promise<ServerContext> | undefined;

async function getContext(): Promise<ServerContext> {
  // Repo mode when run inside a checkout (local bundles, catalog); otherwise
  // discovery mode, which still proves against published circuits.
  contextPromise ??= resolveContext({}).catch(() => ({
    mode: "discovery" as const,
    catalog: null,
    cacheDir: process.env.OGZK_CACHE_DIR ?? path.join(os.homedir(), ".0gzk", "bundles"),
    toolNames: [],
  }));
  return contextPromise;
}

/** Cap what goes back to the model — proofs and schemas can be large. */
const MAX_RESULT_CHARS = 8000;

export async function runClientTool(name: string, argsJson: string): Promise<string> {
  const def = clientToolDefs.find((d) => d.name === name);
  if (!def) {
    return `Tool error: ${name} is not a client-side tool.`;
  }

  let args: unknown;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (err) {
    return `Tool error: arguments were not valid JSON (${
      err instanceof Error ? err.message : String(err)
    })`;
  }

  const ctx = await getContext();
  try {
    const result = await def.handler(ctx, args as never);
    const text = result.content.map((c) => c.text).join("\n");
    return text.length > MAX_RESULT_CHARS
      ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`
      : text;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
