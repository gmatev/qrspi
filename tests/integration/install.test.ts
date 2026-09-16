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
});
