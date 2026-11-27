import {
    type CleanupOutcome,
    type Disposer,
    type MinimalEventBus,
    subscribe,
} from "@miragon/bpmn-modeler-types";

import type { CleanupService } from "./CleanupService";
import { LAYOUT_FORMATTED_EVENT, type Layouter, type LayoutOutcome } from "./Layouter";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface SurfaceInjector {
    get<T>(name: string): T;
    get<T>(name: string, strict: false): T | null;
}

const WITHOUT_LAYOUT = "this surface was created without the layout module";

/** What formatting answers on a surface built without the layout module. */
export function formatWithoutLayout(): LayoutOutcome {
    return { status: "failed", message: WITHOUT_LAYOUT, diagnostics: [] };
}

/** What cleanup answers on a surface built without the layout module. */
export function cleanupWithoutLayout(): CleanupOutcome {
    return { status: "failed", items: [], message: WITHOUT_LAYOUT };
}

export function hasSurfaceLayout(injector: SurfaceInjector): boolean {
    return layouterOf(injector) !== null;
}

function layouterOf(injector: SurfaceInjector): Pick<Layouter, "format"> | null {
    return injector.get<Pick<Layouter, "format">>("bpmnLayouter", false);
}

export async function formatSurfaceDiagram(injector: SurfaceInjector): Promise<LayoutOutcome> {
    const layouter = layouterOf(injector);
    if (!layouter) {
        return formatWithoutLayout();
    }
    return layouter.format();
}

export function cleanupSurfaceDiagram(
    injector: SurfaceInjector,
    options?: { apply?: boolean },
): CleanupOutcome {
    const cleanup = injector.get<Pick<CleanupService, "inspect" | "apply">>("bpmnCleanup", false);
    if (!cleanup) {
        return cleanupWithoutLayout();
    }
    return options?.apply ? cleanup.apply() : cleanup.inspect();
}

export function subscribeFormatted(
    injector: SurfaceInjector,
    listener: (outcome: LayoutOutcome) => void,
): Disposer {
    return subscribe(
        injector.get<MinimalEventBus>("eventBus"),
        LAYOUT_FORMATTED_EVENT,
        (event: LayoutOutcome) => {
            listener(layoutOutcomeOf(event));
        },
    );
}

// The bus copies the outcome onto its own event object; the consumer gets the outcome alone.
function layoutOutcomeOf({ status, code, message, diagnostics }: LayoutOutcome): LayoutOutcome {
    const outcome: LayoutOutcome = { status, diagnostics };
    if (code !== undefined) outcome.code = code;
    if (message !== undefined) outcome.message = message;
    return outcome;
}
