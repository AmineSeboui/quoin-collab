import type * as Y from 'yjs';
import { isSubject } from './authors.ts';
import { isIsoDate } from './iso-date.ts';
import { isRecord } from './json.ts';
import type { KeyChanges } from './key-changes.ts';

const isNewReply = (key: string, value: unknown, subject: string) =>
  isRecord(value) &&
  value.id === key &&
  typeof value.threadId === 'string' &&
  typeof value.body === 'string' &&
  isIsoDate(value.createdAt) &&
  isSubject(value.author, subject);

const isOnThread = (reply: unknown, threads: ReadonlySet<string>) =>
  isRecord(reply) && typeof reply.threadId === 'string' && threads.has(reply.threadId);

/**
 * Why the changes to the replies map may not reach the room, or null when each adds the subject's reply or goes with
 * a thread `deletedThreads` takes away.
 */
export function replyRefusal(
  changes: KeyChanges,
  replies: Y.Map<unknown>,
  subject: string,
  deletedThreads: ReadonlySet<string>,
): string | null {
  for (const [key, { action, oldValue }] of changes) {
    if (action === 'add' && !isNewReply(key, replies.get(key), subject)) return 'adds a reply it may not';
    if (action === 'update') return 'changes a reply';
    if (action === 'delete' && !isOnThread(oldValue, deletedThreads)) return 'deletes a reply without its thread';
  }
  return null;
}
