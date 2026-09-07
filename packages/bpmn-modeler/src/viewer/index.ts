/**
 * `@miragon/bpmn-modeler/viewer` — the host-free, readonly BPMN viewer subpath.
 *
 * A view-only surface: it wraps bpmn-js's NavigatedViewer + outline and drags
 * none of the Camunda editing stack (camunda-bpmn-js, CodeMirror, token
 * simulation, lint) into the module graph. It does carry the browser-only diff
 * rendering primitives, the shared i18n translator via `DiffLegend` (#1439),
 * and — when a consumer opts in via `propertiesPanel` — the engine-neutral
 * readonly panel (preact via `@bpmn-io/properties-panel`, #1443). When a consumer
 * opts into `capabilities.modelNavigation` (#1445), it also registers a
 * diagram-js context pad carrying only the "Navigate to referenced model" entry —
 * the one interaction a readonly surface still offers. See ADR 0014 and its
 * amendments.
 *
 * Deliberately imports **no CSS**: `cssCodeSplit: false` on the lib build would
 * fold any stylesheet reachable from here into the shared `dist/bpmn-modeler.css`
 * (the modeler's `styles.css`), pulling the editor chrome's CSS back in. The
 * viewer's own sheet ships separately as `@miragon/bpmn-modeler/viewer.css`
 * (built by `vite.viewer-css.config.mts`), which a consumer loads instead.
 */

// ── Public factory + API surface ─────────────────────────────────────────────
export { createViewer } from "./createViewer";
export type {
    ViewerOptions,
    ViewerCapabilities,
    BpmnViewerHandle,
    CoreViewerServices,
    CreateViewer,
} from "./publicApi";
export type { ThemeMode } from "../publicApi";

// ── Model-navigation capability — the one engine-neutral host port on /viewer ─
export type {
    ModelNavigationPort,
    ModelReference,
    ReferenceKind,
} from "@miragon/bpmn-model-navigation";

// ── Viewport / selection — public, referenced by the viewer handle ───────────
export { ViewportManager } from "../viewport";
export type { ViewportData } from "../viewport";
export { SelectionManager } from "../selection";
export type { RootElementManager } from "../rootElement";
export type { ViewState } from "../viewState";

// ── Diff view — public rendering primitives + in-page coordinator ────────────
// The data layer (`computeDiff`/`sideView`) is the Node-safe
// `@miragon/bpmn-modeler/diff` subpath; these are the browser-only primitives.
export { DiffViewer } from "./diff/DiffViewer";
export type { DiffMarkerClass } from "./diff/DiffViewer";
export { DiffLegend } from "./diff/DiffLegend";
export type { DiffLegendCallbacks, DiffLegendContext } from "./diff/DiffLegend";
export { DiffNavigator } from "./diff/DiffNavigator";
export { DiffPaneCoordinator } from "./diff/DiffPaneCoordinator";

// ── Re-export so the rolled-up `.d.ts` stays self-contained ──────────────────
export { NoModelerError } from "@miragon/bpmn-modeler-types";
