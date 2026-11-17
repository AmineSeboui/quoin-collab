import type * as Y from 'yjs';
import { sameJson } from './json.ts';

type Run = { readonly end: number; readonly attributes: Readonly<Record<string, unknown>> };

function runsOf(delta: { insert: unknown; attributes?: Record<string, unknown> }[]): Run[] {
  let end = 0;
  return delta.map(({ insert, attributes = {} }) => {
    end += typeof insert === 'string' ? insert.length : 1;
    return { end, attributes };
  });
}

/**
 * Each formatting key that reads differently somewhere in `text` than it did at `before`, with its value now, null
 * where it was taken off. Only formatting may have changed, so both readings run over the same content.
 */
export function changedFormatting(text: Y.Text, before: Y.Snapshot): [string, unknown][] {
  const was = runsOf(text.toDelta(before));
  const now = runsOf(text.toDelta());
  const changes: [string, unknown][] = [];
  let i = 0;
  let j = 0;
  for (let a = was[0], b = now[0]; a !== undefined && b !== undefined; a = was[i], b = now[j]) {
    for (const key of new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)])) {
      if (!sameJson(a.attributes[key], b.attributes[key])) changes.push([key, b.attributes[key] ?? null]);
    }
    if (a.end <= b.end) i += 1;
    if (b.end <= a.end) j += 1;
  }
  return changes;
}
