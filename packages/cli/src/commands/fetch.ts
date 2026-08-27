import { promises as fs } from "node:fs";
import * as path from "node:path";

import { fetchBundle, loadConfig } from "@0gzk/sdk/node";
import chalk from "chalk";
import ora from "ora";

export interface FetchOptions {
  network?: "testnet" | "mainnet";
  indexerUrl?: string;
}

export async function runFetch(
  rootHash: string,
  outputDir: string | undefined,
  options: FetchOptions = {},
): Promise<void> {
  const config = loadConfig({
    network: options.network,
    indexerUrl: options.indexerUrl,
  });

  const target = outputDir ? path.resolve(outputDir) : undefined;

  console.log(chalk.dim(`network:  ${config.network}`));
  console.log(chalk.dim(`indexer:  ${config.indexerUrl}`));
  console.log(chalk.dim(`rootHash: ${rootHash}`));
  console.log(chalk.dim(`output:   ${target ?? "(temp dir)"}`));
  console.log();

  const spinner = ora("Downloading bundle from 0G Storage").start();
  let bundle;
  try {
    bundle = await fetchBundle(rootHash, config, target);
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
