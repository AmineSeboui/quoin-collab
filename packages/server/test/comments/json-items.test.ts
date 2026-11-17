import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ALLOWED, HELLO, changeOn, judge, refused, roomWith, textOf } from './room.ts';
import { guest, member, startThread } from './store.ts';

// `quoin-editor` reads a JSON value in its text as an embed under the formatting in force there; `toDelta` skips it.
function withJsonItem(doc: Y.Doc, ...formats: Record<string, unknown>[]): Y.Doc {
  Y.applyUpdate(doc, changeOn(doc, (copy) => copy.getArray('quoin').insert(HELLO, [{ note: 'x' }])));
  for (const format of formats) Y.applyUpdate(doc, changeOn(doc, (copy) => textOf(copy).format(HELLO, 1, format)));
  return doc;
}

describe('formatting on a JSON item in the text, which the editor shows and toDelta skips', () => {
  it("marking it for the subject's thread", () => {
    const doc = withJsonItem(roomWith((d) => startThread(d, 't-guest', guest)));
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 1, { 'comment:t-guest': true }));
    expect(judge(doc, update)).toEqual(ALLOWED);
  });

  it("taking a member's comment mark off it, with an update that only deletes formatting", () => {
    const doc = withJsonItem(roomWith((d) => startThread(d, 't-member', member)), { 'comment:t-member': true });
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 1, { 'comment:t-member': null }));
    expect(Y.decodeUpdate(update).structs).toHaveLength(0);
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-member'));
  });

  it('taking bold off it', () => {
    const doc = withJsonItem(roomWith(), { bold: true });
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 1, { bold: null }));
    expect(judge(doc, update)).toEqual(refused('formats with bold'));
  });

  it('a mark for a thread that does not exist on it alone', () => {
    const doc = withJsonItem(roomWith());
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 1, { 'comment:t-gone': true }));
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-gone'));
  });
});
