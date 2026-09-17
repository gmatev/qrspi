import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installDistribution } from "../../scripts/install";
import { fileExists } from "../helpers/repository";

describe("installer", () => {
  test("installs harness-specific project layouts and is idempotent", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-install-layout-"));
    const claudeDestination = join(temporaryRoot, "claude-project");
    const codexDestination = join(temporaryRoot, "codex-project");
    try {
      await Promise.all([
        mkdir(claudeDestination, { recursive: true }),
        mkdir(codexDestination, { recursive: true }),
      ]);

      const claude = await installDistribution({
        destination: claudeDestination,
        harness: "claude",
        outputRoot: join(temporaryRoot, "claude-dist"),
      });
      const codexOutputRoot = join(temporaryRoot, "codex-dist");
      const codex = await installDistribution({
        destination: codexDestination,
        harness: "codex",
        outputRoot: codexOutputRoot,
      });

      expect(claude.installed).toBeGreaterThan(0);
      expect(codex.installed).toBeGreaterThan(claude.installed);
      expect(
        await fileExists(
          claudeDestination,
          ".claude",
          "agents",
          "codebase-analyzer.md",
        ),
      ).toBe(true);
      expect(
        await fileExists(
          codexDestination,
          ".codex",
          "agents",
          "codebase-analyzer.toml",
        ),
      ).toBe(true);
      expect(
        await fileExists(
          codexDestination,
          ".agents",
          "skills",
          "qrspi-question",
          "SKILL.md",
        ),
      ).toBe(true);

      const repeated = await installDistribution({
        destination: codexDestination,
        harness: "codex",
        outputRoot: codexOutputRoot,
      });
      expect(repeated).toEqual({ installed: 0, overwritten: 0, skipped: codex.installed });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("refuses conflicts by default and replaces them with force", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-install-conflict-"));
    const destination = join(temporaryRoot, "project");
    const outputRoot = join(temporaryRoot, "dist");
    const target = join(destination, ".codex", "agents", "codebase-analyzer.toml");
    try {
      await mkdir(destination, { recursive: true });
      await installDistribution({ destination, harness: "codex", outputRoot });
      await writeFile(target, "local change");

      await expect(
        installDistribution({ destination, harness: "codex", outputRoot }),
      ).rejects.toThrow("installation would overwrite existing paths");
      expect(await readFile(target, "utf8")).toBe("local change");

      const forced = await installDistribution({
        destination,
        force: true,
        harness: "codex",
        outputRoot,
      });
      expect(forced.overwritten).toBe(1);
      expect(await readFile(target, "utf8")).not.toBe("local change");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("merges hooks without changing unrelated project configuration", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-install-merge-"));
    const claudeDestination = join(temporaryRoot, "claude-project");
    const codexDestination = join(temporaryRoot, "codex-project");
    try {
      await mkdir(join(claudeDestination, ".claude"), { recursive: true });
      await mkdir(join(codexDestination, ".codex"), { recursive: true });
      await writeFile(
        join(claudeDestination, ".claude", "settings.json"),
        JSON.stringify({
          permissions: { allow: ["Read"] },
          hooks: {
            SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "node existing.js" }] }],
          },
        }),
      );
      await writeFile(
        join(codexDestination, ".codex", "hooks.json"),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "node existing.js" }] }],
          },
        }),
      );

      await installDistribution({
        destination: claudeDestination,
        harness: "claude",
        outputRoot: join(temporaryRoot, "claude-dist"),
      });
      await installDistribution({
        destination: codexDestination,
        harness: "codex",
        outputRoot: join(temporaryRoot, "codex-dist"),
      });

      const claude = JSON.parse(
        await readFile(join(claudeDestination, ".claude", "settings.json"), "utf8"),
      );
      const codex = JSON.parse(
        await readFile(join(codexDestination, ".codex", "hooks.json"), "utf8"),
      );
      expect(claude.permissions).toEqual({ allow: ["Read"] });
      expect(claude.hooks.SessionStart).toHaveLength(2);
      expect(claude.hooks.PostToolUse[0].matcher).toBe("EnterWorktree|ExitWorktree");
      expect(codex.hooks.PreToolUse[0].matcher).toBe("Bash");
      expect(codex.hooks.SessionStart[0].matcher).toBe("startup|resume|clear|compact");

      const repeated = await installDistribution({
        destination: claudeDestination,
        harness: "claude",
        outputRoot: join(temporaryRoot, "claude-dist"),
      });
      expect(repeated.installed).toBe(0);
      expect(repeated.overwritten).toBe(0);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("requires force to replace only conflicting QRSPI hook entries", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-install-hook-conflict-"));
    const destination = join(temporaryRoot, "project");
    const outputRoot = join(temporaryRoot, "dist");
    const hooksPath = join(destination, ".codex", "hooks.json");
    try {
      await mkdir(join(destination, ".codex"), { recursive: true });
      const unrelated = {
        matcher: "Bash",
        hooks: [{ type: "command", command: "node existing.js" }],
      };
      await writeFile(
        hooksPath,
        JSON.stringify({
          custom: true,
          hooks: {
            SessionStart: [{
              hooks: [
                { type: "command", command: "bun .codex/hooks/qrspi-context.ts --old" },
                { type: "command", command: "node sibling.js" },
              ],
            }],
            PreToolUse: [unrelated],
          },
        }),
      );

      await expect(
        installDistribution({ destination, harness: "codex", outputRoot }),
      ).rejects.toThrow("conflicting QRSPI hook");

      await installDistribution({ destination, force: true, harness: "codex", outputRoot });
      const installed = JSON.parse(await readFile(hooksPath, "utf8"));
      expect(installed.custom).toBe(true);
      expect(installed.hooks.PreToolUse).toEqual([unrelated]);
      expect(installed.hooks.SessionStart).toHaveLength(2);
      expect(installed.hooks.SessionStart[0].hooks).toEqual([
        { type: "command", command: "node sibling.js" },
      ]);
      expect(installed.hooks.SessionStart[1].hooks[0].command).toContain(
        'qrspi-context.ts" codex',
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("rejects Codex inline hooks before writing any distribution files", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-install-inline-hooks-"));
    try {
      for (const [name, configuration] of [
        ["array-table", "[[hooks.SessionStart]]\ncommand = \"node existing.js\"\n"],
        ["spaced-table", "[ hooks ]\nSessionStart = []\n"],
        ["quoted-table", "[\"hooks\"]\nSessionStart = []\n"],
        ["inline-table", "hooks = { SessionStart = [] }\n"],
      ] as const) {
        const destination = join(temporaryRoot, name);
        await mkdir(join(destination, ".codex"), { recursive: true });
        await writeFile(join(destination, ".codex", "config.toml"), configuration);

        await expect(
          installDistribution({
            destination,
            harness: "codex",
            outputRoot: join(temporaryRoot, "dist"),
          }),
        ).rejects.toThrow("inline hooks");
        expect(await fileExists(destination, ".codex", "tools", "qrspi.ts")).toBe(false);
      }

      const stringOnlyDestination = join(temporaryRoot, "string-only");
      await mkdir(join(stringOnlyDestination, ".codex"), { recursive: true });
      await writeFile(
        join(stringOnlyDestination, ".codex", "config.toml"),
        'message = """\n[hooks]\n"""\n',
      );
      await installDistribution({
        destination: stringOnlyDestination,
        harness: "codex",
        outputRoot: join(temporaryRoot, "dist"),
      });
      expect(await fileExists(stringOnlyDestination, ".codex", "hooks.json")).toBe(true);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
