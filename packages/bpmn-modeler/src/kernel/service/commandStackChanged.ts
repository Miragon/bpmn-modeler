import { type Disposer, type MinimalEventBus, subscribe } from "@miragon/bpmn-modeler-types";

import type { SurfaceServices } from "./surfaceCore";

// Block bodies: a listener's return value would stop the event reaching later listeners.
export function subscribeCommandStackChanged(
    surface: SurfaceServices,
    listener: () => void,
): Disposer {
    return subscribe(surface.service<MinimalEventBus>("eventBus"), "commandStack.changed", () => {
        listener();
    });
}
