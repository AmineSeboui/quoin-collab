import * as Y from 'yjs';

export const existedAt = (snapshot: Y.Snapshot, item: Y.Item): boolean =>
  item.id.clock < (snapshot.sv.get(item.id.client) ?? 0);

/** Whether `item` was in the document, and not deleted, at `snapshot`: Yjs's own test, which it does not export. */
export const shownAt = (snapshot: Y.Snapshot, item: Y.Item): boolean =>
  existedAt(snapshot, item) && !Y.isDeleted(snapshot.ds, item.id);
