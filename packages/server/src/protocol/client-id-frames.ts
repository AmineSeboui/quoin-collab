import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { MESSAGE_CLIENT_ID } from './messages.ts';

/** Gives a comment-only connection the one Yjs client id it may write under. */
export function clientIdFrame(clientID: number): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_CLIENT_ID);
  encoding.writeVarUint(encoder, clientID);
  return encoding.toUint8Array(encoder);
}

/** The client id a client id frame carries. */
export const readClientId = (decoder: decoding.Decoder): number => decoding.readVarUint(decoder);
