import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { ALLOWED, HELLO, captionOf, changeOn, copyOf, judge, roomWith, textOf, withCaption } from './room.ts';
import {
  deleteThread,
  guest,
  markThread,
  member,
  replyTo,
  resolveThread,
  startThread,
  unmarkThread,
} from './store.ts';

describe('an update a commenter may send', () => {
  it('a new thread started by the subject', () => {
    const doc = roomWith();
    expect(judge(doc, changeOn(doc, (copy) => startThread(copy, 't-guest', guest)))).toEqual(ALLOWED);
  });

  it('a reply by the subject', () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    expect(judge(doc, changeOn(doc, (copy) => replyTo(copy, 't-member', 'r-guest', guest)))).toEqual(ALLOWED);
  });

  it('a reply to a thread deleted meanwhile', () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) => replyTo(copy, 't-member', 'r-guest', guest));
    Y.applyUpdate(doc, changeOn(doc, (copy) => deleteThread(copy, 't-member')));
    expect(judge(doc, update)).toEqual(ALLOWED);
  });

  it("resolving the subject's thread", () => {
    const doc = roomWith((d) => startThread(d, 't-guest', guest));
    expect(judge(doc, changeOn(doc, (copy) => resolveThread(copy, 't-guest')))).toEqual(ALLOWED);
  });

  it("deleting the subject's thread with every reply on it", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-guest', guest);
      replyTo(d, 't-guest', 'r-guest', guest);
      replyTo(d, 't-guest', 'r-member', member);
    });
    expect(judge(doc, changeOn(doc, (copy) => deleteThread(copy, 't-guest')))).toEqual(ALLOWED);
  });

  it('marking text for a thread created in the same update', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => {
      startThread(copy, 't-guest', guest);
      markThread(copy, 't-guest');
    });
    expect(judge(doc, update)).toEqual(ALLOWED);
  });

  it("marking text for the subject's stored thread", () => {
    const doc = roomWith((d) => startThread(d, 't-guest', guest));
    expect(judge(doc, changeOn(doc, (copy) => markThread(copy, 't-guest')))).toEqual(ALLOWED);
  });

  it("marking a text held anywhere, here in a block map, for the subject's thread", () => {
    const doc = roomWith(withCaption, (d) => startThread(d, 't-guest', guest));
    const update = changeOn(doc, (copy) => captionOf(copy).format(0, 1, { 'comment:t-guest': true }));
    expect(judge(doc, update)).toEqual(ALLOWED);
  });

  it("removing the mark of the subject's thread", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-guest', guest);
      markThread(d, 't-guest');
    });
    expect(judge(doc, changeOn(doc, (copy) => unmarkThread(copy, 't-guest')))).toEqual(ALLOWED);
  });

  it('removing the mark of a thread that no longer exists', () => {
    const doc = roomWith((d) => {
      startThread(d, 't-member', member);
      markThread(d, 't-member');
      deleteThread(d, 't-member');
    });
    expect(judge(doc, changeOn(doc, (copy) => unmarkThread(copy, 't-member')))).toEqual(ALLOWED);
  });

  it('an update the room already has', () => {
    const doc = roomWith();
    const typed = changeOn(doc, (copy) => textOf(copy).insert(HELLO, 'oh '));
    Y.applyUpdate(doc, typed);
    expect(judge(doc, typed)).toEqual(ALLOWED);
  });

  it("the formatting Yjs cleans up after a member's delete", () => {
    const doc = roomWith();
    const guestCopy = copyOf(doc);
    const bold = changeOn(doc, (copy) => textOf(copy).format(HELLO, 5, { bold: true }));
    const cut = changeOn(doc, (copy) => textOf(copy).delete(HELLO, 5));
    Y.applyUpdate(doc, bold);
    Y.applyUpdate(doc, cut);

    const cleanup: Uint8Array[] = [];
    textOf(guestCopy.doc);
    guestCopy.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== doc) cleanup.push(update);
    });
    Y.applyUpdate(guestCopy.doc, bold, doc);
    Y.applyUpdate(guestCopy.doc, cut, doc);

    expect(cleanup).toHaveLength(1);
    expect(judge(doc, cleanup[0]!)).toEqual(ALLOWED);
  });
});
