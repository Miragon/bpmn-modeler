import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";

import type { ThemeMode } from "./publicApi";
import type { RootElementManager } from "./rootElement";
import type { SelectionManager } from "./selection";
import type { ViewState } from "./viewState";
import type { ViewportManager } from "./viewport";

/**
 * @internal The editable surfaces' properties-panel input that still waits in
 * the panel's 600 ms input debounce, so it is not in the diagram or an export.
 */
export interface PendingInputHandle {
    /** Whether the properties panel holds such input; `false` once destroyed. */
    hasPendingInput(): boolean;

    /** Applies that input to the diagram now. A no-op once destroyed. */
    flushPendingInput(): void;
}

/**
 * The members every BPMN surface handle shares — modeler, designer and viewer
 * — with one contract: same document I/O, view state, theme and teardown.
 */
export interface BpmnSurfaceHandle {
    /** Load BPMN 2.0 XML, replacing any current diagram, and fit it to view. */
    loadDiagram(xml: string): Promise<ImportXMLResult>;

    /** Serialise the current diagram to formatted XML. */
    exportDiagram(): Promise<string>;

    /** Export the current diagram as SVG markup. */
    getDiagramSvg(): Promise<string>;

    /** Viewport (zoom/scroll/fit) accessor. */
    readonly viewport: ViewportManager;

    /** Selection accessor. */
    readonly selection: SelectionManager;

    /**
     * Drill-down plane accessor. Host-adapter surface for restoring the active
     * canvas root across an instance switch; the composed
     * {@link captureViewState}/{@link applyViewState} pair covers the common case.
     */
    readonly rootElement: RootElementManager;

    /**
     * Snapshot the drill-down plane, viewbox, and selection so they survive an
     * instance switch — capture here, `destroy()`, create the next instance,
     * `loadDiagram`, then {@link applyViewState}. See {@link ViewState}.
     */
    captureViewState(): ViewState;

    /**
     * Re-apply a {@link captureViewState} snapshot: plane, viewbox, and
     * selection are restored root → viewport → selection; a stale plane or
     * missing element ids degrade gracefully, and an empty selection clears.
     * A restore called right after `loadDiagram` survives the delayed initial
     * fit — the snapshot viewport decides, not a later observer delivery.
     */
    applyViewState(state: ViewState): void;

    /**
     * Switch the colour theme live. Toggles this instance's `data-bpmn-theme`
     * attribute and mirrors it to a legacy `#theme-link` when present. A no-op
     * once the instance is destroyed.
     */
    setTheme(theme: ThemeMode): void;

    /**
     * Tear the instance down and free its bpmn-js DI graph and DOM. Idempotent.
     * Afterwards every other member except the no-op `setTheme` throws
     * {@link NoModelerError} (async members reject with it), including the host
     * pushes, so a host whose calls can race teardown must catch it.
     */
    destroy(): void;
}
