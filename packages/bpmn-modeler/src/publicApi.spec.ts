import { describe, it, expect } from "vitest";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import { BpmnModeler } from "./modeler";
import type { CreateModelerOptions } from "./createModeler";
import type {
    BpmnModelerHandle,
    ClipboardOptions,
    ContentSavedEvent,
    CoreModelerServices,
    CreateModeler,
    LintingOptions,
    LintModule,
    ModelerOptions,
    StableModelerSurface,
    ThemeMode,
} from "./publicApi";

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

describe("public API conformance", () => {
    it("is a type-only conformance spec; the guarantee is the tsc pass", () => {
        expect(true).toBe(true);
    });
});
