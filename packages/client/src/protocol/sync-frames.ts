import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';
import { MESSAGE_SYNC } from './messages.ts';

const framed = (write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return encoding.toUint8Array(encoder);
};

/** Opens a sync: "here is what I have, send me what I lack". */
export const syncStep1 = (doc: Y.Doc): Uint8Array =>
  framed((encoder) => syncProtocol.writeSyncStep1(encoder, doc));

/** Answers a step 1 with everything the other side is missing. */
export const syncStep2 = (doc: Y.Doc, stateVector?: Uint8Array): Uint8Array =>
  framed((encoder) => syncProtocol.writeSyncStep2(encoder, doc, stateVector));

/** Carries one change to a document both sides already share. */
export const syncUpdate = (update: Uint8Array): Uint8Array =>
  framed((encoder) => syncProtocol.writeUpdate(encoder, update));
