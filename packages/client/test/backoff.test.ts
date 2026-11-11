import { describe, expect, it } from 'vitest';
import { backoff } from '../src/backoff.ts';

describe('the reconnect delay', () => {
  it('starts almost at once, because the usual close is a time limit rather than a fault', () => {
    expect(backoff().next()).toBeLessThanOrEqual(150);
  });

  it('grows and then stops growing', () => {
    const delay = backoff({ firstMs: 100, baseMs: 1_000, capMs: 8_000 });
    const waits = Array.from({ length: 10 }, () => delay.next());
    expect(waits.every((wait) => wait <= 8_000)).toBe(true);
    expect(Math.max(...waits.slice(5))).toBeGreaterThan(Math.max(...waits.slice(0, 2)));
  });

  it('is jittered, so reconnecting clients do not arrive together', () => {
    const seen = new Set(Array.from({ length: 40 }, () => backoff({ firstMs: 1_000 }).next()));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('goes back to the start once a connection holds', () => {
    const delay = backoff({ firstMs: 100, baseMs: 1_000, capMs: 8_000 });
    for (let i = 0; i < 5; i += 1) delay.next();
    delay.reset();
    expect(delay.next()).toBeLessThanOrEqual(100);
  });
});
