import {
    type EditableSurfaceMode,
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
    type SurfaceModeService,
} from "@miragon/bpmn-modeler-types/domain";
import type { DisposableStore, Disposer } from "@miragon/bpmn-modeler-types";

import { MODE_ATTRIBUTE, surfaceModeChange } from "../domain/surfaceMode";

interface SurfaceModeEventBus {
    fire(event: string, data: object): unknown;
}

/** The surface's mode. Features read it and listen to {@link SURFACE_MODE_CHANGED}; only the kernel sets it. */
export class KernelSurfaceMode implements SurfaceModeService {
    constructor(
        private readonly eventBus: SurfaceModeEventBus,
        private mode: EditableSurfaceMode,
    ) {}

    get(): EditableSurfaceMode {
        return this.mode;
    }

    /** `false` when the surface already holds `requested`; no event fires then. */
    set(requested: EditableSurfaceMode): boolean {
        const change = surfaceModeChange(this.mode, requested);
        if (change.kind === "unchanged") {
            return false;
        }
        // Held before the event, so a listener that reads the mode sees the new one.
        this.mode = change.mode;
        const event: SurfaceModeChangedEvent = { mode: change.mode };
        this.eventBus.fire(SURFACE_MODE_CHANGED, event);
        return true;
    }
}

export function createSurfaceModeModule(initial: EditableSurfaceMode) {
    function surfaceMode(eventBus: SurfaceModeEventBus): KernelSurfaceMode {
        return new KernelSurfaceMode(eventBus, initial);
    }
    surfaceMode.$inject = ["eventBus"];
    return { [SURFACE_MODE_SERVICE]: ["factory", surfaceMode] };
}

interface ModeChangedEventBus {
    on(
        event: typeof SURFACE_MODE_CHANGED,
        priority: number,
        listener: (event: SurfaceModeChangedEvent) => void,
    ): void;
    off(
        event: typeof SURFACE_MODE_CHANGED,
        listener: (event: SurfaceModeChangedEvent) => void,
    ): void;
}

// Below lint's 500, so the host hears of a change after the panel, the attribute and lint.
const HOST_CALLBACK_PRIORITY = 250;

/** From the event, not from a setter, so a change set on the mode service reaches the host too. */
export function subscribeModeChanged(
    eventBus: ModeChangedEventBus,
    listener: (mode: EditableSurfaceMode) => void,
): Disposer {
    const notify = (event: SurfaceModeChangedEvent): void => {
        listener(event.mode);
    };
    eventBus.on(SURFACE_MODE_CHANGED, HOST_CALLBACK_PRIORITY, notify);
    return () => eventBus.off(SURFACE_MODE_CHANGED, notify);
}

/**
 * Set once the instance is built, so a failed construction leaves no attribute,
 * and before the first paint, so design mode never flashes engine controls;
 * {@link holdModeOnRoots} moves it with each change.
 */
export function markModeRoots(
    store: DisposableStore,
    roots: readonly HTMLElement[],
    mode: EditableSurfaceMode,
): void {
    for (const root of roots) {
        root.setAttribute(MODE_ATTRIBUTE, mode);
    }
    store.add(() => {
        for (const root of roots) {
            root.removeAttribute(MODE_ATTRIBUTE);
        }
    });
}

// With the panel filter at the default priority, before lint and the host.
const ROOT_ATTRIBUTE_PRIORITY = 1000;

/** {@link markModeRoots}, then moves the attribute with each change, as the kernel guarantees it. */
export function holdModeOnRoots(
    store: DisposableStore,
    eventBus: ModeChangedEventBus,
    roots: readonly HTMLElement[],
    mode: EditableSurfaceMode,
): void {
    markModeRoots(store, roots, mode);
    const follow = (event: SurfaceModeChangedEvent): void => {
        for (const root of roots) {
            root.setAttribute(MODE_ATTRIBUTE, event.mode);
        }
    };
    eventBus.on(SURFACE_MODE_CHANGED, ROOT_ATTRIBUTE_PRIORITY, follow);
    store.add(() => eventBus.off(SURFACE_MODE_CHANGED, follow));
}
