# Changelog

All three packages are released together under one version, so a tag names the state of the whole wire:
a client and a server from the same release always understand each other. Newest first.

## 0.1.1 (2026-11-11)

### Fixed
- `CollabProvider` starts its reconnect delay again when a connection has synced, rather than when the
  socket opened. A server that accepts a socket and drops it before syncing was retried every 150
  milliseconds for as long as it kept doing so; now it is backed off like any other failure, while the
  close a serverless function's time limit causes still costs 75 to 150 milliseconds, because that
  connection synced. y-websocket's provider has drawn the line in the same place for some time and was
  right to.

### Changed
- The reason given for this client existing is its size, about a third of y-websocket's provider, rather
  than its reconnect. Both handle a function's time limit, and within milliseconds of each other. The
  README said otherwise and was wrong.

## 0.1.0 (2026-11-11)

### Added
- `quoin-collab-protocol`, the frames both ends read and write, which are y-websocket's.
- `quoin-collab-server`: rooms, presence, Postgres persistence, Redis fanout, signed room tokens,
  Prometheus metrics, and a standalone server behind `npx quoin-collab-server`.
- `quoin-collab-client`: one socket to one room, with awareness.

First release. The three had lived inside a private repository since 2026-11-06, which is why their
history starts before this date.
