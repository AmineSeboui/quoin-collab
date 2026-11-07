import type { Fanout, FanoutMessage, Subscription } from './fanout.ts';

/** A fanout that reaches nobody, because in one process the rooms are already shared. */
export function memoryFanout(): Fanout {
  const listeners = new Map<string, Set<(message: FanoutMessage) => void>>();
  return {
    publish: (room, message) => {
      for (const listener of listeners.get(room) ?? []) listener(message);
    },
    subscribe: (room, listener): Subscription => {
      const set = listeners.get(room) ?? new Set();
      listeners.set(room, set);
      set.add(listener);
      return {
        ready: Promise.resolve(),
        stop: () => {
          set.delete(listener);
          if (set.size === 0) listeners.delete(room);
        },
      };
    },
  };
}
