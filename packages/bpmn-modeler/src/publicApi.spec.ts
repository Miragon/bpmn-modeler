import { describe, it, expect } from "vitest";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import { BpmnModeler } from "./modeler";
import { BpmnViewer } from "./viewer/viewer";
import { BpmnDesigner } from "./design/designer";
import type { CreateModelerOptions } from "./createModeler";
import type {
    BpmnModelerHandle,
    ClipboardOptions,
    ContentSavedEvent,
    CoreModelerServices,
    CreateModeler,
    LintingOptions,
    LintModule,
    ModelerMode,
    ModelerOptions,
    StableModelerSurface,
    ThemeMode,
} from "./publicApi";
import type { ViewState } from "./viewState";
import type { BpmnViewerHandle, CoreViewerServices, ViewerOptions } from "./viewer/publicApi";
import type {
    BpmnDesignerHandle,
    CoreDesignerServices,
    DesignerCapabilities,
    DesignerOptions,
} from "./design/publicApi";
// The three model-navigation types must be re-exported from both barrels — the
// public proof that a /design consumer can name the port and its references.
import type {
    ModelNavigationPort as ModelNavigationPortFromRoot,
    ModelReference as ModelReferenceFromRoot,
    ReferenceKind as ReferenceKindFromRoot,
} from "./index";
import type {
    ModelNavigationPort as ModelNavigationPortFromDesign,
    ModelReference as ModelReferenceFromDesign,
    ReferenceKind as ReferenceKindFromDesign,
} from "./design/index";

// A minimal stub of the injected `@miragon/bpmn-modeler/lint` namespace. The
// on-tiers below all require a `module`, so migration failures are compile-time.
const _lintModule: LintModule = { createLintModule: () => ({}) };

/**
 * Type-level conformance + scenario spec for the public API.
 *
 * The assertions below are compile-checked (this file is type-checked by
 * `tsconfig.spec.json`); the single runtime `it` exists only so the test runner
 * has something to execute — esbuild strips the types without checking them, so
 * the guarantee is the `tsc` pass, not the vitest run.
 *
 * `satisfies` is used instead of a plain annotation so the checks cannot be
 * widened away by an over-broad target type.
 */

// Conformance: the BpmnModeler class satisfies the full handle. If a future
// refactor reshapes one of these members, this line stops compiling.
const _conformance = (modeler: BpmnModeler): BpmnModelerHandle => modeler;
void _conformance;

// Class→handle conformance for the viewer and designer too: a forgotten method
// on either class (e.g. a missing captureViewState) is a compile error here
// rather than a runtime `undefined` on the handle the factory returns.
const _viewerConformance = (v: BpmnViewer): BpmnViewerHandle => v;
void _viewerConformance;
const _designerConformance = (d: BpmnDesigner): BpmnDesignerHandle => d;
void _designerConformance;

// The captured view-state shape is frozen: viewport, an optional plane id, and
// the selection id list. A field drop/rename breaks this literal.
const _viewState = {
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    rootElementId: "SubProcess_1_plane",
    selectedElementIds: ["Task_1"],
} satisfies ViewState;
void _viewState;
// rootElementId is optional — a top-level-plane snapshot omits it.
const _viewStateTopLevel = {
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    selectedElementIds: [],
} satisfies ViewState;
void _viewStateTopLevel;

// Structural sanity check that the frozen stable subset stays a subset of the
// full handle as the surface grows.
type _HandleIsSuperset = BpmnModelerHandle extends StableModelerSurface ? true : never;
const _handleSuperset: _HandleIsSuperset = true;
void _handleSuperset;

// Element templates arrive as fetched data, not a path.
const _scenarioTemplates = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    elementTemplates: [{ id: "tpl", name: "Fetched template" }],
} satisfies ModelerOptions;
void _scenarioTemplates;

// [A] Escape hatches: extra DI modules alongside a custom moddle extension for
// a host's own BPMN namespace (bpmiq's sticky-note case).
const _scenarioEscapeHatches = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    additionalModules: [{ __init__: [] }],
    moddleExtensions: {
        bpmiq: { name: "bpmiq", uri: "http://bpmiq/schema", prefix: "bpmiq", types: [] },
    },
} satisfies ModelerOptions;
void _scenarioEscapeHatches;

// An async ModelNavigationPort (GitHub-API resolution before opening a tab).
// The return type must accept `async`.
const _asyncNavigation: ModelNavigationPort = {
    async openReference({ id, kind }) {
        await Promise.resolve();
        void id;
        void kind;
    },
};
const _scenarioAsyncNav = {
    engine: "c8",
    propertiesPanel: { parent: document.createElement("div") },
    capabilities: { modelNavigation: _asyncNavigation },
} satisfies ModelerOptions;
void _scenarioAsyncNav;

// A host may keep navigation visibility in sync with its own workspace index.
// Without these optional hooks, syntactically valid references stay visible.
const _formAwareNavigation = {
    openReference: (_reference) => undefined,
    isReferenceAvailable: ({ id, kind }) => kind !== "form" || id === "Form_Request",
    onReferenceAvailabilityChanged: (_listener) => () => undefined,
} satisfies ModelNavigationPort;
void _formAwareNavigation;

// Graceful `{ module, config }` linting. The literal type-checks against the
// BpmnlintConfig mirror; unresolvable rules degrade at runtime and surface via
// onLintResults({ results, unresolved }).
const _scenarioLintConfig = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    linting: {
        module: _lintModule,
        config: { extends: "bpmnlint:recommended", rules: { "label-required": "warn" } },
    },
    onLintResults: ({ results, unresolved }) => {
        void results;
        void unresolved;
    },
} satisfies ModelerOptions;
void _scenarioLintConfig;

// External tier: `{ module, results: "external" }`. `module` is required — the
// external tier still needs LintConfigService to paint host-pushed results.
const _scenarioLintExternal = {
    engine: "c8",
    propertiesPanel: { parent: document.createElement("div") },
    linting: { module: _lintModule, results: "external" },
} satisfies ModelerOptions;
void _scenarioLintExternal;

// Migration failures are compile-time: an object tier without `module` is
// rejected, and `config` never rides the external variant.
const _lintMissingModule = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — an object lint tier must supply a `module`.
    linting: { config: {} },
} satisfies ModelerOptions;
void _lintMissingModule;

const _lintExternalMissingModule = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — the external tier must supply a `module`.
    linting: { results: "external" },
} satisfies ModelerOptions;
void _lintExternalMissingModule;

// Type-level entry conformance (no runtime load): the real `/lint` subpath
// namespace structurally satisfies the public LintModule contract. If
// createLintModule's signature drifts from LintModule, this line stops
// compiling — keeping the structural interface in sync with the implementation.
type _EntryConformsToLintModule = typeof import("./bpmnlint") extends LintModule ? true : never;
const _entryConforms: _EntryConformsToLintModule = true;
void _entryConforms;

// [B] Opinionated built-ins: each tier/override type-checks in isolation, and
// the target factory type is nameable. These exercise the built-in and event
// declarations the scenario literals above don't reach.
const _themes = ["light", "dark", "automatic"] satisfies ThemeMode[];
void _themes;
const _lintOff: LintingOptions = false;
const _lintExternal: LintingOptions = { module: _lintModule, results: "external" };
const _lintConfig: LintingOptions = { module: _lintModule, config: {} };
void [_lintOff, _lintExternal, _lintConfig];
const _clipboard: ClipboardOptions = {
    bridge: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
};
// A host with two protocol channels (VS Code) supplies a separate `text`
// bridge; the package forwards it to createClipboardModules' text binding and
// drives the contenteditable polyfill from it.
const _clipboardWithText: ClipboardOptions = {
    bridge: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
    text: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
};
void _clipboardWithText;
// The runtime factory accepts the same clipboard override — omit it for the
// native browser clipboard, or pass `{ bridge }` to route through a host. The
// runtime options extend {@link ModelerOptions} (engine + nested
// `propertiesPanel`), plus the internal `handleGlobalEscape`.
const _createWithClipboard = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    clipboard: _clipboard,
} satisfies CreateModelerOptions;
void _createWithClipboard;
const _createNativeClipboard = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    handleGlobalEscape: true,
} satisfies CreateModelerOptions;
void _createNativeClipboard;
const _builtinsShape = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    theme: "dark",
    locale: "de",
    linting: false,
    clipboard: _clipboard,
    onContentSaved: ({ xml }: ContentSavedEvent) => void xml,
} satisfies ModelerOptions;
void _builtinsShape;

// [B] Design/implement mode is a built-in runtime toggle (#1442). The mode
// literals type-check against the option, an unknown mode is rejected, and
// onModeChanged narrows its argument to ModelerMode.
const _modes = ["design", "implement"] satisfies ModelerMode[];
void _modes;
const _scenarioDesignMode = {
    engine: "c8",
    propertiesPanel: { parent: document.createElement("div") },
    mode: "design",
    onModeChanged: (mode: ModelerMode) => void mode,
} satisfies ModelerOptions;
void _scenarioDesignMode;
const _rejectsUnknownMode = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — "view" is not a modeler mode (design | implement only).
    mode: "view",
} satisfies ModelerOptions;
void _rejectsUnknownMode;
// The handle carries the live setMode/getMode pair.
const _modeHandle = (m: BpmnModelerHandle) => {
    m.setMode("design");
    const mode: ModelerMode = m.getMode();
    void mode;
};
void _modeHandle;

// The async factory signature is nameable.
type _FactoryReturn = ReturnType<CreateModeler>;
const _factoryReturns: _FactoryReturn extends Promise<BpmnModelerHandle> ? true : never = true;
void _factoryReturns;

// Demo-webapp-shaped literal — model navigation only, no code-link/scripting.
const _demoShape = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    capabilities: {
        modelNavigation: {
            openReference: ({ id, kind }) => {
                void id;
                void kind;
            },
        },
    },
} satisfies ModelerOptions;
void _demoShape;

// Frozen core-service contract (#1408): each keyed lookup resolves to its
// vendor diagram-js/bpmn-js type without an explicit type argument. If an
// overload regresses, one of these annotations stops compiling.
const _coreServices = (m: BpmnModelerHandle) => {
    const canvas: CoreModelerServices["canvas"] = m.getService("canvas");
    const commandStack: CoreModelerServices["commandStack"] = m.getService("commandStack");
    const elementRegistry: CoreModelerServices["elementRegistry"] = m.getService("elementRegistry");
    const eventBus: CoreModelerServices["eventBus"] = m.getService("eventBus");
    const modeling: CoreModelerServices["modeling"] = m.getService("modeling");
    const overlays: CoreModelerServices["overlays"] = m.getService("overlays");
    const selection: CoreModelerServices["selection"] = m.getService("selection");
    void [canvas, commandStack, elementRegistry, eventBus, modeling, overlays, selection];
};
void _coreServices;

// Non-core names keep the generic escape hatch: an explicit type argument is
// honoured, and a bare call defaults to `unknown`.
const _escapeHatch = (m: BpmnModelerHandle) => {
    const custom = m.getService<{ translate(s: string): string }>("customTranslator");
    const untyped: unknown = m.getService("anythingElse");
    void [custom, untyped];
};
void _escapeHatch;

// ── Viewer subpath conformance (#1405) ──────────────────────────────────────

// Subset compatibility (acceptance criterion): every BpmnViewerHandle member is
// signature-identical to its BpmnModelerHandle counterpart, so a modeler handle
// narrows to a viewer handle with no adapter. If a viewer member drifts from the
// modeler's shape, this line stops compiling.
const _modelerSatisfiesViewerHandle = (m: BpmnModelerHandle): BpmnViewerHandle => m;
void _modelerSatisfiesViewerHandle;

// CoreViewerServices is the readonly Pick of CoreModelerServices: each shared key
// keeps its exact vendor type, and the editing keys are absent.
const _coreViewerServices = (v: BpmnViewerHandle) => {
    const canvas: CoreModelerServices["canvas"] = v.getService("canvas");
    const elementRegistry: CoreModelerServices["elementRegistry"] = v.getService("elementRegistry");
    const eventBus: CoreModelerServices["eventBus"] = v.getService("eventBus");
    const overlays: CoreModelerServices["overlays"] = v.getService("overlays");
    const selection: CoreModelerServices["selection"] = v.getService("selection");
    void [canvas, elementRegistry, eventBus, overlays, selection];
};
void _coreViewerServices;

type _ViewerServicesAreModelerSubset = keyof CoreViewerServices extends keyof CoreModelerServices
    ? true
    : never;
const _viewerServicesSubset: _ViewerServicesAreModelerSubset = true;
void _viewerServicesSubset;

// ViewerOptions is minimal: no engine, no editor-only built-ins, and an
// optional (readonly) properties panel.
const _viewerOptions = {
    theme: "dark",
    propertiesPanel: { parent: document.createElement("div") },
    moddleExtensions: {
        bpmiq: { name: "bpmiq", uri: "http://bpmiq/schema", prefix: "bpmiq", types: [] },
    },
    additionalModules: [{ __init__: [] }],
} satisfies ViewerOptions;
void _viewerOptions;

const _viewerRejectsEngine = {
    // @ts-expect-error — a viewer has no engine (bpmn-js's base viewer reads any BPMN).
    engine: "c7",
} satisfies ViewerOptions;
void _viewerRejectsEngine;

const _viewerRejectsLinting = {
    // @ts-expect-error — linting is an editor-only built-in, absent from the viewer.
    linting: false,
} satisfies ViewerOptions;
void _viewerRejectsLinting;

// The viewer handle carries no editing methods.
const _viewerHasNoEditing = (v: BpmnViewerHandle) => {
    // @ts-expect-error — `newDiagram` is a modeler-only method.
    void v.newDiagram;
    // @ts-expect-error — `setElementTemplates` is a modeler-only method.
    void v.setElementTemplates;
};
void _viewerHasNoEditing;

// ── Designer subpath conformance (#1196) ────────────────────────────────────

// Subset compatibility: every BpmnDesignerHandle member is signature-identical
// to its BpmnModelerHandle counterpart, so a modeler handle narrows to a designer
// handle with no adapter. If a designer member drifts from the modeler's shape,
// this line stops compiling.
const _modelerSatisfiesDesignerHandle = (m: BpmnModelerHandle): BpmnDesignerHandle => m;
void _modelerSatisfiesDesignerHandle;

// Design mode is fully editable, so CoreDesignerServices is the full
// CoreModelerServices set (not the viewer's readonly Pick): each of the seven
// keys resolves to its exact vendor type, including modeling + commandStack.
const _coreDesignerServices = (d: BpmnDesignerHandle) => {
    const canvas: CoreModelerServices["canvas"] = d.getService("canvas");
    const commandStack: CoreModelerServices["commandStack"] = d.getService("commandStack");
    const modeling: CoreModelerServices["modeling"] = d.getService("modeling");
    void [canvas, commandStack, modeling];
};
void _coreDesignerServices;

type _DesignerServicesEqualModeler = keyof CoreDesignerServices extends keyof CoreModelerServices
    ? keyof CoreModelerServices extends keyof CoreDesignerServices
        ? true
        : never
    : never;
const _designerServicesEqual: _DesignerServicesEqualModeler = true;
void _designerServicesEqual;

// DesignerOptions requires the panel host and accepts the engine-neutral knobs.
const _designerOptions = {
    propertiesPanel: { parent: document.createElement("div") },
    theme: "dark",
    locale: "de",
    favouriteBpmnElements: ["bpmn:Task"],
    moddleExtensions: {
        bpmiq: { name: "bpmiq", uri: "http://bpmiq/schema", prefix: "bpmiq", types: [] },
    },
    additionalModules: [{ __init__: [] }],
} satisfies DesignerOptions;
void _designerOptions;

const _designerRejectsEngine = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — Design mode has no engine (no execution platform to bind).
    engine: "c7",
} satisfies DesignerOptions;
void _designerRejectsEngine;

const _designerRejectsLinting = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — linting is an engine-bound built-in, absent from the designer.
    linting: false,
} satisfies DesignerOptions;
void _designerRejectsLinting;

const _designerRejectsElementTemplates = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — element templates are engine-bound, absent from the designer.
    elementTemplates: [],
} satisfies DesignerOptions;
void _designerRejectsElementTemplates;

// The one engine-neutral host capability: modelNavigation is accepted, …
const _designerAcceptsNavigation = {
    propertiesPanel: { parent: document.createElement("div") },
    capabilities: { modelNavigation: _asyncNavigation },
} satisfies DesignerOptions;
void _designerAcceptsNavigation;

// … while the engine-bound ports stay compile-time-rejected on /design.
const _designerRejectsCodeLink = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — codeLink is engine-bound, absent from DesignerCapabilities.
    capabilities: { codeLink: {} },
} satisfies DesignerOptions;
void _designerRejectsCodeLink;

const _designerRejectsScripting = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — scripting is engine-bound (C7-only), absent from DesignerCapabilities.
    capabilities: { scripting: {} },
} satisfies DesignerOptions;
void _designerRejectsScripting;

// DesignerCapabilities carries exactly the navigation port.
const _designerCapabilities = { modelNavigation: _asyncNavigation } satisfies DesignerCapabilities;
void _designerCapabilities;

// The re-exported navigation types are structurally the same from either barrel.
const _navPortRoot: ModelNavigationPortFromRoot = _asyncNavigation;
const _navPortDesign: ModelNavigationPortFromDesign = _navPortRoot;
void (_navPortDesign satisfies ModelNavigationPortFromDesign);
const _refRoot: ModelReferenceFromRoot = { id: "Process_1", kind: "process" };
const _refDesign: ModelReferenceFromDesign = _refRoot;
void _refDesign;
const _kindRoot: ReferenceKindFromRoot = "process";
const _kindDesign: ReferenceKindFromDesign = _kindRoot;
void _kindDesign;

describe("public API conformance", () => {
    it("is a type-only conformance spec; the guarantee is the tsc pass", () => {
        expect(true).toBe(true);
    });
});
