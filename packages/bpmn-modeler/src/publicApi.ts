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
import type { ModelerCapabilities } from "./capabilities";
import type { ViewportManager } from "./viewport";
import type { SelectionManager } from "./selection";

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
 * [B] Theme selection for a single instance. `"automatic"` follows the
 * OS/browser `prefers-color-scheme` live; `"light"`/`"dark"` force a fixed
 * stylesheet. A host that themes off its own chrome (VS Code `<body>` classes)
 * maps that signal to a forced mode in its adapter — the package does not read
 * host chrome.
 */
export type ThemeMode = "light" | "dark" | "automatic";

/**
 * [B] Linting configuration tiers:
 *
 * - `undefined` — linting on with the bundled default ruleset.
 * - `false` — linting off entirely (no chip, no overlay).
 * - `{ config }` — on, with a caller-supplied {@link BpmnlintConfig}; rules the
 *   bundled resolver cannot resolve degrade gracefully and are reported via
 *   {@link LintRunEvent.unresolved} rather than failing the pass.
 * - `{ results: "external" }` — the modeler renders results the host computes
 *   and pushes through {@link BpmnModelerHandle.applyLintResults}; no in-webview
 *   linter runs.
 *
 * `results?: never` on the config variant makes the union discriminable on
 * `results`, so the runtime tier selection narrows without type guards.
 */
export type LintingOptions =
    false | { config?: BpmnlintConfig; results?: never } | { results: "external" };

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
    /** [B] Linting tier — see {@link LintingOptions}. Omit for the bundled default. */
    linting?: LintingOptions;

    /** [B] Clipboard override — omit for the native clipboard. */
    clipboard?: ClipboardOptions;

    /** [B] Colour theme — defaults to `"automatic"`. */
    theme?: ThemeMode;

    /** [B] UI locale (BCP-47-ish tag) — defaults to `"en"`. */
    locale?: string;

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

    /** [A] Tear the instance down and free its bpmn-js DI graph and DOM. */
    destroy(): void;

    // ── [B] Opinionated built-ins ───────────────────────────────────────────
    /** [B] Switch the colour theme live. */
    setTheme(theme: ThemeMode): void;

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
 * resolve its {@link BpmnModelerHandle}. Async because the lazy lint chunk
 * forces a construction await; a host that learns the engine late simply calls
 * this late.
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
    | "destroy"
    | "getService"
    | "applyLintResults"
    | "applyLintingDisabled"
>;
