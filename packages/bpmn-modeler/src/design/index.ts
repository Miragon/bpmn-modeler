/**
 * `@miragon/bpmn-modeler/design` — the host-free, engine-neutral BPMN design
 * surface.
 *
 * A fully editable but engine-neutral surface for documentation / conceptual
 * modelling: the base bpmn-js Modeler plus a plain-BPMN properties panel
 * (general / documentation groups) and neutral UX (translate, append menu, flow
 * navigation). It drags none of the Camunda editing stack (camunda-bpmn-js,
 * element templates, token simulation, transaction boundaries, lint) into the
 * module graph. That leanness is enforced at the graph level
 * (`scripts/check-design-pure-entry.mjs` + `architecture.spec.ts`) so it holds
 * under single-file bundlers. See ADR 0016.
 *
 * The mode marker is the absence of `modeler:executionPlatform` on
 * `bpmn:Definitions` — route with `detectEngine(xml)` (`undefined` ⇒ Design).
 *
 * Deliberately imports **no CSS**: `cssCodeSplit: false` on the lib build would
 * fold any stylesheet reachable from here into the shared `dist/bpmn-modeler.css`
 * (the modeler's `styles.css`), pulling the editor chrome's CSS back in. The
 * design surface's own sheet ships separately as
 * `@miragon/bpmn-modeler/design.css` (built by `vite.viewer-css.config.mts`),
 * which a consumer loads instead. Note that the properties panel does pull preact
 * and CodeMirror (its FEEL/JSON editors) into the graph — legitimately, unlike
 * the readonly `/viewer`.
 */

// ── Public factory + API surface ─────────────────────────────────────────────
export { createDesigner } from "./createDesigner";
export type {
    DesignerOptions,
    BpmnDesignerHandle,
    CoreDesignerServices,
    CreateDesigner,
} from "./publicApi";
export type { ThemeMode, ClipboardOptions, ContentSavedEvent } from "../publicApi";

// ── Mode routing — re-exported for hosts that decide Design vs Implement ──────
export { detectEngine } from "../detectEngine";
export type { DetectedEngine } from "../detectEngine";

// ── Viewport / selection — public, referenced by the designer handle ─────────
export { ViewportManager } from "../viewport";
export type { ViewportData } from "../viewport";
export { SelectionManager } from "../selection";
export type { ViewState } from "../viewState";

// ── Re-exports so the rolled-up `.d.ts` stays self-contained ─────────────────
export { NoModelerError } from "@miragon/bpmn-modeler-types";
export type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
