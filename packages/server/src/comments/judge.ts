import * as Y from 'yjs';
import { refusalOf } from './effect.ts';
import { scratchCopy, type Scratch } from './scratch.ts';

export type Judgement = { ok: true } | { ok: false; reason: string };

const JUDGED = Symbol('quoin-collab-judged');

function tryUpdate(scratch: Scratch, update: Uint8Array, subject: string): string | null {
  let refusal: string | null = 'was never applied';
  scratch.doc.on('afterTransaction', (transaction: Y.Transaction) => {
    if (transaction.origin === JUDGED) refusal = refusalOf(transaction, scratch, subject);
  });
  try {
    Y.applyUpdate(scratch.doc, update, JUDGED);
  } catch {
    return 'cannot be read';
  }
  // What the room cannot place yet it keeps, and applies later with no judgement.
  if (!Y.snapshotContainsUpdate(Y.snapshot(scratch.doc), update)) return 'needs changes the room lacks';
  return refusal;
}

/**
 * Whether an update from a connection that may only comment can reach the room, decided by what it does to a copy of
 * the room's document, so the room never sees one that fails. `subject` is the token's, and `field` names the comment
 * maps as `yjsCommentThreads` does.
 */
export function judgeCommentUpdate(doc: Y.Doc, update: Uint8Array, subject: string, field = 'comment'): Judgement {
  const scratch = scratchCopy(doc, field);
  try {
    const refusal = tryUpdate(scratch, update, subject);
    return refusal === null ? { ok: true } : { ok: false, reason: refusal };
  } finally {
    scratch.doc.destroy();
  }
}
