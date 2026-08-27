import { promises as fs } from "node:fs";
import * as path from "node:path";

import { backendForRef, fetchBundle, loadConfig, type StorageConfig } from "@0gzk/sdk/node";
import chalk from "chalk";
import ora from "ora";

export interface FetchOptions {
  network?: string;
  storage?: string;
  indexerUrl?: string;
}

export async function runFetch(
  ref: string,
  outputDir: string | undefined,
  options: FetchOptions = {},
): Promise<void> {
  const config = loadConfig({
    network: options.network as StorageConfig["network"] | undefined,
    storage: options.storage as StorageConfig["storage"] | undefined,
    indexerUrl: options.indexerUrl,
  });

  const target = outputDir ? path.resolve(outputDir) : undefined;
  const backend = backendForRef(ref) ?? config.storage;

  console.log(chalk.dim(`network:  ${config.network}`));
  console.log(chalk.dim(`backend:  ${backend}`));
  if (backend === "0g") {
    console.log(chalk.dim(`indexer:  ${config.indexerUrl}`));
  } else {
    console.log(chalk.dim(`gateway:  ${config.ipfs.gateway}`));
  }
  console.log(chalk.dim(`ref:      ${ref}`));
  console.log(chalk.dim(`output:   ${target ?? "(temp dir)"}`));
  console.log();

  const spinner = ora(
    backend === "ipfs" ? "Downloading bundle from IPFS gateway" : "Downloading bundle from 0G Storage",
  ).start();
  let bundle;
  try {
    bundle = await fetchBundle(ref, config, target);
    spinner.succeed("Bundle downloaded and extracted");
  } catch (err) {
    spinner.fail("Download failed");
    throw err;
  }

  const resolvedDir = target ?? "(see temp dir from --output)";
  console.log();
  console.log(chalk.bold("Extracted to:"), resolvedDir);
  console.log(chalk.bold("Circuit:    "), bundle.metadata.name, chalk.dim(`v${bundle.metadata.version}`));
  console.log(
    chalk.bold("Protocol:   "),
    `${bundle.metadata.protocol} on ${bundle.metadata.curve}`,
  );

  if (target) {
    const entries = await fs.readdir(target);
    console.log();
    console.log(chalk.bold("Files:"));
    for (const entry of entries.sort()) {
      console.log(`  ${entry}`);
    }
  }
}
