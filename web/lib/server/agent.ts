import "server-only";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";
import {
  discoveryToolDefs,
  type ServerContext,
  type ToolDef,
  type Catalog,
} from "@0gzk/mcp";

import catalogJson from "../../../circuits/index.json";

/**
 * Hosted agent loop for `0gzk agent`: the CLI sends the conversation, this
 * module runs gpt-5-nano with the SAME discovery tools the MCP server
 * exposes, executes tool calls server-side, and returns the reply plus a
 * tool trace the CLI renders. Users never need an LLM key — OPENAI_API_KEY
 * lives in this deployment's env.
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

function toolByName(name: string): ToolDef | undefined {
  return discoveryToolDefs.find((d) => d.name === name);
}

function openAiTools() {
  return discoveryToolDefs.map((def) => ({
    type: "function" as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(z.object(def.schema)),
    },
  }));
}

function firstLine(text: string, max = 90): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function callOpenAi(
  apiKey: string,
  messages: Array<Record<string, unknown>>,
): Promise<OpenAiChoiceMessage> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools: openAiTools() }),
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

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];
  const trace: AgentTraceEntry[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await callOpenAi(apiKey, messages);

    if (!message.tool_calls?.length) {
      return { reply: message.content ?? "", trace, model: MODEL };
    }

    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });

    for (const call of message.tool_calls) {
      const def = toolByName(call.function.name);
      let resultText: string;
      if (!def) {
        resultText = `Unknown tool: ${call.function.name}`;
      } else {
        try {
          const args = z.object(def.schema).parse(JSON.parse(call.function.arguments || "{}"));
          const result = await def.handler(ctx, args as never);
          resultText = result.content.map((c) => c.text).join("\n");
        } catch (err) {
          resultText = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
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
