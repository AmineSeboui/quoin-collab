import * as Y from 'yjs';
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness';
import { awarenessFrame, syncStep1, syncUpdate } from './protocol/index.ts';
import { backoff, type Backoff } from './backoff.ts';
import { Emitter } from './emitter.ts';
import { handleFrame } from './handle-frame.ts';
import { roomUrl } from './room-url.ts';

export type ProviderStatus = 'offline' | 'connecting' | 'connected';

export type ProviderEvents = {
  sync: (synced: boolean) => void;
  status: (status: ProviderStatus) => void;
  denied: (reason: string) => void;
  error: (error: Error) => void;
};

export type CollabProviderOptions = {
  /** `wss://host/api/collab`, or a path on this origin such as `/api/collab`. */
  url: string;
  room: string;
  doc?: Y.Doc;
  awareness?: Awareness;
  /** A string, or a function called before every connect so a short lived token can be refreshed. */
  token?: string | (() => string | Promise<string>);
  /** False leaves the provider offline until `connect` is called. */
  connect?: boolean;
  socketFactory?: (url: string) => WebSocket;
};

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

/**
 * One socket to one room. It carries the surface Quoin's collaboration guide expects, `synced` and the `sync`
 * event, so it drops into `yjsCollaboration` the way y-websocket's provider does, and it reconnects on its own:
 * a function with a time limit closes a healthy connection, and that must not read as a failure.
 */
export class CollabProvider extends Emitter<ProviderEvents> {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly room: string;

  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly delay: Backoff = backoff();
  private readonly origin = Object.freeze({ provider: 'quoin-collab' });
  private readonly ownsDoc: boolean;
  private readonly ownsAwareness: boolean;
  private wanted: boolean;
  private settled = false;
  private state: ProviderStatus = 'offline';
  private destroyed = false;
  private readonly options: CollabProviderOptions;

  constructor(options: CollabProviderOptions) {
    super();
    this.options = options;
    this.room = options.room;
    this.ownsDoc = options.doc === undefined;
    this.doc = options.doc ?? new Y.Doc();
    this.ownsAwareness = options.awareness === undefined;
    this.awareness = options.awareness ?? new Awareness(this.doc);
    this.wanted = options.connect !== false;
    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    if (typeof addEventListener === 'function') addEventListener('pagehide', this.leave);
    if (this.wanted) this.open();
  }

  get synced(): boolean {
    return this.settled;
  }

  get status(): ProviderStatus {
    return this.state;
  }

  connect(): void {
    if (this.destroyed || this.wanted) return;
    this.wanted = true;
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    this.teardown(1000, 'the client disconnected');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.leave();
    this.disconnect();
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    if (typeof removeEventListener === 'function') removeEventListener('pagehide', this.leave);
    if (this.ownsAwareness) this.awareness.destroy();
    if (this.ownsDoc) this.doc.destroy();
    this.clearListeners();
  }

  private readonly leave = () => {
    this.awareness.setLocalState(null);
  };

  private setStatus(status: ProviderStatus): void {
    if (this.state === status) return;
    this.state = status;
    this.emit('status', status);
  }

  private setSynced(synced: boolean): void {
    if (this.settled === synced) return;
    this.settled = synced;
    // A connection that synced did useful work, so the next close starts the delay again. One that opened and
    // was dropped before syncing did not, and a server accepting sockets it cannot serve must be backed off
    // rather than retried every 150 milliseconds.
    if (synced) this.delay.reset();
    this.emit('sync', synced);
  }

  private send(data: Uint8Array): void {
    // lib0 hands back a view on a plain ArrayBuffer, which `send` wants spelled out since it rejects a shared one.
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data as Uint8Array<ArrayBuffer>);
  }

  private async resolveToken(): Promise<string | null> {
    const { token } = this.options;
    if (token === undefined) return null;
    return typeof token === 'function' ? await token() : token;
  }

  private open(): void {
    if (this.destroyed || !this.wanted || this.socket !== null) return;
    this.setStatus('connecting');
    void this.resolveToken()
      .then((token) => {
        if (this.destroyed || !this.wanted || this.socket !== null) return;
        const url = roomUrl(this.options.url, this.room, token);
        const socket = this.options.socketFactory?.(url) ?? new WebSocket(url);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;
        socket.onopen = () => this.onOpen();
        socket.onmessage = (event: MessageEvent<ArrayBuffer>) => this.onMessage(event);
        socket.onclose = () => this.onClose();
        socket.onerror = () => this.emit('error', new Error(`The connection to ${this.room} failed.`));
      })
      .catch((error: unknown) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
        this.scheduleRetry();
      });
  }

  private onOpen(): void {
    this.setStatus('connected');
    this.send(syncStep1(this.doc));
    const local = this.awareness.getLocalState();
    if (local !== null) this.send(awarenessFrame(this.awareness, [this.doc.clientID]));
  }

  private onMessage(event: MessageEvent<ArrayBuffer>): void {
    handleFrame(new Uint8Array(event.data), {
      doc: this.doc,
      awareness: this.awareness,
      origin: this.origin,
      send: (data) => this.send(data),
      onSynced: () => this.setSynced(true),
      onDenied: (reason) => {
        this.wanted = false;
        this.emit('denied', reason);
      },
    });
  }

  private onClose(): void {
    this.socket = null;
    this.setSynced(false);
    this.setStatus('offline');
    this.forgetOthers();
    this.scheduleRetry();
  }

  /** Carets from a connection that has ended would otherwise sit on the page until their own timeout. */
  private forgetOthers(): void {
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    if (others.length > 0) removeAwarenessStates(this.awareness, others, this.origin);
  }

  private scheduleRetry(): void {
    if (this.destroyed || !this.wanted || this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, this.delay.next());
  }

  private teardown(code: number, reason: string): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onopen = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(code, reason);
      }
    }
    this.setSynced(false);
    this.setStatus('offline');
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this.origin) this.send(syncUpdate(update));
  };

  private readonly onAwarenessUpdate = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    if (origin === this.origin) return;
    const clients = [...added, ...updated, ...removed];
    if (clients.length > 0) this.send(awarenessFrame(this.awareness, clients));
  };
}
