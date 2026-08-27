/** Tool registry: which tool definitions exist per server mode. */
import type { ToolDef } from "./defs.js";
import { discoveryToolDefs } from "./discovery.js";
import { scaffoldCircuitTool } from "./templates.js";
import { buildCircuitTool, proveCircuitTool, validateMetadataTool } from "./authoring.js";

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

export const authoringToolDefs: ToolDef[] = [
  scaffoldCircuitTool,
  validateMetadataTool,
  buildCircuitTool,
  proveCircuitTool,
];

/** Discovery tools always; authoring tools only when a repo checkout is available. */
export function allToolDefs(mode: "repo" | "discovery"): ToolDef[] {
  return mode === "repo" ? [...discoveryToolDefs, ...authoringToolDefs] : [...discoveryToolDefs];
}
