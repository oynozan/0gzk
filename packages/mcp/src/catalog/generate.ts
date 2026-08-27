/**
 * Catalog generator: walks `circuits/<name>/` directories and produces the
 * deterministic `circuits/index.json`. Output has NO timestamps, a fixed key
 * order, and circuits sorted by name — two runs over the same tree serialize
 * byte-identically, so the file is commit-friendly.
 */
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalog } from "./load.js";
import { CircuitMetadataSchema, type DiscoveryMetadata } from "./metadata-schema.js";
import { readR1csCounts } from "./r1cs.js";
import {
  PublicationRecordSchema,
  type Catalog,
  type CatalogEntry,
  type ConstraintInfo,
  type PublicationRecord,
} from "./types.js";
import { z } from "zod";

export interface GenerateCatalogOptions {
  /** Repository root: the directory containing `circuits/`. */
  repoRoot: string;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(p: string): Promise<unknown | undefined> {
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch {
    return undefined;
  }
  return JSON.parse(raw) as unknown;
}

/** Parse `PTAU_SIZE=<n>` out of a circuit's `build.sh`. */
export function parsePtauSize(buildShText: string): number | null {
  const match = /^\s*PTAU_SIZE=(\d+)\s*$/m.exec(buildShText);
  return match ? Number(match[1]) : null;
}

const PublicationsFileSchema = z.record(z.string(), z.array(PublicationRecordSchema));

async function readPublications(circuitsDir: string): Promise<Record<string, PublicationRecord[]>> {
  const raw = await readJsonIfPresent(path.join(circuitsDir, "publications.json"));
  if (raw === undefined) return {};
  return PublicationsFileSchema.parse(raw);
}

async function readStickyConstraints(circuitsDir: string): Promise<Map<string, ConstraintInfo>> {
  const sticky = new Map<string, ConstraintInfo>();
  try {
    const existing = await loadCatalog(path.join(circuitsDir, "index.json"));
    for (const entry of existing.circuits) {
      if (entry.constraints) sticky.set(entry.name, entry.constraints);
    }
  } catch {
    // No committed index.json (or an invalid one) — nothing to preserve.
  }
  return sticky;
}

/** Build the catalog for every `circuits/<name>/` (dirs starting with `_` skipped). */
export async function generateCatalog({ repoRoot }: GenerateCatalogOptions): Promise<Catalog> {
  const circuitsDir = path.join(repoRoot, "circuits");
  const dirents = await readdir(circuitsDir, { withFileTypes: true });
  const publications = await readPublications(circuitsDir);
  const sticky = await readStickyConstraints(circuitsDir);

  const names = dirents
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const circuits: CatalogEntry[] = [];
  for (const name of names) {
    const dir = path.join(circuitsDir, name);
    const metadataRaw = await readJsonIfPresent(path.join(dir, "metadata.json"));
    if (metadataRaw === undefined) continue; // not a circuit directory

    const metadata = CircuitMetadataSchema.parse(metadataRaw) as DiscoveryMetadata;

    const exampleRaw = await readJsonIfPresent(path.join(dir, "example_input.json"));
    const exampleInput =
      exampleRaw !== undefined && typeof exampleRaw === "object" && exampleRaw !== null && !Array.isArray(exampleRaw)
        ? (exampleRaw as Record<string, unknown>)
        : null;

    let ptauSize: number | null = null;
    try {
      ptauSize = parsePtauSize(await readFile(path.join(dir, "build.sh"), "utf8"));
    } catch {
      ptauSize = null;
    }

    let constraints: ConstraintInfo | null = null;
    const r1csPath = path.join(dir, "build", `${name}.r1cs`);
    if (await pathExists(r1csPath)) {
      const counts = await readR1csCounts(r1csPath);
      constraints = {
        count: counts.mConstraints,
        nPubIn: counts.nPubIn,
        nPrvIn: counts.nPrvIn,
        nPubOut: counts.nPubOut,
        source: "r1cs-header",
      };
    } else {
      // Sticky: preserve the committed value so a checkout without build
      // artifacts doesn't erase constraint counts from the catalog.
      constraints = sticky.get(name) ?? null;
    }

    // Fixed literal key order — this is what makes the output deterministic.
    circuits.push({
      name: metadata.name,
      version: metadata.version,
      description: metadata.description ?? "",
      tags: metadata.tags ?? [],
      keywords: metadata.keywords ?? [],
      useCases: metadata.useCases ?? [],
      protocol: metadata.protocol,
      curve: metadata.curve,
      inputs: metadata.inputs,
      outputs: metadata.outputs,
      exampleInput,
      ptauSize,
      constraints,
      publications: publications[name] ?? [],
      dir: `circuits/${name}`,
    });
  }

  return { schemaVersion: 1, circuits };
}

export function serializeCatalog(catalog: Catalog): string {
  return JSON.stringify(catalog, null, 2) + "\n";
}

/** Write `circuits/index.json` under `repoRoot`; returns the path written. */
export async function writeCatalog(catalog: Catalog, repoRoot: string): Promise<string> {
  const outPath = path.join(repoRoot, "circuits", "index.json");
  await writeFile(outPath, serializeCatalog(catalog), "utf8");
  return outPath;
}
