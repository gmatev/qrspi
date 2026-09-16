import { copyFile, lstat, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { packageDistributions, type Harness } from "./package.ts";

interface InstallOptions {
  destination: string;
  force?: boolean;
  harness: Harness;
  outputRoot?: string;
  repositoryRoot?: string;
}

export interface InstallResult {
  installed: number;
  overwritten: number;
  skipped: number;
}

const defaultRepositoryRoot = resolve(import.meta.dir, "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathStat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    } else {
      throw new Error(`unsupported distribution entry: ${path}`);
    }
  }
  return files;
}

async function conflictingParent(path: string, destination: string): Promise<string | undefined> {
  let current = dirname(path);
  while (current !== destination) {
    const currentStat = await pathStat(current);
    if (currentStat && !currentStat.isDirectory()) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function assertInsideDestination(path: string, destination: string): void {
  const pathFromDestination = relative(destination, path);
  if (
    pathFromDestination === ".." ||
    pathFromDestination.startsWith(`..${sep}`) ||
    resolve(path) === resolve(destination)
  ) {
    throw new Error(`refusing to install outside destination: ${path}`);
  }
}

export async function installDistribution(options: InstallOptions): Promise<InstallResult> {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot);
  const outputRoot = resolve(options.outputRoot ?? join(repositoryRoot, "dist"));
  const destination = resolve(options.destination);
  const destinationStat = await pathStat(destination);
  if (!destinationStat?.isDirectory()) {
    throw new Error(`destination must be an existing directory: ${destination}`);
  }

  await packageDistributions({ repositoryRoot, outputRoot });
  const distributionRoot = join(outputRoot, options.harness);
  const files = await listFiles(distributionRoot);
  const conflicts: string[] = [];
  const states = new Map<string, "new" | "same" | "overwrite">();

  for (const file of files) {
    const source = join(distributionRoot, file);
    const target = resolve(destination, file);
    assertInsideDestination(target, destination);

    const parentConflict = await conflictingParent(target, destination);
    if (parentConflict) {
      conflicts.push(`${relative(destination, parentConflict)} blocks a directory`);
      continue;
    }

    const targetStat = await pathStat(target);
    if (!targetStat) {
      states.set(file, "new");
      continue;
    }
    if (!targetStat.isFile()) {
      conflicts.push(`${file} exists and is not a file`);
      continue;
    }

    const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
    if (sourceBytes.equals(targetBytes)) {
      states.set(file, "same");
    } else if (options.force) {
      states.set(file, "overwrite");
    } else {
      conflicts.push(file);
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `installation would overwrite existing paths:\n${conflicts.map((path) => `- ${path}`).join("\n")}\nRe-run with --force to replace conflicting files.`,
    );
  }

  const result: InstallResult = { installed: 0, overwritten: 0, skipped: 0 };
  for (const file of files) {
    const state = states.get(file);
    if (state === "same") {
      result.skipped += 1;
      continue;
    }
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(distributionRoot, file), target);
    if (state === "overwrite") result.overwritten += 1;
    else result.installed += 1;
  }
  return result;
}

function parseHarness(value: string | undefined): Harness {
  if (value === "claude" || value === "codex") return value;
  throw new Error("harness must be claude or codex");
}

if (import.meta.main) {
  const arguments_ = Bun.argv.slice(2);
  const forceIndex = arguments_.indexOf("--force");
  const force = forceIndex !== -1;
  if (force) arguments_.splice(forceIndex, 1);

  try {
    if (arguments_.length !== 2) {
      throw new Error("Usage: bun scripts/install.ts <claude|codex> <destination> [--force]");
    }
    const [harnessValue, destination] = arguments_;
    if (destination === undefined) throw new Error("destination is required");
    const harness = parseHarness(harnessValue);
    const result = await installDistribution({ destination, force, harness });
    console.log(
      `Installed QRSPI for ${harness}: ${result.installed} new, ${result.overwritten} replaced, ${result.skipped} unchanged.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
