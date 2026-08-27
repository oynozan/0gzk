/**
 * README table rendering: turn a catalog into the markdown table committed in
 * `circuits/README.md` between the `<!-- CATALOG:BEGIN -->` /
 * `<!-- CATALOG:END -->` markers.
 */
import type { Catalog, CatalogEntry } from "./types.js";

export const CATALOG_BEGIN = "<!-- CATALOG:BEGIN -->";
export const CATALOG_END = "<!-- CATALOG:END -->";

function groupThousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function publicInputs(entry: CatalogEntry): string {
  const names = Object.entries(entry.inputs)
    .filter(([, spec]) => spec.visibility === "public")
    .map(([name]) => name);
  return names.length > 0 ? names.join(", ") : "—";
}

function useCaseCell(entry: CatalogEntry): string {
  const text = entry.useCases[0] ?? entry.description;
  return text ? escapeCell(text) : "—";
}

function publishedOn(entry: CatalogEntry): string {
  const chains = [...new Set(entry.publications.map((p) => p.chain))];
  return chains.length > 0 ? chains.join(", ") : "—";
}

/** Render the catalog as a markdown table (no surrounding markers). */
export function renderReadmeTable(catalog: Catalog): string {
  const header = [
    "| Circuit | Constraints | Public inputs | Tags | Use case | Published on |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const rows = catalog.circuits.map((entry) => {
    const constraints = entry.constraints ? groupThousands(entry.constraints.count) : "—";
    const tags = entry.tags.length > 0 ? escapeCell(entry.tags.join(", ")) : "—";
    return `| \`${entry.name}\` | ${constraints} | ${escapeCell(publicInputs(entry))} | ${tags} | ${useCaseCell(entry)} | ${publishedOn(entry)} |`;
  });
  return [...header, ...rows].join("\n");
}

/**
 * Replace the content between the catalog markers in a README with `table`.
 * Throws when either marker is missing so a mangled README fails loudly
 * instead of silently appending a second table.
 */
export function spliceReadme(readmeText: string, table: string): string {
  const beginIndex = readmeText.indexOf(CATALOG_BEGIN);
  const endIndex = readmeText.indexOf(CATALOG_END);
  if (beginIndex === -1 || endIndex === -1) {
    throw new Error(
      `README is missing the ${CATALOG_BEGIN} / ${CATALOG_END} markers — add both markers around the ` +
        "catalog table section so the generated table can be spliced in.",
    );
  }
  if (endIndex < beginIndex) {
    throw new Error(`README has ${CATALOG_END} before ${CATALOG_BEGIN} — fix the marker order.`);
  }
  const before = readmeText.slice(0, beginIndex + CATALOG_BEGIN.length);
  const after = readmeText.slice(endIndex);
  return `${before}\n\n${table}\n\n${after}`;
}
