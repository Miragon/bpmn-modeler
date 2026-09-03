import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type { CoreModelerServices, ThemeMode } from "../publicApi";
import type { ViewportManager } from "../viewport";
import type { SelectionManager } from "../selection";
import type { ViewState } from "../viewState";

/**
 * The public TypeScript surface of `@miragon/bpmn-modeler/viewer`: the readonly
 * analogue of the full modeler.
 *
 * The viewer is a lean, view-only surface for hosts with view-only permissions
 * or embedded previews — it drags none of the editing stack (camunda-bpmn-js,
 * properties-panel/preact, CodeMirror, token simulation, lint) into the module
 * graph. Leanness holds at the *module-graph* level, not a runtime flag, so it
 * survives single-file bundlers (`vite-plugin-singlefile`) that inline
 * everything reachable — hence a separate subpath, mirroring the `/lint`
 * precedent (ADR 0013). See ADR 0014.
 *
 * Every handle member below is signature-identical to its {@link
 * BpmnModelerHandle} counterpart (subset compatibility is asserted in
 * `publicApi.spec.ts`), so a host can narrow a modeler handle to a viewer handle
 * without adapters. There is no `engine`, `propertiesPanel`, `linting`,
 * `clipboard`, `capabilities`, events, or `locale`.
 */

/**
 * The core diagram-js/bpmn-js services a viewer exposes through
 * {@link BpmnViewerHandle.getService}. A `Pick` of {@link CoreModelerServices}
 * (ADR 0011) — the readonly subset: no `modeling` or `commandStack`, so the
 * absence of an editing surface is expressed in the type.
 */
export type CoreViewerServices = Pick<
    CoreModelerServices,
    "canvas" | "elementRegistry" | "eventBus" | "overlays" | "selection"
>;

/**
 * Per-instance configuration for {@link createViewer}. Deliberately minimal: a
 * viewer has no engine (bpmn-js's base viewer reads any BPMN), no properties
 * panel, and no host capabilities.
 */
export interface ViewerOptions {
    /**
     * Colour theme — defaults to `"automatic"`. Theming always engages: the
     * instance gets a `data-bpmn-theme` attribute from the first frame.
     */
    theme?: ThemeMode;

    /**
     * Escape hatch: extra moddle extensions for a host's own BPMN namespace.
     * Matches bpmn-js's own `moddleExtensions`.
     */
    moddleExtensions?: Record<string, object>;

    /**
     * Escape hatch: extra render-only bpmn-js DI modules. Matches bpmn-js's own
     * `additionalModules`.
     */
    additionalModules?: unknown[];
}

/**
 * The instance handle {@link createViewer} resolves to — the readonly subset of
 * {@link BpmnModelerHandle}.
 */
export interface BpmnViewerHandle {
    /** Load BPMN 2.0 XML, replacing any current diagram, and fit it to view. */
    loadDiagram(xml: string): Promise<ImportXMLResult>;

    /** Serialise the current diagram to formatted XML. */
    exportDiagram(): Promise<string>;

    /** Export the current diagram as SVG markup. */
    getDiagramSvg(): Promise<string>;

    /** Viewport (zoom/scroll/fit) accessor. */
    readonly viewport: ViewportManager;

    /** Selection accessor — the viewer's base modules ship visible selection. */
    readonly selection: SelectionManager;

    /**
     * Snapshot the drill-down plane, viewbox, and selection so they survive an
     * instance switch — capture here, `destroy()`, create the next instance,
     * `loadDiagram`, then {@link applyViewState}. See {@link ViewState}.
     */
    captureViewState(): ViewState;

    /**
     * Re-apply a {@link captureViewState} snapshot: plane, viewbox, and
     * selection are restored root → viewport → selection; a stale plane or
     * missing element ids degrade gracefully.
     */
    applyViewState(state: ViewState): void;

    /**
     * Switch the colour theme live. Toggles this instance's `data-bpmn-theme`
     * attribute and mirrors it to a legacy `#theme-link` when present.
     */
    setTheme(theme: ThemeMode): void;

    /**
     * Resolve a core diagram-js/bpmn-js service by name. The
     * {@link CoreViewerServices} names — `canvas`, `elementRegistry`,
     * `eventBus`, `overlays`, `selection` — are semver-stable across minor
     * versions. Editing services (`modeling`, `commandStack`) are not
     * registered on a viewer and throw.
     */
    getService<K extends keyof CoreViewerServices>(name: K): CoreViewerServices[K];
    getService<T = unknown>(name: string): T;

    /** Tear the instance down and free its bpmn-js DI graph and DOM. */
    destroy(): void;
}

/**
 * The `@miragon/bpmn-modeler/viewer` entry point: stand up one readonly viewer
 * bound to `container` and resolve its {@link BpmnViewerHandle}. Async for API
 * stability symmetry with {@link createModeler}.
 */
export type CreateViewer = (
    container: HTMLElement,
    options?: ViewerOptions,
) => Promise<BpmnViewerHandle>;
