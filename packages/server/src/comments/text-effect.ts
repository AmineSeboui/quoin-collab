import * as Y from 'yjs';
import { applyFormat, changedKeys, type Formatting } from './formatting.ts';
import type { Marks } from './marks.ts';
import { existedAt, shownAt } from './shown.ts';

/**
 * Why a change to a text may not reach the room, or null when it only adds or removes the subject's comment marks.
 * The text is read item by item, before and after, as `quoin-editor`'s `readItems` reads it: every item that is not
 * formatting shows under the formatting in force there, including content `toDelta` skips. Deleted formatting is
 * judged by what then shows, so the redundant marks Yjs cleans up on its own pass.
 */
export function textRefusal(text: Y.Text, before: Y.Snapshot, marks: Marks): string | null {
  const was: Formatting = new Map();
  const now: Formatting = new Map();
  for (const item of Y.getTypeChildren(text)) {
    const { content } = item;
    const wasShown = shownAt(before, item);
    const isShown = !item.deleted;
    if (content instanceof Y.ContentFormat) {
      if (isShown && !existedAt(before, item) && !marks.mayWrite(content.key, content.value)) {
        return `formats with ${content.key}`;
      }
      if (wasShown) applyFormat(was, content);
      if (isShown) applyFormat(now, content);
    } else if (wasShown !== isShown) {
      return isShown ? 'inserts into the text' : 'deletes from the text';
    } else if (isShown) {
      const refused = changedKeys(was, now).find(([key, value]) => !marks.mayShow(key, value));
      if (refused !== undefined) return `formats with ${refused[0]}`;
    }
  }
  return null;
}
