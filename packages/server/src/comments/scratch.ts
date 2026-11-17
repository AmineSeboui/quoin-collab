import * as Y from 'yjs';

export type Scratch = {
  readonly doc: Y.Doc;
  readonly threads: Y.Map<unknown>;
  readonly replies: Y.Map<unknown>;
  /** The copy as the room holds it, before the update is tried. */
  readonly before: Y.Snapshot;
};

/**
 * A copy of the room's document to try an update on. Built from an update, it knows none of the room's types, so each
 * root but the two comment maps is read as a `Y.Text`: a root that is no text can then take only comment formatting,
 * which its readers skip.
 */
export function scratchCopy(doc: Y.Doc, field: string): Scratch {
  const copy = new Y.Doc();
  const threadsName = `${field}-threads`;
  const repliesName = `${field}-replies`;
  const threads = copy.getMap<unknown>(threadsName);
  const replies = copy.getMap<unknown>(repliesName);
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  for (const name of [...copy.share.keys()]) if (name !== threadsName && name !== repliesName) copy.getText(name);
  return { doc: copy, threads, replies, before: Y.snapshot(copy) };
}
