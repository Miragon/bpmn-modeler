import {
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
    type SurfaceModeService,
} from "@miragon/bpmn-modeler-types/domain";

import { SURFACE_ROOTS } from "../../../kernel/domain/kernelNames";
import { MODE_ATTRIBUTE } from "../../../kernel/domain/surfaceMode";
import type { SurfaceRoots } from "../../../kernel/port/kernelServices";

interface ModeAttributeInjector {
    get<T>(name: string, strict: false): T | null;
}

interface ModeChangeEventBus {
    on(event: string, listener: (event: SurfaceModeChangedEvent) => void): void;
}

/**
 * Moves `data-bpmn-mode` on the surface roots with each mode change. The kernel
 * sets it once the instance is built and removes it on destroy, so a
 * construction that fails part-way leaves no attribute.
 */
export class ModeAttribute {
    static $inject = ["eventBus", "injector"];

    constructor(eventBus: ModeChangeEventBus, injector: ModeAttributeInjector) {
        if (!injector.get<SurfaceModeService>(SURFACE_MODE_SERVICE, false)) {
            return;
        }
        const roots = injector.get<SurfaceRoots>(SURFACE_ROOTS, false) ?? [];
        eventBus.on(SURFACE_MODE_CHANGED, (event) => {
            for (const root of roots) {
                root.setAttribute(MODE_ATTRIBUTE, event.mode);
            }
        });
    }
}
