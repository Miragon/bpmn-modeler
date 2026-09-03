/**
 * `@miragon/bpmn-modeler/viewer` — the host-free, readonly BPMN viewer subpath.
 *
 * A view-only surface: it wraps bpmn-js's NavigatedViewer + outline and drags
 * none of the editing stack (camunda-bpmn-js, properties-panel/preact,
 * CodeMirror, token simulation, lint) into the module graph. It does carry the
 * browser-only diff rendering primitives and, through `DiffLegend`, the shared
 * i18n translator (#1439). See ADR 0014 and its #1439 amendment.
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
    BpmnViewerHandle,
    CoreViewerServices,
    CreateViewer,
} from "./publicApi";
export type { ThemeMode } from "../publicApi";

// ── Viewport / selection — public, referenced by the viewer handle ───────────
export { ViewportManager } from "../viewport";
export type { ViewportData } from "../viewport";
export { SelectionManager } from "../selection";

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
