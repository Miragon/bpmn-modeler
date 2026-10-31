import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type { CoreModelerServices } from "./coreServices";

export type { CoreModelerServices } from "./coreServices";
import type {
    BpmnlintConfig,
    BpmnModelerSetting,
    CleanupOutcome,
    Engine,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
import type { LayoutOutcome } from "@miragon/bpmn-modeler-layout";
import type { LintCallbacks, LintTierInit } from "./bpmnlint/LintConfigService";
import type { LintConfigOption } from "./bpmnlint/lintConfigResolution";
import type { ModelerCapabilities } from "./capabilities";
import type { ModelerMode } from "./mode";
import type { BpmnSurfaceHandle } from "./surfaceHandle";

export type { ModelerMode } from "./mode";
export type { LintConfigByMode, LintConfigOption } from "./bpmnlint/lintConfigResolution";

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
 *   is one option away and replacing one is one override away (clipboard,
 *   theme, locale). Linting is opt-in through an injected module.
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

// A structural interface avoids API Extractor rollup failures on relative import() types.
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
 * - `{ module, config? }` — in-page linting with the injected {@link LintModule}.
 *   `config` is either the per-mode zero-config default (omitted), a single
 *   {@link BpmnlintConfig} applied verbatim in both modes, or a
 *   {@link LintConfigByMode} map to lint Design and Implement differently on one
 *   instance (re-resolved on {@link BpmnModelerHandle.setMode}). The mode default
 *   drops the Camunda engine layer in Design and keeps it in Implement. Rules the
 *   bundled resolver cannot resolve degrade gracefully and are reported via
 *   {@link LintRunEvent.unresolved} rather than failing the pass.
 * - `{ module, results: "external" }` — the modeler renders results the host
 *   computes and pushes through {@link BpmnModelerHandle.applyLintResults}; no
 *   in-webview linter runs. `module` is still required — the external tier needs
 *   {@link LintModule} to paint and to service a `startInPageLinting` handback.
 */
export type LintingOptions =
    | false
    | { module: LintModule; config?: LintConfigOption; results?: never }
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
 * 1000ms maxWait), because every consumer needs exactly that debounce;
 * {@link BpmnModelerHandle.onCommandStackChanged} reports each change
 * undebounced for the rare consumer that wants it. A failing save (export or
 * `onContentSaved`) is reported through {@link ModelerOptions.onError}, not by
 * rejecting the debounced run.
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
     * [A] Execution-platform version stamped verbatim into a fresh diagram's
     * `modeler:executionPlatformVersion` by {@link BpmnModelerHandle.newDiagram}.
     * Defaults to the latest known version for {@link engine}. Never applied to
     * diagrams opened via {@link BpmnModelerHandle.loadDiagram} — loaded
     * documents keep whatever metadata they carry (or none).
     */
    engineVersion?: string;

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
     * host custom property groups only, no element-template chooser) on the
     * **same** live instance — no re-import, no
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
    onContentSaved?: (event: ContentSavedEvent) => void | Promise<void>;

    /**
     * One in-page lint pass completed — findings + gracefully-degraded rules.
     * Passes are debounced and run when the browser is idle, so a burst of
     * edits (or an import) yields one call shortly after it settles, not one
     * per change.
     */
    onLintResults?: (event: LintRunEvent) => void;

    /** The in-canvas lint chip was toggled on/off. */
    onLintingToggled?: (enabled: boolean) => void;

    /**
     * A failing debounced save — export failure, or an error thrown by (or a
     * rejected promise returned from) `onContentSaved`. Fires exactly once per
     * debounced execution, never after `destroy()`; later edits keep saving.
     * When unset, failures fall back to `console.error`.
     */
    onError?: (error: unknown) => void;

    /**
     * A non-fatal warning for the host log: element not found, missing inline
     * script, or a host lint push to an instance created without a lint module.
     * Every warning is also mirrored to `console.warn`.
     */
    onWarning?: (message: string) => void;

    /**
     * The element-templates loader reported validation errors.
     *
     * During {@link createModeler}, this is the consumer's control point over a
     * bad template set: return normally to continue creation (valid templates
     * are applied, invalid ones skipped), or throw to abort — the partially
     * initialised instance is destroyed and the factory rejects with the thrown
     * error, so nothing is leaked.
     */
    onElementTemplatesErrors?: (errors: unknown[]) => void;

    /** The design/implement mode changed — fired once per actual change (never on a redundant `setMode`). */
    onModeChanged?: (mode: ModelerMode) => void;
}

/**
 * The instance handle {@link createModeler} resolves to. The inherited
 * {@link BpmnSurfaceHandle} members are engine-intrinsic [A], except the
 * opinionated `setTheme` [B].
 */
export interface BpmnModelerHandle extends BpmnSurfaceHandle {
    // ── [A] Engine-intrinsic ────────────────────────────────────────────────
    /**
     * [A] Replace the diagram with a fresh empty one and fit it to view. The new
     * diagram is stamped for this instance's {@link ModelerOptions.engine} (and
     * {@link ModelerOptions.engineVersion}), so it reopens with the same engine
     * and mode availability.
     */
    newDiagram(): Promise<ImportXMLResult>;

    /**
     * [A] Rearrange the diagram left to right and reroute its connections.
     *
     * Touches only diagram interchange — shape bounds, waypoints and label
     * positions — so the model's semantics are unchanged. The whole rearrange
     * is one command-stack step, so a single undo restores the previous layout.
     *
     * Computes first and applies only on success: a refusal or an engine
     * failure leaves the diagram exactly as it was, and says why through
     * {@link LayoutOutcome.code}.
     */
    formatDiagram(): Promise<LayoutOutcome>;

    /**
     * [A] Report — or, with `apply`, remove — orphan diagram interchange,
     * dangling flows and other invisible leftovers.
     *
     * Unlike {@link formatDiagram} this *does* change the model, which is why
     * it is a separate call: report first, confirm with the user, then apply.
     * Applying recomputes the findings rather than trusting the reported ones,
     * so an edit made in between is never deleted by a stale id.
     *
     * Reports failure in the outcome rather than throwing, so an empty item
     * list always means the diagram was clean.
     */
    cleanupDiagram(options?: { apply?: boolean }): CleanupOutcome;

    /** [A] Push a new set of element templates (data, never a path). */
    setElementTemplates(templates: object[]): void;

    /**
     * [A] Merge a partial settings update. `colorTheme` is **not** applied here
     * (theme is host policy — use `theme` / {@link setTheme}); every other field
     * takes effect immediately.
     */
    setSettings(settings: Partial<BpmnModelerSetting>): void;

    /**
     * [A] Replace the element types pinned at the top of the append/create
     * menu — equivalent to `setSettings({ favouriteBpmnElements })`, and
     * present on {@link BpmnDesignerHandle} too, so a host updates either
     * surface the same way. Only the first six types count, shown in the given
     * order; of those, types without a plain menu entry are skipped, and an
     * empty list clears the row. Takes effect the next time the menu opens.
     */
    setFavouriteBpmnElements(types: readonly string[]): void;

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
     * [B] Render host-computed lint results, or clear them with `null`. A no-op
     * reported through `onWarning` when the instance was created without a lint
     * module.
     */
    applyLintResults(results: LintResults | null): void;

    /**
     * [B] Turn off the in-webview linter and clear its overlay. A no-op reported
     * through `onWarning` when the instance was created without a lint module.
     */
    applyLintingDisabled(): void;

    /**
     * [B] Start (or restart) the in-webview linter. Optional `config` overrides
     * the engine-aware default; a config-less call resets any previously
     * handed-back config to the resolved default/mode rules (e.g. after the
     * host deletes its workspace `.bpmnlintrc`). Optional `configToken` lets a
     * repeat instruction with the same version dedup while linting is live.
     * Never re-enables a user-disabled linter. A no-op reported through
     * `onWarning` when the instance was created without a lint module.
     */
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void;

    // ── Events (outbound notifications) ─────────────────────────────────────
    /**
     * Subscribe to every command-stack change, undebounced: each executed,
     * undone or redone edit. An import resets the stack without a
     * notification. The listener's return value is ignored. Returns a function
     * that removes the listener; `destroy()` removes it too. For the debounced
     * XML, use {@link ModelerOptions.onContentSaved}.
     */
    onCommandStackChanged(listener: () => void): () => void;

    /**
     * Subscribe to the outcome of every format attempt, failures included:
     * {@link formatDiagram} as well as the palette entry and the canvas
     * shortcut, whose outcome reaches no caller otherwise. The listener
     * receives the same {@link LayoutOutcome} `formatDiagram` resolves.
     * Returns a function that removes the listener.
     */
    onFormatted(listener: (outcome: LayoutOutcome) => void): () => void;

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
 * [A] The package entry point: stand up one modeler bound to `container` and
 * resolve its {@link BpmnModelerHandle}. Async for API stability (a host that
 * learns the engine late simply calls this late); the lint stack is now injected
 * synchronously rather than awaited internally.
 *
 * On any initialisation failure after allocation the factory destroys the
 * partial instance (owned DOM and document listeners removed) before rejecting,
 * so the same container and panel roots can be reused for a retry.
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
