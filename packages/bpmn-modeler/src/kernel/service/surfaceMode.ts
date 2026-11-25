import {
    type EditableSurfaceMode,
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
    type SurfaceModeService,
} from "@miragon/bpmn-modeler-types/domain";

import { surfaceModeChange } from "../domain/surfaceMode";

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
