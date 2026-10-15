import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/** Runs `fn` with a fresh per-job directory and always removes it afterwards, even on failure. */
export async function withTempDir<T>(root: string, jobId: string, fn: (dir: string) => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, `${jobId}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Removes job directories left behind by a crash. Only touches entries older than
 * `olderThanMs`, so it's safe while another worker shares the same TEMP_DIR.
 */
export async function sweepStaleTempDirs(root: string, olderThanMs: number): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - olderThanMs;
  let removed = 0;
  for (const entry of entries) {
    const full = path.join(root, entry);
    try {
      if ((await stat(full)).mtimeMs < cutoff) {
        await rm(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // Removed concurrently; nothing to do.
    }
  }
  return removed;
}
