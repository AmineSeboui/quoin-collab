import type { CollabServer } from '../src/server.ts';
import type { ConnectionHandle, SocketSink } from '../src/transport.ts';

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/**
 * A socket with no network under it, joined straight to a server connection. Frames are buffered in both
 * directions until each end is ready, so a test never depends on which promise settled first.
 */
export class FakeSocket {
  readyState = CONNECTING;
  binaryType = 'arraybuffer';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private handle: ConnectionHandle | null = null;
  private readonly pendingToServer: Uint8Array[] = [];
  private readonly pendingToClient: Uint8Array[] = [];

  readonly sink: SocketSink = {
    send: (data) => this.deliver(data),
    close: () => this.close(),
  };

  send(data: ArrayBuffer | Uint8Array): void {
    const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
    if (this.handle === null) this.pendingToServer.push(bytes);
    else this.handle.receive(bytes);
  }

  close(): void {
    if (this.readyState === CLOSED) return;
    // A real socket hands over what it already received before it reports the close, a denial frame included.
    for (const bytes of this.pendingToClient.splice(0)) this.emit(bytes);
    this.readyState = CLOSED;
    this.handle?.disconnect();
    this.handle = null;
    this.onclose?.();
  }

  attach(handle: ConnectionHandle | null): void {
    if (handle === null) {
      this.close();
      return;
    }
    this.handle = handle;
    for (const bytes of this.pendingToServer.splice(0)) handle.receive(bytes);
    queueMicrotask(() => {
      if (this.readyState !== CONNECTING) return;
      this.readyState = OPEN;
      this.onopen?.();
      for (const bytes of this.pendingToClient.splice(0)) this.emit(bytes);
    });
  }

  private deliver(data: Uint8Array): void {
    if (this.readyState !== OPEN || this.onmessage === null) this.pendingToClient.push(new Uint8Array(data));
    else this.emit(data);
  }

  private emit(data: Uint8Array): void {
    this.onmessage?.({ data: data.slice().buffer as ArrayBuffer });
  }
}

/** A `socketFactory` for CollabProvider that joins it to this server in process. */
export function socketsTo(collab: CollabServer, room: string) {
  const opened: FakeSocket[] = [];
  const factory = (url: string): WebSocket => {
    const socket = new FakeSocket();
    opened.push(socket);
    const token = new URL(url).searchParams.get('token');
    void collab
      .connect({ room, token, headers: {} }, socket.sink)
      .then((handle) => socket.attach(handle))
      .catch(() => socket.close());
    return socket as unknown as WebSocket;
  };
  return { factory, opened };
}
