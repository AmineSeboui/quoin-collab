type Pingable = { ping(): void; terminate(): void; on(event: 'pong', listener: () => void): unknown };

/**
 * Drops a socket the other end stopped answering for. Without this a server keeps rooms open for clients that
 * went away without a close frame, which a laptop lid does every time.
 */
export function keepalive(socket: Pingable, intervalMs: number): () => void {
  let alive = true;
  socket.on('pong', () => void (alive = true));
  const timer = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, intervalMs);
  return () => clearInterval(timer);
}
