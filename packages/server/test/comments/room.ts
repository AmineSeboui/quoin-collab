import * as Y from 'yjs';
import { judgeCommentUpdate, type Judgement } from '../../src/comments/judge.ts';

export const SUBJECT = 'guest-1';

export const ALLOWED: Judgement = { ok: true };
export const refused = (reason: string): Judgement => ({ ok: false, reason });

export const textOf = (doc: Y.Doc) => doc.getText('quoin');

/** Where `hello` starts in the text: after its block's marker and the embed that starts the block's text. */
export const HELLO = 2;

export const markerOf = (doc: Y.Doc) => (textOf(doc).toDelta() as { insert: unknown }[])[0]!.insert as Y.Map<unknown>;

/** A text held in the block's marker, as a host's own block type might keep one. */
export const captionOf = (doc: Y.Doc) => markerOf(doc).get('caption') as Y.Text;

export const withCaption = (doc: Y.Doc) => markerOf(doc).set('caption', new Y.Text('a caption'));

const writeDocument = (doc: Y.Doc) =>
  textOf(doc).applyDelta([
    { insert: new Y.Map<unknown>([['id', 'b1'], ['type', 'paragraph'], ['indent', 0], ['attrs', new Y.Map()]]) },
    { insert: { r: 'text' } },
    { insert: 'hello world' },
  ]);

/**
 * A room's document as `quoin-editor` writes one, with `writes` made by a member. The room gets it as an update, so
 * like the server's it knows none of its types.
 */
export function roomWith(...writes: ((doc: Y.Doc) => void)[]): Y.Doc {
  const member = new Y.Doc();
  writeDocument(member);
  for (const write of writes) member.transact(() => write(member));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(member));
  return doc;
}

export type Client = { readonly doc: Y.Doc; change(make: (doc: Y.Doc) => void): Uint8Array };

/** A client synced with `doc`; each change it makes returns the update it would send. */
export function copyOf(doc: Y.Doc): Client {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return {
    doc: copy,
    change(make) {
      const sent: Uint8Array[] = [];
      const keep = (update: Uint8Array) => sent.push(update);
      copy.on('update', keep);
      copy.transact(() => make(copy));
      copy.off('update', keep);
      return Y.mergeUpdates(sent);
    },
  };
}

export const changeOn = (doc: Y.Doc, make: (doc: Y.Doc) => void): Uint8Array => copyOf(doc).change(make);

export const judge = (doc: Y.Doc, update: Uint8Array, field?: string): Judgement =>
  judgeCommentUpdate(doc, update, SUBJECT, field);

export const judgeAt = (doc: Y.Doc, update: Uint8Array, now: number, skewMs?: number): Judgement =>
  judgeCommentUpdate(doc, update, SUBJECT, undefined, { now, skewMs: skewMs ?? 600_000 });
