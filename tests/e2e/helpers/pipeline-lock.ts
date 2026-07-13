import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOCK_DIR = join(tmpdir(), "tanglak-e2e-pipeline.lock");
// How long a *live* owner may hold the lock before a waiter is allowed to
// reclaim it as abandoned. A dead owner (see isProcessAlive) is reclaimed
// immediately regardless of this window -- this constant only bounds how
// long we tolerate a still-running-but-stuck holder.
const STALE_AFTER_MS = 120_000;
// Nine spec files currently share this single global lock across up to 38
// individual tests (each acquires it for the duration of one test, in
// beforeEach/afterEach). With Playwright run at --workers=6 (per
// AGENTS.md), a test can legitimately end up queued behind many other
// still-healthy holders, not just a stale one -- a fixed ~3-minute budget
// (the previous STALE_AFTER_MS + 60s) was tuned only for "wait out one
// stale-lock detection cycle", not for realistic worst-case queue depth,
// and was the direct cause of CI's "timeout in beforeEach while waiting
// for acquirePipelineLock()" failures. Generous headroom here is safe:
// a genuinely stuck run still fails, just with a clearer, later timeout
// instead of a spurious one while the queue is simply long.
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
// How often to log a progress line while waiting, so a long queue shows up
// as visible progress in CI output instead of multi-minute silence.
const PROGRESS_LOG_INTERVAL_MS = 15_000;

type PipelineLockOptions = {
  label?: string;
  timeoutMs?: number;
};

type PipelineLockOwner = {
  pid?: number;
  acquiredAt?: number;
  label?: string;
};

/** True if a process with this pid is still alive (same-machine check -- Playwright workers all run on the same CI host). */
function isProcessAlive(pid: number | undefined): boolean {
  if (typeof pid !== "number" || !Number.isFinite(pid)) return false;
  try {
    // Signal 0 sends nothing but still validates the pid exists and is
    // reachable -- throws ESRCH (no such process) or EPERM otherwise.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"; // exists, just not ours to signal -- still alive
  }
}

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

/**
 * Reclaims the lock directory if its current owner is abandoned --
 * either because the owning process has died (crashed/killed without
 * running its `afterEach` release), which is reclaimed immediately
 * regardless of age, or because a still-alive owner has held it past
 * `STALE_AFTER_MS` (a hang/bug, not a crash). A live owner within that
 * window is never touched, even if a waiter has been queued a long
 * time -- that case is handled by the waiter's own generous `timeoutMs`
 * budget, not by stealing an active lock out from under a healthy test.
 * Returns true if a lock was actually reclaimed, for caller diagnostics.
 */
async function removeStaleLock(): Promise<boolean> {
  try {
    const raw = await readFile(join(LOCK_DIR, "owner.json"), "utf8");
    const owner = JSON.parse(raw) as PipelineLockOwner;
    const ownerProcessDead = !isProcessAlive(owner.pid);
    const ownerTimedOut = typeof owner.acquiredAt === "number" && Date.now() - owner.acquiredAt > STALE_AFTER_MS;
    if (ownerProcessDead || ownerTimedOut) {
      await rm(LOCK_DIR, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch {
    try {
      const lockStats = await stat(LOCK_DIR);
      if (Date.now() - lockStats.mtimeMs > STALE_AFTER_MS) {
        await rm(LOCK_DIR, { recursive: true, force: true });
        return true;
      }
      return false;
    } catch {
      // Lock disappeared between attempts -- nothing to reclaim.
      return false;
    }
  }
}
