import { NETWORKS, explorerAddressUrl, resolveNetwork } from "@0gzk/sdk";

/**
 * Explorer link helpers for the current build's network.
 *
 * `NEXT_PUBLIC_OGZK_NETWORK` (fallback `NEXT_PUBLIC_OG_NETWORK`, aliases
 * `mainnet`/`testnet` accepted) picks the chain preset; `NEXT_PUBLIC_OG_EXPLORER`
 * still wins as a full base-URL override. Both are inlined at build time, so
 * the values are constants in the client bundle. Operators that point the
 * server at another chain via `OGZK_NETWORK` should set the NEXT_PUBLIC mirror
 * so explorer links match the chain the server is actually reading.
 */
function preset() {
  const name =
    resolveNetwork(
      process.env.NEXT_PUBLIC_OGZK_NETWORK ?? process.env.NEXT_PUBLIC_OG_NETWORK,
    ) ?? "base";
  return NETWORKS[name];
}

export function getExplorerBase(): string {
  if (process.env.NEXT_PUBLIC_OG_EXPLORER) return process.env.NEXT_PUBLIC_OG_EXPLORER;
  return preset().explorer;
}

/** Full explorer URL for an account/address page. */
export function getExplorerAddressUrl(address: string): string {
  const override = process.env.NEXT_PUBLIC_OG_EXPLORER;
  if (override) return `${override}/address/${address}`;
  return explorerAddressUrl(preset(), address);
}
