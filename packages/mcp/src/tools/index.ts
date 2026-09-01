/** Tool registry: which tool definitions exist per server mode. */
import type { ToolDef } from "./defs.js";
import { discoveryToolDefs } from "./discovery.js";
import { scaffoldCircuitTool } from "./templates.js";
import { buildCircuitTool, proveCircuitTool, validateMetadataTool } from "./authoring.js";
import { readInputFileTool, validateInputsTool } from "./inputs.js";

export type { ToolDef, ToolResult, ToolSchema, ToolArgs } from "./defs.js";
export { defineTool, errorMessage, errorResult, jsonResult } from "./defs.js";
export {
  discoveryToolDefs,
  getCircuitTool,
  getExampleInputTool,
  listCircuitsTool,
  resolveCircuitTool,
  searchCircuitsTool,
} from "./discovery.js";
export { scaffoldCircuitTool } from "./templates.js";
export type { ScaffoldOutput, ScaffoldSignal, ScaffoldSpec } from "./templates.js";
export { pascalCase, renderBuildSh, renderCircomTemplate, renderMetadata } from "./templates.js";
export { buildCircuitTool, proveCircuitTool, validateMetadataTool } from "./authoring.js";
export { readInputFileTool, validateInputsTool } from "./inputs.js";

export const authoringToolDefs: ToolDef[] = [
  scaffoldCircuitTool,
  validateMetadataTool,
  buildCircuitTool,
  proveCircuitTool,
];

/**
 * Tools that turn a conversation into an actual proof. They read local files
 * and run snarkjs, so they must execute on the USER's machine: the hosted
 * agent delegates these to the CLI rather than running them server-side,
 * which is what keeps the witness on-device.
 */
export const clientToolDefs: ToolDef[] = [validateInputsTool, readInputFileTool, proveCircuitTool];

export const CLIENT_TOOL_NAMES: readonly string[] = clientToolDefs.map((d) => d.name);

/** Discovery tools always; authoring tools only when a repo checkout is available. */
export function allToolDefs(mode: "repo" | "discovery"): ToolDef[] {
  return mode === "repo"
    ? [...discoveryToolDefs, validateInputsTool, readInputFileTool, ...authoringToolDefs]
    : [...discoveryToolDefs, validateInputsTool, readInputFileTool, proveCircuitTool];
}
