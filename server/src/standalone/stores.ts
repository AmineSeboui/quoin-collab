import type { Fanout } from '../fanout/fanout.ts';
import { memoryFanout } from '../fanout/memory.ts';
import { redisFanout, type RedisClients } from '../fanout/redis.ts';
import type { Persistence } from '../persistence/persistence.ts';
import { memoryPersistence } from '../persistence/memory.ts';
import { postgresPersistence } from '../persistence/postgres.ts';
import { resolveRedisUrl, resolveRedisUrlName } from '../redis-url.ts';

export type StoreEnv = Record<string, string | undefined>;

/** Imported by name so `pg` and `ioredis` stay optional: a server with neither URL set loads neither. */
const load = async <T>(name: string): Promise<T> => (await import(/* @vite-ignore */ name)) as T;

type PgModule = {
  Pool: new (config: { connectionString: string }) => Parameters<typeof postgresPersistence>[0];
};
type RedisModule = { default: new (url: string) => RedisClients['publisher'] & RedisClients['subscriber'] };

export type Stores = { persistence: Persistence; fanout: Fanout; notes: string[] };

/** Builds the two stores a deployment needs from its environment, and says plainly which ones it got. */
export async function storesFromEnv(env: StoreEnv): Promise<Stores> {
  const { DATABASE_URL } = env;
  const REDIS_URL = resolveRedisUrl(env);
  const notes: string[] = [];
  let persistence = memoryPersistence();
  let fanout = memoryFanout();

  if (DATABASE_URL) {
    const { Pool } = await load<PgModule>('pg');
    const postgres = postgresPersistence(new Pool({ connectionString: DATABASE_URL }));
    await postgres.migrate();
    persistence = postgres;
    notes.push('documents are kept in Postgres');
  } else {
    notes.push('documents are kept in memory only, so they go when this process does');
  }

  if (REDIS_URL) {
    const { default: Redis } = await load<RedisModule>('ioredis');
    fanout = redisFanout({ publisher: new Redis(REDIS_URL), subscriber: new Redis(REDIS_URL) });
    notes.push(`updates are shared between processes through Redis, from ${resolveRedisUrlName(env)}`);
  } else {
    notes.push('updates stay in this process, which is right for exactly one of it');
  }

  return { persistence, fanout, notes };
}
