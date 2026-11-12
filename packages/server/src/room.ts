import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { awarenessFrame, syncUpdate } from './protocol/index.ts';
import type { SocketSink } from './transport.ts';

/** The origin on a change that arrived from another server process, which must not be published back to it. */
export const REMOTE = Symbol('quoin-collab-remote');

export type RoomEvents = {
  onLocalUpdate(update: Uint8Array): void;
  onLocalAwareness(update: Uint8Array): void;
  onEmpty(): void;
};

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

/**
 * One shared document and the sockets attached to it on this process. A change reaches every other socket here
 * and, through `onLocalUpdate`, every other process serving the same room.
 */
export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  private readonly sinks = new Set<SocketSink>();

  readonly name: string;
  private readonly events: RoomEvents;

  constructor(name: string, events: RoomEvents) {
    this.name = name;
    this.events = events;
    this.awareness.setLocalState(null);
    this.doc.on('update', this.onUpdate);
    this.awareness.on('update', this.onAwareness);
  }

  get size(): number {
    return this.sinks.size;
  }

  state(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  attach(sink: SocketSink): void {
    this.sinks.add(sink);
  }

  detach(sink: SocketSink, clients: readonly number[]): void {
    this.sinks.delete(sink);
    if (clients.length > 0) removeAwarenessStates(this.awareness, [...clients], sink);
    if (this.sinks.size === 0) this.events.onEmpty();
  }

  applyUpdate(update: Uint8Array, origin: unknown): void {
    Y.applyUpdate(this.doc, update, origin);
  }

  applyAwareness(update: Uint8Array, origin: unknown): void {
    applyAwarenessUpdate(this.awareness, update, origin);
  }

  /** Everyone currently known to be here, for a client that has just asked. */
  awarenessSnapshot(): Uint8Array | null {
    const clients = [...this.awareness.getStates().keys()];
    return clients.length === 0 ? null : awarenessFrame(this.awareness, clients);
  }

  destroy(): void {
    this.doc.off('update', this.onUpdate);
    this.awareness.off('update', this.onAwareness);
    this.awareness.destroy();
    this.doc.destroy();
  }

  private readonly onUpdate = (update: Uint8Array, origin: unknown) => {
    this.sendExcept(syncUpdate(update), origin);
    if (origin !== REMOTE) this.events.onLocalUpdate(update);
  };

  private readonly onAwareness = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const clients = [...added, ...updated, ...removed];
    if (clients.length === 0) return;
    this.sendExcept(awarenessFrame(this.awareness, clients), origin);
    if (origin !== REMOTE) this.events.onLocalAwareness(encodeAwarenessUpdate(this.awareness, clients));
  };

  private sendExcept(frame: Uint8Array, origin: unknown): void {
    for (const sink of this.sinks) if (sink !== origin) sink.send(frame);
  }
}
