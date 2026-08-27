/**
 * Deterministic weighted search over the catalog. No fuzzy magic: lowercase
 * tokenization plus per-field weights, so results are explainable
 * (`matchedFields`) and stable across runs.
 *
 * Weights: exact-name 10, name-substring 6, tag exact 5, keyword exact 4,
 * useCase token 3, description token 2, input/output description token 1.
 * Each query token contributes its single best field score; the total is then
 * boosted by the fraction of query tokens that matched anything.
 */
import type { Catalog, CatalogEntry } from "./types.js";

export interface SearchMatch {
  entry: CatalogEntry;
  score: number;
  matchedFields: string[];
}

export interface SearchOptions {
  limit?: number;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 0);
}

function textTokenMatch(textTokens: string[], token: string): boolean {
  return textTokens.some((t) => t === token || (token.length >= 3 && t.startsWith(token)));
}

interface FieldIndex {
  name: string;
  nameTokens: string[];
  tags: string[];
  keywords: string[];
  useCaseTokens: string[];
  descriptionTokens: string[];
  ioDescriptionTokens: string[];
}

function indexEntry(entry: CatalogEntry): FieldIndex {
  const ioDescriptions: string[] = [];
  for (const spec of Object.values(entry.inputs)) {
    if (spec.description) ioDescriptions.push(spec.description);
  }
  for (const spec of Object.values(entry.outputs)) {
    if (spec.description) ioDescriptions.push(spec.description);
  }
  return {
    name: entry.name.toLowerCase(),
    nameTokens: tokenize(entry.name),
    tags: entry.tags.map((t) => t.toLowerCase()),
    keywords: entry.keywords.map((k) => k.toLowerCase()),
    useCaseTokens: tokenize(entry.useCases.join(" ")),
    descriptionTokens: tokenize(entry.description),
    ioDescriptionTokens: tokenize(ioDescriptions.join(" ")),
  };
}

function scoreToken(index: FieldIndex, token: string): { score: number; field: string } | null {
  if (token === index.name) return { score: 10, field: "name" };
  if (index.name.includes(token) || index.nameTokens.includes(token)) {
    return { score: 6, field: "name" };
  }
  if (index.tags.includes(token)) return { score: 5, field: "tags" };
  if (index.keywords.includes(token)) return { score: 4, field: "keywords" };
  if (textTokenMatch(index.useCaseTokens, token)) return { score: 3, field: "useCases" };
  if (textTokenMatch(index.descriptionTokens, token)) return { score: 2, field: "description" };
  if (textTokenMatch(index.ioDescriptionTokens, token)) return { score: 1, field: "io-descriptions" };
  return null;
}

export function searchCatalog(catalog: Catalog, query: string, options: SearchOptions = {}): SearchMatch[] {
  const limit = options.limit ?? 10;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matches: SearchMatch[] = [];
  for (const entry of catalog.circuits) {
    const index = indexEntry(entry);
    let base = 0;
    let matchedTokens = 0;
    const fields = new Set<string>();

    // Whole-query exact name match (e.g. query "age_verification").
    if (query.trim().toLowerCase() === index.name) {
      base += 10;
      fields.add("name");
    }

    for (const token of tokens) {
      const best = scoreToken(index, token);
      if (best) {
        base += best.score;
        matchedTokens += 1;
        fields.add(best.field);
      }
    }

    if (base <= 0) continue;
    const score = Math.round(base * (1 + matchedTokens / tokens.length) * 100) / 100;
    matches.push({ entry, score, matchedFields: [...fields] });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.name < b.entry.name ? -1 : a.entry.name > b.entry.name ? 1 : 0;
  });
  return matches.slice(0, limit);
}
