import type * as Y from 'yjs';
import { sameJson } from './json.ts';

/** The attributes in force at a point of a text, as the formatting items before it set them. */
export type Formatting = Map<string, unknown>;

export function applyFormat(formatting: Formatting, { key, value }: Y.ContentFormat): void {
  if (value === null) formatting.delete(key);
  else formatting.set(key, value);
}

/** Each key set differently in `was` and `now`, with its value now, null where it is no longer set. */
export function changedKeys(was: Formatting, now: Formatting): [string, unknown][] {
  return [...new Set([...was.keys(), ...now.keys()])]
    .filter((key) => was.has(key) !== now.has(key) || !sameJson(was.get(key), now.get(key)))
    .map((key) => [key, now.has(key) ? now.get(key) : null]);
}
