import {
    type AppendMenuInjector,
    applyFavouriteBpmnElements,
} from "@miragon/bpmn-modeler-append-menu";

import type { EditingSurface } from "../../kernel/port/bpmnSurface";

/** @experimental What a host calls on a surface's append-menu feature. */
export interface AppendMenuAccessor {
    setFavourites(types: readonly string[]): void;
}

/** @experimental `undefined` on a surface built without the append-menu feature. */
export function appendMenuOf(
    surface: Pick<EditingSurface, "getService">,
): AppendMenuAccessor | undefined {
    const injector = surface.getService<AppendMenuInjector>("injector");
    if (!injector.get("appendMenuOverride", false)) {
        return undefined;
    }
    return {
        setFavourites: (types) => {
            applyFavouriteBpmnElements(injector, types);
        },
    };
}
