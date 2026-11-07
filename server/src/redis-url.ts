/**
 * Hosted Redis providers each pick their own name for the same connection string, and several inject an HTTPS
 * REST address beside it, so insisting on one name turns a correctly provisioned database into a server that
 * quietly reaches nobody. `REDIS_URL` is the name to set when you are setting it yourself; the rest are
 * accepted because a marketplace integration chose them for you.
 */
const NAMES = ['REDIS_URL', 'KV_URL', 'UPSTASH_REDIS_URL', 'REDIS_URI'] as const;

const isRedisUrl = (value: string | undefined): value is string => value !== undefined && /^rediss?:\/\//.test(value);

export function resolveRedisUrl(env: Record<string, string | undefined>): string | null {
  for (const name of NAMES) {
    if (isRedisUrl(env[name])) return env[name];
  }
  return null;
}

/** The name the URL was found under, so a server can say where its configuration came from. */
export function resolveRedisUrlName(env: Record<string, string | undefined>): string | null {
  return NAMES.find((name) => isRedisUrl(env[name])) ?? null;
}
