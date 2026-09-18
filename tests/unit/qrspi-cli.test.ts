import { describe, expect, test } from "bun:test";
import { LIMITS } from "../../src/tools/protocol";
import { parseCommand, parseStdin } from "../../src/tools/qrspi";
import { createTestRepository, invokeQrspi } from "../helpers/repository";

describe("QRSPI CLI grammar", () => {
  test("parses the literal terminator and preserves description tokens", () => {
    expect(parseCommand([
      "router",
      "--new",
      "--task-id",
      "cli-phases",
      "--",
      "keep",
      "--flags",
      "literal",
    ])).toEqual({ kind: "new", taskId: "cli-phases", description: "keep --flags literal" });
    expect(parseCommand([
      "router",
      "--new",
      "--task-id",
      "cli-phases",
      "--",
      "  valid whitespace  ",
    ])).toEqual({ kind: "new", taskId: "cli-phases", description: "  valid whitespace  " });
  });

  test("rejects empty descriptions and strict grammar violations", () => {
    for (const args of [
      ["router", "--new", "--task-id", "task", "--"],
      ["router", "--new", "--task-id", "a", "--task-id", "b", "--", "description"],
      ["router", "--resume", "--task-id", "a", "extra"],
      ["task", "bootstrap", "--input", "file.json"],
      ["phase", "enter", "--phase", "question", "--phase", "research"],
      ["unknown"],
    ]) {
      expect(() => parseCommand(args)).toThrow();
    }
  });

  test("rejects removed and terminal phases as executable", () => {
    for (const phase of ["worktree", "done"]) {
      expect(() => parseCommand(["phase", "enter", "--phase", phase])).toThrow();
    }
  });

  test("parses exactly one exact bootstrap object", () => {
    expect(parseStdin('{"task_id":"task","description":"d","references":[]}')).toEqual({
      task_id: "task",
      description: "d",
      references: [],
    });
    for (const input of [
      "",
      "not json",
      '{}{}',
      '{"task_id":"task","description":"d","references":[],"extra":true}',
      '{"task_id":"task","description":"d","references":[{"source":"x","extra":true}]}',
    ]) {
      expect(() => parseStdin(input)).toThrow();
    }
  });

  test("emits help as plain text and failures as one JSON value on stderr", async () => {
    const repository = await createTestRepository();
    try {
      const help = await invokeQrspi(repository.root, ["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toStartWith("Usage:\n");
      expect(help.stderr).toBe("");

      const failure = await invokeQrspi(repository.root, ["unknown"]);
      expect(failure.exitCode).toBe(2);
      expect(failure.stdout).toBe("");
      expect(failure.stderr.endsWith("\n")).toBe(true);
      expect(JSON.parse(failure.stderr).error.code).toBe("usage-error");
      expect(new TextEncoder().encode(failure.stderr).byteLength).toBeLessThanOrEqual(
        LIMITS.failure_document_bytes,
      );
    } finally {
      await repository.cleanup();
    }
  });
});
