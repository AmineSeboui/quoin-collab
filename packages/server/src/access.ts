/** What a connection may do to the room: change it, change only its own comments, or change nothing. */
export type Access = 'write' | 'comment' | 'read';

/** `canComment` only narrows a read-only grant; without `readOnly` the holder is a writer, as before it existed. */
export function accessOf(grant: { readOnly?: boolean; canComment?: boolean }): Access {
  if (grant.readOnly !== true) return 'write';
  return grant.canComment === true ? 'comment' : 'read';
}
