/** What a comment-only connection is told, in the denial and in the close, when it sends a change it may not make. */
export const REFUSED_REASON = 'refused';

/** The close that follows the denial: not 4401, so a client can tell a refused change from a refused token. */
export const REFUSED_CODE = 4403;
