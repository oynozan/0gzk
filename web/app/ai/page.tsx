import type { Metadata } from "next";

import { Block, Row } from "@/components/SpecSheet";
import { Command, Term } from "@/components/CommandRow";

export const metadata: Metadata = {
  title: "AI · 0gzk",
  description:
    "The 0gzk AI surface: a terminal agent that discovers and authors ZK circuits, and an MCP server that plugs the circuit catalog into Claude Code, Claude Desktop, and Cursor.",
};

const SAMPLE_SESSION = `$ 0gzk agent "which circuit proves someone is over 18?"

╭──────────────────────────────────────────╮
│ ✳ 0gzk agent                             │
│                                          │
│ model: gpt-5-nano (hosted)               │
│ tools: 5 discovery tools                 │
│ auth: none needed                        │
╰──────────────────────────────────────────╯

⏺ search_circuits({"query":"prove age over 18"})
  ⎿ age_verification (score 21) …
⏺ get_circuit({"name":"age_verification"})
  ⎿ { "source": "catalog", "inputs": { "birthYear": … } }

Use age_verification: private birthYear, public currentYear
and minAge, public isAdult output. Prove it with:

  0gzk prove --name age_verification input.json

────────────────────────────────────────
gpt-5-nano · 6.2s`;

const MCP_JSON = `{
  "mcpServers": {
    "0gzk": {
      "command": "npx",
      "args": ["-y", "@0gzk/mcp"]
    }
  }
}`;

export default function AiPage() {
  return (
    <div>
      <p
        style={{
          margin: "var(--space-5) 0 0",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--type-14)",
          color: "var(--text-mute)",
          letterSpacing: "0.02em",
          maxWidth: "62ch",
        }}
      >
        Ask for a proof in plain language. The agent finds the circuit, shows its
        schema, and proves it — or scaffolds a new one. The same nine tools plug
        into any MCP client.
      </p>

      <Block title="INSTALL" index="§ 01">
        <Row label="CLI" value={<Command text="npm i -g @0gzk/cli" />} unit="0gzk binary" />
        <Row label="SDK" value={<Command text="npm i @0gzk/sdk snarkjs" />} unit="for your own app" />
        <Row label="MCP" value={<Command text="claude mcp add 0gzk -- npx -y @0gzk/mcp" />} unit="Claude Code" />
      </Block>

      <Block title="AGENT" index="§ 02">
        <Row
          label="WHAT"
          value="a terminal chat assistant that knows every published circuit: search, schemas, example inputs, live registry records on 0G and Base"
        />
        <Row
          label="AUTH"
          value={
            <span style={{ color: "var(--ok)" }}>
              none — the agent talks to the hosted 0gzk backend; no LLM API key, ever
            </span>
          }
          unit="gpt-5-nano server-side"
        />
        <Row label="ONE-SHOT" value={<Command text='0gzk agent "which circuit fits a sealed-bid auction?"' />} />
        <Row label="CHAT" value={<Command text="0gzk agent" />} unit="interactive" />
        <Row
          label="LOCAL MODE"
          value={
            <span>
              <code style={{ color: "var(--text)" }}>0gzk agent --local</code> runs Claude
              in-process with the full authoring toolset (scaffold → build → prove) — uses
              your Anthropic key or Claude Code login
            </span>
          }
          unit="circuit authors"
        />
        <Row
          label="TRACE"
          value="every turn prints the tools it called and what they returned — no black box"
        />
        <Row label="SESSION" value={<Term>{SAMPLE_SESSION}</Term>} />
      </Block>

      <Block title="MCP SERVER" index="§ 03">
        <Row
          label="WHAT"
          value={
            <span>
              <code style={{ color: "var(--text)" }}>@0gzk/mcp</code> — a Model Context
              Protocol server. Any MCP client (Claude Code, Claude Desktop, Cursor)
              becomes a 0gzk circuit assistant
            </span>
          }
        />
        <Row label="CLAUDE CODE" value={<Command text="claude mcp add 0gzk -- npx -y @0gzk/mcp" />} />
        <Row
          label="DESKTOP / CURSOR"
          value={<Term>{MCP_JSON}</Term>}
          unit="claude_desktop_config.json · .cursor/mcp.json"
        />
        <Row label="search_circuits" tag="PUB" value="ranked search over names, tags, use cases, and I/O docs" />
        <Row label="list_circuits" tag="PUB" value="page the catalog or a live registry on any chain" />
        <Row label="get_circuit" tag="PUB" value="full schema + example input + a ready-to-run prove recipe" />
        <Row label="get_example_input" tag="PUB" value="a working input JSON for any reference circuit" />
        <Row label="resolve_circuit" tag="PUB" value="name@version → per-chain registry records" />
        <Row label="scaffold_circuit" tag="PRV" value="create a typed .circom skeleton + metadata + build script" />
        <Row label="validate_metadata" tag="PRV" value="schema-check a metadata.json, with discovery-field warnings" />
        <Row label="build_circuit" tag="PRV" value="circom compile + trusted setup into a publishable bundle" />
        <Row label="prove_circuit" tag="PRV" value="generate and verify a Groth16 proof for any bundle" />
        <Row
          label="MODES"
          value="[PUB] discovery tools work anywhere against the live registries; [PRV] authoring tools switch on inside a repo checkout"
          unit="repo · discovery"
        />
      </Block>

      <Block title="HOW DISCOVERY WORKS" index="§ 04">
        <Row
          label="CATALOG"
          value={
            <span>
              a committed, deterministic index (<code style={{ color: "var(--text)" }}>circuits/index.json</code>)
              built from every circuit&rsquo;s metadata, tags, use cases, constraint counts, and
              per-chain publications — regenerated by{" "}
              <code style={{ color: "var(--text)" }}>0gzk catalog build</code>, kept fresh by CI
            </span>
          }
        />
        <Row
          label="ON-CHAIN"
          value="anything not in the catalog is resolved live: registry record by name, bundle fetched by content address, verification key checked against the on-chain vkeyHash"
        />
        <Row
          label="CHAINS"
          value="0G mainnet · 0G testnet · Base · Base Sepolia — bundles on 0G Storage or IPFS, one registry contract everywhere"
        />
      </Block>
    </div>
  );
}
