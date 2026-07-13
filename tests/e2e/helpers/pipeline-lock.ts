import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "tanglak-e2e-pipeline.lock");
const STALE_AFTER_MS = 120_000;

type PipelineLockOptions = {
  label?: string;
  timeoutMs?: number;
};

type PipelineLockOwner = {
  pid?: number;
  acquiredAt?: number;
  label?: string;
};

export async function acquirePipelineLock(options: PipelineLockOptions = {}) {
  const startedAt = Date.now();
  const label = options.label ?? "unnamed";
  const timeoutMs = options.timeoutMs ?? 60_000;

  while (true) {
    try {
      await mkdir(LOCK_DIR);
      await writeFile(join(LOCK_DIR, "owner.json"), JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
        label,
      }));
      return async () => {
        await rm(LOCK_DIR, { recursive: true, force: true });
      };
    } catch {
      await removeStaleLock();
      if (Date.now() - startedAt > timeoutMs) {
        const owner = await readCurrentOwner();
        throw new Error(
          `Timed out after ${timeoutMs}ms acquiring TangLak E2E pipeline lock for ${label}. `
          + `Current owner: ${formatOwner(owner)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function readCurrentOwner() {
  try {
    const raw = await readFile(join(LOCK_DIR, "owner.json"), "utf8");
    return JSON.parse(raw) as PipelineLockOwner;
  } catch {
    return undefined;
  }
}

function formatOwner(owner: PipelineLockOwner | undefined) {
  if (!owner) {
    return "unknown";
  }

  const acquiredAt = typeof owner.acquiredAt === "number"
    ? `${new Date(owner.acquiredAt).toISOString()} (${Date.now() - owner.acquiredAt}ms ago)`
    : "unknown";

  return JSON.stringify({
    pid: owner.pid ?? "unknown",
    label: owner.label ?? "unknown",
    acquiredAt,
  });
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
