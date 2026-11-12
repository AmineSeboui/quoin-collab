import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { syncStep2 } from '../src/protocol/index.ts';
import { CollabProvider } from '../src/provider.ts';

/** Just enough WebSocket for the provider: it opens when told to and closes when told to. */
class FakeSocket {
  static opened: FakeSocket[] = [];
  binaryType = 'arraybuffer';
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeSocket.opened.push(this);
  }

  open(): void {
    this.onopen?.();
  }

  /** What a server sends once it has read the client's state, which is what counts as synced. */
  sync(doc: Y.Doc): void {
    const frame = syncStep2(doc, Y.encodeStateVector(new Y.Doc()));
    const data = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    this.onmessage?.({ data } as MessageEvent<ArrayBuffer>);
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  send(): void {}
  close(): void {
    this.drop();
  }
}

/** Every delay the provider asked setTimeout for, with the retry run at once so a test needs no clock. */
let asked: number[] = [];

beforeEach(() => {
  asked = [];
  FakeSocket.opened = [];
  // The retry runs on a microtask rather than after the delay, so a test needs no clock. It must not run
  // before setTimeout has returned, or the provider would still be holding the handle it is about to clear.
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, ms?: number) => {
    asked.push(ms ?? 0);
    queueMicrotask(handler);
    return asked.length;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const provider = () =>
  new CollabProvider({
    url: 'ws://localhost:1234',
    room: 'notes',
    connect: false,
    socketFactory: () => new FakeSocket() as unknown as WebSocket,
  });

const settle = async () => {
  for (let flush = 0; flush < 6; flush++) await Promise.resolve();
};

describe('the reconnect delay', () => {
  it('starts again after a connection that synced, which is the close a time limit causes', async () => {
    const client = provider();
    client.connect();
    await settle();

    for (let round = 0; round < 4; round++) {
      const socket = FakeSocket.opened.at(-1)!;
      socket.open();
      socket.sync(client.doc);
      expect(client.synced).toBe(true);
      socket.drop();
      await settle();
    }

    expect(asked.length).toBe(4);
    expect(asked.every((wait) => wait <= 150)).toBe(true);
    client.destroy();
  });

  it('backs off when a server accepts a socket and drops it before syncing', async () => {
    const client = provider();
    client.connect();
    await settle();

    for (let round = 0; round < 5; round++) {
      const socket = FakeSocket.opened.at(-1)!;
      socket.open();
      socket.drop();
      await settle();
    }

    expect(asked.length).toBe(5);
    expect(Math.max(...asked)).toBeGreaterThan(150);
    client.destroy();
  });
});
