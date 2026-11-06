import type { Fanout, FanoutMessage } from './fanout.ts';
import { decodeFanout, encodeFanout } from './codec.ts';

type Listener = (channel: Buffer, message: Buffer) => void;

/** The part of an ioredis client this uses. A subscriber connection cannot publish, so both are needed. */
export type RedisClients = {
  publisher: { publish(channel: string, message: Buffer): unknown; quit?(): unknown };
  subscriber: {
    subscribe(channel: string): unknown;
    unsubscribe(channel: string): unknown;
    on(event: 'messageBuffer', listener: Listener): unknown;
    off(event: 'messageBuffer', listener: Listener): unknown;
    quit?(): unknown;
  };
};

const channelFor = (room: string) => `quoin:room:${room}`;

/** Shares updates between every server process subscribed to a room, one Redis channel per room. */
export function redisFanout({ publisher, subscriber }: RedisClients): Fanout {
  const listeners = new Map<string, Set<(message: FanoutMessage) => void>>();

  const onMessage: Listener = (channel, data) => {
    const room = channel.toString().slice(channelFor('').length);
    const set = listeners.get(room);
    if (set === undefined || set.size === 0) return;
    const message = decodeFanout(new Uint8Array(data));
    if (message === null) return;
    for (const listener of [...set]) listener(message);
  };
  subscriber.on('messageBuffer', onMessage);

  return {
    publish: (room, message) => void publisher.publish(channelFor(room), Buffer.from(encodeFanout(message))),
    subscribe: (room, listener) => {
      const set = listeners.get(room) ?? new Set();
      if (set.size === 0) {
        listeners.set(room, set);
        subscriber.subscribe(channelFor(room));
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size > 0) return;
        listeners.delete(room);
        subscriber.unsubscribe(channelFor(room));
      };
    },
    close: async () => {
      subscriber.off('messageBuffer', onMessage);
      await Promise.all([subscriber.quit?.(), publisher.quit?.()]);
    },
  };
}
