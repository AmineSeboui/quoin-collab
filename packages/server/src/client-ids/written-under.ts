import * as Y from 'yjs';

/**
 * Whether every struct `update` carries is under `clientID`, false when it cannot be read. Its delete set names no
 * client, so what it deletes is left to the comment rule.
 */
export function writtenOnlyUnder(update: Uint8Array, clientID: number): boolean {
  try {
    return [...Y.parseUpdateMeta(update).from.keys()].every((writer) => writer === clientID);
  } catch {
    return false;
  }
}
