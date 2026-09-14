/**
 * @internal Lifecycle primitives the modeler surfaces compose their `destroy()`
 * from. Published from `@miragon/bpmn-modeler-types` because the package's
 * `modeSession` subpath may value-import only this workspace lib (see the
 * package's `architecture.spec.ts`), not package-internal helpers.
 */

export type Disposer = () => void;

/**
 * Collects disposers and runs them in reverse-registration (LIFO) order, so
 * every disposer runs while the things it registered after still stand. A
 * disposer that throws does not stop the rest; the first error is rethrown once
 * they have all run.
 */
export class DisposableStore {
    private disposers: Disposer[] = [];

    private disposed = false;

    get isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Registers disposers. Adding to an already-disposed store runs them
     * immediately (LIFO) rather than leaking them, so a late registration on a
     * torn-down surface still frees its resource.
     */
    add(...disposers: Disposer[]): void {
        if (this.disposed) {
            for (let index = disposers.length - 1; index >= 0; index--) {
                disposers[index]();
            }
            return;
        }
        this.disposers.push(...disposers);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        const pending = this.disposers.splice(0).reverse();
        let firstError: unknown;
        let failed = false;
        for (const disposer of pending) {
            try {
                disposer();
            } catch (error) {
                if (!failed) {
                    failed = true;
                    firstError = error;
                }
            }
        }
        if (failed) {
            throw firstError;
        }
    }
}

/**
 * Holds at most one disposer, disposing the previous one whenever a new one is
 * set. For a resource re-armed across its owner's lifetime — the per-load
 * canvas-size observer re-created on every `loadDiagram` — which cannot be a
 * plain {@link DisposableStore} entry.
 */
export class MutableDisposable {
    private current: Disposer | undefined;

    private disposed = false;

    set(disposer: Disposer | undefined): void {
        const previous = this.current;
        this.current = undefined;
        previous?.();
        if (disposer === undefined) {
            return;
        }
        if (this.disposed) {
            disposer();
            return;
        }
        this.current = disposer;
    }

    dispose(): void {
        this.disposed = true;
        const previous = this.current;
        this.current = undefined;
        previous?.();
    }
}

// Bivariant seam: `any[]` keeps real event buses and narrow handlers mutually assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => void;

/** The slice of a bpmn-js / diagram-js event bus {@link subscribe} needs. */
export interface MinimalEventBus {
    on(event: string, handler: EventHandler): void;
    off(event: string, handler: EventHandler): void;
}

/**
 * Subscribes `handler` to `event` and returns a disposer that unsubscribes it.
 * Captures the bus so the disposer still works after the surface is destroyed,
 * when a lazy service accessor would throw.
 */
export function subscribe(bus: MinimalEventBus, event: string, handler: EventHandler): Disposer {
    bus.on(event, handler);
    return () => bus.off(event, handler);
}
