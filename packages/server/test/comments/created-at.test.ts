import { describe, expect, it } from 'vitest';
import { ALLOWED, changeOn, judge, refused, roomWith } from './room.ts';
import { guest, member, reply, repliesOf, startThread, thread, threadsOf } from './store.ts';

const NOT_DATES = ['yesterday', '2026-11-17', '2026-02-30T00:00:00.000Z', '2026-11-17T09:00:00.000+00:00'];

describe('the date on a new comment', () => {
  it('may be what the editor writes, new Date().toISOString()', () => {
    const now = new Date().toISOString();
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) => {
      threadsOf(copy).set('t-guest', { ...thread('t-guest', guest), createdAt: now });
      repliesOf(copy).set('r-guest', { ...reply('r-guest', 't-member', guest), createdAt: now });
    });
    expect(judge(doc, update)).toEqual(ALLOWED);
  });

  it.each(NOT_DATES)('is refused on a thread as %s, which toISOString never writes', (createdAt) => {
    const doc = roomWith();
    const update = changeOn(doc, (copy) => threadsOf(copy).set('t-guest', { ...thread('t-guest', guest), createdAt }));
    expect(judge(doc, update)).toEqual(refused('adds a thread it may not'));
  });

  it.each(NOT_DATES)('is refused on a reply as %s, which toISOString never writes', (createdAt) => {
    const doc = roomWith((d) => startThread(d, 't-member', member));
    const update = changeOn(doc, (copy) =>
      repliesOf(copy).set('r-guest', { ...reply('r-guest', 't-member', guest), createdAt }),
    );
    expect(judge(doc, update)).toEqual(refused('adds a reply it may not'));
  });
});
