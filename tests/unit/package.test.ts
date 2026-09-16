import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistributions } from "../../scripts/package";
import { fileExists, repositoryPath } from "../helpers/repository";

describe("packageDistributions", () => {
  test("removes stale generated files on every build", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-package-clean-"));
    const outputRoot = join(temporaryRoot, "dist");
    try {
      await packageDistributions({ outputRoot });
      await writeFile(join(outputRoot, "stale.txt"), "stale");

      await packageDistributions({ outputRoot });

      expect(await fileExists(outputRoot, "stale.txt")).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("rejects incomplete harness model mappings before replacing output", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-package-validation-"));
    const repositoryRoot = join(temporaryRoot, "repository");
    const outputRoot = join(temporaryRoot, "dist");
    try {
      await cp(repositoryPath("src"), join(repositoryRoot, "src"), { recursive: true });
      await cp(repositoryPath("harness"), join(repositoryRoot, "harness"), {
        recursive: true,
      });
      await packageDistributions({ repositoryRoot, outputRoot });
      await writeFile(join(outputRoot, "sentinel.txt"), "preserve me");

      const configPath = join(repositoryRoot, "harness", "codex", "agents.toml");
      const config = Bun.TOML.parse(await readFile(configPath, "utf8")) as {
        agents: Record<string, unknown>;
      };
      delete config.agents["codebase-locator"];
      await writeFile(configPath, Bun.TOML.stringify(config) ?? "");

      await expect(
        packageDistributions({ repositoryRoot, outputRoot }),
      ).rejects.toThrow("missing: codebase-locator");
      expect(await readFile(join(outputRoot, "sentinel.txt"), "utf8")).toBe("preserve me");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
