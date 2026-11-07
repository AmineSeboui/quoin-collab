import { describe, expect, it } from 'vitest';
import { createCollabServer } from '../src/server.ts';
import { attachWsSocket, type AttachableSocket } from '../src/adapters/attach.ts';
import { syncStep1 } from 'quoin-collab-protocol';
import * as Y from 'yjs';

/** A socket with no buffering of its own: a frame arriving before a listener is attached is simply gone. */
class BareSocket implements AttachableSocket {
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  private messages: ((data: Buffer) => void) | null = null;
  private closes: (() => void) | null = null;

  send(data: Uint8Array) {
    this.sent.push(new Uint8Array(data));
  }
  close() {
    this.readyState = 3;
    this.closes?.();
  }
  on(event: 'message' | 'close', listener: never) {
    if (event === 'message') this.messages = listener as unknown as (data: Buffer) => void;
    else this.closes = listener as unknown as () => void;
  }
  /** Delivers as a real socket does: to whoever is listening right now, and to nobody otherwise. */
  deliver(frame: Uint8Array) {
    this.messages?.(Buffer.from(frame));
  }
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a connection whose authorizer is slow', () => {
  it('does not lose the opening sync the client sent while the room was opening', async () => {
    const collab = createCollabServer({
      authorize: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {};
      },
    });
    const socket = new BareSocket();
    attachWsSocket({ collab, request: { room: 'notes', token: null, headers: {} }, socket });

    // The client does not wait to be authorized; it sends as soon as its socket is open.
    socket.deliver(syncStep1(new Y.Doc()));
    await settle(150);

    // Two frames back: the server's own opening sync, and the answer to the one that arrived early.
    expect(socket.sent.length).toBeGreaterThanOrEqual(2);
    await collab.close();
  });

  it('closes the connection it opened when the socket went away first', async () => {
    const collab = createCollabServer({
      authorize: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {};
      },
    });
    const socket = new BareSocket();
    attachWsSocket({ collab, request: { room: 'brief', token: null, headers: {} }, socket });
    socket.close();
    await settle(150);

    expect(collab.stats().connections).toBe(0);
    await collab.close();
  });
});
