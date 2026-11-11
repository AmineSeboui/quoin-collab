import type { Fanout, FanoutMessage, Subscription } from './fanout.ts';
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

export type RedisFanoutOptions = RedisClients & {
  /**
   * Where a broker failure is reported. Every ioredis call here answers with a promise, and a rejected one
   * nobody handled takes the whole process down; on a serverless host that means a connection dying in the
   * middle of being set up, with nothing in the logs to say why. So each is caught and reported here instead.
   */
  onError?: (error: Error) => void;
};

/** Shares updates between every server process subscribed to a room, one Redis channel per room. */
export function redisFanout({ publisher, subscriber, onError }: RedisFanoutOptions): Fanout {
  const report = (error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error)));
  const settle = (result: unknown) => {
    if (result instanceof Promise) result.catch(report);
  };
  const listeners = new Map<string, Set<(message: FanoutMessage) => void>>();
  const subscribed = new Map<string, Promise<void>>();

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
    publish: (room, message) => settle(publisher.publish(channelFor(room), Buffer.from(encodeFanout(message)))),
    subscribe: (room, listener): Subscription => {
      const set = listeners.get(room) ?? new Set();
      let ready = subscribed.get(room);
      if (set.size === 0) {
        listeners.set(room, set);
        ready = Promise.resolve(subscriber.subscribe(channelFor(room))).then(
          () => undefined,
          (error: unknown) => report(error),
        );
        subscribed.set(room, ready);
      }
      set.add(listener);
      return {
        ready: ready ?? Promise.resolve(),
        stop: () => {
          set.delete(listener);
          if (set.size > 0) return;
          listeners.delete(room);
          subscribed.delete(room);
          settle(subscriber.unsubscribe(channelFor(room)));
        },
      };
    },
    close: async () => {
      subscriber.off('messageBuffer', onMessage);
      await Promise.all([subscriber.quit?.(), publisher.quit?.()]).catch(report);
    },
  };
}
