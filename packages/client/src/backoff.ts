export type Backoff = { next(): number; reset(): void };

/**
 * Full jitter, starting almost at once. A serverless function ends a healthy connection when it reaches its time
 * limit, so the common reconnect is not a failure and should not be made to wait a second.
 */
export function backoff({ firstMs = 150, baseMs = 500, capMs = 15_000 } = {}): Backoff {
  let attempt = 0;
  return {
    next: () => {
      const delay = attempt === 0 ? firstMs : Math.min(capMs, baseMs * 2 ** (attempt - 1));
      attempt += 1;
      return Math.round(delay * (0.5 + Math.random() * 0.5));
    },
    reset: () => void (attempt = 0),
  };
}
