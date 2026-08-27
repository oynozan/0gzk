import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { generateProof, verifyLocal, type BundleFiles } from "@0gzk/sdk";
import {
  fetchBundle,
  loadConfig,
  readBundleFromDir,
  type StorageConfig,
} from "@0gzk/sdk/node";
import chalk from "chalk";
import ora from "ora";

import { connectRegistry, fetchBundleByName, parseNameSpec } from "../registry.js";

export interface ProveOptions {
  bundle?: string;
  rootHash?: string;
  name?: string;
  registry?: string;
  rpcUrl?: string;
  out?: string;
  network?: string;
  indexerUrl?: string;
  verify?: boolean;
}

function defaultCacheDir(): string {
  if (process.env.OGZK_CACHE_DIR) return path.resolve(process.env.OGZK_CACHE_DIR);
  return path.join(os.homedir(), ".0gzk", "bundles");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadInputJson(inputPath: string): Promise<Record<string, unknown>> {
  const abs = path.resolve(inputPath);
  if (!(await pathExists(abs))) {
    throw new Error(`Input file not found: ${abs}`);
  }
  const raw = await fs.readFile(abs, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Input file is not valid JSON (${abs}): ${msg}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Input file must be a JSON object (${abs})`);
  }
  return parsed as Record<string, unknown>;
}

async function resolveBundle(
  options: ProveOptions,
): Promise<{ bundle: BundleFiles; source: string; cacheDir?: string }> {
  const sources = [options.bundle, options.rootHash, options.name].filter(Boolean).length;
  if (sources > 1) {
    throw new Error("Use exactly one of --bundle, --root-hash, or --name.");
  }
  if (sources === 0) {
    throw new Error("Pass one of --bundle <dir>, --root-hash <0x...>, or --name <name>@<version>.");
  }

  if (options.bundle) {
    const dir = path.resolve(options.bundle);
    if (!(await pathExists(path.join(dir, "metadata.json")))) {
      throw new Error(`No metadata.json found in bundle dir: ${dir}`);
    }
    const bundle = await readBundleFromDir(dir);
    return { bundle, source: dir };
  }

  if (options.name) {
    const cacheRoot = defaultCacheDir();
    const handle = connectRegistry({
      network: options.network,
      rpcUrl: options.rpcUrl,
      registryAddress: options.registry,
    });
    const spinner = ora(`Resolving ${options.name} via registry`).start();
    try {
      const result = await fetchBundleByName(handle, parseNameSpec(options.name), cacheRoot);
      spinner.succeed(
        `Resolved ${options.name} -> ${result.rootHash.slice(0, 10)}… (v${result.version})`,
      );
      return {
        bundle: result.bundle,
        source: `registry:${options.name}@${result.version}`,
        cacheDir: path.join(cacheRoot, result.rootHash.toLowerCase()),
      };
    } catch (err) {
      spinner.fail("Registry resolve failed");
      throw err;
    }
  }

  const rootHash = options.rootHash!;
  if (!/^0x[0-9a-fA-F]+$/.test(rootHash)) {
    throw new Error(`Invalid root hash (expected 0x-prefixed hex): ${rootHash}`);
  }

  const cacheRoot = defaultCacheDir();
  const cacheDir = path.join(cacheRoot, rootHash.toLowerCase());
  const cachedMetadata = path.join(cacheDir, "metadata.json");

  if (await pathExists(cachedMetadata)) {
    console.log(chalk.dim(`cache:    hit at ${cacheDir}`));
    const bundle = await readBundleFromDir(cacheDir);
    return { bundle, source: `cache:${cacheDir}`, cacheDir };
  }

  console.log(chalk.dim(`cache:    miss, downloading to ${cacheDir}`));
  await fs.mkdir(cacheDir, { recursive: true });

  const config = loadConfig({
    network: options.network as StorageConfig["network"] | undefined,
    indexerUrl: options.indexerUrl,
  });

  const spinner = ora("Downloading bundle from storage").start();
  try {
    const bundle = await fetchBundle(rootHash, config, cacheDir);
    spinner.succeed(`Bundle cached at ${cacheDir}`);
    return { bundle, source: `0g:${rootHash}`, cacheDir };
  } catch (err) {
    spinner.fail("Download failed");
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function runProve(
  inputPath: string,
  options: ProveOptions = {},
): Promise<void> {
  const inputs = await loadInputJson(inputPath);
  const { bundle, source } = await resolveBundle(options);

  console.log(chalk.dim(`circuit:  ${bundle.metadata.name} v${bundle.metadata.version}`));
  console.log(chalk.dim(`protocol: ${bundle.metadata.protocol} on ${bundle.metadata.curve}`));
  console.log(chalk.dim(`source:   ${source}`));
  console.log();

  const proveSpinner = ora("Generating proof").start();
  const startedAt = Date.now();
  let proof;
  try {
    proof = await generateProof(bundle, inputs);
  } catch (err) {
    proveSpinner.fail("Proof generation failed");
    throw err;
  }
  const proveMs = Date.now() - startedAt;
  proveSpinner.succeed(`Proof generated in ${proveMs} ms`);

  let verified: boolean | null = null;
  if (options.verify !== false) {
    const verifySpinner = ora("Verifying locally").start();
    try {
      verified = await verifyLocal(bundle, proof);
    } catch (err) {
      verifySpinner.fail("Verification threw");
      throw err;
    }
    if (verified) {
      verifySpinner.succeed("Verified locally");
    } else {
      verifySpinner.fail("Verification returned false");
    }
  }

  const outDir = path.resolve(options.out ?? `proof-${timestampSlug()}`);
  await fs.mkdir(outDir, { recursive: true });

  const proofPath = path.join(outDir, "proof.json");
  const publicPath = path.join(outDir, "public.json");
  const resultPath = path.join(outDir, "result.json");

  await fs.writeFile(proofPath, JSON.stringify(proof.proof, null, 2));
  await fs.writeFile(publicPath, JSON.stringify(proof.publicSignals, null, 2));

  const summary = {
    circuit: {
      name: bundle.metadata.name,
      version: bundle.metadata.version,
      protocol: bundle.metadata.protocol,
      curve: bundle.metadata.curve,
    },
    rootHash: options.rootHash ?? null,
    bundleSource: source,
    inputs,
    publicSignals: proof.publicSignals,
    proof: proof.proof,
    verified,
    durationMs: proveMs,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(resultPath, JSON.stringify(summary, null, 2));

  console.log();
  console.log(chalk.bold("output:"), outDir);
  console.log(`  proof.json   ${chalk.dim("- snarkjs proof")}`);
  console.log(`  public.json  ${chalk.dim("- public signals")}`);
  console.log(`  result.json  ${chalk.dim("- summary")}`);
  console.log();
  console.log(chalk.bold("publicSignals:"), JSON.stringify(proof.publicSignals));

  if (verified === false) {
    process.exitCode = 1;
    throw new Error("Local verification failed: snarkjs.groth16.verify returned false");
  }
}
