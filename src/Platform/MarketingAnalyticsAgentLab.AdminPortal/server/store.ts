import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Minimal JSON file persistence for the BFF.
 *
 * State lives under `.mvp-state/` next to the AdminPortal. We keep one file per kind
 * (`openapi-sources.json`, `tool-configurations.json`, `executions.jsonl`) so devs can
 * peek / delete state without DB tooling. `.mvp-state/` is gitignored.
 *
 * Concurrency assumption: this is the dev BFF for one developer at a time. No locking.
 */

const STATE_DIR = resolve(process.cwd(), '.mvp-state');

function pathFor(file: string): string {
  return resolve(STATE_DIR, file);
}

async function ensureDir(): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    await mkdir(STATE_DIR, { recursive: true });
  }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDir();
  const path = pathFor(file);
  if (!existsSync(path)) return fallback;
  try {
    const text = await readFile(path, 'utf8');
    if (!text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[mvp-bff] failed to read ${file}, falling back to defaults:`, err);
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir();
  const path = pathFor(file);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  // Atomic-ish: write to .tmp then rename.
  const { rename } = await import('node:fs/promises');
  await rename(tmp, path);
}

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await ensureDir();
  const path = pathFor(file);
  const { appendFile } = await import('node:fs/promises');
  // Ensure the parent path exists for first-time writers.
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(value) + '\n', 'utf8');
}

export async function readJsonl<T>(file: string): Promise<T[]> {
  await ensureDir();
  const path = pathFor(file);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // skip malformed line; do not poison the whole feed
    }
  }
  return out;
}

export const STORE_FILES = {
  sources: 'openapi-sources.json',
  configurations: 'tool-configurations.json',
  publishedTools: 'published-tools.json',
  executions: 'executions.jsonl',
  audit: 'audit.jsonl',
} as const;
