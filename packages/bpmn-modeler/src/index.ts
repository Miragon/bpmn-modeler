/**
 * `@miragon/bpmn-modeler` — the host-free, publishable BPMN modeler (epic #1293).
 *
 * The factory and the designed handle (#1375) are the supported surface; the
 * `@internal`-tagged exports below exist only for the in-repo `apps/bpmn-webview`
 * bootstrap and are removed once it becomes a thin adapter (#1377).
 */

// Side-effect styles the modeler's own DOM depends on (the webview bootstrap
// carried these before the extraction). A theme stylesheet is linked separately
// by the consumer — see `styles.css` / `light-theme.css` / `dark-theme.css`.
import "./styles/default.css";
import "./styles/diff.css";
import "./styles/canvasFocusIndicator.css";

// ── Public factory + designed API surface (#1375) ────────────────────────────
export { createModeler } from "./createModeler";
export type {
    ThemeMode,
    LintingOptions,
    ClipboardOptions,
    ContentSavedEvent,
    ModelerOptions,
    BpmnModelerHandle,
    CreateModeler,
    StableModelerSurface,
} from "./publicApi";
export type { ModelerCapabilities } from "./capabilities";
export { UnsupportedEngineError } from "./modeler";

// ── Re-exports so the rolled-up `.d.ts` stays self-contained ─────────────────
export type {
    Engine,
    BpmnModelerSetting,
    BpmnlintConfig,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";
export { NoModelerError } from "@miragon/bpmn-modeler-types";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

// ── Viewport / selection — public, referenced by the designed handle ─────────
export { ViewportManager } from "./viewport";
export type { ViewportData } from "./viewport";
export { SelectionManager } from "./selection";

// ── Diff view — public rendering primitives + in-page coordinator (#1378) ─────
// The data layer (`computeDiff`/`sideView` + result types) is the Node-safe
// `@miragon/bpmn-modeler/diff` subpath; these are the browser-only primitives.
export { DiffViewer } from "./diff/DiffViewer";
export type { DiffMarkerClass } from "./diff/DiffViewer";
export { DiffLegend } from "./diff/DiffLegend";
export type { DiffLegendCallbacks, DiffLegendContext } from "./diff/DiffLegend";
export { DiffNavigator } from "./diff/DiffNavigator";
export { DiffPaneCoordinator } from "./diff/DiffPaneCoordinator";

// ── @internal — host-only surface the thin bpmn-webview adapter still needs ───
// The adapter reaches the raw {@link BpmnModeler} class (host-only methods:
// onCommandStackChanged, applyImplementationStatus, drill-down restore, …) and
// its `CreateModelerOptions`.
/** @internal */
export { BpmnModeler } from "./modeler";
/** @internal */
export type { CreateModelerOptions } from "./createModeler";
