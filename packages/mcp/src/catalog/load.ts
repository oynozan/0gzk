/** Load and zod-validate a committed `circuits/index.json`. */
import { readFile } from "node:fs/promises";
import { CatalogSchema, type Catalog } from "./types.js";

export async function loadCatalog(path: string): Promise<Catalog> {
  const raw = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const result = CatalogSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${path} does not match the catalog schema: ${issues}`);
  }
  return result.data as Catalog;
}
