/** Public catalog surface: types, generation, loading, search, README table. */
export type {
  Catalog,
  CatalogEntry,
  ConstraintInfo,
  DiscoveryMetadata,
  PublicationRecord,
} from "./types.js";
export {
  CANONICAL_BUNDLE_FILES,
  CatalogEntrySchema,
  CatalogSchema,
  CircuitMetadataSchema,
  ConstraintInfoSchema,
  InputSpecSchema,
  OutputSpecSchema,
  PublicationRecordSchema,
  metadataWarnings,
} from "./types.js";
export {
  generateCatalog,
  parsePtauSize,
  serializeCatalog,
  writeCatalog,
  type GenerateCatalogOptions,
} from "./generate.js";
export { loadCatalog } from "./load.js";
export { readR1csCounts, type R1csCounts } from "./r1cs.js";
export {
  CATALOG_BEGIN,
  CATALOG_END,
  renderReadmeTable,
  spliceReadme,
} from "./readme.js";
export { searchCatalog, tokenize, type SearchMatch, type SearchOptions } from "./search.js";
