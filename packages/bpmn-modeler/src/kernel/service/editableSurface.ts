import type { ElementIdOptions, ElementIdsService } from "@miragon/bpmn-modeler-element-ids";
import {
    type CleanupService,
    LAYOUT_FORMATTED_EVENT,
    type LayoutOutcome,
    type Layouter,
} from "@miragon/bpmn-modeler-layout";
import {
    type CleanupOutcome,
    type Disposer,
    type ElementIdProposals,
    type MinimalEventBus,
    subscribe,
} from "@miragon/bpmn-modeler-types";

import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";
import type { SurfaceReporter } from "./reporting";
import type { SurfaceServices } from "./surfaceCore";

// Kept out of SurfaceCore: the layout value import must stay out of `/viewer`.

// Structural sliver of the non-core append-menu DI service — only the member called here.
interface AppendMenuOverrideService {
    setFavourites(types: string[]): void;
}

const WITHOUT_LAYOUT = "this surface was created without the layout module";

export async function formatSurfaceDiagram(surface: SurfaceServices): Promise<LayoutOutcome> {
    const layouter = surface.optionalService<Layouter>("bpmnLayouter");
    if (!layouter) {
        return { status: "failed", message: WITHOUT_LAYOUT, diagnostics: [] };
    }
    return layouter.format();
}

export function subscribeFormatted(
    surface: SurfaceServices,
    listener: (outcome: LayoutOutcome) => void,
): Disposer {
    return subscribe(
        surface.service<MinimalEventBus>("eventBus"),
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

export function cleanupSurfaceDiagram(
    surface: SurfaceServices,
    options?: { apply?: boolean },
): CleanupOutcome {
    const cleanup = surface.optionalService<CleanupService>("bpmnCleanup");
    if (!cleanup) {
        return { status: "failed", items: [], message: WITHOUT_LAYOUT };
    }
    return options?.apply ? cleanup.apply() : cleanup.inspect();
}

/** A surface built without the append menu ignores favourites. */
export function applyFavouriteBpmnElements(
    surface: SurfaceServices,
    types: readonly string[],
): void {
    surface
        .optionalService<AppendMenuOverrideService>("appendMenuOverride")
        ?.setFavourites([...types]);
}

const NO_ELEMENT_IDS: ElementIdProposals = { rows: [] };

export function proposeSurfaceElementIds(
    surface: SurfaceServices,
    unchecked: readonly string[] | undefined,
): ElementIdProposals {
    return (
        surface
            .optionalService<ElementIdsService>("elementIds")
            ?.list(unchecked && new Set(unchecked)) ?? NO_ELEMENT_IDS
    );
}

export function renameSurfaceElementIds(
    surface: SurfaceServices,
    unchecked: readonly string[],
): number {
    return (
        surface.optionalService<ElementIdsService>("elementIds")?.rename(new Set(unchecked)) ?? 0
    );
}

export function applyElementIdSettings(surface: SurfaceServices, options: ElementIdOptions): void {
    surface.optionalService<ElementIdsService>("elementIds")?.configure(options);
}

export function createSurfaceLintHandle(
    surface: SurfaceServices,
    reporter: SurfaceReporter,
): LintHandleMethods {
    return createLintHandleMethods(
        () => surface.optionalService<LintHandleMethods>("bpmnLintConfig"),
        (message) => reporter.warn(message),
    );
}
