import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import type {
    ClipboardOptions,
    ContentSavedEvent,
    CoreModelerServices,
    ThemeMode,
} from "../publicApi";
import type { ViewportManager } from "../viewport";
import type { SelectionManager } from "../selection";
import type { ViewState } from "../viewState";

/**
 * The public TypeScript surface of `@miragon/bpmn-modeler/design`: an
 * engine-neutral, editable BPMN surface for documentation / conceptual modelling.
 *
 * Design mode sits between the full {@link BpmnModelerHandle} (Camunda 7/8, with
 * an engine-bound properties panel) and the readonly {@link BpmnViewerHandle}: it
 * is fully editable — palette, context pad, modelling, copy-paste — but carries
 * only plain-BPMN properties (general / documentation groups), none of the
 * Camunda stack. It never loads camunda-bpmn-js, element templates, token
 * simulation, transaction boundaries, or the lint stack.
 *
 * **The mode marker is the absence of `modeler:executionPlatform` on
 * `bpmn:Definitions`.** A host routes a document with `detectEngine(xml) ===
 * undefined` here (editable Design), and one with a detected engine to
 * {@link createModeler} (Implement). Switching modes is a host concern: stamp or
 * strip the execution platform on the XML, `destroy()` this instance, and stand
 * up the other factory — the conversion helpers are deferred (see ADR 0016).
 *
 * Leanness holds at the *module-graph* level, not a runtime flag, so it survives
 * single-file bundlers (`vite-plugin-singlefile`) that inline everything
 * reachable — hence a separate subpath, mirroring the `/viewer` (ADR 0014) and
 * `/lint` (ADR 0013) precedents. See ADR 0016.
 */

/**
 * The core diagram-js/bpmn-js services a designer exposes through
 * {@link BpmnDesignerHandle.getService}. Identical to {@link CoreModelerServices}
 * (ADR 0011) — Design mode is fully editable, so `modeling` and `commandStack`
 * are present, unlike the readonly viewer's `Pick`.
 */
export type CoreDesignerServices = CoreModelerServices;

/**
 * The host capabilities a designer can opt into. Unlike the root
 * {@link ModelerCapabilities}, this is navigation-only: `modelNavigation`
 * ("Navigate to referenced model" on Call Activities / Business Rule Tasks /
 * linked forms) is engine-neutral, so it belongs on the design surface. The
 * engine-bound ports (`codeLink`, `scripting`) are deliberately absent so they
 * are compile-time-rejected here, mirroring how {@link DesignerOptions} rejects
 * `engine` / `linting` / `elementTemplates`.
 *
 * Present ⇒ the feature's DI module is registered and its context-pad entry
 * appears; absent ⇒ no provider is registered and no entry renders.
 */
export interface DesignerCapabilities {
    modelNavigation?: ModelNavigationPort;
}

/**
 * Per-instance configuration for {@link createDesigner}. Deliberately minimal:
 * Design mode has no engine (there is no execution platform to bind), no element
 * templates, and no linting — every field that survives is engine-neutral. Its
 * only host capability is the engine-neutral `modelNavigation` (see
 * {@link DesignerCapabilities}).
 */
export interface DesignerOptions {
    /**
     * The panel host. Required (as in {@link createModeler}): each instance owns
     * its own properties-panel parent so several surfaces can coexist on a page.
     * The panel shows only the engine-neutral general / documentation groups.
     */
    propertiesPanel: { parent: HTMLElement };

    /**
     * Colour theme — defaults to `"automatic"`. Theming always engages: the
     * instance gets a `data-bpmn-theme` attribute from the first frame.
     */
    theme?: ThemeMode;

    /** UI locale (BCP-47-ish tag) — Design mode has translatable UI. Defaults to `"en"`. */
    locale?: string;

    /**
     * Element types offered first in the append/create menu — the neutral
     * counterpart of the modeler setting of the same name, lifted to a
     * first-class option (Design mode has no `settings`).
     */
    favouriteBpmnElements?: string[];

    /** Clipboard override — omit for the native browser clipboard. */
    clipboard?: ClipboardOptions;

    /**
     * Escape hatch: extra moddle extensions for a host's own BPMN namespace.
     * Matches bpmn-js's own `moddleExtensions`.
     */
    moddleExtensions?: Record<string, object>;

    /**
     * Escape hatch: extra bpmn-js DI modules. Matches bpmn-js's own
     * `additionalModules`.
     */
    additionalModules?: unknown[];

    /**
     * Engine-neutral host capabilities to opt into — currently only
     * `modelNavigation`. Omit a capability and its DI module is never
     * registered, so its context-pad entry never renders. See
     * {@link DesignerCapabilities}.
     */
    capabilities?: DesignerCapabilities;

    /** Debounced diagram content — see {@link ContentSavedEvent}. */
    onContentSaved?: (event: ContentSavedEvent) => void;
}

/**
 * The instance handle {@link createDesigner} resolves to — the editable,
 * engine-neutral analogue of {@link BpmnModelerHandle}. Every member is
 * signature-identical to its modeler counterpart (subset compatibility is
 * asserted in `publicApi.spec.ts`).
 */
export interface BpmnDesignerHandle {
    /** Load BPMN 2.0 XML, replacing any current diagram, and fit it to view. */
    loadDiagram(xml: string): Promise<ImportXMLResult>;

    /** Serialise the current diagram to formatted XML. */
    exportDiagram(): Promise<string>;

    /**
     * Replace the diagram with a new empty one. The base bpmn-js template carries
     * no `modeler:executionPlatform`, so a fresh Design diagram stays in Design
     * mode by the mode-marker semantics above.
     */
    newDiagram(): Promise<ImportXMLResult>;

    /** Export the current diagram as SVG markup. */
    getDiagramSvg(): Promise<string>;

    /** Viewport (zoom/scroll/fit) accessor. */
    readonly viewport: ViewportManager;

    /** Selection accessor. */
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
     * {@link CoreDesignerServices} names are semver-stable; every other name is an
     * unstable escape hatch.
     */
    getService<K extends keyof CoreDesignerServices>(name: K): CoreDesignerServices[K];
    getService<T = unknown>(name: string): T;

    /** Tear the instance down and free its bpmn-js DI graph and DOM. */
    destroy(): void;
}

/**
 * The `@miragon/bpmn-modeler/design` entry point: stand up one engine-neutral,
 * editable designer bound to `container` and resolve its
 * {@link BpmnDesignerHandle}. Async for API-stability symmetry with
 * {@link createModeler}.
 */
export type CreateDesigner = (
    container: HTMLElement,
    options: DesignerOptions,
) => Promise<BpmnDesignerHandle>;
