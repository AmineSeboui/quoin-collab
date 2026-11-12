import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { MESSAGE_AUTH } from './messages.ts';

const PERMISSION_DENIED = 0;

/** Tells a client why it is being turned away, before the socket closes. */
export function deniedFrame(reason: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AUTH);
  encoding.writeVarUint(encoder, PERMISSION_DENIED);
  encoding.writeVarString(encoder, reason);
  return encoding.toUint8Array(encoder);
}

/** The reason from a denial frame, or null when the frame says something else. */
export function readDenial(decoder: decoding.Decoder): string | null {
  if (decoding.readVarUint(decoder) !== PERMISSION_DENIED) return null;
  return decoding.readVarString(decoder);
}
