import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Modeling from "bpmn-js/lib/features/modeling/Modeling";
import type {
    BpmnlintConfig,
    BpmnModelerSetting,
    Engine,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
// Type-only import — erased at build (same contract as modeler.ts's
// LintConfigService import), so referencing the lint module's types here never
// pulls the lint stack into the main bundle.
import type { LintCallbacks, LintTierInit } from "./bpmnlint/LintConfigService";
import type { ModelerCapabilities } from "./capabilities";
import type { ViewportManager } from "./viewport";
import type { SelectionManager } from "./selection";
import type { ViewState } from "./viewState";
import type { ModelerMode } from "./mode";

export type { ModelerMode } from "./mode";

/**
 * The public TypeScript surface of the `@miragon/bpmn-modeler` package:
 * `createModeler(container, options)`, the instance handle, and the outbound
 * event model.
 *
 * ## Feature taxonomy
 *
 * Every capability the modeler exposes falls into exactly one of three
 * categories, and each declaration below is tagged with its category:
 *
 * - **[A] Engine-intrinsic** — the diagram surface itself. Always present; not
 *   a toggle. Loading/exporting XML, the viewport, the selection, the engine.
 * - **[B] Opinionated built-in** — on by sensible default, but turning one off
 *   is one option away and replacing one is one override away (linting,
 *   clipboard, theme, locale).
 * - **[C] Host capability** — off by default; a host opts in by supplying a
 *   port. Absent port ⇒ no UI, no dead buttons (model navigation, code link,
 *   inline scripting).
 *
 * Events (the `on*` callbacks) are a fourth, cross-cutting concern: strictly
 * outbound notifications. An event is **never** a substitute for a capability
 * port — it cannot answer a question or resolve a target, only announce that
 * something happened.
 */

/**
 * [B] Theme selection for a single instance. The modeler toggles a
 * `data-bpmn-theme` attribute on its container + panel parent (the authoritative
 * mechanism — dark rules are scoped under `[data-bpmn-theme="dark"]`, so two
 * instances on one page can hold different themes) and mirrors the choice onto a
 * legacy page-global `#theme-link` when the consumer still links one.
 * `"automatic"` follows the OS/browser `prefers-color-scheme` live;
 * `"light"`/`"dark"` force a fixed kind. A host that themes off its own chrome
 * (VS Code `<body>` classes) maps that signal to a forced mode in its adapter —
 * the package does not read host chrome.
 */
export type ThemeMode = "light" | "dark" | "automatic";

/**
 * [B] The namespace of `@miragon/bpmn-modeler/lint`, imported and handed in by
 * the host. The lint stack (`bpmn-js-bpmnlint`, `bpmnlint`, the rule plugin, and
 * its CSS) lives behind this subpath so a `linting: false` consumer never pulls
 * it into the module graph — even under single-file bundlers, where a reachable
 * internal dynamic import can no longer be tree-shaken.
 *
 * ```ts
 * linting: { module: await import("@miragon/bpmn-modeler/lint") }
 * ```
 *
 * Declared structurally (not `typeof import("./bpmnlint")`) because
 * api-extractor rollups of relative `import()` types are fragile; a type-level
 * conformance check in `publicApi.spec.ts` keeps the two in sync.
 */
export interface LintModule {
    createLintModule(tier: LintTierInit, callbacks: LintCallbacks): unknown;
}

/**
 * [B] Linting configuration tiers. Injection-only: the lint stack is never
 * bundled by the package, so every on-tier requires a `module` the host imports
 * from `@miragon/bpmn-modeler/lint`.
 *
 * - *(omitted)* — linting off, with a one-time `console.info` migration nudge.
 * - `false` — linting off entirely (no chip, no overlay), silent and explicit.
 * - `{ module, config? }` — in-page linting with the injected {@link LintModule},
 *   using the default or a caller-supplied {@link BpmnlintConfig}; rules the
 *   bundled resolver cannot resolve degrade gracefully and are reported via
 *   {@link LintRunEvent.unresolved} rather than failing the pass.
 * - `{ module, results: "external" }` — the modeler renders results the host
 *   computes and pushes through {@link BpmnModelerHandle.applyLintResults}; no
 *   in-webview linter runs. `module` is still required — the external tier needs
 *   {@link LintModule} to paint and to service a `startInPageLinting` handback.
 *
 * `results?: never` on the config variant makes the union discriminable on
 * `results`, so the runtime tier selection narrows without type guards. `module`
 * being required on both object variants makes a missed migration a compile-time
 * error, not a silent runtime downgrade.
 */
export type LintingOptions =
    | false
    | { module: LintModule; config?: BpmnlintConfig; results?: never }
    | { module: LintModule; results: "external" };

/**
 * [B] Clipboard override. Default (option omitted) is the native browser
 * clipboard. A sandboxed host that cannot reach the system clipboard from the
 * webview supplies a {@link ClipboardBridge} to route copy/paste through its
 * extension host.
 */
export interface ClipboardOptions {
    /** Bridge for diagram-element copy/paste; also the default for `text`. */
    bridge: ClipboardBridge;
    /**
     * Optional separate bridge for text surfaces (labels + the
     * contenteditable/FEEL polyfill). Defaults to `bridge`. A host with two
     * protocol channels (VS Code) supplies both; a single-bridge consumer omits
     * it and both surfaces share `bridge`.
     */
    text?: ClipboardBridge;
}

/**
 * Outbound content notification. Debounced and owned by the package (300ms,
 * 1000ms maxWait), because every consumer needs exactly that debounce; raw
 * `commandStack.changed` stays reachable through the
 * {@link BpmnModelerHandle.getService} escape hatch for the rare consumer that
 * wants it un-debounced.
 */
export interface ContentSavedEvent {
    readonly xml: string;
}

/**
 * Per-instance configuration for {@link createModeler}. Deliberately flat and
 * opinionated: the required fields ([A]) are the minimum to stand up an
 * independent modeler, and every other field either turns off / replaces a
 * built-in ([B]) or wires a host capability ([C]).
 */
export interface ModelerOptions {
    // ── [A] Engine-intrinsic ────────────────────────────────────────────────
    /**
     * [A] Camunda engine version. Switching engines = `destroy()` + a new
     * instance.
     */
    engine: Engine;

    /**
     * [A] The panel host. Each instance owns its own properties-panel parent so
     * several modelers can coexist on one page.
     */
    propertiesPanel: { parent: HTMLElement };

    /**
     * [A] Initial element templates as **data**, never a path: the host fetches
     * the JSON and hands it in. Live updates go through
     * {@link BpmnModelerHandle.setElementTemplates}.
     */
    elementTemplates?: object[];

    /** [A] Initial settings (align-to-origin, transaction boundaries, favourites). */
    settings?: Partial<BpmnModelerSetting>;

    /**
     * [A] Escape hatch: extra bpmn-js DI modules. Unstable/advanced — the
     * supported knobs are the typed options above. Matches bpmn-js's own
     * `additionalModules`.
     */
    additionalModules?: unknown[];

    /**
     * [A] Escape hatch: extra moddle extensions, merged onto the engine's
     * bundled camunda/zeebe moddles (last-wins on a colliding namespace
     * prefix). Matches bpmn-js's own `moddleExtensions`.
     */
    moddleExtensions?: Record<string, object>;

    // ── [B] Opinionated built-ins ───────────────────────────────────────────
    /**
     * [B] Linting tier — see {@link LintingOptions}. Injection-only: an on-tier
     * supplies a `module` from `@miragon/bpmn-modeler/lint`. Omit (or `false`)
     * for no linting.
     */
    linting?: LintingOptions;

    /** [B] Clipboard override — omit for the native clipboard. */
    clipboard?: ClipboardOptions;

    /**
     * [B] Colour theme — defaults to `"automatic"`. Theming always engages: the
     * instance gets a `data-bpmn-theme` attribute from the first frame regardless
     * of whether this is set.
     */
    theme?: ThemeMode;

    /** [B] UI locale (BCP-47-ish tag) — defaults to `"en"`. */
    locale?: string;

    /**
     * [B] Initial design/implement mode — defaults to `"implement"`. `"design"`
     * reduces an engine-tagged model to its engine-neutral surface (neutral +
     * host custom property groups only, no element-template chooser, no
     * token-simulation toggle) on the **same** live instance — no re-import, no
     * engine-data loss on replace/copy-paste. Toggle at runtime with
     * {@link BpmnModelerHandle.setMode}. Unrelated to `theme` / {@link setTheme}.
     */
    mode?: ModelerMode;

    // ── [C] Host capabilities ───────────────────────────────────────────────
    /**
     * [C] Per-feature host ports. Each present port registers its feature's DI
     * module and UI; each absent port leaves the feature off entirely. See
     * {@link ModelerCapabilities}.
     */
    capabilities?: ModelerCapabilities;

    // ── Events (outbound notifications) ─────────────────────────────────────
    /** Debounced diagram content — see {@link ContentSavedEvent}. */
    onContentSaved?: (event: ContentSavedEvent) => void;

    /** One lint pass completed — findings + gracefully-degraded rules. */
    onLintResults?: (event: LintRunEvent) => void;

    /** The in-canvas lint chip was toggled on/off. */
    onLintingToggled?: (enabled: boolean) => void;

    /** A non-fatal warning (element-not-found, missing inline script) for the host log. */
    onWarning?: (message: string) => void;

    /** The element-templates loader reported validation errors. */
    onElementTemplatesErrors?: (errors: unknown[]) => void;

    /** The design/implement mode changed — fired once per actual change (never on a redundant `setMode`). */
    onModeChanged?: (mode: ModelerMode) => void;
}

/**
 * The instance handle {@link createModeler} resolves to.
 */
export interface BpmnModelerHandle {
    // ── [A] Engine-intrinsic ────────────────────────────────────────────────
    /** [A] Load BPMN 2.0 XML, replacing any current diagram. */
    loadDiagram(xml: string): Promise<ImportXMLResult>;

    /** [A] Serialise the current diagram to formatted XML. */
    exportDiagram(): Promise<string>;

    /** [A] Replace the diagram with a new empty one. */
    newDiagram(): Promise<ImportXMLResult>;

    /** [A] Export the current diagram as SVG markup. */
    getDiagramSvg(): Promise<string>;

    /** [A] Push a new set of element templates (data, never a path). */
    setElementTemplates(templates: object[]): void;

    /**
     * [A] Merge a partial settings update. `colorTheme` is **not** applied here
     * (theme is host policy — use `theme` / {@link setTheme}); every other field
     * takes effect immediately.
     */
    setSettings(settings: Partial<BpmnModelerSetting>): void;

    /** [A] Viewport (zoom/scroll/fit) accessor. */
    readonly viewport: ViewportManager;

    /** [A] Selection accessor. */
    readonly selection: SelectionManager;

    /**
     * [A] Snapshot the drill-down plane, viewbox, and selection so they survive
     * an instance switch — capture here, `destroy()`, create the next instance,
     * `loadDiagram`, then {@link applyViewState}. See {@link ViewState}.
     */
    captureViewState(): ViewState;

    /**
     * [A] Re-apply a {@link captureViewState} snapshot: plane, viewbox, and
     * selection are restored root → viewport → selection; a stale plane or
     * missing element ids degrade gracefully.
     */
    applyViewState(state: ViewState): void;

    /** [A] Tear the instance down and free its bpmn-js DI graph and DOM. */
    destroy(): void;

    // ── [B] Opinionated built-ins ───────────────────────────────────────────
    /**
     * [B] Switch the colour theme live. Toggles this instance's
     * `data-bpmn-theme` attribute and mirrors it to a legacy `#theme-link` when
     * present.
     */
    setTheme(theme: ThemeMode): void;

    /**
     * [B] Switch the design/implement mode live on this same instance — no
     * re-import, no engine-data loss. `"design"` filters the panel to its
     * engine-neutral surface and hides the engine chrome; `"implement"` restores
     * the full Camunda surface. Fires `onModeChanged` once per actual change.
     * Unrelated to {@link setTheme} despite the shared "mode" wording.
     */
    setMode(mode: ModelerMode): void;

    /** [B] The current design/implement mode. */
    getMode(): ModelerMode;

    /**
     * [B] Render host-computed lint results, or clear them with `null`.
     */
    applyLintResults(results: LintResults | null): void;

    /** [B] Turn off the in-webview linter and clear its overlay. */
    applyLintingDisabled(): void;

    /**
     * [B] Start (or restart) the in-webview linter with the host's
     * no-workspace-config handback. Optional `config` overrides the engine-aware
     * default; optional `configToken` lets a repeat instruction with the same
     * version dedup while linting is live. Never re-enables a user-disabled
     * linter.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void;

    // ── Core services + escape hatch ─────────────────────────────────────────
    /**
     * Resolve a core diagram-js/bpmn-js service by name. The {@link
     * CoreModelerServices} names — `canvas`, `commandStack`, `elementRegistry`,
     * `eventBus`, `modeling`, `overlays`, `selection` — are semver-stable across
     * minor versions: the name resolves, and the returned value keeps its
     * upstream-documented shape. This overload types those lookups
     * automatically.
     */
    getService<K extends keyof CoreModelerServices>(name: K): CoreModelerServices[K];
    /**
     * Unstable escape hatch: reach any other bpmn-js DI service by name. Not
     * covered by semver — plugin authors accept breakage across minor versions.
     * Kept public deliberately so advanced integrations are not blocked while
     * the typed surface catches up.
     *
     * @remarks Unstable for names outside {@link CoreModelerServices}. Prefer a
     *   typed option/method; open an issue if one is missing.
     */
    getService<T = unknown>(name: string): T;
}

/**
 * The core diagram-js/bpmn-js services whose names and documented shapes are
 * semver-stable through {@link BpmnModelerHandle.getService} across minor
 * versions. Modelled as a name→type map so it stays `Pick`-able: a future
 * viewer handle (#1405) can freeze exactly the subset it exposes.
 */
export interface CoreModelerServices {
    canvas: Canvas;
    commandStack: CommandStack;
    elementRegistry: ElementRegistry;
    eventBus: EventBus;
    modeling: Modeling;
    overlays: Overlays;
    selection: Selection;
}

/**
 * [A] The package entry point: stand up one modeler bound to `container` and
 * resolve its {@link BpmnModelerHandle}. Async for API stability (a host that
 * learns the engine late simply calls this late); the lint stack is now injected
 * synchronously rather than awaited internally.
 */
export type CreateModeler = (
    container: HTMLElement,
    options: ModelerOptions,
) => Promise<BpmnModelerHandle>;

/**
 * The subset of {@link BpmnModelerHandle} whose signatures are frozen, asserted
 * against the runtime handle in `publicApi.spec.ts`.
 */
export type StableModelerSurface = Pick<
    BpmnModelerHandle,
    | "loadDiagram"
    | "exportDiagram"
    | "newDiagram"
    | "getDiagramSvg"
    | "setSettings"
    | "viewport"
    | "selection"
    | "captureViewState"
    | "applyViewState"
    | "destroy"
    | "getService"
    | "applyLintResults"
    | "applyLintingDisabled"
>;
