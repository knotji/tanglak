type TimingOptions = {
  route?: string;
  userId?: string;
};

export function shouldLogTiming() {
  return process.env.NODE_ENV === "development" || process.env.TANGLAK_DEBUG_TIMING === "1";
}

export async function timeAsync<T>(
  label: string,
  work: () => Promise<T>,
  options: TimingOptions = {},
): Promise<T> {
  if (!shouldLogTiming()) return work();

  const started = performance.now();
  try {
    return await work();
  } finally {
    const elapsed = Math.round(performance.now() - started);
    const route = options.route ? ` route=${options.route}` : "";
    const user = options.userId ? ` user=${options.userId.slice(0, 8)}` : "";
    console.info(`[TangLak timing] ${label}${route}${user} ${elapsed}ms`);
  }
}

export function timePage<T>(route: string, work: () => Promise<T>): Promise<T> {
  return timeAsync("page.load", work, { route });
}
