/**
 * Authoring tools (repo mode only): validate metadata, compile + bundle a
 * circuit, and generate/verify proofs against local or published bundles.
 */
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { generateProof, verifyLocal, type BundleFiles } from "@0gzk/sdk";
import { buildCircuitBundle } from "@0gzk/sdk/build";
import { fetchBundle, loadConfig, readBundleFromDir } from "@0gzk/sdk/node";
import { getLatest } from "@0gzk/sdk/onchain";
import { parsePtauSize } from "../catalog/generate.js";
import { CircuitMetadataSchema, metadataWarnings, type DiscoveryMetadata } from "../catalog/metadata-schema.js";
import { readR1csCounts } from "../catalog/r1cs.js";
import { CHAIN_SLUGS, fetchBundleForRecord, getRegistry, withTimeout } from "../chains.js";
import type { ServerContext } from "../context.js";
import { defineTool, errorMessage, errorResult, jsonResult } from "./defs.js";

const chainSchema = z.enum(CHAIN_SLUGS);
const REGISTRY_TIMEOUT_MS = 10_000;

/** Where proofs land when the caller does not choose: ~/.0gzk/proofs. */
export function defaultProofsDir(): string {
  return process.env.OGZK_PROOFS_DIR ?? path.join(os.homedir(), ".0gzk", "proofs");
}

/** Sortable, filename-safe stamp: 20260901-213645. */
function proofStamp(): string {
  const d = new Date();
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export const validateMetadataTool = defineTool({
  name: "validate_metadata",
  description:
    "Validate a circuit metadata.json against the 0gzk schema. Returns {valid, errors, warnings}; warnings flag discoverability " +
    "gaps (missing description/tags/useCases) and drift from the canonical bundle file names.",
  readOnly: false,
  schema: {
    metadataJson: z.string().optional().describe("The metadata.json content as a string"),
    path: z.string().optional().describe("Path to a metadata.json (absolute, or relative to the repo root)"),
  },
  handler: async (ctx, args) => {
    if ((args.metadataJson === undefined) === (args.path === undefined)) {
      return errorResult("Pass exactly one of metadataJson (inline content) or path (file to read).");
    }
    let raw: string;
    if (args.path !== undefined) {
      const resolved = path.isAbsolute(args.path) ? args.path : path.resolve(ctx.repoRoot ?? process.cwd(), args.path);
      try {
        raw = await readFile(resolved, "utf8");
      } catch (err) {
        return errorResult(`Could not read ${resolved}: ${errorMessage(err)}`);
      }
    } else {
      raw = args.metadataJson!;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return jsonResult({ valid: false, errors: [`not valid JSON: ${errorMessage(err)}`], warnings: [] });
    }

    const result = CircuitMetadataSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      );
      return jsonResult({ valid: false, errors, warnings: [] });
    }
    return jsonResult({
      valid: true,
      errors: [],
      warnings: metadataWarnings(result.data as DiscoveryMetadata),
    });
  },
});

function probeCircom(): { ok: true; version: string } | { ok: false; message: string } {
  const probe = spawnSync("circom", ["--version"], { encoding: "utf8", shell: false });
  if (probe.error || probe.status !== 0) {
    return {
      ok: false,
      message:
        "circom compiler not found on PATH. Install it from https://docs.circom.io/getting-started/installation/ " +
        "(it is a Rust binary; cargo install or a release download both work), then retry.",
    };
  }
  return { ok: true, version: (probe.stdout ?? "").trim() };
}

export const buildCircuitTool = defineTool({
  name: "build_circuit",
  description:
    "Compile a circuit with circom and run the Groth16 phase-2 setup, producing a publish-ready circuit_bundle/ " +
    "(circuit.wasm, circuit_final.zkey, verification_key.json, verifier.sol, metadata.json). Requires circom on PATH.",
  readOnly: false,
  schema: {
    name: z.string().optional().describe("Circuit name under circuits/<name>/"),
    dir: z.string().optional().describe("Explicit circuit directory (alternative to name)"),
  },
  handler: async (ctx, args) => {
    if ((args.name === undefined) === (args.dir === undefined)) {
      return errorResult("Pass exactly one of name (circuits/<name>/) or dir (explicit circuit directory).");
    }
    let circuitDir: string;
    let circuitName: string;
    if (args.name !== undefined) {
      if (!ctx.repoRoot) {
        return errorResult("build_circuit by name needs a repo checkout (--repo-root / OGZK_REPO_ROOT). Alternatively pass dir.");
      }
      circuitName = args.name;
      circuitDir = path.join(ctx.repoRoot, "circuits", circuitName);
    } else {
      circuitDir = path.isAbsolute(args.dir!) ? args.dir! : path.resolve(ctx.repoRoot ?? process.cwd(), args.dir!);
      circuitName = path.basename(circuitDir);
    }

    const circomSource = path.join(circuitDir, `${circuitName}.circom`);
    if (!(await pathExists(circomSource))) {
      return errorResult(`${circomSource} not found — is ${circuitDir} a circuit directory?`);
    }

    const probe = probeCircom();
    if (!probe.ok) return errorResult(probe.message);

    const buildDir = path.join(circuitDir, "build");
    await mkdir(buildDir, { recursive: true });
    const libDir = path.join(ctx.repoRoot ?? path.resolve(circuitDir, "..", ".."), "node_modules");
    const compile = spawnSync(
      "circom",
      [`${circuitName}.circom`, "--r1cs", "--wasm", "--sym", "-l", libDir, "-o", "build"],
      { cwd: circuitDir, encoding: "utf8", shell: false },
    );
    if (compile.error || compile.status !== 0) {
      const output = [compile.stdout, compile.stderr].filter(Boolean).join("\n").trim();
      return errorResult(
        `circom compilation failed (exit ${compile.status ?? "spawn error"}):\n${output || errorMessage(compile.error)}`,
      );
    }

    let ptauSize = 12;
    try {
      ptauSize = parsePtauSize(await readFile(path.join(circuitDir, "build.sh"), "utf8")) ?? 12;
    } catch {
      // keep default
    }

    const r1csPath = path.join(buildDir, `${circuitName}.r1cs`);
    try {
      const result = await buildCircuitBundle({
        r1csPath,
        wasmPath: path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`),
        metadataPath: path.join(circuitDir, "metadata.json"),
        outputDir: path.join(circuitDir, "circuit_bundle"),
        ptauSize,
      });
      const counts = await readR1csCounts(r1csPath);
      return jsonResult({
        circomVersion: probe.version,
        bundleDir: result.bundleDir,
        vkeyHash: result.vkeyHash,
        ptauSize,
        constraints: {
          count: counts.mConstraints,
          nPubIn: counts.nPubIn,
          nPrvIn: counts.nPrvIn,
          nPubOut: counts.nPubOut,
          source: "r1cs-header",
        },
        reminder: "Run `0gzk catalog build` to refresh circuits/index.json and the README table.",
      });
    } catch (err) {
      return errorResult(`bundle setup failed: ${errorMessage(err)}`);
    }
  },
});

async function loadBundleByRootHash(ctx: ServerContext, rootHash: string, chain: (typeof CHAIN_SLUGS)[number]): Promise<BundleFiles> {
  const dir = path.join(ctx.cacheDir, rootHash.toLowerCase());
  if (await pathExists(path.join(dir, "metadata.json"))) {
    return readBundleFromDir(dir);
  }
  return fetchBundle(rootHash, loadConfig({ network: chain }), dir);
}

export const proveCircuitTool = defineTool({
  name: "prove_circuit",
  description:
    "Generate a Groth16 proof (and locally verify it) for a circuit, optionally saving the artifacts to disk. Bundle source: a " +
    "repo circuit's circuit_bundle/ by name (falling back to the published registry bundle), an explicit bundleDir, or a " +
    "published rootHash fetched into the cache. Input validation errors describe the exact expected input schema. Proving runs " +
    "wherever this tool executes — the witness never leaves that machine.",
  readOnly: false,
  schema: {
    inputs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Circuit inputs keyed by signal name (field elements as decimal strings)"),
    inputFile: z
      .string()
      .optional()
      .describe("Path to a JSON file of inputs, read locally — use instead of `inputs` to keep values off the wire"),
    name: z.string().optional().describe("Circuit name (repo circuit_bundle/ preferred, registry fallback)"),
    bundleDir: z.string().optional().describe("Directory containing an extracted bundle"),
    rootHash: z.string().optional().describe("Published bundle rootHash (0x...)"),
    chain: chainSchema.optional().describe("Registry/storage chain for fetches (default base)"),
    verify: z.boolean().default(true),
    outDir: z
      .string()
      .optional()
      .describe(
        "Directory for proof.json, public.json and result.json. Defaults to " +
          "~/.0gzk/proofs/<circuit>-<timestamp>/. The absolute path is always returned as saved.outDir.",
      ),
  },
  handler: async (ctx, args) => {
    const sources = [args.name, args.bundleDir, args.rootHash].filter((s) => s !== undefined);
    if (sources.length !== 1) {
      return errorResult("Pass exactly one of name, bundleDir, or rootHash to select the circuit bundle.");
    }
    const chain = args.chain ?? "base";

    // Inputs come either inline or from a local file (the file path keeps the
    // witness off the wire entirely).
    let inputs: Record<string, unknown>;
    if (args.inputFile !== undefined) {
      const abs = path.isAbsolute(args.inputFile)
        ? args.inputFile
        : path.resolve(ctx.repoRoot ?? process.cwd(), args.inputFile);
      try {
        const parsed: unknown = JSON.parse(await readFile(abs, "utf8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return errorResult(`${abs} must contain a JSON object of circuit inputs.`);
        }
        inputs = parsed as Record<string, unknown>;
      } catch (err) {
        return errorResult(`could not read inputs from ${abs}: ${errorMessage(err)}`);
      }
    } else if (args.inputs !== undefined) {
      inputs = args.inputs;
    } else {
      return errorResult("Pass either `inputs` (inline) or `inputFile` (a local JSON path).");
    }

    let bundle: BundleFiles;
    try {
      if (args.bundleDir !== undefined) {
        const dir = path.isAbsolute(args.bundleDir) ? args.bundleDir : path.resolve(ctx.repoRoot ?? process.cwd(), args.bundleDir);
        bundle = await readBundleFromDir(dir);
      } else if (args.rootHash !== undefined) {
        bundle = await loadBundleByRootHash(ctx, args.rootHash, chain);
      } else {
        const name = args.name!;
        const localDir = ctx.repoRoot ? path.join(ctx.repoRoot, "circuits", name, "circuit_bundle") : undefined;
        if (localDir && (await pathExists(path.join(localDir, "metadata.json")))) {
          bundle = await readBundleFromDir(localDir);
        } else {
          const registry = getRegistry(chain);
          const { record } = await withTimeout(getLatest(registry, name), REGISTRY_TIMEOUT_MS, `getLatest on ${chain}`);
          const dir = path.join(ctx.cacheDir, record.rootHash.toLowerCase());
          bundle =
            (await pathExists(path.join(dir, "metadata.json")))
              ? await readBundleFromDir(dir)
              : await fetchBundleForRecord(record, chain, dir);
        }
      }
    } catch (err) {
      return errorResult(`could not load the circuit bundle: ${errorMessage(err)}`);
    }

    try {
      const startedAt = performance.now();
      const result = await generateProof(bundle, inputs);
      const durationMs = Math.round(performance.now() - startedAt);
      const verified = args.verify ? await verifyLocal(bundle, result) : undefined;

      // Artifacts are always written somewhere predictable: a bare
      // "./proof" is ambiguous over ssh/WSL, so the default lives under the
      // user's own 0gzk directory and the absolute path is always reported.
      let saved: { outDir: string; files: string[] } | undefined;
      {
        const dir =
          args.outDir === undefined
            ? path.join(defaultProofsDir(), `${bundle.metadata.name}-${proofStamp()}`)
            : path.isAbsolute(args.outDir)
              ? args.outDir
              : path.resolve(process.cwd(), args.outDir);
        await mkdir(dir, { recursive: true });
        const summary = {
          circuit: {
            name: bundle.metadata.name,
            version: bundle.metadata.version,
            protocol: bundle.metadata.protocol,
            curve: bundle.metadata.curve,
          },
          publicSignals: result.publicSignals,
          proof: result.proof,
          verified: verified ?? null,
          durationMs,
        };
        await Promise.all([
          writeFile(path.join(dir, "proof.json"), `${JSON.stringify(result.proof, null, 2)}\n`),
          writeFile(path.join(dir, "public.json"), `${JSON.stringify(result.publicSignals, null, 2)}\n`),
          writeFile(path.join(dir, "result.json"), `${JSON.stringify(summary, null, 2)}\n`),
        ]);
        saved = { outDir: dir, files: ["proof.json", "public.json", "result.json"] };
      }

      return jsonResult({
        circuit: bundle.metadata.name,
        version: bundle.metadata.version,
        proof: result.proof,
        publicSignals: result.publicSignals,
        ...(verified !== undefined ? { verified } : {}),
        durationMs,
        ...(saved ? { saved } : {}),
      });
    } catch (err) {
      // InputValidationError messages list the exact schema issues — surface
      // them verbatim so the caller can fix its inputs.
      return errorResult(errorMessage(err));
    }
  },
});
