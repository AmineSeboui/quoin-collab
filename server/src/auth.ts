export type ConnectionRequest = {
  /** The document the client asked for, taken from the path. */
  room: string;
  /** The `token` query parameter, when the client sent one. */
  token: string | null;
  headers: Readonly<Record<string, string | undefined>>;
};

export type Authorization = {
  /** A read-only client receives every change and writes none; its frames that would write are dropped. */
  readOnly?: boolean;
  /**
   * The room this connection actually opens, when it is not the one asked for. A deployment serving more than
   * one tenant sets it to a name carrying the tenant, so that two customers who both call a room `notes` are
   * in two documents rather than one. The client never learns the rewritten name and does not need to.
   */
  room?: string;
};

/**
 * Decides whether a client may open a room. Returning null turns it away with a denial frame, so the client can
 * tell a rejection from a network failure. Absent, every connection is accepted, which suits local development
 * and nothing else.
 */
export type Authorize = (request: ConnectionRequest) => Authorization | null | Promise<Authorization | null>;
