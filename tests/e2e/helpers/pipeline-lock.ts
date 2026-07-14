import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "tanglak-e2e-pipeline.lock");
const STALE_AFTER_MS = 120_000;
const DEFAULT_TIMEOUT_MS = STALE_AFTER_MS + 60_000;

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
  // The timeout must be longer than stale-lock cleanup; otherwise a worker
  // can fail before it is allowed to remove a dead owner left by another
  // Playwright worker.
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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
  const owner = await readCurrentOwner();
  if (!owner) {
    try {
      const lockStats = await stat(LOCK_DIR);
      if (Date.now() - lockStats.mtimeMs > STALE_AFTER_MS) {
        await rm(LOCK_DIR, { recursive: true, force: true });
      }
    } catch {
      // The lock may disappear between a failed mkdir and the fallback stat.
    }
    return;
  }

  const isExpired =
    typeof owner.acquiredAt === "number" && Date.now() - owner.acquiredAt > STALE_AFTER_MS;
  if (!isExpired) {
    return;
  }

  // A slow E2E worker can legitimately hold the lock for longer than the
  // stale threshold while the owning Playwright process is still alive. Only
  // clean up an expired lock when the recorded owner process has gone away;
  // otherwise let waiters time out with the owner details instead of masking a
  // real pipeline deadlock.
  if (typeof owner.pid !== "number" || isProcessAlive(owner.pid)) {
    return;
  }

  await rm(LOCK_DIR, { recursive: true, force: true });
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

export const __pipelineLockTestHooks = {
  LOCK_DIR,
  STALE_AFTER_MS,
  removeStaleLock,
};
