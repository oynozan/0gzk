import "server-only";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  buildMcpServer,
  clientToolDefs,
  discoveryToolDefs,
  CLIENT_TOOL_NAMES,
  type ServerContext,
  type Catalog,
} from "@0gzk/mcp";

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
  "You are the 0gzk agent. You do not just advise — you DO the work: find the right",
  "circuit, collect the user's values, validate them, generate the proof, and save it.",
  "",
  "## How to run a job",
  "1. Find the circuit with search_circuits / get_circuit if it is not already obvious.",
  "2. Show the user the exact inputs it needs (validate_inputs with no inputs returns the",
  "   schema) and ASK for any values you do not have. Name each signal, its type, and",
  "   whether it is public or private.",
  "3. When the user gives values — or points at a JSON file — call validate_inputs first.",
  "   If it reports errors, explain them in plain language and ask for corrections.",
  "4. Once valid, CALL prove_circuit. Do not tell the user to run a command themselves;",
  "   running it is your job. Pass outDir so the artifacts are saved (default './proof').",
  "   If the user referenced a file, pass inputFile instead of inputs.",
  "5. Report the outcome: verified true/false, the public signals and what they mean,",
  "   and where the files were written.",
  "",
  "validate_inputs, read_input_file and prove_circuit run on the USER's machine, not on",
  "the server — private inputs never leave their device. Never ask a user to paste a",
  "secret you do not need, and never repeat their private values back to them.",
  "",
  "If a user just asks a question, answer it. Only start the job flow when they want a proof.",
  "",
  "0gzk in one breath: Circom circuits compiled to Groth16 (bn128, snarkjs) ship as",
  "content-addressed bundles on decentralized storage (0G Storage or IPFS); an on-chain",
  "CircuitRegistry maps name@version to the bundle on 0G mainnet/testnet and Base;",
  "proving is always client-side, witnesses never leave the machine.",
  "",
  "Rules:",
  "- ALWAYS call search_circuits before saying no circuit fits a need.",
  "- Never invent rootHashes, addresses, versions, or public signals — resolve or compute them.",
  "- Default chain is Base; say so if it matters, and use 0g-mainnet only when asked.",
  "- Be concise. Ask for missing values in one short list rather than one at a time.",
  "- To author NEW circuits (scaffold/compile), point users at `0gzk agent --local`",
  "  inside a repo checkout, or the @0gzk/mcp server in their editor.",
  "",
  "Available circuits: " + catalog.circuits.map((c) => c.name).join(", "),
].join("\n");

export interface AgentTraceEntry {
  tool: string;
  args: string;
  summary: string;
}

export interface ClientToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentTurnResult {
  /** false when the CLI must run `clientToolCalls` and post the results back. */
  done: boolean;
  reply: string;
  trace: AgentTraceEntry[];
  model: string;
  /** Tools the CLI must execute locally (proving, local files). */
  clientToolCalls?: ClientToolCall[];
  /** Conversation so far, echoed so the endpoint stays stateless. */
  messages?: Array<Record<string, unknown>>;
}

/**
 * Wire format. Beyond plain user/assistant turns the CLI also replays the
 * assistant tool-call messages and its own local tool results, so the server
 * needs no session state.
 */
export type ChatMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

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
  const served = tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));

  // Client-side tools are declared to the model but never executed here: the
  // CLI runs them so the witness stays on the user's machine.
  const delegated = clientToolDefs.map((def) => ({
    type: "function" as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(z.object(def.schema)) as Record<string, unknown>,
    },
  }));

  const servedNames = new Set(served.map((t) => t.function.name));
  return [...served, ...delegated.filter((t) => !servedNames.has(t.function.name))];
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
      return { done: true, reply: message.content ?? "", trace, model: MODEL };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });

    // If the model wants anything that touches the user's machine, hand the
    // whole batch back: the CLI executes it and posts the results to continue.
    const delegated = message.tool_calls.filter((c) => CLIENT_TOOL_NAMES.includes(c.function.name));
    if (delegated.length > 0) {
      // Server-side calls in the same batch still run here, so the CLI only
      // ever has to handle the local ones.
      for (const call of message.tool_calls) {
        if (CLIENT_TOOL_NAMES.includes(call.function.name)) continue;
        const resultText = await callMcpTool(client, call.function.name, call.function.arguments);
        trace.push({
          tool: call.function.name,
          args: firstLine(call.function.arguments ?? "", 90),
          summary: firstLine(resultText),
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: resultText });
      }
      return {
        done: false,
        reply: message.content ?? "",
        trace,
        model: MODEL,
        clientToolCalls: delegated.map((c) => ({
          id: c.id,
          name: c.function.name,
          arguments: c.function.arguments,
        })),
        // Drop the system prompt: the next request re-adds it.
        messages: messages.slice(1),
      };
    }

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
    done: true,
    reply: "I hit the tool budget for this question — try narrowing it down.",
    trace,
    model: MODEL,
  };
}
