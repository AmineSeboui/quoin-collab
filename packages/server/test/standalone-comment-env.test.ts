import { describe, expect, it } from 'vitest';
import { commentOptionsFromEnv } from '../src/standalone/comment-env.ts';

describe('the comment options of the standalone server’s environment', () => {
  it('reads the field, the update bound and the clock window', () => {
    expect(
      commentOptionsFromEnv({
        QUOIN_COLLAB_COMMENT_FIELD: 'notes',
        QUOIN_COLLAB_MAX_COMMENT_UPDATE_BYTES: '1024',
        QUOIN_COLLAB_COMMENT_CLOCK_SKEW_MS: '60000',
      }),
    ).toEqual({ commentField: 'notes', maxCommentUpdateBytes: 1024, commentClockSkewMs: 60_000 });
  });

  it.each(['', '0', '-5', 'soon', undefined])('reads %s as the default', (value) => {
    const options = commentOptionsFromEnv({
      QUOIN_COLLAB_MAX_COMMENT_UPDATE_BYTES: value,
      QUOIN_COLLAB_COMMENT_CLOCK_SKEW_MS: value,
    });
    expect(options.maxCommentUpdateBytes).toBeUndefined();
    expect(options.commentClockSkewMs).toBeUndefined();
  });
});
