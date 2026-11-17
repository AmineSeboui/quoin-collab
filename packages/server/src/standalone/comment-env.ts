type Env = Record<string, string | undefined>;

const positive = (value: string | undefined) => {
  const number = Number(value);
  return number > 0 ? number : undefined;
};

/** The comment options the standalone server reads from its environment; an empty or non-positive number is unset. */
export const commentOptionsFromEnv = (env: Env) => ({
  commentField: env.QUOIN_COLLAB_COMMENT_FIELD || undefined,
  maxCommentUpdateBytes: positive(env.QUOIN_COLLAB_MAX_COMMENT_UPDATE_BYTES),
  commentClockSkewMs: positive(env.QUOIN_COLLAB_COMMENT_CLOCK_SKEW_MS),
});
