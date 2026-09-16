import { access, readFile, readdir } from "node:fs/promises";
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
