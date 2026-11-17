import * as Y from 'yjs';
import { changedFormatting } from './formatting.ts';
import type { Marks } from './marks.ts';

type ItemChanges = { readonly added: ReadonlySet<Y.Item>; readonly deleted: ReadonlySet<Y.Item> };

// A YTextEvent's own `changes` leaves `added` and `deleted` empty, so they are read as on any other event.
const itemChangesOf = (event: Y.YTextEvent): ItemChanges => Reflect.get(Y.YEvent.prototype, 'changes', event);

/**
 * Why a change to a text may not reach the room, or null when it only adds or removes the subject's comment marks.
 * Deleted formatting is judged by what the text then shows, so the redundant marks Yjs cleans up on its own pass.
 */
export function textRefusal(event: Y.YTextEvent, before: Y.Snapshot, marks: Marks): string | null {
  const { added, deleted } = itemChangesOf(event);
  for (const { content } of added) {
    if (!(content instanceof Y.ContentFormat)) return 'inserts into the text';
    if (!marks.mayWrite(content.key, content.value)) return `formats with ${content.key}`;
  }
  for (const { content } of deleted) if (!(content instanceof Y.ContentFormat)) return 'deletes from the text';
  for (const [key, value] of changedFormatting(event.target, before)) {
    if (!marks.mayShow(key, value)) return `formats with ${key}`;
  }
  return null;
}
