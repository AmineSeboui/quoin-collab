/**
 * What the core needs of a socket, so the same rooms serve a `ws` server, a Vercel Function and a test with no
 * socket at all. An adapter owns the real socket and passes frames in through the handle it gets back.
 */
export type SocketSink = {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
};

export type ConnectionHandle = {
  receive(data: Uint8Array): void;
  disconnect(): void;
};
