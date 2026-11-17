import { outdatedTimeout } from 'y-protocols/awareness';
import { REMOTE, type Room } from '../room.ts';
import type { SocketSink } from '../transport.ts';

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

export type Presence = {
  join(sink: SocketSink, subject: string): void;
  leave(sink: SocketSink): void;
  /** Whether a connection other than `subject`'s own has announced `id` in this room. */
  announcedByOther(id: number, subject: string): boolean;
};

const presences = new WeakMap<Room, Presence>();

const setOf = <K, V>(map: Map<K, Set<V>>, key: K): Set<V> => map.get(key) ?? map.set(key, new Set()).get(key)!;

function watch(room: Room): Presence {
  const commenters = new Map<unknown, string>();
  const bySubject = new Map<number, Set<string>>();
  const byOthers = new Map<unknown, Set<number>>();
  const elsewhere = new Map<number, number>();
  // Whoever was here before the first commenter is of unknown origin, so is treated as announced elsewhere.
  for (const [id, meta] of room.awareness.meta) if (room.awareness.states.has(id)) elsewhere.set(id, meta.lastUpdated);

  room.awareness.on('update', ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const named = [...added, ...updated];
    if (origin === REMOTE) {
      for (const id of named) elsewhere.set(id, Date.now());
      for (const id of removed) elsewhere.delete(id);
      return;
    }
    const subject = commenters.get(origin);
    // A commenter's ids stay its subject's for the room's life; another connection's only while it holds them, so
    // a reader promoted to commenter keeps the id its reading connection announced.
    if (subject !== undefined) for (const id of named) setOf(bySubject, id).add(subject);
    else if (typeof origin === 'object' && origin !== null) for (const id of named) setOf(byOthers, origin).add(id);
    // Only the connection that announced an id takes it back, or awareness timing it out once nobody renews it.
    for (const [by, ids] of byOthers) {
      if (by !== origin && origin !== 'timeout') continue;
      for (const id of removed) ids.delete(id);
      if (ids.size === 0) byOthers.delete(by);
    }
  });

  return {
    join: (sink, subject) => void commenters.set(sink, subject),
    leave: (sink) => void commenters.delete(sink),
    announcedByOther(id, subject) {
      // A process that stopped without saying so leaves its announcements until awareness itself would time them out.
      const seen = elsewhere.get(id);
      if (seen !== undefined && Date.now() - seen < outdatedTimeout) return true;
      if ([...(bySubject.get(id) ?? [])].some((by) => by !== subject)) return true;
      return [...byOthers.values()].some((ids) => ids.has(id));
    },
  };
}

/** Who has announced which client id in `room`, watched from the first comment-only connection on. */
export function presenceIn(room: Room): Presence {
  const known = presences.get(room);
  if (known !== undefined) return known;
  const presence = watch(room);
  presences.set(room, presence);
  return presence;
}
