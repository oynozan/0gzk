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

/**
 * Paths the model is never allowed to touch. These tool arguments are chosen
 * by a model whose context includes strings from a permissionless on-chain
 * registry, so treat them as untrusted: a circuit description could try to
 * talk the model into reading a key file or overwriting a dotfile.
 */
const DENIED_SEGMENTS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".git",
  ".npmrc",
  ".env",
  "id_rsa",
  "credentials",
];

function pathObjection(target: string, kind: "read" | "write"): string | undefined {
  const resolved = path.resolve(target);
  const lower = resolved.toLowerCase().replace(/\\/g, "/");

  // The CLI's own config holds the private key and API tokens.
  const configDir = path.resolve(process.env.OGZK_CONFIG_DIR ?? path.join(os.homedir(), ".0gzk"));
  const inConfigDir = lower.startsWith(path.resolve(configDir).toLowerCase().replace(/\\/g, "/"));
  const proofsRoot = path
    .resolve(process.env.OGZK_PROOFS_DIR ?? path.join(configDir, "proofs"))
    .toLowerCase()
    .replace(/\\/g, "/");
  if (inConfigDir && !lower.startsWith(proofsRoot)) {
    return `refusing to ${kind} inside the 0gzk config directory (${configDir}); it holds your keys`;
  }

  for (const segment of DENIED_SEGMENTS) {
    if (lower.split("/").includes(segment) || lower.endsWith(`/${segment}`)) {
      return `refusing to ${kind} a sensitive path (matched "${segment}")`;
    }
  }
  return undefined;
}

/** Reject dangerous paths before the tool ever sees them. */
function guardArgs(name: string, args: Record<string, unknown>): string | undefined {
  if (typeof args.inputFile === "string") {
    const objection = pathObjection(args.inputFile, "read");
    if (objection) return objection;
  }
  if (typeof args.path === "string" && name === "read_input_file") {
    const objection = pathObjection(args.path, "read");
    if (objection) return objection;
  }
  if (typeof args.outDir === "string") {
    const objection = pathObjection(args.outDir, "write");
    if (objection) return objection;
  }
  return undefined;
}

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

  if (args && typeof args === "object" && !Array.isArray(args)) {
    const objection = guardArgs(name, args as Record<string, unknown>);
    if (objection) return `Tool error: ${objection}. Ask the user for a different path.`;
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
