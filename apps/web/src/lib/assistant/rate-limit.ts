type RateBucket = { startedAt: number; count: number };

const globalForRateLimits = globalThis as typeof globalThis & {
  assistantRateBuckets?: Map<string, RateBucket>;
};

const buckets = (globalForRateLimits.assistantRateBuckets ??= new Map());

export function checkAssistantRateLimit(
  userId: string,
  action: string,
  maximum: number,
  windowMs = 60_000,
) {
  const now = Date.now();
  const key = `${userId}:${action}`;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= maximum) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowMs - (now - bucket.startedAt)) / 1000),
      ),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
