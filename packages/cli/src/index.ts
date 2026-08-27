#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import chalk from "chalk";

import { runPublish } from "./commands/publish.js";
import { runFetch } from "./commands/fetch.js";
import { runProve } from "./commands/prove.js";
import {
  runRegistryGet,
  runRegistryList,
  runRegistryRegister,
  runRegistryResolve,
} from "./commands/registry.js";
import {
  runConfigGet,
  runConfigPath,
  runConfigSet,
  runConfigUnset,
  runSetKey,
} from "./commands/config.js";
import { applyGlobalConfigToEnv, loadGlobalConfig } from "./config-store.js";

// Pull persistent settings from ~/.0gzk/config.json into process.env so the
// rest of the CLI (and the SDK underneath) reads them through the existing
// OG_* env path. Shell env vars set before the CLI ran are NOT overwritten,
// preserving the priority order: CLI flag > shell env > config file > preset.
const globalConfig = await loadGlobalConfig();
applyGlobalConfigToEnv(globalConfig);

// Read the version from our own package.json so `0gzk --version` can never
// drift from the published manifest.
const pkg = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
) as { version: string };

// Short-circuit `--version` / `-V` before commander touches it. Commander 12 +
// `parseAsync` has a quirk where the version flag handler hangs the event loop
// instead of exiting, so we handle it manually.
if (process.argv.includes("--version") || process.argv.includes("-V")) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const program = new Command();

program
  .name("0gzk")
  .description("0gzk CLI: publish circuit bundles to 0G Storage, register them on 0G Chain, and prove locally.")
  .version(pkg.version);

program
  .command("publish")
  .description("Pack a circuit bundle, upload it to 0G Storage, and optionally register it on-chain.")
  .argument("<bundleDir>", "Path to the circuit_bundle/ directory to upload")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--rpc-url <url>", "Override EVM RPC URL")
  .option("--indexer-url <url>", "Override 0G Storage indexer URL")
  .option("--key <hex>", "Override OG_PRIVATE_KEY (0x-prefixed)")
  .option("--no-receipt", "Do not write .published.json into the bundle directory")
  .option("--register", "Also call CircuitRegistry.publishVersion after upload")
  .option("--registry <address>", "Override the on-chain CircuitRegistry address")
  .option("--metadata-uri <uri>", "Optional human-readable metadata URI to record on-chain")
  .option("--verifier-address <address>", "On-chain Groth16 verifier address (defaults to address(0))")
  .option(
    "--wait <duration>",
    "How long to wait for 0G Storage finalization (e.g. 30s, 5m, 1h, forever). Default 5m.",
  )
  .option(
    "--no-wait",
    "Submit the upload and return as soon as the rootHash is known; --register still fires.",
  )
  .action(async (bundleDir: string, opts) => {
    await runPublish(bundleDir, {
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      indexerUrl: opts.indexerUrl,
      privateKey: opts.key,
      writeReceipt: opts.receipt !== false,
      register: Boolean(opts.register),
      registry: opts.registry,
      metadataUri: opts.metadataUri,
      verifierAddress: opts.verifierAddress,
      wait: opts.wait,
      noWait: opts.wait === false,
    });
  });

program
  .command("fetch")
  .description("Download a circuit bundle from 0G Storage by root hash and untar it.")
  .argument("<rootHash>", "0x-prefixed root hash returned by `0gzk publish`")
  .argument("[outputDir]", "Where to extract the bundle (default: a temp directory)")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--indexer-url <url>", "Override 0G Storage indexer URL")
  .action(async (rootHash: string, outputDir: string | undefined, opts) => {
    await runFetch(rootHash, outputDir, {
      network: opts.network,
      indexerUrl: opts.indexerUrl,
    });
  });

program
  .command("prove")
  .description(
    "Generate a Groth16 proof for an input.json against a circuit bundle (local dir, 0G root hash, or registry name).",
  )
  .argument("<inputFile>", "Path to a JSON file with the circuit inputs")
  .option("--bundle <dir>", "Use a local circuit_bundle/ directory")
  .option("--root-hash <hex>", "Fetch the bundle from 0G Storage by root hash")
  .option("--name <spec>", "Resolve via the on-chain registry, e.g. age_verification@0.1.0")
  .option("--registry <address>", "Override the CircuitRegistry address (used with --name)")
  .option("--rpc-url <url>", "Override the EVM RPC URL (used with --name)")
  .option("--out <dir>", "Write proof.json/public.json/result.json to this directory")
  .option("--no-verify", "Skip local verification after proving")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--indexer-url <url>", "Override 0G Storage indexer URL")
  .action(async (inputFile: string, opts) => {
    await runProve(inputFile, {
      bundle: opts.bundle,
      rootHash: opts.rootHash,
      name: opts.name,
      registry: opts.registry,
      rpcUrl: opts.rpcUrl,
      out: opts.out,
      verify: opts.verify !== false,
      network: opts.network,
      indexerUrl: opts.indexerUrl,
    });
  });

const registry = program
  .command("registry")
  .description("Browse and resolve circuits via the on-chain CircuitRegistry.");

registry
  .command("register")
  .description(
    "Register an already-uploaded bundle on-chain. Use when 0G Storage finalization " +
      "timed out during `0gzk publish --register` and you have the rootHash on hand.",
  )
  .argument("<rootHash>", "0x-prefixed rootHash returned by `0gzk publish`")
  .requiredOption(
    "--bundle <dir>",
    "Local circuit_bundle/ directory whose metadata.json + verification_key.json " +
      "are used to compute (name, version, vkeyHash).",
  )
  .option("--metadata-uri <uri>", "Optional human-readable metadata URI to record on-chain")
  .option("--verifier-address <address>", "On-chain Groth16 verifier address (defaults to address(0))")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--rpc-url <url>", "Override the EVM RPC URL")
  .option("--key <hex>", "Override OG_PRIVATE_KEY (0x-prefixed)")
  .option("--registry <address>", "Override the CircuitRegistry address")
  .action(async (rootHash: string, opts) => {
    await runRegistryRegister(rootHash, {
      bundle: opts.bundle,
      metadataUri: opts.metadataUri,
      verifierAddress: opts.verifierAddress,
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      privateKey: opts.key,
      registry: opts.registry,
    });
  });

registry
  .command("list")
  .description("Page through registered circuits.")
  .option("--offset <n>", "Pagination offset (default 0)")
  .option("--limit <n>", "Page size (default 50)")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--rpc-url <url>", "Override the EVM RPC URL")
  .option("--registry <address>", "Override the CircuitRegistry address")
  .action(async (opts) => {
    await runRegistryList({
      offset: opts.offset,
      limit: opts.limit,
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      registry: opts.registry,
    });
  });

registry
  .command("get")
  .description("Show metadata for <name> (latest) or <name>@<version>.")
  .argument("<spec>", "Circuit name, optionally with @<version>")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--rpc-url <url>", "Override the EVM RPC URL")
  .option("--registry <address>", "Override the CircuitRegistry address")
  .action(async (spec: string, opts) => {
    await runRegistryGet(spec, {
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      registry: opts.registry,
    });
  });

registry
  .command("resolve")
  .description("Resolve <name>@<version> via registry and download the bundle.")
  .argument("<spec>", "Circuit name@version")
  .argument("[outputDir]", "Where to extract the bundle (default: ~/.0gzk/bundles/<rootHash>/)")
  .option("--network <network>", "Override network (testnet | mainnet)")
  .option("--rpc-url <url>", "Override the EVM RPC URL")
  .option("--registry <address>", "Override the CircuitRegistry address")
  .action(async (spec: string, outputDir: string | undefined, opts) => {
    await runRegistryResolve(spec, {
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      registry: opts.registry,
      outputDir,
    });
  });

program
  .command("key")
  .description(
    "Shortcut for `0gzk config set privateKey <hex>`. Stores the signing key " +
      "in ~/.0gzk/config.json (mode 0600).",
  )
  .argument("<hex>", "0x-prefixed 32-byte private key")
  .action(async (hex: string) => {
    await runSetKey(hex);
  });

const config = program
  .command("config")
  .description(
    "Read and write persistent CLI settings stored in ~/.0gzk/config.json " +
      "(privateKey, network, rpcUrl, indexerUrl, registry).",
  );

config
  .command("set")
  .description("Set a config value, e.g. `0gzk config set privateKey 0x...`.")
  .argument("<key>", "One of: privateKey, network, rpcUrl, indexerUrl, registry")
  .argument("<value>", "Value to store. Validated before write.")
  .action(async (key: string, value: string) => {
    await runConfigSet(key, value);
  });

config
  .command("get")
  .description("Print one config value, or all values if <key> is omitted.")
  .argument("[key]", "Optional config key to read")
  .option("--show", "Reveal the private key instead of masking it")
  .action(async (key: string | undefined, opts: { show?: boolean }) => {
    await runConfigGet(key, { reveal: Boolean(opts.show) });
  });

config
  .command("list")
  .description("Alias for `config get` with no key. Shows every value and its source.")
  .option("--show", "Reveal the private key instead of masking it")
  .action(async (opts: { show?: boolean }) => {
    await runConfigGet(undefined, { reveal: Boolean(opts.show) });
  });

config
  .command("unset")
  .description("Remove a key from ~/.0gzk/config.json.")
  .argument("<key>", "Config key to remove")
  .action(async (key: string) => {
    await runConfigUnset(key);
  });

config
  .command("path")
  .description("Print the absolute path to the config file. Honors $OGZK_CONFIG_DIR.")
  .action(async () => {
    await runConfigPath();
  });

program
  .parseAsync(process.argv)
  .then(() => {
    // snarkjs leaves background workers/wasm threads alive after groth16.fullProve,
    // which keeps Node's event loop pinned. Force-exit once the command resolves.
    process.exit(process.exitCode ?? 0);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`error: ${message}`));
    process.exit(1);
  });
