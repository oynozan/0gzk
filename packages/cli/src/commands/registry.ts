import * as path from "node:path";

import { readBundleFromDir } from "@0gzk/sdk/node";
import chalk from "chalk";
import ora from "ora";

import {
  connectRegistry,
  hashVkey,
  listCircuits,
  listVersions,
  parseNameSpec,
  resolveVersionRecord,
  fetchBundleByName,
} from "../registry.js";

export interface RegistryListOptions {
  offset?: string;
  limit?: string;
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  registry?: string;
}

export async function runRegistryList(options: RegistryListOptions = {}): Promise<void> {
  const handle = connectRegistry({
    network: options.network,
    rpcUrl: options.rpcUrl,
    registryAddress: options.registry,
  });
  const offset = options.offset ? Number(options.offset) : 0;
  const limit = options.limit ? Number(options.limit) : 50;

  console.log(chalk.dim(`network:  ${handle.config.network}`));
  console.log(chalk.dim(`registry: ${handle.registryAddress}`));
  console.log();

  const rows = await listCircuits(handle.registry, { offset, limit });
  if (rows.length === 0) {
    console.log(chalk.yellow("No circuits registered yet."));
    return;
  }

  for (const row of rows) {
    const latest = row.latestVersion ? `v${row.latestVersion}` : chalk.dim("(no versions)");
    console.log(`${chalk.bold(row.name.padEnd(28))} ${latest.padEnd(14)} ${chalk.dim(row.owner)}`);
  }
  console.log();
  console.log(chalk.dim(`${rows.length} circuit(s) shown (offset ${offset}, limit ${limit}).`));
}

export interface RegistryGetOptions {
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  registry?: string;
}

export async function runRegistryGet(
  spec: string,
  options: RegistryGetOptions = {},
): Promise<void> {
  const handle = connectRegistry({
    network: options.network,
    rpcUrl: options.rpcUrl,
    registryAddress: options.registry,
  });
  const parsed = parseNameSpec(spec);

  console.log(chalk.dim(`network:  ${handle.config.network}`));
  console.log(chalk.dim(`registry: ${handle.registryAddress}`));
  console.log();

  if (parsed.version) {
    const { version, record } = await resolveVersionRecord(handle, parsed);
    printVersion(parsed.name, version, record);
  } else {
    const versions = await listVersions(handle.registry, parsed.name);
    if (versions.length === 0) {
      console.log(chalk.yellow(`No versions published for ${parsed.name} yet.`));
      return;
    }
    const { version, record } = await resolveVersionRecord(handle, parsed);
    console.log(chalk.bold(parsed.name));
    console.log(chalk.dim("versions:"));
    for (const v of versions) {
      const marker = v === version ? chalk.green("→ ") : "  ";
      console.log(`  ${marker}${v}`);
    }
    console.log();
    printVersion(parsed.name, version, record);
  }
}

function printVersion(
  name: string,
  version: string,
  record: { rootHash: string; vkeyHash: string; verifier: string; publisher: string; publishedAt: number; metadataURI: string },
): void {
  console.log(chalk.bold(`${name}@${version}`));
  console.log(`  rootHash:    ${chalk.green(record.rootHash)}`);
  console.log(`  vkeyHash:    ${record.vkeyHash}`);
  console.log(`  verifier:    ${record.verifier}`);
  console.log(`  publisher:   ${record.publisher}`);
  console.log(`  publishedAt: ${new Date(record.publishedAt * 1000).toISOString()}`);
  if (record.metadataURI) {
    console.log(`  metadataURI: ${record.metadataURI}`);
  }
}

export interface RegistryResolveOptions {
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  registry?: string;
  outputDir?: string;
}

export interface RegistryRegisterOptions {
  bundle: string;
  metadataUri?: string;
  verifierAddress?: string;
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  privateKey?: string;
  registry?: string;
}

/**
 * Recovery path for users whose `0gzk publish` upload completed (the rootHash
 * is on chain) but finalization timed out before `--register` could fire. Uses
 * the local bundle to recompute `vkeyHash` and calls `publishVersion` against
 * the supplied rootHash. No re-upload.
 */
export async function runRegistryRegister(
  rootHash: string,
  options: RegistryRegisterOptions,
): Promise<void> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(rootHash)) {
    throw new Error(`Invalid rootHash (expected 0x + 64 hex chars): ${rootHash}`);
  }

  const bundle = await readBundleFromDir(path.resolve(options.bundle));
  const vkeyHash = hashVkey(bundle.vkey);
  const handle = connectRegistry({
    network: options.network,
    rpcUrl: options.rpcUrl,
    registryAddress: options.registry,
    privateKey: options.privateKey,
  });
  if (!handle.signer) {
    throw new Error(
      "registry register requires OG_PRIVATE_KEY (or --key) to sign the registration tx.",
    );
  }

  const { name, version } = bundle.metadata;
  console.log(chalk.dim(`network:  ${handle.config.network}`));
  console.log(chalk.dim(`registry: ${handle.registryAddress}`));
  console.log(chalk.dim(`circuit:  ${name}@${version}`));
  console.log(chalk.dim(`rootHash: ${rootHash}`));
  console.log(chalk.dim(`vkeyHash: ${vkeyHash}`));
  console.log();

  const claimSpinner = ora(`Ensuring ${name} is claimed`).start();
  try {
    const exists = await handle.registry.getFunction("exists")(name);
    if (!exists) {
      const tx = await handle.registry.getFunction("createCircuit")(name);
      await tx.wait();
      claimSpinner.succeed(`Claimed name ${name}`);
    } else {
      const owner = (await handle.registry.getFunction("ownerOf")(name)) as string;
      if (owner.toLowerCase() !== handle.signer.address.toLowerCase()) {
        claimSpinner.fail(`Name ${name} is owned by ${owner}, not the configured key.`);
        throw new Error(`Cannot publish under ${name}: not owner.`);
      }
      claimSpinner.succeed("Existing claim by signer");
    }
  } catch (err) {
    claimSpinner.fail("createCircuit failed");
    throw err;
  }

  const publishSpinner = ora(`Publishing ${name}@${version}`).start();
  try {
    const verifier =
      options.verifierAddress ?? "0x0000000000000000000000000000000000000000";
    const metadataUri = options.metadataUri ?? "";
    const tx = await handle.registry.getFunction("publishVersion")(
      name,
      version,
      rootHash,
      vkeyHash,
      verifier,
      metadataUri,
    );
    const receipt = await tx.wait();
    publishSpinner.succeed(`Published ${name}@${version}`);
    console.log(chalk.dim(`registryTx: ${receipt?.hash ?? tx.hash}`));
  } catch (err) {
    publishSpinner.fail("publishVersion failed");
    throw err;
  }
}

export async function runRegistryResolve(
  spec: string,
  options: RegistryResolveOptions = {},
): Promise<void> {
  const handle = connectRegistry({
    network: options.network,
    rpcUrl: options.rpcUrl,
    registryAddress: options.registry,
  });
  const parsed = parseNameSpec(spec);

  const { bundle, rootHash, version, record } = await fetchBundleByName(
    handle,
    parsed,
    options.outputDir,
  );

  console.log();
  console.log(chalk.bold(`${parsed.name}@${version}`));
  console.log(`  rootHash: ${chalk.green(rootHash)}`);
  console.log(`  files:    ${Object.keys(bundle.metadata.files).join(", ")}`);
  if (options.outputDir) {
    console.log(`  output:   ${options.outputDir}`);
  }
  if (record.verifier && record.verifier !== "0x0000000000000000000000000000000000000000") {
    console.log(`  verifier: ${record.verifier}`);
  }
}
