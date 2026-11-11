import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MESSAGE_AWARENESS, MESSAGE_QUERY_AWARENESS } from './messages.ts';

/** Who is here and where their caret is, for the clients named. */
export function awarenessFrame(awareness: awarenessProtocol.Awareness, clients: number[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients));
  return encoding.toUint8Array(encoder);
}

/** Asks the other side to send its awareness, which a client does after reconnecting. */
export function queryAwarenessFrame(): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_QUERY_AWARENESS);
  return encoding.toUint8Array(encoder);
}
