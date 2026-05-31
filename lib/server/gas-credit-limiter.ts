const DAILY_SPONSORED_EXECUTION_LIMIT = 10;
const UNKNOWN_USER_KEY = "unknown-ip";

type DailyGasCreditEntry = {
  successfulExecutions: number;
};

// Hackathon testnet limiter: in-memory per-day gas credit tracking. Supabase persistence can be added later.
const dailyGasCreditLimiter = new Map<string, DailyGasCreditEntry>();

export const DAILY_SPONSORED_GAS_CREDIT_LIMIT = DAILY_SPONSORED_EXECUTION_LIMIT;
export const DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR = "Daily sponsored gas credits exhausted. Try again tomorrow or use paid mode when available.";

export function reserveSponsoredGasCredit(userKey: string) {
  const storageKey = getDailyGasCreditStorageKey(userKey);
  const entry = dailyGasCreditLimiter.get(storageKey) ?? { successfulExecutions: 0 };

  if (entry.successfulExecutions >= DAILY_SPONSORED_EXECUTION_LIMIT) {
    return { ok: false as const, storageKey };
  }

  dailyGasCreditLimiter.set(storageKey, {
    successfulExecutions: entry.successfulExecutions + 1,
  });

  return { ok: true as const, storageKey };
}

export function rollbackSponsoredGasCredit(storageKey: string) {
  const entry = dailyGasCreditLimiter.get(storageKey);

  if (!entry) {
    return;
  }

  dailyGasCreditLimiter.set(storageKey, {
    successfulExecutions: Math.max(entry.successfulExecutions - 1, 0),
  });
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || UNKNOWN_USER_KEY;
}

export function getDailyGasCreditStorageKey(userKey: string, date = new Date()) {
  const yyyyMmDd = date.toISOString().slice(0, 10);
  const normalizedUserKey = normalizeUserKey(userKey);

  return `${normalizedUserKey}:${yyyyMmDd}`;
}

function normalizeUserKey(userKey: string) {
  return userKey.trim() || UNKNOWN_USER_KEY;
}
