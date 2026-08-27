/**
 * Scaffolding: templates for a new `circuits/<name>/` directory plus the
 * scaffold_circuit tool. Templates mirror the shape of the existing reference
 * circuits (see circuits/range_proof_64bit) so generated circuits build with
 * the shared `_lib/build_lib.sh` pipeline unchanged.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CANONICAL_BUNDLE_FILES } from "../catalog/metadata-schema.js";
import { defineTool, errorMessage, errorResult, jsonResult } from "./defs.js";

export interface ScaffoldSignal {
  name: string;
  type: string;
  visibility: "public" | "private";
  description?: string;
  length?: number;
}

export interface ScaffoldOutput {
  name: string;
  type: string;
  description?: string;
}

export interface ScaffoldSpec {
  name: string;
  description: string;
  ptauSize: number;
  inputs: ScaffoldSignal[];
  outputs: ScaffoldOutput[];
  tags?: string[];
}

export function pascalCase(snakeName: string): string {
  return snakeName
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function signalDecl(kind: "input" | "output", name: string, length: number | undefined, description: string | undefined): string {
  const array = length !== undefined ? `[${length}]` : "";
  const comment = description ? ` // ${description}` : "";
  return `    signal ${kind} ${name}${array};${comment}`;
}

export function renderCircomTemplate(spec: ScaffoldSpec): string {
  const templateName = pascalCase(spec.name);
  const publicInputs = spec.inputs.filter((i) => i.visibility === "public").map((i) => i.name);
  const lines: string[] = [
    "pragma circom 2.1.6;",
    "",
    "// circomlib is resolved from the repo's node_modules (build.sh passes -l).",
    "// Uncomment the includes you need:",
    '// include "circomlib/circuits/poseidon.circom";',
    '// include "circomlib/circuits/comparators.circom";',
    '// include "circomlib/circuits/bitify.circom";',
    "",
    `// ${spec.description}`,
    "//",
    `// Public:   ${publicInputs.length > 0 ? publicInputs.join(", ") : "(none)"}`,
    `// Private:  ${spec.inputs.filter((i) => i.visibility === "private").map((i) => i.name).join(", ") || "(none)"}`,
    `template ${templateName}() {`,
    ...spec.inputs.map((i) => signalDecl("input", i.name, i.length, i.description)),
    ...spec.outputs.map((o) => signalDecl("output", o.name, undefined, o.description)),
    "",
    "    // TODO: add constraints",
    "}",
    "",
    publicInputs.length > 0
      ? `component main { public [${publicInputs.join(", ")}] } = ${templateName}();`
      : `component main = ${templateName}();`,
    "",
  ];
  return lines.join("\n");
}

export function renderBuildSh(name: string, ptauSize: number): string {
  return [
    "#!/usr/bin/env bash",
    `# Build script for the ${name} circuit.`,
    "# See circuits/_lib/build_lib.sh for the full pipeline.",
    "",
    "set -euo pipefail",
    "",
    `CIRCUIT_NAME="${name}"`,
    `PTAU_SIZE=${ptauSize}`,
    'SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"',
    "",
    "# shellcheck source=../_lib/build_lib.sh",
    'source "$SCRIPT_DIR/../_lib/build_lib.sh"',
    "",
    'ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"',
    "",
  ].join("\n");
}

export function renderMetadata(spec: ScaffoldSpec): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    inputs[input.name] = {
      type: input.type,
      visibility: input.visibility,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.length !== undefined ? { length: input.length } : {}),
    };
  }
  const outputs: Record<string, unknown> = {};
  for (const output of spec.outputs) {
    outputs[output.name] = {
      type: output.type,
      ...(output.description !== undefined ? { description: output.description } : {}),
    };
  }
  // Fixed literal key order to match the committed metadata files.
  return {
    name: spec.name,
    version: "0.1.0",
    description: spec.description,
    ...(spec.tags && spec.tags.length > 0 ? { tags: spec.tags } : {}),
    protocol: "groth16",
    curve: "bn128",
    inputs,
    outputs,
    files: { ...CANONICAL_BUNDLE_FILES },
  };
}

const signalNameSchema = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "must be a valid circom identifier")
  .max(64);

export const scaffoldCircuitTool = defineTool({
  name: "scaffold_circuit",
  description:
    "Create a new circuits/<name>/ directory in the repo with a .circom skeleton, metadata.json, build.sh, and an empty " +
    "example_input.json — matching the layout of the existing reference circuits. Refuses to overwrite an existing directory.",
  readOnly: false,
  schema: {
    name: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, "lower_snake_case, starting with a letter")
      .max(32),
    description: z.string().min(1),
    ptauSize: z.number().int().min(12).max(16).default(12).describe("Powers-of-tau exponent: 12 covers up to 4096 constraints"),
    inputs: z
      .array(
        z.object({
          name: signalNameSchema,
          type: z.string().min(1).describe('e.g. "field", "uint", "bool", "field[]"'),
          visibility: z.enum(["public", "private"]),
          description: z.string().optional(),
          length: z.number().int().positive().optional().describe("Fixed array length for array types"),
        }),
      )
      .min(1),
    outputs: z
      .array(
        z.object({
          name: signalNameSchema,
          type: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .default([]),
    tags: z.array(z.string()).optional(),
  },
  handler: async (ctx, args) => {
    if (!ctx.repoRoot) {
      return errorResult(
        "scaffold_circuit needs a repo checkout. Start the server with --repo-root (or OGZK_REPO_ROOT) pointing at the 0gzk repository.",
      );
    }
    const dir = path.join(ctx.repoRoot, "circuits", args.name);
    if (existsSync(dir)) {
      return errorResult(`circuits/${args.name}/ already exists — refusing to overwrite it.`);
    }

    const spec: ScaffoldSpec = {
      name: args.name,
      description: args.description,
      ptauSize: args.ptauSize,
      inputs: args.inputs,
      outputs: args.outputs,
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
    };

    try {
      await mkdir(dir, { recursive: true });
      const files = {
        [`${args.name}.circom`]: renderCircomTemplate(spec),
        "metadata.json": JSON.stringify(renderMetadata(spec), null, 2) + "\n",
        "build.sh": renderBuildSh(args.name, args.ptauSize),
        "example_input.json": "{}\n",
      };
      for (const [fileName, content] of Object.entries(files)) {
        await writeFile(path.join(dir, fileName), content, "utf8");
      }
      return jsonResult({
        created: Object.keys(files).map((f) => `circuits/${args.name}/${f}`),
        note: "example_input.json was created empty ({}) — fill it with a valid witness input (see circuits/_lib/gen_examples.mjs for Poseidon-based derivation).",
        nextSteps: [
          `Write the constraint logic in circuits/${args.name}/${args.name}.circom (the body is a TODO).`,
          `bash circuits/${args.name}/build.sh   # compile + Groth16 setup + circuit_bundle/`,
          "0gzk catalog build   # refresh circuits/index.json and the README table",
        ],
      });
    } catch (err) {
      return errorResult(`scaffold_circuit failed: ${errorMessage(err)}`);
    }
  },
});
