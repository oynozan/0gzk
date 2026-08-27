// Hand-curated ABI for CircuitRegistry. Kept manually instead of regenerated
// from forge artifacts on every install so the SDK stays self-contained and
// publishable independently of the contracts package.
//
// If CircuitRegistry.sol changes, mirror the edit here and bump the SDK
// minor version.
export const CIRCUIT_REGISTRY_ABI = [
  {
    type: "function",
    name: "createCircuit",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "publishVersion",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "rootHash", type: "bytes32" },
      { name: "vkeyHash", type: "bytes32" },
      { name: "verifier", type: "address" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setVerifier",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "verifier", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "newOwner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "circuitCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getVersion",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "rootHash", type: "bytes32" },
          { name: "vkeyHash", type: "bytes32" },
          { name: "verifier", type: "address" },
          { name: "publisher", type: "address" },
          { name: "publishedAt", type: "uint64" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getLatest",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [
      { name: "version", type: "string" },
      {
        name: "record",
        type: "tuple",
        components: [
          { name: "rootHash", type: "bytes32" },
          { name: "vkeyHash", type: "bytes32" },
          { name: "verifier", type: "address" },
          { name: "publisher", type: "address" },
          { name: "publishedAt", type: "uint64" },
          { name: "metadataURI", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "listVersions",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "string[]" }],
  },
  {
    type: "function",
    name: "listCircuits",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "name", type: "string" },
          { name: "owner", type: "address" },
          { name: "versionCount", type: "uint256" },
          { name: "latestVersion", type: "string" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "CircuitCreated",
    inputs: [
      { name: "nameHash", type: "string", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "VersionPublished",
    inputs: [
      { name: "nameHash", type: "string", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "version", type: "string", indexed: false },
      { name: "rootHash", type: "bytes32", indexed: false },
      { name: "vkeyHash", type: "bytes32", indexed: false },
      { name: "verifier", type: "address", indexed: false },
      { name: "publisher", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

export type CircuitRegistryAbi = typeof CIRCUIT_REGISTRY_ABI;
