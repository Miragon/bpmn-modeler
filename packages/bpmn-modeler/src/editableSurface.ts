import { createClipboardModules } from "@miragon/bpmn-modeler-clipboard";
import type { CleanupService, LayoutOutcome, Layouter } from "@miragon/bpmn-modeler-layout";
import type { CleanupOutcome, DisposableStore } from "@miragon/bpmn-modeler-types";

import type { LintConfigService } from "./bpmnlint/LintConfigService";
import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";
import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";
import type { ClipboardOptions } from "./publicApi";
import type { SurfaceReporter } from "./reporting";
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

export function createSurfaceLintHandle(
    surface: SurfaceServices,
    reporter: SurfaceReporter,
): LintHandleMethods {
    return createLintHandleMethods(
        () => surface.optionalService<LintConfigService>("bpmnLintConfig"),
        (message) => reporter.warn(message),
    );
}
