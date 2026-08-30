import "server-only";
import * as os from "node:os";
import * as path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { buildMcpServer, discoveryToolDefs, type ServerContext, type Catalog } from "@0gzk/mcp";

import catalogJson from "../../../circuits/index.json";

/**
 * Hosted agent loop for `0gzk agent`: the CLI sends the conversation, this
 * module runs gpt-5-nano against the 0gzk MCP server, and returns the reply
 * plus a tool trace the CLI renders. Users never need an LLM key —
 * OPENAI_API_KEY lives in this deployment's env.
 *
 * This is a real MCP client: it speaks the protocol (tools/list, tools/call)
 * to a real McpServer over an in-memory transport pair, rather than calling
 * the tool handlers directly. Same server the `0gzk-mcp` binary serves over
 * stdio — so the protocol path our users depend on is the one our own agent
 * exercises on every request. Only the read-only discovery tools are
 * registered; the authoring tools write to disk and must never be reachable
 * from a public endpoint.
 */

const MODEL = process.env.OGZK_AGENT_MODEL ?? "gpt-5-nano";
const MAX_TOOL_ROUNDS = 6;
// OPENAI_BASE_URL enables OpenAI-compatible backends (Azure, OpenRouter, stubs).
const OPENAI_URL = `${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

// The catalog ships inside the deployment bundle (build-time JSON import),
// so discovery needs no filesystem access at runtime.
const catalog = catalogJson as unknown as Catalog;

const ctx: ServerContext = {
  mode: "repo",
  catalog,
  cacheDir: process.env.OGZK_CACHE_DIR ?? path.join(os.tmpdir(), "0gzk-bundles"),
  toolNames: discoveryToolDefs.map((d) => d.name),
};

/**
 * One MCP client/server pair per process, connected lazily on first use and
 * reused across requests (a cold start pays the connect once).
 */
let mcpClientPromise: Promise<Client> | undefined;

async function getMcpClient(): Promise<Client> {
  mcpClientPromise ??= (async () => {
    const server = buildMcpServer(ctx, discoveryToolDefs);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "0gzk-hosted-agent", version: "1" }, { capabilities: {} });
    // The v1 client and v2 server transports share the same JSON-RPC wire
    // contract; the structural cast bridges the two SDK majors.
    await server.connect(serverTransport as never);
    await client.connect(clientTransport as never);
    return client;
  })().catch((err) => {
    mcpClientPromise = undefined; // let the next request retry a failed connect
    throw err;
  });
  return mcpClientPromise;
}

const SYSTEM_PROMPT = [
  "You are the 0gzk assistant: an expert guide to the 0gzk zero-knowledge circuit platform.",
  "Users are developers looking for the right ZK circuit, or trying to use one.",
  "",
  "0gzk in one breath: Circom circuits compiled to Groth16 (bn128, snarkjs) ship as",
  "content-addressed bundles on decentralized storage (0G Storage or IPFS); an on-chain",
  "CircuitRegistry maps name@version to the bundle on 0G mainnet/testnet and Base;",
  "proving is always client-side, witnesses never leave the machine.",
  "",
  "Rules:",
  "- ALWAYS call search_circuits before saying no circuit fits a need.",
  "- Use get_circuit for exact input/output schemas and a ready-to-run prove command.",
  "- Never invent rootHashes, addresses, or versions — resolve them with resolve_circuit.",
  "- Answer concretely: name the circuit, show the command, cite the chain.",
  "- To author new circuits, point users at `0gzk agent` inside a repo checkout,",
  "  or the scaffold/build tools of the @0gzk/mcp server.",
  "",
  "Available circuits: " + catalog.circuits.map((c) => c.name).join(", "),
].join("\n");

export interface AgentTraceEntry {
  tool: string;
  args: string;
  summary: string;
}

export interface AgentTurnResult {
  reply: string;
  trace: AgentTraceEntry[];
  model: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAiChoiceMessage {
  content: string | null;
  tool_calls?: OpenAiToolCall[];
}

/**
 * The tool list the model sees comes from the MCP server's own `tools/list`
 * response — not from a hand-maintained copy.
 */
async function openAiTools(client: Client) {
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));
}

/** Execute one tool over MCP and flatten its content blocks to text. */
async function callMcpTool(
  client: Client,
  name: string,
  argsJson: string,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch (err) {
    return `Tool error: arguments were not valid JSON (${
      err instanceof Error ? err.message : String(err)
    })`;
  }

  try {
    const result = await client.callTool({ name, arguments: args });
    const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
    return text || (result.isError ? "Tool reported an error with no message." : "(no output)");
  } catch (err) {
    // Unknown tool names and schema violations surface here as MCP errors.
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function firstLine(text: string, max = 90): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function callOpenAi(
  apiKey: string,
  messages: Array<Record<string, unknown>>,
  tools: Awaited<ReturnType<typeof openAiTools>>,
): Promise<OpenAiChoiceMessage> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${firstLine(body, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: OpenAiChoiceMessage }>;
  };
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error("OpenAI returned no choices");
  return message;
}

export async function runAgentTurn(history: ChatMessage[]): Promise<AgentTurnResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Agent backend is not configured (missing OPENAI_API_KEY).");
  }

  const client = await getMcpClient();
  const tools = await openAiTools(client);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];
  const trace: AgentTraceEntry[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await callOpenAi(apiKey, messages, tools);

    if (!message.tool_calls?.length) {
      return { reply: message.content ?? "", trace, model: MODEL };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });

    for (const call of message.tool_calls) {
      const resultText = await callMcpTool(client, call.function.name, call.function.arguments);
      trace.push({
        tool: call.function.name,
        args: firstLine(call.function.arguments ?? "", 90),
        summary: firstLine(resultText),
      });
      messages.push({ role: "tool", tool_call_id: call.id, content: resultText });
    }
  }

  return {
    reply: "I hit the tool budget for this question — try narrowing it down.",
    trace,
    model: MODEL,
  };
}
