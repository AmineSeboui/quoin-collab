/** The server's clock as a comment is judged: `now` in milliseconds, and how far a new comment's date may be from it. */
export type CommentClock = { readonly now: number; readonly skewMs: number };

export const DEFAULT_CLOCK_SKEW_MS = 600_000;

export const clockAt = (now: number, skewMs = DEFAULT_CLOCK_SKEW_MS): CommentClock => ({
  now,
  skewMs: skewMs > 0 ? skewMs : DEFAULT_CLOCK_SKEW_MS,
});

/** Whether `date`, an ISO date, is no further from the clock than its window allows. */
export const isNear = (date: string, { now, skewMs }: CommentClock): boolean =>
  Math.abs(new Date(date).getTime() - now) <= skewMs;
