import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { __pipelineLockTestHooks } from "../e2e/helpers/pipeline-lock";

const { LOCK_DIR, STALE_AFTER_MS, removeStaleLock } = __pipelineLockTestHooks;

async function writeOwner(owner: Record<string, unknown>) {
  await mkdir(LOCK_DIR, { recursive: true });
  await writeFile(join(LOCK_DIR, "owner.json"), JSON.stringify(owner));
}

async function makeLockDirStale() {
  const staleDate = new Date(Date.now() - STALE_AFTER_MS - 1_000);
  await utimes(LOCK_DIR, staleDate, staleDate);
}

async function lockExists() {
  try {
    await stat(LOCK_DIR);
    return true;
  } catch {
    return false;
  }
}

describe("pipeline lock stale cleanup", () => {
  afterEach(async () => {
    await rm(LOCK_DIR, { recursive: true, force: true });
  });

  it("does not remove a valid live owner", async () => {
    await writeOwner({
      pid: process.pid,
      acquiredAt: Date.now() - STALE_AFTER_MS - 1_000,
      label: "live-owner",
    });

    await removeStaleLock();

    expect(await lockExists()).toBe(true);
  });

  it("removes a valid dead expired owner", async () => {
    await writeOwner({
      pid: Number.MAX_SAFE_INTEGER,
      acquiredAt: Date.now() - STALE_AFTER_MS - 1_000,
      label: "dead-owner",
    });

    await removeStaleLock();

    expect(await lockExists()).toBe(false);
  });

  it("removes a missing owner.json with a stale lock directory", async () => {
    await mkdir(LOCK_DIR, { recursive: true });
    await makeLockDirStale();

    await removeStaleLock();

    expect(await lockExists()).toBe(false);
  });

  it("removes a corrupt owner.json with a stale lock directory", async () => {
    await mkdir(LOCK_DIR, { recursive: true });
    await writeFile(join(LOCK_DIR, "owner.json"), "{");
    await makeLockDirStale();

    await removeStaleLock();

    expect(await lockExists()).toBe(false);
  });

  it("does not remove a fresh ownerless lock", async () => {
    await mkdir(LOCK_DIR, { recursive: true });

    await removeStaleLock();

    expect(await lockExists()).toBe(true);
  });
});
