import type { BpmnModelerSetting } from "@miragon/bpmn-modeler-types";
import type { ModelerCapabilities } from "./capabilities";
import { BpmnModeler } from "./modeler";

/**
 * Per-instance configuration for a {@link BpmnModeler}. Everything a modeler
 * needs to stand up independently of any other instance on the page lives here
 * — the panel host, the DI extras, and the small set of page-level side effects
 * a host-less consumer can opt out of. Deliberately minimal: the polished
 * public API surface is #1375's job (epic #1293).
 */
export interface CreateModelerOptions {
    /** Each instance needs its own panel host; required. */
    propertiesPanelParent: HTMLElement;
    /** Extra bpmn-js DI modules (clipboard bridges, translation, demo modules). */
    extraModules?: unknown[];
    /** Per-feature host ports; each present port registers its feature's module. */
    capabilities?: ModelerCapabilities;
    /**
     * Lint on/off chip port. Defaults to a no-op so a host-less consumer works
     * — `LintConfigService.$inject` requires the `lintingHost` DI value.
     */
    lintingHost?: { setLintingEnabled(enabled: boolean): void };
    /**
     * Page-level colour theme stays outside the facade (it is shared with the
     * dmn-webview and owns a single `#theme-link`). bootstrap passes
     * `setColorThemeMode`; a host-less consumer omits it and the setting is inert.
     */
    applyColorThemeMode?: (mode: BpmnModelerSetting["colorTheme"]) => void;
    /**
     * When `true`, an Escape with nothing focused (`<body>`) re-homes this
     * canvas. Default off; the single-instance bootstrap passes `true` to keep
     * today's page-wide behaviour, while a multi-instance consumer leaves it off
     * so each modeler only reacts to Escapes inside its own subtrees.
     */
    handleGlobalEscape?: boolean;
}

/**
 * Thin factory over the {@link BpmnModeler} constructor: builds one independent
 * modeler bound to `container` and its own `propertiesPanelParent`. Engine
 * selection is a deliberate second step — call {@link BpmnModeler.create} once
 * the engine is known (the host learns it only after the file arrives).
 */
export function createModeler(container: HTMLElement, options: CreateModelerOptions): BpmnModeler {
    return new BpmnModeler(container, options);
}
