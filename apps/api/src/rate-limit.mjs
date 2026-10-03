const positiveInteger = (
  value,
  fallback
) => {
  const parsed = Number.parseInt(
    String(value ?? ""),
    10
  );

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
};

export function createFixedWindowRateLimiter({
  windowMs = 60_000,
  maxRequests = 600,
  maxEntries = 10_000,
  now = () => Date.now()
} = {}) {
  const resolvedWindowMs =
    positiveInteger(windowMs, 60_000);
  const resolvedMaxRequests =
    positiveInteger(maxRequests, 600);
  const resolvedMaxEntries =
    positiveInteger(maxEntries, 10_000);
  const buckets = new Map();

  const cleanup = (timestamp) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) {
        buckets.delete(key);
      }
    }

    while (
      buckets.size > resolvedMaxEntries
    ) {
      const oldestKey =
        buckets.keys().next().value;

      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  };

  const consume = (key) => {
    if (
      typeof key !== "string" ||
      key.length === 0
    ) {
      throw new TypeError(
        "rate limit key is required"
      );
    }

    const timestamp = Number(now());

    if (!Number.isFinite(timestamp)) {
      throw new TypeError(
        "rate limiter clock is invalid"
      );
    }

    let bucket = buckets.get(key);

    if (
      !bucket ||
      bucket.resetAt <= timestamp
    ) {
      bucket = {
        count: 0,
        resetAt:
          timestamp + resolvedWindowMs
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (
      buckets.size >
      resolvedMaxEntries
    ) {
      cleanup(timestamp);
    }

    const allowed =
      bucket.count <= resolvedMaxRequests;

    return {
      allowed,
      limit: resolvedMaxRequests,
      remaining: Math.max(
        0,
        resolvedMaxRequests -
          bucket.count
      ),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (
            bucket.resetAt -
            timestamp
          ) / 1000
        )
      )
    };
  };

  return {
    consume,
    size: () => buckets.size
  };
}
