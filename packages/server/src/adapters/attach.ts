import type { ConnectionRequest } from '../auth.ts';
import type { CollabServer } from '../server.ts';
import type { ConnectionHandle } from '../transport.ts';
import { wsBytes, wsSink, type RawData, type WsSocket } from './ws.ts';

export type AttachableSocket = WsSocket & {
  on(event: 'message', listener: (data: RawData) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
};

export type AttachOptions = {
  collab: CollabServer;
  request: ConnectionRequest;
  socket: AttachableSocket;
  onDenied?: () => void;
  onError?: (error: Error) => void;
};

/**
 * Joins a `ws` style socket to the server.
 *
 * Listeners are attached before the connection is opened, because opening it is asynchronous and the client
 * does not wait: it sends its opening sync as soon as the socket is up. An authorizer that reaches a database
 * takes long enough for that frame to arrive first, and a frame that arrives before a listener is simply lost.
 * The client then sits connected and never synced, which looks like a hang rather than a failure. So frames
 * are held until the connection exists, and replayed into it in order.
 *
 * It returns a promise that settles once the connection is open or refused. A serverless host may suspend an
 * instance as soon as its handler returns, so a caller there must await this; work left running after the
 * handler returns is not guaranteed to continue.
 */
export function attachWsSocket({ collab, request, socket, onDenied, onError }: AttachOptions): Promise<void> {
  const pending: Uint8Array[] = [];
  let handle: ConnectionHandle | null = null;
  let closed = false;

  socket.on('message', (data: RawData) => {
    const bytes = wsBytes(data);
    if (handle === null) pending.push(bytes);
    else handle.receive(bytes);
  });
  socket.on('close', () => {
    closed = true;
    handle?.disconnect();
    handle = null;
  });

  return collab
    .connect(request, wsSink(socket))
    .then((opened) => {
      if (opened === null) {
        onDenied?.();
        return;
      }
      if (closed) {
        // The socket went away while the room was opening, so the connection is closed rather than leaked.
        opened.disconnect();
        return;
      }
      handle = opened;
      for (const bytes of pending.splice(0)) opened.receive(bytes);
    })
    .catch((error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      socket.close(1011, 'the room could not be opened');
    });
}
