import type * as Y from 'yjs';
import { isSubject, startedBy } from './authors.ts';
import { isIsoDate } from './iso-date.ts';
import { isRecord, sameJson } from './json.ts';
import type { KeyChanges } from './key-changes.ts';

const isNewThread = (key: string, value: unknown, subject: string) =>
  isRecord(value) &&
  value.id === key &&
  typeof value.resolved === 'boolean' &&
  isIsoDate(value.createdAt) &&
  isSubject(value.startedBy, subject);

function onlyResolvedDiffers(stored: Record<string, unknown>, value: unknown): boolean {
  if (!isRecord(value) || typeof value.resolved !== 'boolean') return false;
  const keys = new Set([...Object.keys(stored), ...Object.keys(value)]);
  return [...keys].every((key) => key === 'resolved' || sameJson(stored[key], value[key]));
}

/**
 * Why the changes to the threads map may not reach the room, or null when each is the subject's own. A thread is new
 * only under an id `threadIds` never held: the editor makes each id afresh, and a reply left behind by a deleted
 * thread would otherwise show under whatever thread took its id.
 */
export function threadRefusal(
  changes: KeyChanges,
  threads: Y.Map<unknown>,
  threadIds: ReadonlySet<string>,
  subject: string,
): string | null {
  for (const [key, { action, oldValue }] of changes) {
    const value = threads.get(key);
    if (action === 'add' && threadIds.has(key)) return 'brings back a deleted thread';
    if (action === 'add' && !isNewThread(key, value, subject)) return 'adds a thread it may not';
    if (action === 'update' && !(startedBy(oldValue, subject) && onlyResolvedDiffers(oldValue, value))) {
      return 'changes a thread it may not';
    }
    if (action === 'delete' && !startedBy(oldValue, subject)) return 'deletes a thread it did not start';
  }
  return null;
}

export const deletedThreads = (changes: KeyChanges): ReadonlySet<string> =>
  new Set([...changes].filter(([, { action }]) => action === 'delete').map(([key]) => key));
