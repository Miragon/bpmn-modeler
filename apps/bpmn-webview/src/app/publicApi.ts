import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
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
 * The designed public TypeScript surface of the future `@miragon/bpmn-modeler`
 * npm package (#1375, epic #1293). This file is a **type-only skeleton**: it
 * fixes the shape of `createModeler(container, options)`, the instance handle,
 * and the outbound event model *before* the package is extracted, so the
 * extraction moves code into a designed API instead of freezing today's
 * accidental facade. No runtime lives here — the current {@link BpmnModeler}
 * satisfies the stable subset (proved in `publicApi.spec.ts`), and #1373/#1376
 * grow the runtime up to the rest of this shape.
 *
 * ## Feature taxonomy
 *
 * Every capability the modeler exposes falls into exactly one of three
 * categories, and each declaration below is tagged with its category so the
 * ADR's taxonomy table has a machine-anchored home:
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
 * [B] Theme selection for a single instance. `"automatic"` follows the host's
 * light/dark signal; the VS Code `<body>`-class watcher moves to the host
 * adapter (#1376/#1377), leaving the modeler with an injected mode.
 */
export type ThemeMode = "light" | "dark" | "automatic";

/**
 * [B] Linting configuration, adopting #1373's tier ladder verbatim:
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
    | false
    | { config?: BpmnlintConfig; results?: never }
    | { results: "external" };

/**
 * [B] Clipboard override. Default (option omitted) is the native browser
 * clipboard (#1374). A sandboxed host that cannot reach the system clipboard
 * from the webview supplies a {@link ClipboardBridge} to route copy/paste
 * through its extension host.
 */
export interface ClipboardOptions {
    bridge: ClipboardBridge;
}

/**
 * Outbound content notification. Debounced and owned by the package (300ms,
 * 1000ms maxWait — the shape battle-tested in `bootstrap`), because every
 * consumer needs exactly that debounce; raw `commandStack.changed` stays
 * reachable through the {@link BpmnModelerHandle.getService} escape hatch for
 * the rare consumer that wants it un-debounced.
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
     * [A] Camunda engine version. Required and known up front in the target
     * shape (the current two-step `create(engine)` is the internal migration
     * path; #1373/#1376 collapse it). Switching engines = `destroy()` + a new
     * instance.
     */
    engine: Engine;

    /**
     * [A] The panel host. Each instance owns its own properties-panel parent so
     * several modelers can coexist on one page (rename of today's flat
     * `propertiesPanelParent`).
     */
    propertiesPanel: { parent: HTMLElement };

    /**
     * [A] Initial element templates as **data**, never a path (bpm-iq scenario
     * 1): the host fetches the JSON and hands it in. Live updates go through
     * {@link BpmnModelerHandle.setElementTemplates}.
     */
    elementTemplates?: object[];

    /** [A] Initial settings (align-to-origin, transaction boundaries, favourites). */
    settings?: Partial<BpmnModelerSetting>;

    /**
     * [A] Escape hatch: extra bpmn-js DI modules. Unstable/advanced — the
     * supported knobs are the typed options above. Renamed from the current
     * `extraModules` to match bpmn-js's own `additionalModules`.
     */
    additionalModules?: unknown[];

    // ── [B] Opinionated built-ins ───────────────────────────────────────────
    /** [B] Linting tier — see {@link LintingOptions}. Omit for the bundled default. */
    linting?: LintingOptions;

    /** [B] Clipboard override — omit for the native clipboard (#1374). */
    clipboard?: ClipboardOptions;

    /** [B] Colour theme — defaults to `"automatic"`. */
    theme?: ThemeMode;

    /** [B] UI locale (BCP-47-ish tag) — defaults to `"en"`. Absorbs the page-level `TranslateModule` + `i18n.setLanguage` wiring. */
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

    /** One lint pass completed — findings + gracefully-degraded rules (#1373). */
    onLintResults?: (event: LintRunEvent) => void;

    /** The in-canvas lint chip was toggled on/off (absorbs today's `lintingHost`, #1373). */
    onLintingToggled?: (enabled: boolean) => void;

    /** A non-fatal warning (element-not-found, missing inline script) for the host log. */
    onWarning?: (message: string) => void;

    /** The element-templates loader reported validation errors. */
    onElementTemplatesErrors?: (errors: unknown[]) => void;
}

/**
 * The instance handle {@link createModeler} resolves to — the designed
 * replacement for today's {@link BpmnModeler} class surface. Members are the
 * union of the **stable subset** (already implemented and frozen in shape) and
 * the **target-only** addition (`setTheme`) that #1376 adds
 * (`applyLintResults` / `applyLintingDisabled` landed with #1373's tier
 * ladder). `publicApi.spec.ts` asserts the current facade satisfies the stable
 * subset; the additions are documented in the ADR's rename/reshape map.
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

    /** [A] Merge a partial settings update. */
    setSettings(settings: Partial<BpmnModelerSetting>): void;

    /** [A] Viewport (zoom/scroll/fit) accessor. */
    readonly viewport: ViewportManager;

    /** [A] Selection accessor. */
    readonly selection: SelectionManager;

    /** [A] Tear the instance down and free its bpmn-js DI graph and DOM. */
    destroy(): void;

    // ── [B] Opinionated built-ins ───────────────────────────────────────────
    /** [B] Switch the colour theme live (target-only; #1376/#1377). */
    setTheme(theme: ThemeMode): void;

    /**
     * [B] Render host-computed lint results, or clear them with `null`
     * (#1373's `results: "external"` tier).
     */
    applyLintResults(results: LintResults | null): void;

    /** [B] Turn off the in-webview linter and clear its overlay (#1373). */
    applyLintingDisabled(): void;

    /**
     * [B] Start (or restart) the in-webview linter — the host's no-workspace-config
     * handback (#1373 Phase B). Optional `config` overrides the engine-aware
     * default. Never re-enables a user-disabled linter.
     */
    startInPageLinting(config?: BpmnlintConfig): void;

    // ── Escape hatch ────────────────────────────────────────────────────────
    /**
     * Unstable escape hatch: reach a bpmn-js DI service by name. Not covered by
     * semver — plugin authors accept breakage across minor versions. Kept
     * public deliberately (ADR decision) so advanced integrations are not
     * blocked while the typed surface catches up.
     *
     * @remarks Unstable. Prefer a typed option/method; open an issue if one is missing.
     */
    getService<T = unknown>(name: string): T;
}

/**
 * [A] The designed package entry point: stand up one modeler bound to
 * `container` and resolve its {@link BpmnModelerHandle}. Async because #1373's
 * lazy lint chunk forces a construction await anyway; a host that learns the
 * engine late simply calls this late (today's `bootstrap` already constructs
 * after the file handshake).
 *
 * Type-only in this spike — the runtime factory is still
 * {@link createModeler} + the two-step `create(engine)`; #1376 collapses the
 * two into this signature.
 */
export type CreateModeler = (
    container: HTMLElement,
    options: ModelerOptions,
) => Promise<BpmnModelerHandle>;

/**
 * The stable subset of {@link BpmnModelerHandle}: the members the current
 * {@link BpmnModeler} already implements with target-final signatures, so their
 * shape is frozen and the extraction cannot silently reshape them.
 * `setElementTemplates` is intentionally excluded — its param widens from
 * `JSON[] | undefined` to `object[]` (see the ADR's reshape map), so it is not
 * yet stable.
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
