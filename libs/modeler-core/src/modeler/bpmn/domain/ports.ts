import { LintResults } from "@miragon/bpmn-modeler-types";

/**
 * Runs bpmnlint over a diagram in a full Node context (the extension host),
 * resolving built-in, `plugin:*`, and custom `pkg/rule` rules against the
 * workspace `node_modules` rooted at the `.bpmnlintrc` — parity with the CLI.
 *
 * A port because rule resolution needs Node's `require`/module resolution, which
 * only concrete hosts (VS Code, standalone Theia) have; the browser webview never
 * could. Hosts without a Node linter simply don't wire one, and linting stays
 * dormant.
 */
export interface LintRunnerPort {
    /**
     * @param xml the diagram XML to lint.
     * @param configPath absolute path of the resolved `.bpmnlintrc`; its
     *   directory anchors module resolution for custom rules/plugins. For the
     *   zero-config default this is the document's own path (a resolution anchor
     *   only — the default references no workspace modules).
     * @param config the parsed `.bpmnlintrc` contents, or the bundled default.
     * @returns the findings keyed by rule name, plus the names of any
     *   rules/configs that could not be resolved (skipped, never thrown).
     */
    lint(
        xml: string,
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<{ results: LintResults; unresolved: string[] }>;
}

/**
 * Publishes bpmnlint findings as host-native diagnostics (VS Code's Problems
 * panel) so they are searchable and clickable without opening the diagram. A
 * port so the core stays free of `vscode.Diagnostic`; hosts without a Problems
 * surface leave it unwired.
 */
export interface DiagnosticsPort {
    /**
     * Replaces the diagnostics for `documentUri` (a `uri.toString()` key) with the
     * given findings. `xml` is used for best-effort element-id→line mapping.
     */
    publish(documentUri: string, xml: string, results: LintResults): void;
    /** Drops all diagnostics for `documentUri` (no config, or editor closed). */
    clear(documentUri: string): void;
}

/**
 * Stores the user's linting on/off switch, on a host that keeps one. The host
 * reports the stored choice back through `SettingsPort.getLintingEnabled`.
 */
export interface LintingPreferencePort {
    setLintingEnabled(enabled: boolean): void | Promise<void>;
}

/**
 * Persists the global default visibility of the BPMN properties panel across
 * sessions. {@link getVisibility} is synchronous so the webview HTML can be
 * pre-rendered with the correct collapsed state before the webview boots.
 */
export interface PropertiesPanelStatePort {
    getVisibility(): boolean;
    setVisibility(visible: boolean): Promise<void>;
}
