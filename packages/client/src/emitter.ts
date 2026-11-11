type Listeners<Events extends Record<string, (...args: never[]) => void>> = {
  [K in keyof Events]?: Set<Events[K]>;
};

/** Just enough of an event target for `provider.on('sync', ...)`, typed per event. */
export class Emitter<Events extends Record<string, (...args: never[]) => void>> {
  private readonly listeners: Listeners<Events> = {};

  on<K extends keyof Events>(event: K, listener: Events[K]): void {
    (this.listeners[event] ??= new Set()).add(listener);
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): void {
    this.listeners[event]?.delete(listener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    for (const listener of [...(this.listeners[event] ?? [])]) listener(...(args as never[]));
  }

  protected clearListeners(): void {
    for (const key of Object.keys(this.listeners)) delete this.listeners[key as keyof Events];
  }
}
