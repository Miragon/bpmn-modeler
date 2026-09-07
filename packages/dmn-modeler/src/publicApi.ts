/**
 * The public TypeScript surface of the host-free DMN modeler facade.
 *
 * Engine features are split into the same categories used by ADR 0007:
 *
 * - **[A] Engine-intrinsic** features are always present.
 * - **[B] Opinionated built-ins** have a useful default and may be replaced.
 *
 * The `on*` members are outbound notifications, documented separately from
 * either category. They do not provide host capabilities to the modeler.
 */

/** A view editor supported by dmn-js. */
export type DmnViewType = "drd" | "decisionTable" | "literalExpression" | "boxedExpression";

/** The structural DMN element data associated with a view. */
export interface DmnViewElement {
    readonly id: string;
    readonly $type: string;
    readonly name?: string;
    readonly [property: string]: unknown;
}

/** A view returned by {@link DmnModelerHandle.getViews}. */
export interface DmnView {
    readonly id: string;
    readonly name?: string;
    readonly type: DmnViewType;
    readonly element: DmnViewElement;
}

/** Optional detail attached to a dmn-js import/open warning. */
export interface DmnWarningError {
    readonly message?: string;
    readonly stack?: string;
}

/** A non-fatal warning produced while importing or opening a DMN view. */
export interface DmnWarning {
    readonly message: string;
    readonly error?: DmnWarningError;
}

/** Result shared by DMN import and view-open operations. */
export interface DmnOperationResult {
    readonly warnings: DmnWarning[];
}

/** Payload emitted when dmn-js reports that its available or active views changed. */
export interface DmnViewChangedEvent {
    readonly views: DmnView[];
    readonly activeView?: DmnView;
}

/** One expression language shown by decision editors. */
export interface DmnExpressionLanguage {
    readonly value: string;
    readonly label: string;
}

/** Expression-language choices and the language initially used by an editor. */
export interface DmnExpressionLanguages {
    readonly options: DmnExpressionLanguage[];
    readonly defaults?: {
        readonly editor?: string;
    };
}

/** Additional dmn-js dependency-injection modules, grouped by view editor. */
export type DmnAdditionalModules = Partial<Record<DmnViewType, unknown[]>>;

/** Initial keyboard binding for every view editor. Binding defaults to enabled. */
export interface DmnKeyboardOptions {
    readonly bind?: boolean;
}

/**
 * [B] Theme selection for a single instance. The modeler toggles a
 * `data-dmn-theme` attribute on its container + panel parent (the authoritative
 * mechanism — dark rules are scoped under `[data-dmn-theme="dark"]`, so two
 * instances on one page can hold different themes) and mirrors the choice onto a
 * legacy page-global `#theme-link` when the consumer still links one.
 * `"automatic"` follows the OS/browser `prefers-color-scheme` live;
 * `"light"`/`"dark"` force a fixed kind. A host that themes off its own chrome
 * (VS Code `<body>` classes) maps that signal to a forced mode in its adapter —
 * the package does not read host chrome.
 */
export type DmnThemeMode = "light" | "dark" | "automatic";

/** Per-instance configuration for {@link createModeler}. */
export interface DmnModelerOptions {
    // ── [A] Engine-intrinsic ───────────────────────────────────────────────

    /** [A] The properties-panel host owned by this modeler instance. */
    propertiesPanel: { parent: HTMLElement };

    /**
     * [A] Extra DI modules for individual view editors. Caller modules are
     * appended after the facade defaults, allowing deliberate overrides.
     */
    additionalModules?: DmnAdditionalModules;

    /** [A] Extra moddle descriptors, merged over the bundled Camunda descriptor. */
    moddleExtensions?: Record<string, object>;

    /**
     * [A] Expression-language configuration. When supplied it replaces the
     * facade's six-language default.
     */
    expressionLanguages?: DmnExpressionLanguages;

    /** [A] Data types shown by editors. When supplied they replace the defaults. */
    dataTypes?: string[];

    /** [A] Per-editor keyboard configuration. */
    keyboard?: DmnKeyboardOptions;

    // ── [B] Opinionated built-ins ───────────────────────────────────────────

    /**
     * [B] Colour theme — defaults to `"automatic"`. Theming always engages: the
     * instance gets a `data-dmn-theme` attribute from the first frame regardless
     * of whether this is set.
     */
    theme?: DmnThemeMode;

    /** [B] Reserved UI locale. It has no runtime effect in this release. */
    locale?: string;

    // ── Events (outbound notifications) ────────────────────────────────────

    /** Fired for every active editor `commandStack.changed` notification. */
    onContentChanged?: () => void;

    /** Fired for each upstream `views.changed` notification. */
    onViewChanged?: (event: DmnViewChangedEvent) => void;

    /** Fired once for each non-fatal warning returned by import or open. */
    onWarning?: (message: string) => void;
}

/** The independent instance handle returned by {@link createModeler}. */
export interface DmnModelerHandle {
    /** [A] Load DMN XML, replacing any currently loaded document. */
    loadDiagram(xml: string): Promise<DmnOperationResult>;

    /** [A] Serialise the current document as formatted DMN XML. */
    exportDiagram(): Promise<string>;

    /** [A] Return the active view, if the loaded document has one. */
    getActiveView(): DmnView | undefined;

    /** [A] Return every view in the loaded document. */
    getViews(): DmnView[];

    /** [A] Open a view previously returned by this handle. */
    openView(view: DmnView): Promise<DmnOperationResult>;

    /** [A] Whether the decision requirements diagram is active. */
    isDrdViewActive(): boolean;

    /** [A] Focus the active DRD canvas; safely does nothing in other views. */
    focusCanvas(): void;

    /** [A] Whether the active DRD canvas owns focus; false in other views. */
    isCanvasFocused(): boolean;

    /**
     * [B] Switch the colour theme live. Toggles this instance's `data-dmn-theme`
     * attribute and mirrors it to a legacy `#theme-link` when present.
     */
    setTheme(theme: DmnThemeMode): void;

    /** [A] Tear down this instance and all of its listeners and observers. */
    destroy(): void;

    /**
     * [A] Unstable escape hatch into the active dmn-js viewer's DI graph. The
     * service names and returned shapes are not covered by this facade's API.
     */
    getService<T = unknown>(name: string): T;
}

/** [A] Factory signature for one independent DMN modeler instance. */
export type CreateDmnModeler = (
    container: HTMLElement,
    options: DmnModelerOptions,
) => Promise<DmnModelerHandle>;
