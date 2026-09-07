/**
 * `@miragon/bpmn-modeler` — the host-free, publishable BPMN modeler.
 *
 * The factory and the handle are the supported surface; the `@internal`-tagged
 * exports below exist only for the in-repo `apps/bpmn-webview` adapter.
 */

// Side-effect styles the modeler's own DOM depends on. `themes.css` (imported
// last) folds in the upstream light base + the `[data-bpmn-theme="dark"]`-scoped
// dark overrides, so loading `styles.css` is all a consumer needs for
// per-instance theming. The legacy split `light-theme.css` / `dark-theme.css`
// exports remain for the `#theme-link` fallback.
import "./styles/default.css";
import "./styles/diff.css";
import "./styles/canvasFocusIndicator.css";
import "./styles/themes.css";

// ── Public factory + API surface ─────────────────────────────────────────────
export { createModeler } from "./createModeler";
export type {
    ThemeMode,
    ModelerMode,
    LintingOptions,
    LintModule,
    ClipboardOptions,
    ContentSavedEvent,
    ModelerOptions,
    BpmnModelerHandle,
    CoreModelerServices,
    CreateModeler,
    StableModelerSurface,
} from "./publicApi";
export type { ModelerCapabilities } from "./capabilities";
export type {
    ModelNavigationPort,
    ModelReference,
    ReferenceKind,
} from "@miragon/bpmn-model-navigation";
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
export { detectEngine } from "./detectEngine";
export type { DetectedEngine } from "./detectEngine";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

// ── Viewport / selection — public, referenced by the designed handle ─────────
export { ViewportManager } from "./viewport";
export type { ViewportData } from "./viewport";
export { SelectionManager } from "./selection";
export type { RootElementManager } from "./rootElement";
export type { ViewState } from "./viewState";

// ── Diff view — moved to `@miragon/bpmn-modeler/viewer` (#1439) ───────────────
// Local value+type aliases rather than `export … from`: api-extractor attaches a
// JSDoc `@deprecated` tag to a declaration this file owns, but drops it from a
// bare re-export statement — so only this form surfaces the deprecation in the
// rolled-up `dist/index.d.ts`. The live surface is `@miragon/bpmn-modeler/viewer`.
import { DiffViewer as DiffViewerImpl } from "./viewer/diff/DiffViewer";
import type { DiffMarkerClass as DiffMarkerClassImpl } from "./viewer/diff/DiffViewer";
import { DiffLegend as DiffLegendImpl } from "./viewer/diff/DiffLegend";
import type {
    DiffLegendCallbacks as DiffLegendCallbacksImpl,
    DiffLegendContext as DiffLegendContextImpl,
} from "./viewer/diff/DiffLegend";
import { DiffNavigator as DiffNavigatorImpl } from "./viewer/diff/DiffNavigator";
import { DiffPaneCoordinator as DiffPaneCoordinatorImpl } from "./viewer/diff/DiffPaneCoordinator";

/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffViewer = DiffViewerImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffViewer = DiffViewerImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffMarkerClass = DiffMarkerClassImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffLegend = DiffLegendImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegend = DiffLegendImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegendCallbacks = DiffLegendCallbacksImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffLegendContext = DiffLegendContextImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffNavigator = DiffNavigatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffNavigator = DiffNavigatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export const DiffPaneCoordinator = DiffPaneCoordinatorImpl;
/** @deprecated Import from `@miragon/bpmn-modeler/viewer` instead; removed in a future major. */
export type DiffPaneCoordinator = DiffPaneCoordinatorImpl;

// ── @internal — host-only surface the thin bpmn-webview adapter still needs ───
// The adapter reaches the raw {@link BpmnModeler} class (host-only methods:
// onCommandStackChanged, applyImplementationStatus, drill-down restore, …) and
// its `CreateModelerOptions`.
/** @internal */
export { BpmnModeler } from "./modeler";
/** @internal */
export type { CreateModelerOptions } from "./createModeler";
