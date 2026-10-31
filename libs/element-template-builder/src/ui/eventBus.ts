type Listener = (event: never) => void;

/** The subset of diagram-js's event bus the properties panel subscribes through. */
export class PanelEventBus {
    private readonly listeners = new Map<string, Set<Listener>>();

    on(event: string, listener: Listener): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener);
    }

    off(event: string, listener: Listener): void {
        this.listeners.get(event)?.delete(listener);
    }

    fire(event: string, payload: object): void {
        for (const listener of [...(this.listeners.get(event) ?? [])]) {
            (listener as (event: object) => void)(payload);
        }
    }
}
