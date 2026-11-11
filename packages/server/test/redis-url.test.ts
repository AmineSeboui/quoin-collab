import { describe, expect, it } from 'vitest';
import { resolveRedisUrl, resolveRedisUrlName } from '../src/redis-url.ts';

describe('finding the Redis connection string', () => {
  it('prefers the documented name', () => {
    const env = { REDIS_URL: 'rediss://ours', KV_URL: 'rediss://theirs' };
    expect(resolveRedisUrl(env)).toBe('rediss://ours');
    expect(resolveRedisUrlName(env)).toBe('REDIS_URL');
  });

  it('takes the name a marketplace integration chose instead', () => {
    expect(resolveRedisUrl({ KV_URL: 'rediss://injected' })).toBe('rediss://injected');
    expect(resolveRedisUrl({ UPSTASH_REDIS_URL: 'redis://injected' })).toBe('redis://injected');
  });

  it('ignores the REST address that is injected beside it', () => {
    expect(resolveRedisUrl({ KV_REST_API_URL: 'https://example.upstash.io', KV_REST_API_TOKEN: 'secret' })).toBeNull();
  });

  it('skips a recognised name holding something that is not a Redis URL', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'https://not-redis', KV_URL: 'rediss://real' })).toBe('rediss://real');
  });

  it('is null when there is nothing to find, which means one process and no broker', () => {
    expect(resolveRedisUrl({})).toBeNull();
    expect(resolveRedisUrlName({})).toBeNull();
  });

  it('accepts both schemes, since a hosted provider uses TLS and a local one does not', () => {
    expect(resolveRedisUrl({ REDIS_URL: 'redis://localhost:6379' })).toBe('redis://localhost:6379');
    expect(resolveRedisUrl({ REDIS_URL: 'rediss://user:pass@host:6380' })).toBe('rediss://user:pass@host:6380');
  });
});
