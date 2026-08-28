import { describe, it, expect } from "vitest";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import { BpmnModeler } from "./modeler";
import type { CreateModelerOptions } from "./createModeler";
import type {
    BpmnModelerHandle,
    ClipboardOptions,
    ContentSavedEvent,
    CreateModeler,
    LintingOptions,
    ModelerOptions,
    StableModelerSurface,
    ThemeMode,
} from "./publicApi";

/**
 * Type-level conformance + scenario spec for the designed public API (#1375).
 *
 * The assertions below are compile-checked (this file is type-checked by
 * `tsconfig.spec.json`); the single runtime `it` exists only so the test runner
 * has something to execute — esbuild strips the types without checking them, so
 * the guarantee is the `tsc` pass, not the vitest run. Each block encodes one
 * deliverable: (a) the current facade already satisfies the stable subset;
 * (b) the three bpm-iq scenarios type-check; (c) a demo-webapp-shaped literal.
 *
 * `satisfies` is used instead of a plain annotation so the checks cannot be
 * widened away by an over-broad target type.
 */

// (a) Conformance: the current BpmnModeler class satisfies the frozen stable
// subset of the designed handle. If a future refactor reshapes one of these
// members, this line stops compiling.
const _conformance = (modeler: BpmnModeler): StableModelerSurface => modeler;
void _conformance;

// The full target handle is a superset the current class does *not* yet meet
// (setTheme is target-only; #1376), so we only assert the stable subset above
// — this keeps the two facts distinct.
type _HandleIsSuperset = BpmnModelerHandle extends StableModelerSurface ? true : never;
const _handleSuperset: _HandleIsSuperset = true;
void _handleSuperset;

// (b1) bpm-iq scenario 1 — element templates arrive as fetched data, not a path.
const _scenarioTemplates = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    elementTemplates: [{ id: "tpl", name: "Fetched template" }],
} satisfies ModelerOptions;
void _scenarioTemplates;

// (b2) bpm-iq scenario 2 — an async ModelNavigationPort (GitHub-API resolution
// before opening a tab). The widened return type must accept `async`.
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

// (b3) bpm-iq scenario 3 — graceful `{ config }` linting. The literal type-checks
// against the BpmnlintConfig mirror; unresolvable rules degrade at runtime and
// surface via onLintResults({ results, unresolved }).
const _scenarioLintConfig = {
    engine: "c7",
    propertiesPanel: { parent: document.createElement("div") },
    linting: { config: { extends: "bpmnlint:recommended", rules: { "label-required": "warn" } } },
    onLintResults: ({ results, unresolved }) => {
        void results;
        void unresolved;
    },
} satisfies ModelerOptions;
void _scenarioLintConfig;

// [B] Opinionated built-ins: each tier/override type-checks in isolation, and
// the target factory type is nameable. These exercise the built-in and event
// declarations the scenario literals above don't reach.
const _themes = ["light", "dark", "automatic"] satisfies ThemeMode[];
void _themes;
const _lintOff: LintingOptions = false;
const _lintExternal: LintingOptions = { results: "external" };
const _lintConfig: LintingOptions = { config: {} };
void [_lintOff, _lintExternal, _lintConfig];
const _clipboard: ClipboardOptions = {
    bridge: { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined },
};
// The runtime factory (#1374) accepts the same clipboard override — omit it for
// the native browser clipboard, or pass `{ bridge }` to route through a host.
const _createWithClipboard = {
    propertiesPanelParent: document.createElement("div"),
    clipboard: _clipboard,
} satisfies CreateModelerOptions;
void _createWithClipboard;
const _createNativeClipboard = {
    propertiesPanelParent: document.createElement("div"),
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

// The designed async factory signature is nameable and distinct from today's
// synchronous `createModeler` (which #1376 collapses into this shape).
type _FactoryReturn = ReturnType<CreateModeler>;
const _factoryReturns: _FactoryReturn extends Promise<BpmnModelerHandle> ? true : never = true;
void _factoryReturns;

// (c) demo-webapp-shaped literal — model navigation only, no code-link/scripting.
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

describe("public API skeleton (#1375)", () => {
    it("is a type-only conformance spec; the guarantee is the tsc pass", () => {
        expect(true).toBe(true);
    });
});
