import type { Persistence } from './persistence.ts';

/** Keeps rooms for as long as the process lives. The default, and all a single developer needs. */
export function memoryPersistence(): Persistence {
  const rooms = new Map<string, Uint8Array>();
  return {
    load: async (room) => rooms.get(room) ?? null,
    save: async (room, state) => void rooms.set(room, state),
  };
}
