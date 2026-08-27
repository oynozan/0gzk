/**
 * THE SEAM between tool logic and the MCP transport. Tool definitions are
 * plain objects (name + zod raw shape + handler); `src/server.ts` is the only
 * place that turns them into MCP registrations. Handlers NEVER throw for
 * expected failures — they return `errorResult(...)` so the calling model
 * gets a readable message instead of a protocol error.
 */
import type { z } from "zod";
import type { ServerContext } from "../context.js";

/** A plain record of zod field schemas — the raw shape of a tool's input. */
export type ToolSchema = Record<string, z.ZodType>;

/** Inferred argument object for a tool schema. */
export type ToolArgs<S extends ToolSchema> = z.infer<z.ZodObject<S>>;

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolDef<S extends ToolSchema = ToolSchema> {
  name: string;
  description: string;
  schema: S;
  /** Advertised as the MCP `readOnlyHint` annotation. */
  readOnly: boolean;
  // Method syntax (not an arrow property) so ToolDef<ConcreteShape> stays
  // assignable to the base ToolDef under strictFunctionTypes.
  handler(ctx: ServerContext, args: ToolArgs<S>): Promise<ToolResult>;
}

/** Identity helper that preserves schema inference for handler args. */
export function defineTool<S extends ToolSchema>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

export function jsonResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
