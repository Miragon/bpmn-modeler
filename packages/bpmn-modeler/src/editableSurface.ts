import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import type { ElementIdsService } from "@miragon/bpmn-modeler-element-ids";
import {
    type CleanupService,
    LAYOUT_FORMATTED_EVENT,
    type LayoutOutcome,
    type Layouter,
} from "@miragon/bpmn-modeler-layout";
import {
    type BpmnModelerSetting,
    type CleanupOutcome,
    type Disposer,
    type ElementIdProposals,
    type DisposableStore,
    type MinimalEventBus,
    subscribe,
} from "@miragon/bpmn-modeler-types";

import type { LintConfigService } from "./bpmnlint/LintConfigService";
import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";
import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";
import type { ClipboardOptions, ElementIdOptions } from "./publicApi";
import type { SurfaceReporter } from "./reporting/reporting";
import type { SurfaceServices } from "./surfaceCore";

// Kept out of SurfaceCore: these value imports (clipboard modules) must stay out of `/viewer`.

// Structural sliver of the non-core append-menu DI service — only the member called here.
interface AppendMenuOverrideService {
    setFavourites(types: string[]): void;
}

/**
 * Returns the bpmn-js clipboard modules for a clipboard override and registers
 * the contenteditable text polyfill for `roots` on `store`. Without an override
 * the native browser clipboard applies and nothing is installed.
 */
export function installClipboardSupport(
    store: DisposableStore,
    clipboard: ClipboardOptions | undefined,
    roots: readonly HTMLElement[],
): unknown[] {
    if (!clipboard) {
        return [];
    }
    // FEEL editors sit outside bpmn-js DI and need the document-level text bridge.
    // Wrap callbacks to preserve the bridge's this binding.
    const textBridge = clipboard.text ?? clipboard.bridge;
    store.add(
        installContentEditableClipboardPolyfill(roots, {
            requestClipboard: () => textBridge.requestClipboard(),
            writeClipboard: (text) => {
                void textBridge.writeClipboard(text);
            },
        }),
    );
    return createClipboardModules({ element: clipboard.bridge, text: clipboard.text });
}

export function formatSurfaceDiagram(surface: SurfaceServices): Promise<LayoutOutcome> {
    return surface.service<Layouter>("bpmnLayouter").format();
}

// Block bodies: a listener's return value would stop the event reaching later listeners.
export function subscribeCommandStackChanged(
    surface: SurfaceServices,
    listener: () => void,
): Disposer {
    return subscribe(surface.service<MinimalEventBus>("eventBus"), "commandStack.changed", () => {
        listener();
    });
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
    const cleanup = surface.service<CleanupService>("bpmnCleanup");
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

const NO_ELEMENT_IDS: ElementIdProposals = { rows: [], unchecked: [] };

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

/** The element ID option among the modeler settings, as the element ID module takes it. */
export function elementIdSettingsOf(settings: Partial<BpmnModelerSetting>): ElementIdOptions {
    return settings.elementIdsFollowName === undefined
        ? {}
        : { followName: settings.elementIdsFollowName };
}

export function createSurfaceLintHandle(
    surface: SurfaceServices,
    reporter: SurfaceReporter,
): LintHandleMethods {
    return createLintHandleMethods(
        () => surface.optionalService<LintConfigService>("bpmnLintConfig"),
        (message) => reporter.warn(message),
    );
}
