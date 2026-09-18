import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageDistributions } from "../../scripts/package";
import { fileExists, repositoryPath } from "../helpers/repository";

describe("packageDistributions", () => {
  test("packages the shared runtime outside skills for both harnesses", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-package-scripts-"));
    const outputRoot = join(temporaryRoot, "dist");
    try {
      await packageDistributions({ outputRoot });
      const source = await readFile(repositoryPath("src", "tools", "qrspi.ts"), "utf8");
      expect(await readFile(join(outputRoot, "claude", ".claude", "tools", "qrspi.ts"), "utf8")).toBe(source);
      expect(await readFile(join(outputRoot, "codex", ".codex", "tools", "qrspi.ts"), "utf8")).toBe(source);
      expect(await fileExists(outputRoot, "claude", ".claude", "skills", "qrspi", "scripts")).toBe(false);
      expect(await fileExists(outputRoot, "codex", ".agents", "skills", "qrspi", "scripts")).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("preserves skill-owned scripts and references recursively", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-package-resources-"));
    const repositoryRoot = join(temporaryRoot, "repository");
    const outputRoot = join(temporaryRoot, "dist");
    const script = "console.log('skill helper');\n";
    try {
      await cp(repositoryPath("src"), join(repositoryRoot, "src"), { recursive: true });
      await cp(repositoryPath("harness"), join(repositoryRoot, "harness"), {
        recursive: true,
      });
      const scriptRoot = join(repositoryRoot, "src", "skills", "qrspi", "scripts", "nested");
      await mkdir(scriptRoot, { recursive: true });
      await writeFile(join(scriptRoot, "helper.ts"), script);

      await packageDistributions({ repositoryRoot, outputRoot });

      expect(await readFile(join(outputRoot, "claude", ".claude", "skills", "qrspi", "scripts", "nested", "helper.ts"), "utf8")).toBe(script);
      expect(await readFile(join(outputRoot, "codex", ".agents", "skills", "qrspi", "scripts", "nested", "helper.ts"), "utf8")).toBe(script);
      for (const root of [
        join(outputRoot, "claude", ".claude", "skills", "qrspi"),
        join(outputRoot, "codex", ".agents", "skills", "qrspi"),
      ]) {
        expect(await fileExists(root, "references", "task-resume.md")).toBe(true);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

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
