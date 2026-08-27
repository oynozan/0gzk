export const REGISTRY_ADDRESSES: Record<number, string | null> = {
  16661: "0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d", // 0G mainnet (default)
  16602: "0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6", // 0G Galileo testnet
  84532: null, // Base Sepolia — filled in by the deploy runbook
  8453: null, // Base mainnet — not deployed yet
};

export function getRegistryAddress(chainId: number): string | null {
  return REGISTRY_ADDRESSES[chainId] ?? null;
}
