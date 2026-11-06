import type { Fanout, FanoutMessage } from './fanout.ts';

/** A fanout that reaches nobody, because in one process the rooms are already shared. */
export function memoryFanout(): Fanout {
  const listeners = new Map<string, Set<(message: FanoutMessage) => void>>();
  return {
    publish: (room, message) => {
      for (const listener of listeners.get(room) ?? []) listener(message);
    },
    subscribe: (room, listener) => {
      const set = listeners.get(room) ?? new Set();
      listeners.set(room, set);
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(room);
      };
    },
  };
}
