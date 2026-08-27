/**
 * Dynamic-import seam for @anthropic-ai/claude-agent-sdk. The SDK is an
 * OPTIONAL peer dependency: it bundles a native per-platform binary, so plain
 * `npm i -g @0gzk/cli` users shouldn't pay for it unless they use `0gzk agent`.
 */

export type AgentSdkModule = typeof import("@anthropic-ai/claude-agent-sdk");

export async function loadAgentSdk(): Promise<AgentSdkModule> {
  try {
    return await import("@anthropic-ai/claude-agent-sdk");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new Error(
        "0gzk agent needs the Claude Agent SDK, which is not installed:\n" +
          "  npm install -g @anthropic-ai/claude-agent-sdk     (global CLI)\n" +
          "  pnpm add @anthropic-ai/claude-agent-sdk           (inside a project)\n" +
          "Then re-run `0gzk agent`. Requires ANTHROPIC_API_KEY " +
          "(or `0gzk config set anthropicApiKey sk-ant-...`).",
      );
    }
    throw err;
  }
}
