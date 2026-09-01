/**
 * Input handling for the "just do it for me" flow: check a user's values
 * against a circuit's declared signal schema before anything expensive runs,
 * and load values from a JSON file the user points at.
 *
 * These execute wherever the tool runs. In the hosted agent they are
 * delegated to the CLI so witness values stay on the user's machine.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { validateInputs, type CircuitMetadata } from "@0gzk/sdk";
import { readBundleFromDir } from "@0gzk/sdk/node";
import { getLatest } from "@0gzk/sdk/onchain";
import { CHAIN_SLUGS, fetchBundleForRecord, getRegistry, withTimeout } from "../chains.js";
import type { ServerContext } from "../context.js";
import { defineTool, errorMessage, errorResult, jsonResult } from "./defs.js";

const chainSchema = z.enum(CHAIN_SLUGS);
const REGISTRY_TIMEOUT_MS = 10_000;

/** Signal schema as the model should present it to a user. */
function describeSchema(metadata: CircuitMetadata) {
  return {
    inputs: Object.entries(metadata.inputs).map(([name, spec]) => ({
      name,
      type: spec.type,
      visibility: spec.visibility,
      ...(spec.length !== undefined ? { length: spec.length } : {}),
      ...(spec.description ? { description: spec.description } : {}),
    })),
    outputs: Object.entries(metadata.outputs).map(([name, spec]) => ({
      name,
      type: spec.type,
      ...(spec.description ? { description: spec.description } : {}),
    })),
  };
}

/**
 * Resolve a circuit's metadata as cheaply as possible: the local catalog
 * first (no network, no download), then a cached/published bundle.
 */
async function loadMetadata(
  ctx: ServerContext,
  name: string,
  chain: (typeof CHAIN_SLUGS)[number],
): Promise<CircuitMetadata> {
  const entry = ctx.catalog?.circuits.find((c) => c.name === name);
  if (entry) {
    return {
      name: entry.name,
      version: entry.version,
      description: entry.description,
      protocol: entry.protocol,
      curve: entry.curve,
      inputs: entry.inputs,
      outputs: entry.outputs,
      files: { wasm: "circuit.wasm", zkey: "circuit_final.zkey", vkey: "verification_key.json" },
    } as CircuitMetadata;
  }

  const registry = getRegistry(chain);
  const { record } = await withTimeout(getLatest(registry, name), REGISTRY_TIMEOUT_MS, `getLatest on ${chain}`);
  const dir = path.join(ctx.cacheDir, record.rootHash.toLowerCase());
  const bundle = await fetchBundleForRecord(record, chain, dir).catch(async () => readBundleFromDir(dir));
  return bundle.metadata;
}

export const validateInputsTool = defineTool({
  name: "validate_inputs",
  description:
    "Check a set of user-supplied circuit inputs against the circuit's declared signal schema WITHOUT proving. Returns " +
    "{valid, errors, schema}. Call this before prove_circuit whenever the user supplies values: it is instant, it never " +
    "downloads a bundle when the circuit is in the catalog, and its errors name the exact signal and expected type. " +
    "Also use it (with no inputs) to show a user what a circuit needs.",
  readOnly: true,
  schema: {
    name: z.string().describe("Circuit name"),
    inputs: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Candidate inputs keyed by signal name; omit to just fetch the expected schema"),
    chain: chainSchema.optional().describe("Registry chain used only when the circuit is not in the catalog"),
  },
  handler: async (ctx, args) => {
    let metadata: CircuitMetadata;
    try {
      metadata = await loadMetadata(ctx, args.name, args.chain ?? "base");
    } catch (err) {
      return errorResult(`could not load the schema for "${args.name}": ${errorMessage(err)}`);
    }

    const schema = describeSchema(metadata);
    const provided = Object.keys(args.inputs);
    if (provided.length === 0) {
      return jsonResult({
        circuit: metadata.name,
        valid: false,
        errors: ["no inputs supplied"],
        missing: schema.inputs.map((i) => i.name),
        schema,
      });
    }

    try {
      validateInputs(args.inputs, metadata);
      return jsonResult({ circuit: metadata.name, valid: true, errors: [], schema });
    } catch (err) {
      // InputValidationError lists every problem at once; it names signals and
      // expected types, never echoing the user's secret values back.
      return jsonResult({
        circuit: metadata.name,
        valid: false,
        errors: errorMessage(err).split("\n").filter(Boolean),
        schema,
      });
    }
  },
});

export const readInputFileTool = defineTool({
  name: "read_input_file",
  description:
    "Read a JSON file of circuit inputs from the user's machine so it can be validated and proved. Returns only the SIGNAL " +
    "NAMES and value types found — never the values themselves, which stay local. Use it when a user references a file " +
    "instead of typing values, then pass the same path to prove_circuit via inputFile.",
  readOnly: true,
  schema: {
    path: z.string().describe("Path to a JSON file containing circuit inputs"),
  },
  handler: async (ctx, args) => {
    const abs = path.isAbsolute(args.path)
      ? args.path
      : path.resolve(ctx.repoRoot ?? process.cwd(), args.path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(abs, "utf8"));
    } catch (err) {
      return errorResult(`could not read ${abs}: ${errorMessage(err)}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return errorResult(`${abs} must contain a JSON object of circuit inputs.`);
    }
    // Shape only. The values are the witness — they never go over the wire.
    const shape = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      name: key,
      type: Array.isArray(value) ? `array[${value.length}]` : typeof value,
    }));
    return jsonResult({ path: abs, signals: shape, note: "values withheld by design; pass this path as inputFile" });
  },
});
