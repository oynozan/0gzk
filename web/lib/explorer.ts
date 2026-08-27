const MAINNET = "https://explorer.0g.ai/mainnet/blockchain";
const TESTNET = "https://explorer.0g.ai/testnet/blockchain";

/**
 * Resolves the 0G chain explorer base URL for the current build.
 *
 * Reads `NEXT_PUBLIC_OG_EXPLORER` if set (full URL override), otherwise
 * picks based on `NEXT_PUBLIC_OG_NETWORK`. Defaults to mainnet.
 *
 * Both env vars are inlined at build time, so the value is a constant in
 * the client bundle. Operators that point the server at testnet via
 * `OG_NETWORK=testnet` should also set `NEXT_PUBLIC_OG_NETWORK=testnet`
 * so explorer links match the chain the server is actually reading.
 */
export function getExplorerBase(): string {
  if (process.env.NEXT_PUBLIC_OG_EXPLORER) return process.env.NEXT_PUBLIC_OG_EXPLORER;
  return process.env.NEXT_PUBLIC_OG_NETWORK === "testnet" ? TESTNET : MAINNET;
}
