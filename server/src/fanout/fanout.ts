export type FanoutKind = 'update' | 'awareness';

export type FanoutMessage = {
  kind: FanoutKind;
  payload: Uint8Array;
  /** The id of the server that published it, so a subscriber drops its own echo. */
  from: string;
};

/**
 * How two server processes serving one room reach each other. A single process needs none of this, so the
 * default does nothing; more than one needs a broker, because a Yjs update only reaches the clients attached
 * to the process that received it.
 */
/**
 * A subscription, and when it is actually listening. The distinction matters: pub/sub has no replay, so an
 * update published before a subscription is live is not late, it is gone. A room must not be served until
 * `ready` has settled.
 */
export type Subscription = { ready: Promise<void>; stop: () => void };

export type Fanout = {
  publish(room: string, message: FanoutMessage): void;
  subscribe(room: string, listener: (message: FanoutMessage) => void): Subscription;
  close?(): Promise<void>;
};
