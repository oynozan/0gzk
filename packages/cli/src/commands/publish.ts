import { promises as fs } from "node:fs";
import * as path from "node:path";

import {
  UploadTimeoutError,
  loadConfig,
  readBundleFromDir,
  uploadBundle,
  type UploadProgress,
  type UploadResult,
} from "@0gzk/sdk/node";
import chalk from "chalk";
import ora, { type Ora } from "ora";

import { connectRegistry, hashVkey } from "../registry.js";
import { formatDuration, parseDuration } from "../duration.js";

export interface PublishOptions {
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  indexerUrl?: string;
  privateKey?: string;
  writeReceipt?: boolean;
  register?: boolean;
  registry?: string;
  metadataUri?: string;
  verifierAddress?: string;
  /** Raw `--wait <duration>` value, e.g. "5m", "0", "forever". */
  wait?: string;
  /** Shortcut: skip the finalization wait, register-with-rootHash and return. */
  noWait?: boolean;
}

const DEFAULT_WAIT = "5m";
const NO_WAIT_SUBMIT_BUDGET = "30s";

export async function runPublish(
  bundleDir: string,
  options: PublishOptions = {},
): Promise<void> {
  const config = loadConfig({
    network: options.network,
    rpcUrl: options.rpcUrl,
    indexerUrl: options.indexerUrl,
    privateKey: options.privateKey,
  });

  const waitInput = options.noWait
    ? NO_WAIT_SUBMIT_BUDGET
    : options.wait ?? DEFAULT_WAIT;
  const timeoutMs = parseDuration(waitInput);

  console.log(chalk.dim(`network:  ${config.network}`));
  console.log(chalk.dim(`indexer:  ${config.indexerUrl}`));
  console.log(chalk.dim(`bundle:   ${path.resolve(bundleDir)}`));
  if (options.register) console.log(chalk.dim(`register: yes`));
  console.log(chalk.dim(`wait:     ${formatDuration(timeoutMs)}`));
  console.log();

  const tracker = {
    rootHash: undefined as string | undefined,
    segments: 0 as number,
    finalized: false,
  };
  let spinner: Ora | undefined;
  let printedRootHash = false;

  const onProgress = (p: UploadProgress) => {
    if (p.rootHash && !tracker.rootHash) {
      tracker.rootHash = p.rootHash;
    }
    if (typeof p.uploadedSegments === "number") {
      tracker.segments = p.uploadedSegments;
    }
    if (p.finalized) {
      tracker.finalized = true;
    }

    // Print the rootHash the moment we learn it — even if we eventually time
    // out, the user has the recovery key on screen already.
    if (tracker.rootHash && !printedRootHash) {
      printedRootHash = true;
      if (spinner) spinner.stopAndPersist({
        symbol: chalk.green("✓"),
        text: `rootHash assigned: ${chalk.green(tracker.rootHash)}`,
      });
      spinner = ora().start("Streaming segments to storage nodes");
    }

    if (spinner) {
      switch (p.stage) {
        case "packing":
          spinner.text = "Packing bundle tarball";
          break;
        case "submitting":
          spinner.text = "Submitting upload transaction";
          break;
        case "streaming":
          spinner.text = `Streaming segments to storage nodes (${tracker.segments} so far)`;
          break;
        case "finalizing":
          if (p.finalized) {
            spinner.text = "Storage finalization reached";
          } else {
            spinner.text = `Waiting for finalization quorum · rootHash ${chalk.green(
              tracker.rootHash ?? "(pending)",
            )}`;
          }
          break;
        case "done":
          spinner.text = "Upload finalized";
          break;
      }
    }
  };

  spinner = ora("Packing bundle tarball").start();

  let result: UploadResult | undefined;
  let uploadError: unknown;
  try {
    result = await uploadBundle(bundleDir, config, { timeoutMs, onProgress });
    spinner.succeed("Uploaded and finalized on 0G Storage");
  } catch (err) {
    uploadError = err;
    if (err instanceof UploadTimeoutError) {
      if (err.rootHash) {
        spinner.warn(
          `Upload submitted but not finalized within ${formatDuration(timeoutMs)} · ` +
            `rootHash ${chalk.green(err.rootHash)}`,
        );
      } else {
        spinner.fail(
          `Upload did not start within ${formatDuration(timeoutMs)} (no rootHash yet)`,
        );
      }
    } else {
      spinner.fail("Upload failed");
    }
  }

  // From here on we have one of three shapes:
  //   1. result   — upload finalized fully (happy path)
  //   2. uploadError instanceof UploadTimeoutError && rootHash known — register anyway
  //   3. uploadError of any other kind — give up
  const effectiveRootHash =
    result?.rootHash ??
    (uploadError instanceof UploadTimeoutError ? uploadError.rootHash : undefined);

  if (!effectiveRootHash) {
    // No rootHash, no recovery path. Surface the original error.
    if (uploadError) throw uploadError;
    throw new Error("Upload produced no rootHash");
  }

  console.log();
  console.log(chalk.bold("rootHash:"), chalk.green(effectiveRootHash));
  if (result) {
    console.log(chalk.bold("txHash:  "), chalk.green(result.txHash));
    console.log(chalk.bold("txSeq:   "), chalk.green(String(result.txSeq)));
    console.log(chalk.dim(`explorer: ${config.explorer}/tx/${result.txHash}`));
  } else {
    console.log(
      chalk.yellow(
        "note: finalization is still in progress on storage nodes; reads may " +
          "take a few minutes to succeed across the network.",
      ),
    );
  }

  let registryReceipt: {
    address: string;
    name: string;
    version: string;
    vkeyHash: string;
    txHash: string;
  } | null = null;

  if (options.register) {
    registryReceipt = await registerOnChain(bundleDir, effectiveRootHash, options);
  }

  if (options.writeReceipt !== false) {
    const receiptPath = path.join(path.resolve(bundleDir), ".published.json");
    await fs.writeFile(
      receiptPath,
      `${JSON.stringify(
        {
          rootHash: effectiveRootHash,
          txHash: result?.txHash ?? null,
          txSeq: result?.txSeq ?? null,
          network: config.network,
          publishedAt: new Date().toISOString(),
          finalized: Boolean(result),
          registry: registryReceipt,
        },
        null,
        2,
      )}\n`,
    );
    console.log(chalk.dim(`receipt:  ${receiptPath}`));
  }

  // If the upload timed out, exit non-zero so CI notices — but only AFTER the
  // on-chain registration succeeded, so a single re-run picks up cleanly.
  if (uploadError instanceof UploadTimeoutError) {
    console.log();
    console.log(chalk.yellow("⚠ Upload timed out before finalization."));
    console.log("  Your data is on chain. Three ways forward:");
    console.log(
      `    • Wait longer:        ${chalk.cyan(
        `0gzk publish ${bundleDir} --wait 30m${options.register ? " --register" : ""}`,
      )}`,
    );
    if (!options.register) {
      console.log(
        `    • Register now:       ${chalk.cyan(
          `0gzk registry register ${effectiveRootHash} --bundle ${bundleDir}`,
        )}`,
      );
    }
    console.log(
      `    • Verify later:       ${chalk.cyan(
        `0gzk fetch ${effectiveRootHash}`,
      )} (after finalization)`,
    );
    process.exitCode = 2;
  }
}

async function registerOnChain(
  bundleDir: string,
  rootHash: string,
  options: PublishOptions,
): Promise<{
  address: string;
  name: string;
  version: string;
  vkeyHash: string;
  txHash: string;
}> {
  const bundle = await readBundleFromDir(path.resolve(bundleDir));
  const vkeyHash = hashVkey(bundle.vkey);
  const handle = connectRegistry({
    network: options.network,
    rpcUrl: options.rpcUrl,
    registryAddress: options.registry,
    privateKey: options.privateKey,
  });
  if (!handle.signer) {
    throw new Error(
      "--register requires OG_PRIVATE_KEY (or --key) to sign the registration tx.",
    );
  }

  const { name, version } = bundle.metadata;
  console.log();
  console.log(chalk.dim(`registry: ${handle.registryAddress}`));
  console.log(chalk.dim(`circuit:  ${name}@${version}`));
  console.log(chalk.dim(`vkeyHash: ${vkeyHash}`));

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
    const verifier = options.verifierAddress ?? "0x0000000000000000000000000000000000000000";
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
    const out = {
      address: handle.registryAddress,
      name,
      version,
      vkeyHash,
      txHash: receipt?.hash ?? tx.hash,
    };
    console.log(chalk.dim(`registryTx: ${out.txHash}`));
    return out;
  } catch (err) {
    publishSpinner.fail("publishVersion failed");
    throw err;
  }
}
