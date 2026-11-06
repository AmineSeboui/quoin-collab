import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { FanoutKind, FanoutMessage } from './fanout.ts';

const KINDS: readonly FanoutKind[] = ['update', 'awareness'];

export function encodeFanout({ kind, from, payload }: FanoutMessage): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, KINDS.indexOf(kind));
  encoding.writeVarString(encoder, from);
  encoding.writeVarUint8Array(encoder, payload);
  return encoding.toUint8Array(encoder);
}

/** Null when the frame is not one of ours, so an unrelated publisher on the channel cannot crash a subscriber. */
export function decodeFanout(data: Uint8Array): FanoutMessage | null {
  try {
    const decoder = decoding.createDecoder(data);
    const kind = KINDS[decoding.readVarUint(decoder)];
    if (kind === undefined) return null;
    return { kind, from: decoding.readVarString(decoder), payload: decoding.readVarUint8Array(decoder) };
  } catch {
    return null;
  }
}
