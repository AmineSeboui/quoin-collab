/**
 * The first byte of every frame. The numbers are y-websocket's, so a y-websocket client reaches this server
 * unchanged and a Quoin client reaches a y-websocket server unchanged.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;
export const MESSAGE_AUTH = 2;
export const MESSAGE_QUERY_AWARENESS = 3;

export type MessageType =
  | typeof MESSAGE_SYNC
  | typeof MESSAGE_AWARENESS
  | typeof MESSAGE_AUTH
  | typeof MESSAGE_QUERY_AWARENESS;
