import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import { MESSAGE_SYNC, readFrame } from '../src/protocol/index.ts';
import { CollabProvider } from '../src/provider.ts';

/** A socket that keeps what the provider sends and hands it frames when told to. */
export class ScriptedSocket {
  binaryType = 'arraybuffer';
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.onopen?.();
  }

  deliver(frame: Uint8Array): void {
    this.onmessage?.({ data: frame.slice().buffer } as MessageEvent<ArrayBuffer>);
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  send(data: Uint8Array): void {
    this.sent.push(new Uint8Array(data));
  }

  close(): void {
    this.drop();
  }
}

export const settle = async () => {
  for (let flush = 0; flush < 6; flush++) await Promise.resolve();
};

/** A provider on an open scripted socket; `reconnect` drops it and opens the next. */
export async function connected() {
  const sockets: ScriptedSocket[] = [];
  const provider = new CollabProvider({
    url: 'ws://localhost:1234',
    room: 'notes',
    connect: false,
    socketFactory: () => {
      const socket = new ScriptedSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  provider.connect();
  await settle();
  sockets.at(-1)!.open();
  const reconnect = async () => {
    sockets.at(-1)!.drop();
    provider.disconnect();
    provider.connect();
    await settle();
    sockets.at(-1)!.open();
  };
  return { provider, sockets, socket: () => sockets.at(-1)!, reconnect };
}

/** The client ids each update the provider sent writes structs under, with the sync step that carried it. */
export const writes = (socket: ScriptedSocket) =>
  socket.sent.flatMap((data) => {
    const { type, decoder } = readFrame(data);
    if (type !== MESSAGE_SYNC) return [];
    const step = decoding.readVarUint(decoder);
    if (step === syncProtocol.messageYjsSyncStep1) return [];
    return [{ step, writers: [...Y.parseUpdateMeta(decoding.readVarUint8Array(decoder)).from.keys()] }];
  });
