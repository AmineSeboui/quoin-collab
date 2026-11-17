import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  HELLO,
  captionOf,
  changeOn,
  copyOf,
  judge,
  markerOf,
  refused,
  roomWith,
  textOf,
  withCaption,
} from './room.ts';
import { guest, markThread, member, startThread } from './store.ts';

describe('a change to the document a commenter may not send', () => {
  it('inserting text', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => textOf(copy).insert(HELLO, 'oh '));
    expect(judge(doc, update)).toEqual(refused('inserts into the text'));
  });

  it('deleting text', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => textOf(copy).delete(HELLO, 5));
    expect(judge(doc, update)).toEqual(refused('deletes from the text'));
  });

  it('bold formatting', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 5, { bold: true }));
    expect(judge(doc, update)).toEqual(refused('formats with bold'));
  });

  it('bold over text a member has made bold meanwhile, which changes nothing yet', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 5, { bold: true }));
    Y.applyUpdate(doc, changeOn(doc, (copy) => textOf(copy).format(HELLO, 5, { bold: true })));
    expect(judge(doc, update)).toEqual(refused('formats with bold'));
  });

  it('taking off bold a member made, which only deletes formatting', () => {
    const doc = roomWith((d) => textOf(d).format(HELLO, 5, { bold: true }));
    const update = changeOn(doc, (copy) => textOf(copy).format(HELLO, 5, { bold: null }));
    expect(judge(doc, update)).toEqual(refused('formats with bold'));
  });

  it('a comment mark for a thread that does not exist', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => markThread(copy, 't-gone'));
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-gone'));
  });

  it("a comment mark for someone else's thread", () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) => markThread(copy, 't-member'));
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-member'));
  });

  it("removing the mark of someone else's thread", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-member', member);
      markThread(d, 't-member');
    });
    const update = changeOn(doc, (copy) => markThread(copy, 't-member', null));
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-member'));
  });

  it('a comment mark with a value other than true', () => {
    const doc = roomWith((d) => startThread(d, 't-guest', guest));
    const update = changeOn(doc, (copy) => markThread(copy, 't-guest', 'yes'));
    expect(judge(doc, update)).toEqual(refused('formats with comment:t-guest'));
  });

  it('a JSON item in the text, which its delta does not show', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => copy.getArray('quoin').insert(0, [{ note: 'hidden' }]));
    expect(judge(doc, update)).toEqual(refused('inserts into the text'));
  });

  it('a key set on the text', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => copy.getMap('quoin').set('title', 'Mine'));
    expect(judge(doc, update)).toEqual(refused('sets a key outside the comment maps'));
  });

  it('inserting into a text held in a block map', () => {
    const doc = roomWith(withCaption);
    const update = changeOn(doc, (copy) => captionOf(copy).insert(0, 'oh '));
    expect(judge(doc, update)).toEqual(refused('inserts into the text'));
  });

  it('changing a text held in a block map while deleting the block', () => {
    const doc = roomWith(withCaption);
    const client = copyOf(doc);
    const format = client.change((copy) => captionOf(copy).format(0, 1, { bold: true }));
    const cut = client.change((copy) => textOf(copy).delete(0, 1));
    expect(judge(doc, Y.mergeUpdates([format, cut]))).toEqual(refused('deletes from the text'));
  });

  it('changing a block map', () => {
    const doc = roomWith();
    const retyped = changeOn(doc, (copy) => markerOf(copy).set('type', 'heading'));
    const restyled = changeOn(doc, (copy) => (markerOf(copy).get('attrs') as Y.Map<unknown>).set('align', 'center'));
    expect(judge(doc, retyped)).toEqual(refused('changes an embedded type'));
    expect(judge(doc, restyled)).toEqual(refused('changes an embedded type'));
  });

  it('a new root type', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => copy.getMap('settings').set('theme', 'dark'));
    expect(judge(doc, update)).toEqual(refused('adds a root type'));
  });
});
