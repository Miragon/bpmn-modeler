/**
 * `@miragon/bpmn-modeler/viewer` — the host-free, readonly BPMN viewer subpath.
 *
 * A lean, view-only surface: it wraps bpmn-js's NavigatedViewer + outline and
 * drags none of the editing stack (camunda-bpmn-js, properties-panel/preact,
 * CodeMirror, token simulation, lint, i18n) into the module graph. That leanness
 * is enforced at the graph level (`scripts/check-viewer-pure-entry.mjs` +
 * `architecture.spec.ts`) so it holds under single-file bundlers. See ADR 0014.
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

// ── Re-export so the rolled-up `.d.ts` stays self-contained ──────────────────
export { NoModelerError } from "@miragon/bpmn-modeler-types";
