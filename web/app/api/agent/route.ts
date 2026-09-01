import { NextResponse } from "next/server";

import { runAgentTurn, type ChatMessage } from "@/lib/server/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 4000;
/** Tool results carry schemas and public signals, so they get more room. */
const MAX_TOOL_RESULT_LENGTH = 20_000;
const MAX_TOOL_CALLS = 8;
/** Serialized size cap for a replayed tool_calls array. */
const MAX_TOOL_CALLS_BYTES = 24_000;
/** Whole-body cap, checked before parsing anything. */
const MAX_BODY_BYTES = 512_000;

function validate(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const out: ChatMessage[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") return null;
    const { role, content, tool_calls, tool_call_id } = entry as {
      role?: unknown;
      content?: unknown;
      tool_calls?: unknown;
      tool_call_id?: unknown;
    };

    // Results of tools the CLI ran locally (proving, local files).
    if (role === "tool") {
      if (typeof tool_call_id !== "string" || typeof content !== "string") return null;
      if (content.length > MAX_TOOL_RESULT_LENGTH) return null;
      out.push({ role, tool_call_id, content });
      continue;
    }

    if (role !== "user" && role !== "assistant") return null;

    // Assistant turn that requested tools: content may be null/empty. These
    // are replayed verbatim to the model, so bound them like everything else
    // rather than trusting the client.
    if (role === "assistant" && Array.isArray(tool_calls)) {
      if (tool_calls.length > MAX_TOOL_CALLS) return null;
      if (typeof content === "string" && content.length > MAX_MESSAGE_LENGTH) return null;
      if (JSON.stringify(tool_calls).length > MAX_TOOL_CALLS_BYTES) return null;
      out.push({
        role,
        content: typeof content === "string" ? content : null,
        tool_calls,
      });
      continue;
    }

    if (typeof content !== "string" || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      return null;
    }
    out.push({ role, content });
  }

  // Each request must be driven by something new: a user turn, or the results
  // of tools the CLI just ran.
  const last = out[out.length - 1]!;
  if (last.role !== "user" && last.role !== "tool") return null;
  return out;
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const messages = validate(body);
  if (!messages) {
    return NextResponse.json(
      {
        error:
          "Expected { messages: [...] } of user/assistant/tool turns " +
          `(at most ${MAX_MESSAGES} messages of ${MAX_MESSAGE_LENGTH} chars, ending with a user ` +
          "message or the results of client-side tool calls)",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runAgentTurn(messages);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("OPENAI_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
