import * as decoding from 'lib0/decoding';

export type Frame = { type: number; decoder: decoding.Decoder };

/** Splits a frame into its leading type and a decoder positioned at the body that follows it. */
export function readFrame(data: Uint8Array): Frame {
  const decoder = decoding.createDecoder(data);
  return { type: decoding.readVarUint(decoder), decoder };
}
