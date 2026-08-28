import { NextResponse } from "next/server";

import { runAgentTurn, type ChatMessage } from "@/lib/server/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;

function validate(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }
  const out: ChatMessage[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") return null;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      return null;
    }
    out.push({ role, content });
  }
  if (out[out.length - 1]!.role !== "user") return null;
  return out;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const messages = validate(body);
  if (!messages) {
    return NextResponse.json(
      {
        error:
          "Expected { messages: [{ role: 'user' | 'assistant', content: string }, ...] } " +
          `(at most ${MAX_MESSAGES} messages of ${MAX_MESSAGE_LENGTH} chars, ending with a user message)`,
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
