import type { Persistence } from './persistence.ts';

type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: { state: Uint8Array | Buffer }[] }>;
  end?(): Promise<void>;
};

const TABLE = 'quoin_rooms';

export type PostgresOptions = {
  /**
   * Whether closing this persistence also closes the pool. False by default, because a pool handed in from
   * outside is usually shared with the rest of an application, and closing it would take that down too. Pass
   * true only when the pool was created for this and nothing else reads it.
   */
  closePool?: boolean;
};

/**
 * Keeps each room as one row of merged Yjs state. Pass a `pg` Pool, or a Neon Pool, which both answer `query`.
 * Call `migrate` once at startup, or create the table yourself from the statement it runs.
 */
export function postgresPersistence(
  pool: Queryable,
  { closePool = false }: PostgresOptions = {},
): Persistence & { migrate(): Promise<void> } {
  return {
    migrate: async () => {
      await pool.query(
        `create table if not exists ${TABLE} (
           name text primary key,
           state bytea not null,
           updated_at timestamptz not null default now()
         )`,
      );
      // Rooms are listed by prefix where a deployment namespaces them per tenant, and the primary key's
      // index cannot serve a LIKE under most collations. This one can.
      await pool.query(
        `create index if not exists ${TABLE}_name_prefix on ${TABLE} (name text_pattern_ops)`,
      );
    },
    load: async (room) => {
      const { rows } = await pool.query(`select state from ${TABLE} where name = $1`, [room]);
      const state = rows[0]?.state;
      return state === undefined ? null : new Uint8Array(state);
    },
    save: async (room, state) => {
      await pool.query(
        `insert into ${TABLE} (name, state) values ($1, $2)
         on conflict (name) do update set state = excluded.state, updated_at = now()`,
        [room, Buffer.from(state)],
      );
    },
    close: async () => {
      if (closePool) await pool.end?.();
    },
  };
}
