import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { applyAwarenessUpdate, type Awareness } from 'y-protocols/awareness';
import { MESSAGE_AUTH, MESSAGE_AWARENESS, MESSAGE_SYNC, readDenial, readFrame } from 'quoin-collab-protocol';
import type * as Y from 'yjs';

export type FrameContext = {
  doc: Y.Doc;
  awareness: Awareness;
  /** Marks changes that came from the server, so they are not sent straight back to it. */
  origin: object;
  send: (data: Uint8Array) => void;
  onSynced: () => void;
  onDenied: (reason: string) => void;
};

/** Acts on one frame from the server. Anything it needs to answer goes out through `send`. */
export function handleFrame(data: Uint8Array, context: FrameContext): void {
  const { type, decoder } = readFrame(data);
  if (type === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    const answered = syncProtocol.readSyncMessage(decoder, encoder, context.doc, context.origin);
    if (encoding.length(encoder) > 1) context.send(encoding.toUint8Array(encoder));
    if (answered === syncProtocol.messageYjsSyncStep2) context.onSynced();
    return;
  }
  if (type === MESSAGE_AWARENESS) {
    applyAwarenessUpdate(context.awareness, decoding.readVarUint8Array(decoder), context.origin);
    return;
  }
  if (type === MESSAGE_AUTH) {
    const reason = readDenial(decoder);
    if (reason !== null) context.onDenied(reason);
  }
}
