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
import type {
    BpmnViewerHandle,
    CoreViewerServices,
    ViewerCapabilities,
    ViewerOptions,
} from "./viewer/publicApi";
import type {
    BpmnDesignerHandle,
    CoreDesignerServices,
    DesignerCapabilities,
    DesignerOptions,
} from "./design/publicApi";
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
import type {
    ModelNavigationPort as ModelNavigationPortFromViewer,
    ModelReference as ModelReferenceFromViewer,
    ReferenceKind as ReferenceKindFromViewer,
} from "./viewer/index";
import type {
    ModeSessionOptions,
    ModelerSurfaceContext,
    SurfaceContext,
    SurfaceFactories,
    SurfaceHandle,
} from "./modeSession/publicApi";

const _lintModule: LintModule = { createLintModule: () => ({}) };

// These fixtures require tsc: Vitest strips types without checking conformance.
// Use satisfies to validate each fixture without widening its inferred type.

const _conformance = (modeler: BpmnModeler): BpmnModelerHandle => modeler;
void _conformance;

const _viewerConformance = (v: BpmnViewer): BpmnViewerHandle => v;
void _viewerConformance;
const _designerConformance = (d: BpmnDesigner): BpmnDesignerHandle => d;
void _designerConformance;

const _viewState = {
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    rootElementId: "SubProcess_1_plane",
    selectedElementIds: ["Task_1"],
} satisfies ViewState;
void _viewState;
const _viewStateTopLevel = {
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    selectedElementIds: [],
} satisfies ViewState;
void _viewStateTopLevel;

type _HandleIsSuperset = BpmnModelerHandle extends StableModelerSurface ? true : never;
const _handleSuperset: _HandleIsSuperset = true;
void _handleSuperset;

const _scenarioTemplates = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    elementTemplates: [{ id: "tpl", name: "Fetched template" }],
} satisfies ModelerOptions;
void _scenarioTemplates;

const _scenarioEscapeHatches = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    additionalModules: [{ __init__: [] }],
    moddleExtensions: {
        bpmiq: { name: "bpmiq", uri: "http://bpmiq/schema", prefix: "bpmiq", types: [] },
    },
} satisfies ModelerOptions;
void _scenarioEscapeHatches;

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

const _formAwareNavigation = {
    openReference: (_reference) => undefined,
    isReferenceAvailable: ({ id, kind }) => kind !== "form" || id === "Form_Request",
    onReferenceAvailabilityChanged: (_listener) => () => undefined,
} satisfies ModelNavigationPort;
void _formAwareNavigation;

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

const _scenarioLintByMode = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    linting: {
        module: _lintModule,
        config: {
            design: { extends: "bpmnlint:recommended" },
            implement: { extends: "plugin:camunda-compat/camunda-platform-7-24" },
        },
    },
} satisfies ModelerOptions;
void _scenarioLintByMode;

const _scenarioLintExternal = {
    engine: "c8",
    propertiesPanel: { parent: document.createElement("div") },
    linting: { module: _lintModule, results: "external" },
} satisfies ModelerOptions;
void _scenarioLintExternal;

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

type _EntryConformsToLintModule = typeof import("./bpmnlint") extends LintModule ? true : never;
const _entryConforms: _EntryConformsToLintModule = true;
void _entryConforms;

const _themes = ["light", "dark", "automatic"] satisfies ThemeMode[];
void _themes;
const _lintOff: LintingOptions = false;
const _lintExternal: LintingOptions = { module: _lintModule, results: "external" };
const _lintConfig: LintingOptions = { module: _lintModule, config: {} };
void [_lintOff, _lintExternal, _lintConfig];
const _clipboard: ClipboardOptions = {
    bridge: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
};
const _clipboardWithText: ClipboardOptions = {
    bridge: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
    text: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
};
void _clipboardWithText;
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
const _modeHandle = (m: BpmnModelerHandle) => {
    m.setMode("design");
    const mode: ModelerMode = m.getMode();
    void mode;
};
void _modeHandle;

const _rootElementAccessors = (
    m: BpmnModelerHandle,
    v: BpmnViewerHandle,
    d: BpmnDesignerHandle,
) => {
    void [m.rootElement, v.rootElement, d.rootElement];
};
void _rootElementAccessors;

type _FactoryReturn = ReturnType<CreateModeler>;
const _factoryReturns: _FactoryReturn extends Promise<BpmnModelerHandle> ? true : never = true;
void _factoryReturns;

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

const _escapeHatch = (m: BpmnModelerHandle) => {
    const custom = m.getService<{ translate(s: string): string }>("customTranslator");
    const untyped: unknown = m.getService("anythingElse");
    void [custom, untyped];
};
void _escapeHatch;

const _modelerSatisfiesViewerHandle = (m: BpmnModelerHandle): BpmnViewerHandle => m;
void _modelerSatisfiesViewerHandle;

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

const _viewerHasNoEditing = (v: BpmnViewerHandle) => {
    // @ts-expect-error — `newDiagram` is a modeler-only method.
    void v.newDiagram;
    // @ts-expect-error — `setElementTemplates` is a modeler-only method.
    void v.setElementTemplates;
};
void _viewerHasNoEditing;

const _modelerSatisfiesDesignerHandle = (m: BpmnModelerHandle): BpmnDesignerHandle => m;
void _modelerSatisfiesDesignerHandle;

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

const _designerAcceptsLinting = {
    propertiesPanel: { parent: document.createElement("div") },
    linting: { module: _lintModule },
    onLintResults: ({ results, unresolved }) => void [results, unresolved],
    onLintingToggled: (enabled: boolean) => void enabled,
} satisfies DesignerOptions;
void _designerAcceptsLinting;
const _designerLintOff = {
    propertiesPanel: { parent: document.createElement("div") },
    linting: false,
} satisfies DesignerOptions;
void _designerLintOff;
const _designerByModeLint = {
    propertiesPanel: { parent: document.createElement("div") },
    linting: { module: _lintModule, config: { design: { extends: "bpmnlint:recommended" } } },
} satisfies DesignerOptions;
void _designerByModeLint;

const _designerRejectsElementTemplates = {
    propertiesPanel: { parent: document.createElement("div") },
    // @ts-expect-error — element templates are engine-bound, absent from the designer.
    elementTemplates: [],
} satisfies DesignerOptions;
void _designerRejectsElementTemplates;

const _designerAcceptsNavigation = {
    propertiesPanel: { parent: document.createElement("div") },
    capabilities: { modelNavigation: _asyncNavigation },
} satisfies DesignerOptions;
void _designerAcceptsNavigation;

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

const _designerCapabilities = { modelNavigation: _asyncNavigation } satisfies DesignerCapabilities;
void _designerCapabilities;

const _navPortRoot: ModelNavigationPortFromRoot = _asyncNavigation;
const _navPortDesign: ModelNavigationPortFromDesign = _navPortRoot;
void (_navPortDesign satisfies ModelNavigationPortFromDesign);
const _refRoot: ModelReferenceFromRoot = { id: "Process_1", kind: "process" };
const _refDesign: ModelReferenceFromDesign = _refRoot;
void _refDesign;
const _kindRoot: ReferenceKindFromRoot = "process";
const _kindDesign: ReferenceKindFromDesign = _kindRoot;
void _kindDesign;

const _viewerAcceptsNavigation = {
    capabilities: { modelNavigation: _asyncNavigation },
} satisfies ViewerOptions;
void _viewerAcceptsNavigation;

const _viewerRejectsCodeLink = {
    // @ts-expect-error — codeLink is engine-bound, absent from ViewerCapabilities.
    capabilities: { codeLink: {} },
} satisfies ViewerOptions;
void _viewerRejectsCodeLink;

const _viewerRejectsScripting = {
    // @ts-expect-error — scripting is engine-bound (C7-only), absent from ViewerCapabilities.
    capabilities: { scripting: {} },
} satisfies ViewerOptions;
void _viewerRejectsScripting;

const _viewerCapabilities = { modelNavigation: _asyncNavigation } satisfies ViewerCapabilities;
void _viewerCapabilities;

const _viewerCapsAsDesigner: DesignerCapabilities = _viewerCapabilities;
void _viewerCapsAsDesigner;
const _designerCapsAsViewer: ViewerCapabilities = { modelNavigation: _asyncNavigation };
void (_designerCapsAsViewer satisfies DesignerCapabilities);

const _navPortViewer: ModelNavigationPortFromViewer = _navPortRoot;
void (_navPortViewer satisfies ModelNavigationPortFromDesign);
const _refViewer: ModelReferenceFromViewer = _refRoot;
void _refViewer;
const _kindViewer: ReferenceKindFromViewer = _kindRoot;
void _kindViewer;

const _surfaceHandleAcceptsAll = (
    m: BpmnModelerHandle,
    v: BpmnViewerHandle,
    d: BpmnDesignerHandle,
) => {
    const handles: SurfaceHandle[] = [m, v, d];
    void handles;
};
void _surfaceHandleAcceptsAll;

const _surfaceContext = {
    container: document.createElement("div"),
    engine: "c7",
    theme: "dark",
} satisfies SurfaceContext;
void _surfaceContext;
const _modelerContext = { ..._surfaceContext, mode: "design" } satisfies ModelerSurfaceContext;
void _modelerContext;

const _allFactories = {
    view: async (_ctx: SurfaceContext) => ({}) as BpmnViewerHandle,
    design: async (_ctx: SurfaceContext) => ({}) as BpmnDesignerHandle,
    implement: async (ctx: ModelerSurfaceContext) => {
        const mode: ModelerMode = ctx.mode;
        void mode;
        return {} as BpmnModelerHandle;
    },
} satisfies SurfaceFactories;
void _allFactories;

const _singleFactory = {
    view: async (_ctx: SurfaceContext) => ({}) as BpmnViewerHandle,
} satisfies SurfaceFactories;
void _singleFactory;

const _designerImplementFactory = async (
    _ctx: ModelerSurfaceContext,
): Promise<BpmnDesignerHandle> => ({}) as BpmnDesignerHandle;
const _rejectsDesignerForImplement = {
    // @ts-expect-error — implement must resolve a BpmnModelerHandle, not a designer.
    implement: _designerImplementFactory,
} satisfies SurfaceFactories;
void _rejectsDesignerForImplement;

const _modeSessionOptions = {
    container: document.createElement("div"),
    engine: undefined,
    surfaces: _singleFactory,
    initialMode: "view",
    theme: "automatic",
    onModeChanged: (mode, transition) => void [mode, transition],
} satisfies ModeSessionOptions;
void _modeSessionOptions;

type _ModeBarrel = typeof import("./modeSession");
const _modeBarrelExports = (b: _ModeBarrel) => {
    void b.createModeSession;
    void b.mountModeStrip;
    void b.MODE_LABEL;
    void b.SURFACE_MODES;
    void b.defaultMode;
    void b.resolveInitialMode;
    void b.planTransition;
    void b.isModeAvailable;
};
void _modeBarrelExports;

describe("public API conformance", () => {
    it("is a type-only conformance spec; the guarantee is the tsc pass", () => {
        expect(true).toBe(true);
    });
});
