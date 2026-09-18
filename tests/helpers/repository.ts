import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const repositoryRoot = resolve(import.meta.dir, "..", "..");

export interface MarkdownFile<T = Record<string, unknown>> {
  attributes: T;
  body: string;
}

export function repositoryPath(...segments: string[]): string {
  return join(repositoryRoot, ...segments);
}

export async function entryNames(path: string): Promise<string[]> {
  return (await readdir(path)).sort();
}

export async function fileExists(...segments: string[]): Promise<boolean> {
  try {
    await access(join(...segments));
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readTomlFile<T = unknown>(path: string): Promise<T> {
  return Bun.TOML.parse(await readFile(path, "utf8")) as T;
}

export async function readYamlFile<T = unknown>(path: string): Promise<T> {
  return parseYaml(await readFile(path, "utf8")) as T;
}

export async function readMarkdownFile<T = Record<string, unknown>>(
  path: string,
): Promise<MarkdownFile<T>> {
  const source = await readFile(path, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);

  if (!match?.[1]) {
    throw new Error(`${path} does not contain valid YAML frontmatter`);
  }

  return {
    attributes: parseYaml(match[1]) as T,
    body: match[2] ?? "",
  };
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TestRepository {
  root: string;
  cleanup(): Promise<void>;
}

export async function runProcess(
  command: readonly string[],
  cwd: string,
  stdin?: string,
): Promise<ProcessResult> {
  const process = Bun.spawn([...command], {
    cwd,
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    const input = process.stdin;
    if (input === undefined || typeof input === "number") {
      throw new Error("process stdin was not writable");
    }
    input.write(stdin);
    input.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

export async function runGit(cwd: string, ...args: string[]): Promise<ProcessResult> {
  return runProcess(["git", ...args], cwd);
}

export async function createTestRepository(options: { configured?: boolean } = {}): Promise<TestRepository> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qrspi-repository-"));
  const root = join(temporaryRoot, "repository");
  await mkdir(root);
  const initialized = await runGit(root, "init", "-q");
  if (initialized.exitCode !== 0) throw new Error(initialized.stderr);
  await runGit(root, "config", "user.name", "QRSPI Tests");
  await runGit(root, "config", "user.email", "qrspi@example.invalid");
  await writeFile(
    join(root, ".gitignore"),
    options.configured === false
      ? "dist/\n"
      : "dist/\n/.qrspi/tasks/\n/.qrspi/worktrees/\n",
  );
  await writeFile(join(root, "tracked.txt"), "initial\n");
  const added = await runGit(root, "add", ".gitignore", "tracked.txt");
  if (added.exitCode !== 0) throw new Error(added.stderr);
  const committed = await runGit(root, "commit", "-qm", "test fixture");
  if (committed.exitCode !== 0) throw new Error(committed.stderr);
  return {
    root,
    async cleanup() {
      await rm(temporaryRoot, { recursive: true, force: true });
    },
  };
}

export async function invokeQrspi(
  cwd: string,
  args: readonly string[],
  stdin?: string,
): Promise<ProcessResult> {
  return runProcess(
    ["bun", repositoryPath("src", "tools", "qrspi.ts"), ...args],
    cwd,
    stdin,
  );
}
