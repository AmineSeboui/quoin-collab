import type { Fanout } from './fanout/fanout.ts';
import type { Persistence } from './persistence/persistence.ts';
import type { Meter } from './meter.ts';
import { REMOTE, Room } from './room.ts';

export type RoomsOptions = {
  persistence: Persistence;
  fanout: Fanout;
  /** Identifies this process in the fanout, so it ignores the messages it published itself. */
  serverId: string;
  saveAfterMs: number;
  evictAfterMs: number;
  meter: Meter;
  onError: (error: Error) => void;
};

type Entry = {
  room: Room;
  ready: Promise<Room>;
  unsubscribe: () => void;
  save: ReturnType<typeof setTimeout> | null;
  evict: ReturnType<typeof setTimeout> | null;
};

/** The rooms this process is serving: opened on demand, saved after a change, and dropped once nobody is left. */
export class Rooms {
  private readonly entries = new Map<string, Entry>();
  private readonly options: RoomsOptions;

  constructor(options: RoomsOptions) {
    this.options = options;
  }

  get count(): number {
    return this.entries.size;
  }

  get connections(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.room.size;
    return total;
  }

  /** The room, loaded from persistence the first time this process is asked for it. */
  acquire(name: string): Promise<Room> {
    const entry = this.entries.get(name) ?? this.open(name);
    if (entry.evict !== null) {
      clearTimeout(entry.evict);
      entry.evict = null;
    }
    return entry.ready;
  }

  /** Writes every open room out, for a shutdown that should not lose the last few seconds of typing. */
  async flush(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((name) => this.persist(name)));
  }

  async close(): Promise<void> {
    for (const [name, entry] of this.entries) {
      if (entry.save !== null) clearTimeout(entry.save);
      if (entry.evict !== null) clearTimeout(entry.evict);
      await this.persist(name);
      entry.unsubscribe();
      entry.room.destroy();
    }
    this.entries.clear();
  }

  private open(name: string): Entry {
    const { fanout, persistence, serverId, onError } = this.options;
    const room = new Room(name, {
      onLocalUpdate: (payload) => {
        fanout.publish(name, { kind: 'update', payload, from: serverId });
        this.scheduleSave(name);
      },
      onLocalAwareness: (payload) => fanout.publish(name, { kind: 'awareness', payload, from: serverId }),
      onEmpty: () => this.scheduleEvict(name),
    });
    const subscription = fanout.subscribe(name, (message) => {
      if (message.from === serverId) return;
      if (message.kind === 'update') room.applyUpdate(message.payload, REMOTE);
      else room.applyAwareness(message.payload, REMOTE);
    });
    // The subscription is awaited with the load: a room served before it is listening misses whatever is
    // published in that window, and pub/sub does not replay.
    const ready = Promise.all([subscription.ready, persistence.load(name)])
      .then(([, state]) => {
        if (state !== null) room.applyUpdate(state, REMOTE);
        return room;
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)));
        return room;
      });
    const entry: Entry = { room, ready, unsubscribe: subscription.stop, save: null, evict: null };
    this.entries.set(name, entry);
    this.options.meter.record({ kind: 'room.opened', room: name });
    return entry;
  }

  private scheduleSave(name: string): void {
    const entry = this.entries.get(name);
    if (entry === undefined || entry.save !== null) return;
    entry.save = setTimeout(() => {
      entry.save = null;
      void this.persist(name);
    }, this.options.saveAfterMs);
  }

  private scheduleEvict(name: string): void {
    const entry = this.entries.get(name);
    if (entry === undefined || entry.evict !== null) return;
    entry.evict = setTimeout(() => {
      entry.evict = null;
      void this.retire(name, entry);
    }, this.options.evictAfterMs);
  }

  private async retire(name: string, entry: Entry): Promise<void> {
    if (this.stillWanted(name, entry)) return;
    await this.persist(name, entry);
    // The write gave someone time to reconnect, which keeps the loaded room rather than reading it again.
    if (this.stillWanted(name, entry)) return;
    this.entries.delete(name);
    entry.unsubscribe();
    entry.room.destroy();
    this.options.meter.record({ kind: 'room.closed', room: name });
  }

  private stillWanted(name: string, entry: Entry): boolean {
    return entry.room.size > 0 || entry.evict !== null || this.entries.get(name) !== entry;
  }

  private async persist(name: string, known?: Entry): Promise<void> {
    const entry = known ?? this.entries.get(name);
    if (entry === undefined) return;
    try {
      await this.options.persistence.save(name, entry.room.state());
    } catch (error: unknown) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
