import { promises as fs } from "node:fs";
import * as path from "node:path";

import chalk from "chalk";

export interface CatalogOptions {
  repoRoot?: string;
}

async function findRepoRoot(override?: string): Promise<string> {
  if (override) return path.resolve(override);
  if (process.env.OGZK_REPO_ROOT) return path.resolve(process.env.OGZK_REPO_ROOT);
  let dir = process.cwd();
  for (;;) {
    try {
      await fs.access(path.join(dir, "circuits"));
      await fs.access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        throw new Error(
          "Could not find the 0gzk repo root (a directory containing circuits/ and " +
            "pnpm-workspace.yaml). Pass --repo-root <dir> or set OGZK_REPO_ROOT.",
        );
      }
      dir = parent;
    }
  }
}

async function catalogLib() {
  // Lazy import keeps @0gzk/mcp out of the startup path of unrelated commands.
  return import("@0gzk/mcp/catalog");
}

/** Regenerate circuits/index.json + the circuits/README.md catalog table. */
export async function runCatalogBuild(options: CatalogOptions = {}): Promise<void> {
  const repoRoot = await findRepoRoot(options.repoRoot);
  const lib = await catalogLib();

  const catalog = await lib.generateCatalog({ repoRoot });
  await lib.writeCatalog(catalog, repoRoot);

  const readmePath = path.join(repoRoot, "circuits", "README.md");
  const readme = await fs.readFile(readmePath, "utf8");
  const table = lib.renderReadmeTable(catalog);
  await fs.writeFile(readmePath, lib.spliceReadme(readme, table));

  console.log(
    `${chalk.green("✓")} wrote circuits/index.json (${catalog.circuits.length} circuits) ` +
      "and refreshed the circuits/README.md table",
  );
}

/** Exit 1 if circuits/index.json or the README table are stale. CI runs this. */
export async function runCatalogCheck(options: CatalogOptions = {}): Promise<void> {
  const repoRoot = await findRepoRoot(options.repoRoot);
  const lib = await catalogLib();

  const catalog = await lib.generateCatalog({ repoRoot });
  const expectedJson = `${JSON.stringify(catalog, null, 2)}\n`;

  const indexPath = path.join(repoRoot, "circuits", "index.json");
  const actualJson = await fs.readFile(indexPath, "utf8").catch(() => "");

  const readmePath = path.join(repoRoot, "circuits", "README.md");
  const readme = await fs.readFile(readmePath, "utf8");
  const expectedReadme = lib.spliceReadme(readme, lib.renderReadmeTable(catalog));

  const staleJson = actualJson !== expectedJson;
  const staleReadme = expectedReadme !== readme;

  if (!staleJson && !staleReadme) {
    console.log(`${chalk.green("✓")} catalog is up to date`);
    return;
  }
  if (staleJson) console.error(chalk.red("✗ circuits/index.json is stale"));
  if (staleReadme) console.error(chalk.red("✗ circuits/README.md catalog table is stale"));
  console.error(`  Run ${chalk.cyan("0gzk catalog build")} and commit the result.`);
  process.exitCode = 1;
}

/**
 * Upsert circuits/publications.json from local circuit_bundle/.published.json
 * receipts (which are gitignored). Idempotent.
 */
export async function runCatalogImportPublications(
  options: CatalogOptions = {},
): Promise<void> {
  const repoRoot = await findRepoRoot(options.repoRoot);
  const circuitsDir = path.join(repoRoot, "circuits");
  const pubPath = path.join(circuitsDir, "publications.json");

  const publications: Record<string, Array<Record<string, unknown>>> = JSON.parse(
    await fs.readFile(pubPath, "utf8").catch(() => "{}"),
  );

  let imported = 0;
  const entries = await fs.readdir(circuitsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const receiptPath = path.join(circuitsDir, entry.name, "circuit_bundle", ".published.json");
    let receipt: {
      rootHash?: string;
      uri?: string | null;
      storage?: string;
      txSeq?: number | null;
      network?: string;
      chainId?: number;
      publishedAt?: string;
      registry?: {
        address?: string;
        name?: string;
        version?: string;
        vkeyHash?: string;
        txHash?: string;
      } | null;
    };
    try {
      receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    } catch {
      continue;
    }
    if (!receipt.registry || !receipt.rootHash) continue; // storage-only receipts carry no chain record

    const record = {
      chain: receipt.network ?? "unknown",
      chainId: receipt.chainId ?? null,
      registry: receipt.registry.address ?? null,
      version: receipt.registry.version ?? null,
      rootHash: receipt.rootHash,
      vkeyHash: receipt.registry.vkeyHash ?? null,
      verifier: null,
      publisher: null,
      metadataURI: receipt.uri ?? null,
      storage: receipt.storage ?? "0g-storage",
      storageTxSeq: receipt.txSeq ?? null,
      registryTxHash: receipt.registry.txHash ?? null,
      publishedAt: receipt.publishedAt ?? null,
    };

    const list = (publications[entry.name] ??= []);
    const exists = list.some(
      (r) =>
        String(r.rootHash).toLowerCase() === record.rootHash.toLowerCase() &&
        String(r.registry ?? "").toLowerCase() === String(record.registry ?? "").toLowerCase(),
    );
    if (!exists) {
      list.push(record);
      imported += 1;
    }
  }

  await fs.writeFile(pubPath, `${JSON.stringify(publications, null, 2)}\n`);
  console.log(
    `${chalk.green("✓")} imported ${imported} new publication record(s) into circuits/publications.json`,
  );
  if (imported > 0) {
    console.log(chalk.dim("  Run `0gzk catalog build` to fold them into circuits/index.json."));
  }
}
