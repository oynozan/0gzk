/**
 * Server context resolution. Decides between:
 *  - "repo" mode — a 0gzk checkout was found (catalog available, authoring
 *    tools registered), and
 *  - "discovery" mode — no catalog anywhere; only the live on-chain
 *    registries can answer questions.
 */
import { access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateCatalog } from "./catalog/generate.js";
import { loadCatalog } from "./catalog/load.js";
import type { Catalog } from "./catalog/types.js";
import { allToolDefs } from "./tools/index.js";

export interface ResolveContextOptions {
  /** Explicit repository root (the dir containing `circuits/`). */
  repoRoot?: string;
  /** Explicit path to a generated `index.json` — enables catalog discovery over any checkout. */
  catalogPath?: string;
}

export interface ServerContext {
  mode: "repo" | "discovery";
  repoRoot?: string;
  catalog: Catalog | null;
  /** Set when the catalog was loaded from a file on disk. */
  catalogPath?: string;
  /** Bundle cache root (`~/.0gzk/bundles`, override via OGZK_CACHE_DIR). */
  cacheDir: string;
  toolNames: string[];
}

/** Parse `--repo-root <path>` / `--catalog <path>` from a raw argv slice. */
export function parseContextArgs(argv: string[]): ResolveContextOptions {
  const options: ResolveContextOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo-root" && argv[i + 1]) {
      options.repoRoot = argv[++i];
    } else if (arg === "--catalog" && argv[i + 1]) {
      options.catalogPath = argv[++i];
    }
  }
  return options;
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from `startDir` looking for a directory that contains a `circuits`
 * subdirectory AND (`pnpm-workspace.yaml` or `circuits/index.json`).
 */
async function findRepoRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  for (;;) {
    if (await isDir(path.join(current, "circuits"))) {
      const markers = [path.join(current, "pnpm-workspace.yaml"), path.join(current, "circuits", "index.json")];
      for (const marker of markers) {
        if (await isFile(marker)) return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function defaultCacheDir(): string {
  return process.env.OGZK_CACHE_DIR ?? path.join(os.homedir(), ".0gzk", "bundles");
}

export async function resolveContext(
  argvOrOpts: string[] | ResolveContextOptions = {},
): Promise<ServerContext> {
  const options = Array.isArray(argvOrOpts) ? parseContextArgs(argvOrOpts) : argvOrOpts;

  // Resolve the repo root: explicit flag > OGZK_REPO_ROOT env > walk-up.
  let repoRoot: string | undefined;
  if (options.repoRoot) {
    repoRoot = path.resolve(options.repoRoot);
    if (!(await isDir(path.join(repoRoot, "circuits")))) {
      throw new Error(`--repo-root ${repoRoot} has no circuits/ subdirectory`);
    }
  } else if (process.env.OGZK_REPO_ROOT) {
    repoRoot = path.resolve(process.env.OGZK_REPO_ROOT);
    if (!(await isDir(path.join(repoRoot, "circuits")))) {
      throw new Error(`OGZK_REPO_ROOT=${repoRoot} has no circuits/ subdirectory`);
    }
  } else {
    repoRoot = await findRepoRoot(process.cwd());
  }

  // Resolve the catalog: explicit --catalog > repoRoot's committed
  // index.json > generated in-memory from the repo tree.
  let catalog: Catalog | null = null;
  let catalogPath: string | undefined;
  if (options.catalogPath) {
    catalogPath = path.resolve(options.catalogPath);
    catalog = await loadCatalog(catalogPath);
  } else if (repoRoot) {
    const committed = path.join(repoRoot, "circuits", "index.json");
    if (await pathExists(committed)) {
      catalog = await loadCatalog(committed);
      catalogPath = committed;
    } else {
      catalog = await generateCatalog({ repoRoot });
    }
  }

  const mode: ServerContext["mode"] = catalog ? "repo" : "discovery";
  const context: ServerContext = {
    mode,
    catalog,
    cacheDir: defaultCacheDir(),
    toolNames: allToolDefs(mode).map((def) => def.name),
  };
  if (repoRoot !== undefined) context.repoRoot = repoRoot;
  if (catalogPath !== undefined) context.catalogPath = catalogPath;
  return context;
}
