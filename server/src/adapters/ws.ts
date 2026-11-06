import type { SocketSink } from '../transport.ts';

/** What `ws` hands a message listener. Spelled out here so this module imports nothing from `ws` itself. */
export type RawData = Buffer | ArrayBuffer | Uint8Array | readonly Buffer[];

export type WsSocket = {
  readonly readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
};

const OPEN = 1;

/** One frame as bytes, whichever of its three shapes `ws` chose for it. */
export function wsBytes(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data as Buffer[]));
  return new Uint8Array(data as Uint8Array);
}

/** A sink over a `ws` socket, dropping sends to one that is no longer open rather than throwing. */
export function wsSink(socket: WsSocket): SocketSink {
  return {
    send: (data) => {
      if (socket.readyState === OPEN) socket.send(data);
    },
    close: (code, reason) => socket.close(code, reason),
  };
}
