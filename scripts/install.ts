import { copyFile, lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
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

function parseJsonObject(source: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${path} contains invalid JSON`);
  }
  if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
  return parsed;
}

function parseTomlObject(source: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(source);
  } catch {
    throw new Error(`${path} contains invalid TOML`);
  }
  if (!isRecord(parsed)) throw new Error(`${path} must contain a TOML table`);
  return parsed;
}

function isQrspiHook(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.command === "string" &&
    /[\\/]hooks[\\/]qrspi-context\.ts(?:"|\s|$)/u.test(value.command);
}

function qrspiPart(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !Array.isArray(value.hooks)) return undefined;
  const hooks = value.hooks.filter(isQrspiHook);
  return hooks.length === 0 ? undefined : { ...value, hooks };
}

function withoutQrspiHooks(value: unknown): unknown | undefined {
  if (!isRecord(value) || !Array.isArray(value.hooks)) return value;
  const hooks = value.hooks.filter((hook) => !isQrspiHook(hook));
  return hooks.length === 0 ? undefined : { ...value, hooks };
}

function mergeHookConfiguration(
  currentSource: string | undefined,
  desiredSource: string,
  path: string,
  force: boolean,
): { content: string; state: "new" | "same" | "overwrite" } {
  const desired = parseJsonObject(desiredSource, path);
  if (!isRecord(desired.hooks)) throw new Error(`${path} must define a hooks object`);
  if (currentSource === undefined) {
    return { content: `${JSON.stringify(desired, null, 2)}\n`, state: "new" };
  }

  const current = parseJsonObject(currentSource, path);
  if (current.hooks !== undefined && !isRecord(current.hooks)) {
    throw new Error(`${path} hooks must be an object`);
  }
  const mergedHooks: Record<string, unknown> = { ...(isRecord(current.hooks) ? current.hooks : {}) };
  for (const [event, desiredValue] of Object.entries(desired.hooks)) {
    if (!Array.isArray(desiredValue)) throw new Error(`${path} hooks.${event} must be an array`);
    const currentValue = mergedHooks[event];
    if (currentValue !== undefined && !Array.isArray(currentValue)) {
      throw new Error(`${path} hooks.${event} must be an array`);
    }
    const existing = currentValue ?? [];
    const owned = existing.flatMap((entry) => {
      const part = qrspiPart(entry);
      return part === undefined ? [] : [part];
    });
    if (owned.length > 0 && JSON.stringify(owned) !== JSON.stringify(desiredValue) && !force) {
      throw new Error(
        `installation found a conflicting QRSPI hook in ${path}; re-run with --force to replace only QRSPI-owned hook entries`,
      );
    }
    const unrelated = existing.flatMap((entry) => {
      const remaining = withoutQrspiHooks(entry);
      return remaining === undefined ? [] : [remaining];
    });
    mergedHooks[event] = [...unrelated, ...desiredValue];
  }
  const merged = { ...current, hooks: mergedHooks };
  const content = `${JSON.stringify(merged, null, 2)}\n`;
  const normalizedCurrent = `${JSON.stringify(current, null, 2)}\n`;
  return { content, state: content === normalizedCurrent ? "same" : "overwrite" };
}

async function writeFileAtomically(path: string, content: string): Promise<void> {
  const temporary = `${path}.qrspi-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, content, { flag: "wx" });
  await rename(temporary, path);
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
  const configurationFile = options.harness === "claude"
    ? join(".claude", "settings.json")
    : join(".codex", "hooks.json");
  const files = await listFiles(distributionRoot);
  const ordinaryFiles = files.filter((file) => file !== configurationFile);
  const conflicts: string[] = [];
  const states = new Map<string, "new" | "same" | "overwrite">();
  let mergedConfiguration: string | undefined;

  if (options.harness === "codex") {
    const inlineConfig = join(destination, ".codex", "config.toml");
    const inlineConfigStat = await pathStat(inlineConfig);
    if (inlineConfigStat?.isFile()) {
      const source = await readFile(inlineConfig, "utf8");
      const configuration = parseTomlObject(source, ".codex/config.toml");
      if (Object.prototype.hasOwnProperty.call(configuration, "hooks")) {
        throw new Error(
          "Codex inline hooks are configured in .codex/config.toml; remove or migrate them before installing QRSPI so Codex does not load duplicate hook sources",
        );
      }
    }
  }

  for (const file of ordinaryFiles) {
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

  const configurationSource = join(distributionRoot, configurationFile);
  const configurationTarget = join(destination, configurationFile);
  assertInsideDestination(configurationTarget, destination);
  const configurationParentConflict = await conflictingParent(configurationTarget, destination);
  if (configurationParentConflict) {
    conflicts.push(`${relative(destination, configurationParentConflict)} blocks a directory`);
  } else {
    const targetStat = await pathStat(configurationTarget);
    if (targetStat && !targetStat.isFile()) {
      conflicts.push(`${configurationFile} exists and is not a file`);
    } else {
      const merged = mergeHookConfiguration(
        targetStat ? await readFile(configurationTarget, "utf8") : undefined,
        await readFile(configurationSource, "utf8"),
        configurationFile,
        options.force === true,
      );
      mergedConfiguration = merged.content;
      states.set(configurationFile, merged.state);
    }
  }

  if (conflicts.length > 0) {
    throw new Error(
      `installation would overwrite existing paths:\n${conflicts.map((path) => `- ${path}`).join("\n")}\nRe-run with --force to replace conflicting files.`,
    );
  }

  const result: InstallResult = { installed: 0, overwritten: 0, skipped: 0 };
  for (const file of ordinaryFiles) {
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
  const configurationState = states.get(configurationFile);
  if (configurationState === "same") {
    result.skipped += 1;
  } else if (configurationState !== undefined && mergedConfiguration !== undefined) {
    const target = join(destination, configurationFile);
    await mkdir(dirname(target), { recursive: true });
    await writeFileAtomically(target, mergedConfiguration);
    if (configurationState === "overwrite") result.overwritten += 1;
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
