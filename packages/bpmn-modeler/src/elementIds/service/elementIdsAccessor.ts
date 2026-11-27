import {
    applyElementIdSettings,
    type ElementIdOptions,
    type ElementIdsInjector,
    hasSurfaceElementIds,
    proposeSurfaceElementIds,
    renameSurfaceElementIds,
} from "@miragon/bpmn-modeler-element-ids";
import type { ElementIdProposals } from "@miragon/bpmn-modeler-types";

import type { EditingSurface } from "../../kernel/port/bpmnSurface";

/** @experimental What a host calls on a surface's element-ID feature. */
export interface ElementIdsAccessor {
    configure(options: ElementIdOptions): void;
    propose(unchecked?: readonly string[]): ElementIdProposals;
    rename(unchecked: readonly string[]): number;
}

/** @experimental `undefined` on a surface built without the element-ID feature. */
export function elementIdsOf(
    surface: Pick<EditingSurface, "getService">,
): ElementIdsAccessor | undefined {
    const injector = surface.getService<ElementIdsInjector>("injector");
    if (!hasSurfaceElementIds(injector)) {
        return undefined;
    }
    return {
        configure: (options) => {
            applyElementIdSettings(injector, options);
        },
        propose: (unchecked) => proposeSurfaceElementIds(injector, unchecked),
        rename: (unchecked) => renameSurfaceElementIds(injector, unchecked),
    };
}
