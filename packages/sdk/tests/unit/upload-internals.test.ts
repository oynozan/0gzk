import { describe, expect, it, vi } from "vitest";

import {
  interceptUploadLogs,
  parseUploadLogLine,
  withTimeout,
  type ProgressTracker,
} from "../../src/node/upload-internals.js";
import type { UploadProgress } from "../../src/node/storage-types.js";

function blankTracker(): ProgressTracker {
  return { lastProgress: undefined, rootHash: undefined };
}

describe("parseUploadLogLine", () => {
  it("extracts rootHash on first sighting and ignores subsequent occurrences", () => {
    const tracker = blankTracker();
    const seen = { value: false };
    const first = parseUploadLogLine(
      "tx: { dataMerkleRoot: '0xaaaa000000000000000000000000000000000000000000000000000000000000' }",
      tracker,
      seen,
    );
    expect(first.event?.stage).toBe("streaming");
    expect(first.event?.rootHash).toBe(
      "0xaaaa000000000000000000000000000000000000000000000000000000000000",
    );
    expect(tracker.rootHash).toBe(
      "0xaaaa000000000000000000000000000000000000000000000000000000000000",
    );

    const second = parseUploadLogLine(
      "tx: { dataMerkleRoot: '0xbbbb000000000000000000000000000000000000000000000000000000000000' }",
      tracker,
      seen,
    );
    expect(second.event).toBeUndefined();
    // rootHash sticks on the tracker; we don't overwrite mid-upload.
    expect(tracker.rootHash).toBe(
      "0xaaaa000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("emits a segment-progress event for uploadedSegNum lines", () => {
    const tracker = blankTracker();
    tracker.rootHash = "0xrh";
    const { event, suppress } = parseUploadLogLine(
      "{ uploadedSegNum: 4, pruned: false }",
      tracker,
      { value: false },
    );
    expect(event).toMatchObject({
      stage: "streaming",
      uploadedSegments: 4,
      rootHash: "0xrh",
    });
    expect(suppress).toBe(true);
  });

  it("emits exactly one 'finalizing' event for repeated 'not finalized yet' lines", () => {
    const tracker = blankTracker();
    const seen = { value: false };
    const a = parseUploadLogLine(
      "Log entry is available, but not finalized yet",
      tracker,
      seen,
    );
    const b = parseUploadLogLine(
      "Log entry is available, but not finalized yet",
      tracker,
      seen,
    );
    expect(a.event?.stage).toBe("finalizing");
    expect(a.event?.finalized).toBe(false);
    expect(a.suppress).toBe(true);
    // Repeat fires no event and stays suppressed.
    expect(b.event).toBeUndefined();
    expect(b.suppress).toBe(true);
    expect(seen.value).toBe(true);
  });

  it("emits a 'finalized' event when the SDK confirms quorum", () => {
    const tracker = blankTracker();
    tracker.rootHash = "0xrh";
    const { event, suppress } = parseUploadLogLine(
      "Log entry is finalized",
      tracker,
      { value: false },
    );
    expect(event).toMatchObject({
      stage: "finalizing",
      finalized: true,
      rootHash: "0xrh",
    });
    expect(suppress).toBe(true);
  });

  it("passes through unrecognised lines so genuine errors surface", () => {
    const tracker = blankTracker();
    const { event, suppress } = parseUploadLogLine(
      "warning: some unrelated message",
      tracker,
      { value: false },
    );
    expect(event).toBeUndefined();
    expect(suppress).toBe(false);
  });
});

describe("interceptUploadLogs", () => {
  it("translates SDK console.log lines into onProgress events", () => {
    const events: UploadProgress[] = [];
    const tracker = blankTracker();
    const restore = interceptUploadLogs((e) => events.push(e), tracker);

    try {
      console.log(
        "tx:",
        "{ dataMerkleRoot:",
        "'0xdead000000000000000000000000000000000000000000000000000000000000'",
        "}",
      );
      console.log("{ uploadedSegNum: 1 }");
      console.log("{ uploadedSegNum: 2 }");
      console.log("Log entry is available, but not finalized yet");
      console.log("Log entry is available, but not finalized yet");
    } finally {
      restore();
    }

    expect(events.map((e) => e.stage)).toEqual([
      "streaming", // rootHash
      "streaming", // seg 1
      "streaming", // seg 2
      "finalizing", // first not-yet
      // second not-yet is suppressed
    ]);
    expect(events[0]!.rootHash).toBe(
      "0xdead000000000000000000000000000000000000000000000000000000000000",
    );
    expect(events[1]!.uploadedSegments).toBe(1);
    expect(events[2]!.uploadedSegments).toBe(2);
    expect(events[3]!.finalized).toBe(false);
  });

  it("restores console.log + console.error after teardown", () => {
    const originalLog = console.log;
    const originalErr = console.error;
    const restore = interceptUploadLogs(() => undefined, blankTracker());
    expect(console.log).not.toBe(originalLog);
    expect(console.error).not.toBe(originalErr);
    restore();
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalErr);
  });

  it("forwards unrecognised lines to the real console (asserted via spy)", () => {
    const spy = vi.spyOn(console, "log");
    const original = spy.getMockImplementation();
    spy.mockImplementation(() => undefined); // silence

    const tracker = blankTracker();
    const restore = interceptUploadLogs(() => undefined, tracker);
    try {
      console.log("unrelated message");
    } finally {
      restore();
    }

    // The wrapped console.log we just exited should have called the
    // underlying spy at least once with the unrelated message.
    const forwarded = spy.mock.calls.flat().some((arg) => arg === "unrelated message");
    expect(forwarded).toBe(true);

    if (original) spy.mockImplementation(original);
    else spy.mockRestore();
  });
});

describe("withTimeout", () => {
  it("resolves with kind:'value' when the promise wins", async () => {
    const out = await withTimeout(Promise.resolve(42), 1_000);
    expect(out).toEqual({ kind: "value", value: 42 });
  });

  it("resolves with kind:'timeout' when the deadline wins", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));
    const out = await withTimeout(slow, 10);
    expect(out.kind).toBe("timeout");
  });

  it("ignores the timeout when timeoutMs is non-positive or non-finite", async () => {
    await expect(withTimeout(Promise.resolve("a"), 0)).resolves.toEqual({
      kind: "value",
      value: "a",
    });
    await expect(withTimeout(Promise.resolve("b"), Infinity)).resolves.toEqual({
      kind: "value",
      value: "b",
    });
  });
});
