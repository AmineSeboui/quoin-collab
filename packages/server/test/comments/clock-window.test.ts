import { describe, expect, it } from 'vitest';
import { ALLOWED, changeOn, judgeAt, refused, roomWith } from './room.ts';
import { guest, member, reply, repliesOf, resolveThread, startThread, thread, threadsOf } from './store.ts';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const MINUTE = 60_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const replyDated = (createdAt: string) => {
  const doc = roomWith((d) => startThread(d, 't-member', member));
  const update = changeOn(doc, (copy) =>
    repliesOf(copy).set('r-guest', reply('r-guest', 't-member', guest, createdAt)),
  );
  return { doc, update };
};

const threadDated = (createdAt: string) => {
  const doc = roomWith();
  const update = changeOn(doc, (copy) => threadsOf(copy).set('t-guest', thread('t-guest', guest, createdAt)));
  return { doc, update };
};

describe('a new comment’s date against the server’s clock', () => {
  it('passes for a reply and a thread dated now', () => {
    const { doc, update } = replyDated(at(0));
    expect(judgeAt(doc, update, NOW)).toEqual(ALLOWED);
    const started = threadDated(at(0));
    expect(judgeAt(started.doc, started.update, NOW)).toEqual(ALLOWED);
  });

  it.each([
    ['11 minutes before', -11 * MINUTE, false],
    ['9 minutes before', -9 * MINUTE, true],
    ['11 minutes after', 11 * MINUTE, false],
    ['9 minutes after', 9 * MINUTE, true],
  ])('on a reply dated %s the clock', (_, offset, passes) => {
    const { doc, update } = replyDated(at(offset));
    expect(judgeAt(doc, update, NOW)).toEqual(passes ? ALLOWED : refused('adds a reply it may not'));
  });

  it.each([
    ['11 minutes before', -11 * MINUTE, false],
    ['9 minutes after', 9 * MINUTE, true],
    ['11 minutes after', 11 * MINUTE, false],
  ])('on a thread dated %s the clock', (_, offset, passes) => {
    const { doc, update } = threadDated(at(offset));
    expect(judgeAt(doc, update, NOW)).toEqual(passes ? ALLOWED : refused('adds a thread it may not'));
  });

  it('refuses a reply dated in year 0', () => {
    const { doc, update } = replyDated('0000-01-01T00:00:00.000Z');
    expect(judgeAt(doc, update, NOW)).toEqual(refused('adds a reply it may not'));
  });

  it('refuses a reply dated an hour ago between a member’s question and answer', () => {
    const doc = roomWith(
      (d) => startThread(d, 't-member', member),
      (d) => repliesOf(d).set('q', reply('q', 't-member', member, at(-2 * 60 * MINUTE))),
      (d) => repliesOf(d).set('a', reply('a', 't-member', member, at(-30 * MINUTE))),
    );
    const update = changeOn(doc, (copy) =>
      repliesOf(copy).set('r-guest', reply('r-guest', 't-member', guest, at(-60 * MINUTE))),
    );
    expect(judgeAt(doc, update, NOW)).toEqual(refused('adds a reply it may not'));
  });

  it('still lets a commenter resolve their own thread created long ago', () => {
    const doc = roomWith((d) => threadsOf(d).set('t-old', thread('t-old', guest, '2020-01-01T00:00:00.000Z')));
    const update = changeOn(doc, (copy) => resolveThread(copy, 't-old'));
    expect(judgeAt(doc, update, NOW)).toEqual(ALLOWED);
  });

  it('takes the window from the clock: 2 minutes off is refused with 1 minute, passed with the default', () => {
    const { doc, update } = replyDated(at(-2 * MINUTE));
    expect(judgeAt(doc, update, NOW, MINUTE)).toEqual(refused('adds a reply it may not'));
    expect(judgeAt(doc, update, NOW)).toEqual(ALLOWED);
  });
});
