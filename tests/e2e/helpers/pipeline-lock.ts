import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "tanglak-e2e-pipeline.lock");
const STALE_AFTER_MS = 120_000;

export async function acquirePipelineLock() {
  while (true) {
    try {
      await mkdir(LOCK_DIR);
      await writeFile(join(LOCK_DIR, "owner.json"), JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
      }));
      return async () => {
        await rm(LOCK_DIR, { recursive: true, force: true });
      };
    } catch {
      await removeStaleLock();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function removeStaleLock() {
  try {
    const raw = await readFile(join(LOCK_DIR, "owner.json"), "utf8");
    const owner = JSON.parse(raw) as { acquiredAt?: number };
    if (typeof owner.acquiredAt === "number" && Date.now() - owner.acquiredAt > STALE_AFTER_MS) {
      await rm(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    try {
      const lockStats = await stat(LOCK_DIR);
      if (Date.now() - lockStats.mtimeMs > STALE_AFTER_MS) {
        await rm(LOCK_DIR, { recursive: true, force: true });
      }
    } catch {
      // Lock disappeared between attempts.
    }
  }
}
