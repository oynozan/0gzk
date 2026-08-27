/**
 * Read-only discovery tools: search/list/get/resolve circuits from the local
 * catalog (repo mode) or the live on-chain registries (discovery mode).
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getLatest, getVersion, listCircuits, parseNameSpec } from "@0gzk/sdk/onchain";
import type { VersionRecord } from "@0gzk/sdk/onchain";
import {
  CHAIN_SLUGS,
  fetchBundleForRecord,
  getChainInfo,
  getRegistry,
  withTimeout,
  type ChainSlug,
} from "../chains.js";
import { searchCatalog, tokenize } from "../catalog/search.js";
import type { CatalogEntry } from "../catalog/types.js";
import { defineTool, errorMessage, errorResult, jsonResult, type ToolDef } from "./defs.js";

const REGISTRY_TIMEOUT_MS = 10_000;
const chainSchema = z.enum(CHAIN_SLUGS);

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function howToProve(name: string, rootHash?: string): { cli: string; sdk: string } {
  return {
    cli: `0gzk prove --name ${name} <input.json>`,
    sdk: [
      'import { generateProof, verifyLocal } from "@0gzk/sdk";',
      'import { fetchBundle, loadConfig } from "@0gzk/sdk/node";',
      "",
      `const bundle = await fetchBundle("${rootHash ?? "<rootHash>"}", loadConfig());`,
      "const result = await generateProof(bundle, inputs);",
      "const verified = await verifyLocal(bundle, result);",
    ].join("\n"),
  };
}

function publicationSummary(entry: CatalogEntry, chain?: ChainSlug) {
  const pubs = chain ? entry.publications.filter((p) => p.chain === chain) : entry.publications;
  return pubs.map((p) => ({ chain: p.chain, version: p.version, rootHash: p.rootHash }));
}

export const searchCircuitsTool = defineTool({
  name: "search_circuits",
  description:
    "Search 0gzk ZK circuits by natural-language query (matched against names, tags, keywords, use cases, and descriptions). " +
    "In repo mode this searches the local catalog; without a repo it falls back to substring-matching circuit names on a live registry.",
  readOnly: true,
  schema: {
    query: z.string().min(1).describe("What the circuit should do, e.g. \"prove age over 18\""),
    limit: z.number().int().min(1).max(20).default(5).describe("Maximum results"),
    chain: chainSchema.optional().describe("Only report publications on this chain (catalog mode) / registry to enumerate (discovery mode)"),
  },
  handler: async (ctx, args) => {
    if (ctx.catalog) {
      const matches = searchCatalog(ctx.catalog, args.query, { limit: args.limit });
      const results = matches.map(({ entry, score, matchedFields }) => ({
        name: entry.name,
        version: entry.version,
        description: entry.description,
        tags: entry.tags,
        useCases: entry.useCases,
        score,
        matchedFields,
        publications: publicationSummary(entry, args.chain),
        ...(entry.publications.length === 0
          ? { note: "local-only: in this repo but not published to any registry yet" }
          : {}),
      }));
      return jsonResult({ searchMode: "catalog", query: args.query, results });
    }

    // Discovery mode: the registry only stores names, so this is a name match.
    const chain = args.chain ?? "0g-mainnet";
    try {
      const registry = getRegistry(chain);
      const summaries = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = await withTimeout(
          listCircuits(registry, { offset, limit: 100 }),
          REGISTRY_TIMEOUT_MS,
          `listCircuits on ${chain}`,
        );
        summaries.push(...page);
        if (page.length < 100) break;
      }
      const tokens = tokenize(args.query);
      const results = summaries
        .filter((s) => {
          const name = s.name.toLowerCase();
          return tokens.some((t) => name.includes(t));
        })
        .slice(0, args.limit)
        .map((s) => ({
          name: s.name,
          owner: s.owner,
          versionCount: s.versionCount,
          latestVersion: s.latestVersion,
        }));
      return jsonResult({
        searchMode: "registry-names",
        chain,
        query: args.query,
        results,
        note: "No local catalog available — matching against on-chain circuit names only. Use get_circuit to fetch full metadata.",
      });
    } catch (err) {
      return errorResult(`search_circuits failed against the ${chain} registry: ${errorMessage(err)}`);
    }
  },
});

export const listCircuitsTool = defineTool({
  name: "list_circuits",
  description:
    "List known circuits. source=catalog lists the local repo catalog (name/version/description/tags/publications); " +
    "source=registry pages through the live on-chain registry for a chain.",
  readOnly: true,
  schema: {
    source: z.enum(["catalog", "registry"]).optional().describe("Defaults to catalog; falls back to registry when no catalog is available"),
    chain: chainSchema.default("0g-mainnet").describe("Registry chain (source=registry)"),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(200).default(50),
  },
  handler: async (ctx, args) => {
    const source = args.source ?? (ctx.catalog ? "catalog" : "registry");
    if (source === "catalog") {
      if (!ctx.catalog) {
        return errorResult(
          "No catalog available (discovery mode). Re-call with source: \"registry\", or point the server at a checkout via --repo-root / OGZK_REPO_ROOT.",
        );
      }
      const rows = ctx.catalog.circuits.slice(args.offset, args.offset + args.limit).map((entry) => ({
        name: entry.name,
        version: entry.version,
        description: entry.description,
        tags: entry.tags,
        publications: publicationSummary(entry),
      }));
      return jsonResult({ source: "catalog", total: ctx.catalog.circuits.length, offset: args.offset, circuits: rows });
    }
    try {
      const registry = getRegistry(args.chain);
      const page = await withTimeout(
        listCircuits(registry, { offset: args.offset, limit: args.limit }),
        REGISTRY_TIMEOUT_MS,
        `listCircuits on ${args.chain}`,
      );
      return jsonResult({ source: "registry", chain: args.chain, offset: args.offset, circuits: page });
    } catch (err) {
      return errorResult(`list_circuits failed against the ${args.chain} registry: ${errorMessage(err)}`);
    }
  },
});

export const getCircuitTool = defineTool({
  name: "get_circuit",
  description:
    "Get the full record for one circuit: metadata (inputs/outputs), constraints, example input, publications, and how to prove with it. " +
    "Unknown names can be resolved from a live registry and their published bundle fetched into the local cache.",
  readOnly: true,
  schema: {
    name: z.string().min(1),
    version: z.string().optional().describe("Registry version (defaults to latest)"),
    chain: chainSchema.optional().describe("Registry chain for non-catalog circuits (default 0g-mainnet)"),
    includeExampleInput: z.boolean().default(true),
    fetchIfMissing: z.boolean().default(true).describe("Allow downloading the published bundle when the circuit is not in the catalog"),
  },
  handler: async (ctx, args) => {
    const entry = ctx.catalog?.circuits.find((c) => c.name === args.name);
    if (entry) {
      const { exampleInput, ...rest } = entry;
      return jsonResult({
        source: "catalog",
        ...rest,
        ...(args.includeExampleInput ? { exampleInput } : {}),
        howToProve: howToProve(entry.name, entry.publications[0]?.rootHash),
      });
    }

    if (!args.fetchIfMissing) {
      return errorResult(
        `"${args.name}" is not in the local catalog. Resolving it means downloading its published bundle ` +
          "(typically a few MB: wasm + zkey) from storage into the local cache. Re-call with fetchIfMissing: true to allow that.",
      );
    }

    const chain = args.chain ?? "0g-mainnet";
    try {
      const registry = getRegistry(chain);
      let version: string;
      let record: VersionRecord;
      if (args.version) {
        version = args.version;
        record = await withTimeout(getVersion(registry, args.name, args.version), REGISTRY_TIMEOUT_MS, `getVersion on ${chain}`);
      } else {
        const latest = await withTimeout(getLatest(registry, args.name), REGISTRY_TIMEOUT_MS, `getLatest on ${chain}`);
        version = latest.version;
        record = latest.record;
      }

      const bundleDir = path.join(ctx.cacheDir, record.rootHash.toLowerCase());
      const cachedMetadataPath = path.join(bundleDir, "metadata.json");
      let metadata: unknown;
      let cache: "hit" | "downloaded";
      if (await pathExists(cachedMetadataPath)) {
        metadata = JSON.parse(await readFile(cachedMetadataPath, "utf8"));
        cache = "hit";
      } else {
        const bundle = await fetchBundleForRecord(record, chain, bundleDir);
        metadata = bundle.metadata;
        cache = "downloaded";
      }
      return jsonResult({
        source: "registry-bundle-cache",
        chain,
        name: args.name,
        version,
        rootHash: record.rootHash,
        vkeyHash: record.vkeyHash,
        publisher: record.publisher,
        metadataURI: record.metadataURI,
        cache,
        bundleDir,
        metadata,
        howToProve: howToProve(args.name, record.rootHash),
        note: "Example inputs are repo-only; published bundles do not carry one.",
      });
    } catch (err) {
      return errorResult(`get_circuit("${args.name}") failed on ${chain}: ${errorMessage(err)}`);
    }
  },
});

export const getExampleInputTool = defineTool({
  name: "get_example_input",
  description: "Get the committed example_input.json for a catalog circuit — the fastest way to see a valid input shape.",
  readOnly: true,
  schema: {
    name: z.string().min(1),
  },
  handler: async (ctx, args) => {
    if (!ctx.catalog) {
      return errorResult(
        "Example inputs live in the repo checkout only (they are not part of published bundles), and this server is running in discovery mode. " +
          "Start it with --repo-root / OGZK_REPO_ROOT pointing at a 0gzk checkout to use them.",
      );
    }
    const entry = ctx.catalog.circuits.find((c) => c.name === args.name);
    if (!entry) {
      const known = ctx.catalog.circuits.map((c) => c.name).join(", ");
      return errorResult(`Unknown circuit "${args.name}". Catalog circuits: ${known}`);
    }
    return jsonResult({
      name: entry.name,
      exampleInput: entry.exampleInput,
      note: "Example inputs are repo-only (not part of published bundles). Values are decimal strings for field elements.",
    });
  },
});

export const resolveCircuitTool = defineTool({
  name: "resolve_circuit",
  description:
    "Resolve a \"name\" or \"name@version\" spec against the on-chain registries and report the published record per chain " +
    "(rootHash, vkeyHash, verifier, publisher, publishedAt).",
  readOnly: true,
  schema: {
    spec: z.string().min(1).describe('Circuit spec, e.g. "age_verification" or "age_verification@0.1.0"'),
    chain: z.enum([...CHAIN_SLUGS, "all"]).default("all"),
  },
  handler: async (_ctx, args) => {
    let name: string;
    let version: string | undefined;
    try {
      ({ name, version } = parseNameSpec(args.spec));
    } catch (err) {
      return errorResult(`Invalid spec "${args.spec}": ${errorMessage(err)}`);
    }

    const slugs: ChainSlug[] = args.chain === "all" ? [...CHAIN_SLUGS] : [args.chain];
    const skipped: Array<{ chain: ChainSlug; reason: string }> = [];
    const targets = slugs.filter((slug) => {
      if (getChainInfo(slug).registryAddress) return true;
      skipped.push({ chain: slug, reason: "no registry address known (set OGZK_REGISTRY_ADDRESS_* to supply one)" });
      return false;
    });

    const settled = await Promise.allSettled(
      targets.map(async (slug) => {
        const info = getChainInfo(slug);
        const registry = getRegistry(slug);
        const resolved = version
          ? { version, record: await withTimeout(getVersion(registry, name, version), REGISTRY_TIMEOUT_MS, `${slug} registry`) }
          : await withTimeout(getLatest(registry, name), REGISTRY_TIMEOUT_MS, `${slug} registry`);
        return {
          chain: slug,
          chainId: info.chainId,
          registry: info.registryAddress,
          version: resolved.version,
          rootHash: resolved.record.rootHash,
          vkeyHash: resolved.record.vkeyHash,
          verifier: resolved.record.verifier,
          publisher: resolved.record.publisher,
          publishedAt: resolved.record.publishedAt,
          metadataURI: resolved.record.metadataURI,
        };
      }),
    );
    const results = settled.map((outcome, i) =>
      outcome.status === "fulfilled"
        ? outcome.value
        : { chain: targets[i], error: errorMessage(outcome.reason) },
    );
    return jsonResult({ name, version: version ?? "latest", results, skipped });
  },
});

export const discoveryToolDefs: ToolDef[] = [
  searchCircuitsTool,
  listCircuitsTool,
  getCircuitTool,
  getExampleInputTool,
  resolveCircuitTool,
];
