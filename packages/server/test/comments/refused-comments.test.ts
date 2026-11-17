import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { judgeCommentUpdate } from '../../src/comments/judge.ts';
import { ALLOWED, changeOn, judge, refused, roomWith } from './room.ts';
import {
  deleteThread,
  guest,
  member,
  reply,
  repliesOf,
  replyTo,
  resolveThread,
  startThread,
  thread,
  threadsOf,
} from './store.ts';

describe('a change to the comments a commenter may not send', () => {
  it('a thread started by someone else', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => startThread(copy, 't-member', member));
    expect(judge(doc, update)).toEqual(refused('adds a thread it may not'));
  });

  it('a thread whose startedBy has an avatarUrl', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) =>
      startThread(copy, 't-guest', { ...guest, avatarUrl: 'https://x.test/a.png' }),
    );
    expect(judge(doc, update)).toEqual(refused('adds a thread it may not'));
  });

  it('a thread whose id is not its key', () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) => threadsOf(copy).set('t-guest', thread('t-member', guest)));
    expect(judge(doc, update)).toEqual(refused('adds a thread it may not'));
  });

  it('a thread held in a Yjs type', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) =>
      threadsOf(copy).set('t-guest', new Y.Map(Object.entries(thread('t-guest', guest)))),
    );
    expect(judge(doc, update)).toEqual(refused('adds a thread it may not'));
  });

  it('a thread started by an empty subject', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => startThread(copy, 't-nobody', { id: '', name: 'Nobody' }));
    expect(judgeCommentUpdate(doc, update, '')).toEqual(refused('adds a thread it may not'));
  });

  it('a reply by someone else', () => {
    const doc = roomWith((d) => startThread(d, 't-guest', guest));
    const update = changeOn(doc, (copy) => replyTo(copy, 't-guest', 'r-member', member));
    expect(judge(doc, update)).toEqual(refused('adds a reply it may not'));
  });

  it('a reply with an avatarUrl', () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) =>
      replyTo(copy, 't-member', 'r-guest', { ...guest, avatarUrl: 'https://x.test/a.png' }),
    );
    expect(judge(doc, update)).toEqual(refused('adds a reply it may not'));
  });

  it('a reply whose body is not text', () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) =>
      repliesOf(copy).set('r-guest', { ...reply('r-guest', 't-member', guest), body: { html: '<b>hi</b>' } }),
    );
    expect(judge(doc, update)).toEqual(refused('adds a reply it may not'));
  });

  it("changing the subject's own reply", () => {
    const doc = roomWith((d) => replyTo(d, 't-member', 'r-guest', guest));
    const update = changeOn(doc, (copy) =>
      repliesOf(copy).set('r-guest', { ...reply('r-guest', 't-member', guest), body: 'Edited.' }),
    );
    expect(judge(doc, update)).toEqual(refused('changes a reply'));
  });

  it("resolving someone else's thread", () => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) => resolveThread(copy, 't-member'));
    expect(judge(doc, update)).toEqual(refused('changes a thread it may not'));
  });

  it('resolving a thread with no startedBy', () => {
    const doc = roomWith((d) => startThread(d, 't-old', undefined));
    const update = changeOn(doc, (copy) => resolveThread(copy, 't-old'));
    expect(judge(doc, update)).toEqual(refused('changes a thread it may not'));
  });

  it("resolving the subject's thread while changing more than resolved", () => {
    const doc = roomWith((d) => startThread(d, 't-guest', guest));
    const update = changeOn(doc, (copy) =>
      threadsOf(copy).set('t-guest', { ...thread('t-guest', guest), resolved: true, createdAt: '2030-01-01' }),
    );
    expect(judge(doc, update)).toEqual(refused('changes a thread it may not'));
  });

  it("deleting someone else's thread", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-member', member);
      replyTo(d, 't-member', 'r-member', member);
    });
    const update = changeOn(doc, (copy) => deleteThread(copy, 't-member'));
    expect(judge(doc, update)).toEqual(refused('deletes a thread it did not start'));
  });

  it("deleting someone else's reply on its own", () => {
    const doc = roomWith((d) => {
      startThread(d, 't-member', member);
      replyTo(d, 't-member', 'r-member', member);
    });
    const update = changeOn(doc, (copy) => repliesOf(copy).delete('r-member'));
    expect(judge(doc, update)).toEqual(refused('deletes a reply without its thread'));
  });

  it('a list item in a comment map', () => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => copy.getArray('comment-threads').insert(0, [thread('t-guest', guest)]));
    expect(judge(doc, update)).toEqual(refused('puts a list item in a comment map'));
  });

  it('the same rules under a field other than comment', () => {
    const doc = roomWith();
    const own = changeOn(doc, (copy) => startThread(copy, 't-guest', guest, 'review'));
    const others = changeOn(doc, (copy) => startThread(copy, 't-member', member, 'review'));
    const underComment = changeOn(doc, (copy) => startThread(copy, 't-guest', guest));
    expect(judge(doc, own, 'review')).toEqual(ALLOWED);
    expect(judge(doc, others, 'review')).toEqual(refused('adds a thread it may not'));
    expect(judge(doc, underComment, 'review')).toEqual(refused('adds a root type'));
  });
});
