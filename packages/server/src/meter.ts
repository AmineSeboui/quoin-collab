/**
 * What a deployment counts. A hosted service bills from this, a self-hosted one scrapes it, and the default
 * records nothing at all rather than writing somewhere that has to be cleaned up.
 *
 * `subject` is whatever the host's own token called the reader: an opaque id it chose, never a name or an
 * address. The server does not interpret it, and a hosted deployment should hash it before storing it, so that
 * counting people does not mean learning who they are.
 */
export type MeterEvent =
  | { kind: 'room.opened'; room: string }
  | { kind: 'room.closed'; room: string }
  | { kind: 'connection.opened'; room: string; subject?: string }
  | { kind: 'connection.closed'; room: string }
  /**
   * Why is deliberately coarse. It becomes a metric label, and a label that can take any value, such as the
   * sentence sent to the client, turns one counter into thousands. The detail belongs in a log line.
   */
  | { kind: 'connection.refused'; reason: 'unauthorized' | 'declined' }
  | { kind: 'update.applied'; room: string; bytes: number; origin: 'client' | 'remote' }
  | { kind: 'fanout.published'; message: 'update' | 'awareness' }
  | { kind: 'fanout.received'; message: 'update' | 'awareness' }
  | { kind: 'persistence.loaded'; ms: number }
  | { kind: 'persistence.saved'; ms: number; bytes: number }
  | { kind: 'persistence.failed'; operation: 'load' | 'save' };

export type Meter = {
  record(event: MeterEvent): void;
  close?(): Promise<void>;
};

/** Counts nothing. The default, and the whole of what a self-hoster needs until they want a dashboard. */
export const noMeter = (): Meter => ({ record: () => undefined });

/**
 * Collects events in memory, for a test or a single process that only wants a number on a status page. It
 * holds distinct subjects, so it grows with the number of people rather than the number of connections.
 */
export function memoryMeter(): Meter & { readonly counts: MeterCounts } {
  const counts: MeterCounts = { rooms: 0, connections: 0, subjects: new Set() };
  return {
    counts,
    record: (event) => {
      if (event.kind === 'room.opened') counts.rooms += 1;
      else if (event.kind === 'room.closed') counts.rooms -= 1;
      else if (event.kind === 'connection.closed') counts.connections -= 1;
      else if (event.kind === 'connection.opened') {
        counts.connections += 1;
        if (event.subject !== undefined) counts.subjects.add(event.subject);
      }
    },
  };
}

export type MeterCounts = { rooms: number; connections: number; subjects: Set<string> };

/** Sends each event to every meter given, so a deployment can bill and scrape from the same stream. */
export function bothMeters(first: Meter, second: Meter): Meter {
  return {
    record: (event) => {
      first.record(event);
      second.record(event);
    },
    close: async () => {
      await first.close?.();
      await second.close?.();
    },
  };
}
