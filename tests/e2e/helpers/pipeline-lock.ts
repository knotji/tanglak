import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "tanglak-e2e-pipeline.lock");
// How long a valid owner may hold the lock before a waiter can consider it stale.
const STALE_AFTER_MS = 120_000;
// The CI suite can queue several locked specs behind healthy holders at --workers=6.
// Keep this bounded so real deadlocks still fail with owner details.
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_TEST_BODY_TIMEOUT_MS = 30_000;
const PROGRESS_LOG_INTERVAL_MS = 15_000;

export const PIPELINE_LOCK_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const PIPELINE_LOCKED_TEST_TIMEOUT_MS =
  PIPELINE_LOCK_TIMEOUT_MS + DEFAULT_TEST_BODY_TIMEOUT_MS;

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastProgressLogAt = startedAt;

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
      const reclaimed = await removeStaleLock();
      const now = Date.now();

      if (reclaimed) {
        console.warn(`[pipeline-lock] reclaimed an abandoned lock while ${label} was waiting.`);
      } else if (now - lastProgressLogAt > PROGRESS_LOG_INTERVAL_MS) {
        const owner = await readCurrentOwner();
        console.warn(
          `[pipeline-lock] ${label} has been waiting ${now - startedAt}ms. Current owner: ${formatOwner(owner)}`,
        );
        lastProgressLogAt = now;
      }

      if (now - startedAt > timeoutMs) {
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

async function removeStaleLock(): Promise<boolean> {
  const owner = await readCurrentOwner();
  if (!owner) {
    try {
      const lockStats = await stat(LOCK_DIR);
      if (Date.now() - lockStats.mtimeMs > STALE_AFTER_MS) {
        await rm(LOCK_DIR, { recursive: true, force: true });
        return true;
      }
    } catch {
      // The lock may disappear between a failed mkdir and the fallback stat.
    }
    return false;
  }

  const isExpired =
    typeof owner.acquiredAt === "number" && Date.now() - owner.acquiredAt > STALE_AFTER_MS;
  if (!isExpired) {
    return false;
  }

  // A slow E2E worker can legitimately hold the lock for longer than the
  // stale threshold while the owning Playwright process is still alive. Only
  // clean up an expired lock when the recorded owner process has gone away;
  // otherwise let waiters time out with the owner details instead of masking a
  // real pipeline deadlock.
  if (typeof owner.pid !== "number" || isProcessAlive(owner.pid)) {
    return false;
  }

  await rm(LOCK_DIR, { recursive: true, force: true });
  return true;
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
