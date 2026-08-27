# @0gzk/mcp

MCP (Model Context Protocol) server for the 0gzk circuit ecosystem: lets AI
agents discover ZK circuits (from the repo catalog or the live on-chain
registries), inspect their input/output schemas, and author new ones — scaffold,
validate, build, and prove — over stdio.

```bash
npx -y @0gzk/mcp
```

## Tools

| Tool | Mode | What it does |
| --- | --- | --- |
| `search_circuits` | both | Weighted search over names, tags, keywords, use cases, descriptions (registry name-match in discovery mode) |
| `list_circuits` | both | List catalog circuits or page through a live registry |
| `get_circuit` | both | Full record for one circuit: metadata, constraints, example input, publications, how-to-prove; can fetch published bundles into the cache |
| `get_example_input` | both | The committed `example_input.json` for a catalog circuit |
| `resolve_circuit` | both | Resolve `name[@version]` against all registries → rootHash/vkeyHash/verifier per chain |
| `scaffold_circuit` | repo | Create `circuits/<name>/` with a `.circom` skeleton, `metadata.json`, `build.sh`, empty `example_input.json` |
| `validate_metadata` | repo | Validate a `metadata.json` → `{valid, errors, warnings}` |
| `build_circuit` | repo | circom compile + Groth16 phase-2 setup → publish-ready `circuit_bundle/` (needs `circom` on PATH) |
| `prove_circuit` | repo | Generate + locally verify a proof from a local bundle, a bundle dir, or a published rootHash |

Resources: `ogzk://guide/circom-authoring` (the authoring guide) and
`ogzk://catalog` (the raw `circuits/index.json`, repo mode only). The scheme is
`ogzk` because URI schemes cannot start with a digit.

## Repo mode vs discovery mode

- **Repo mode** — the server found a 0gzk checkout (via `--repo-root`,
  `OGZK_REPO_ROOT`, walking up from the cwd, or an explicit `--catalog
  path/to/index.json`). The catalog powers search/list/get, and all four
  authoring tools are registered.
- **Discovery mode** — no checkout, no catalog. Only the five discovery tools
  are registered, answered from the live registries; `get_circuit` fetches
  published bundles into `~/.0gzk/bundles/<rootHash>/` on demand.

## Client configuration

Claude Code:

```bash
claude mcp add 0gzk -- npx -y @0gzk/mcp
```

Claude Desktop / Cursor (JSON config):

```json
{
  "mcpServers": {
    "0gzk": {
      "command": "npx",
      "args": ["-y", "@0gzk/mcp"]
    }
  }
}
```

Working inside the 0gzk repo itself, use the checked-in `.mcp.json` (points at
`packages/mcp/dist/bin.js`), or pass `--repo-root <path>`.

## Environment variables

| Variable | Effect |
| --- | --- |
| `OG_NETWORK` / `OGZK_NETWORK` | Selects the network that `OG_RPC_URL` applies to (`0g-mainnet`, `0g-testnet`, `base`, `base-sepolia`) |
| `OG_RPC_URL` | RPC override for the selected network only |
| `OGZK_REGISTRY_ADDRESS_BASE` | CircuitRegistry address on Base (when not built in) |
| `OGZK_REGISTRY_ADDRESS_BASE_SEPOLIA` | CircuitRegistry address on Base Sepolia (when not built in) |
| `OGZK_REPO_ROOT` | Path to a 0gzk checkout (enables repo mode) |
| `OGZK_CACHE_DIR` | Bundle cache dir (default `~/.0gzk/bundles`) |

## Library usage

The package is also importable: `@0gzk/mcp` (server + context),
`@0gzk/mcp/catalog` (catalog generate/load/search/README table), and
`@0gzk/mcp/tools` (transport-agnostic tool definitions).
