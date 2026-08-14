import { posix } from "path";

import { BpmnlintResultsQuery, LintResults } from "@miragon/bpmn-modeler-shared";

import {
    DiagnosticsPort,
    DocumentPort,
    LintRunnerPort,
    NotifierPort,
    StatusBarPort,
} from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import {
    BpmnLintConfigLocator,
    BpmnlintChangeTarget,
} from "../../../shared/service/BpmnLintConfigLocator";
import { DEFAULT_BPMNLINT_CONFIG, defaultConfigPathFor } from "./defaultBpmnlintConfig";

/**
 * Discovers the nearest `.bpmnlintrc` for an open BPMN document, runs bpmnlint
 * in the extension host, and pushes the resulting findings to the webview, which
 * only renders overlays. Running in the host (a full Node context) is what lets
 * custom `bpmnlint-plugin-*` rules and `plugin:<pkg>/recommended` configs resolve
 * against the workspace `node_modules` — the browser webview only ever saw the
 * built-in rules bundled into it.
 *
 * When no `.bpmnlintrc` is found, this does **not** leave linting dormant: it
 * lints against {@link DEFAULT_BPMNLINT_CONFIG} instead, so every diagram gets
 * baseline execution-safety checks (disconnected flows, missing start/end
 * events, fake joins, …) with zero setup — the gap that otherwise only surfaces
 * as a deployment failure. Any `.bpmnlintrc` the workspace adds — even an empty
 * `{}` — takes over completely, per the locator's nearest-config-wins semantics.
 *
 * The same findings are also published as host diagnostics (Problems panel) and
 * summarised in the status bar. Filesystem discovery / reading / watching lives
 * in {@link BpmnLintConfigLocator}; the actual lint run is a {@link LintRunnerPort}.
 * Implements {@link BpmnlintChangeTarget} so the locator's watcher — and the
 * document-change trigger — can re-lint when the file or diagram changes.
 */
export class BpmnLintConfigService implements BpmnlintChangeTarget {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly locator: BpmnLintConfigLocator,
        private readonly lintRunner: LintRunnerPort,
        private readonly diagnostics: DiagnosticsPort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Re-lints the document and pushes the result to the webview. Named
     * {@link BpmnlintChangeTarget.setBpmnlintConfig} so the locator's watcher and
     * the participant's document-change hook can call it uniformly.
     */
    setBpmnlintConfig(editorId: string, reflectInStatusBar = true): Promise<boolean> {
        return this.lintAndPush(editorId, reflectInStatusBar);
    }

    /** Drops the published diagnostics for a closing editor so the Problems panel
     * does not retain findings for a document that is no longer open. */
    clearDiagnostics(editorId: string): void {
        this.diagnostics.clear(editorId);
    }

    /**
     * Resolves the nearest `.bpmnlintrc` — falling back to
     * {@link DEFAULT_BPMNLINT_CONFIG} when none exists — lints the current
     * document XML against it, then pushes the findings to the webview and
     * publishes them as diagnostics. A read/parse/lint failure against a
     * *found* `.bpmnlintrc` degrades to the no-config state rather than
     * crashing the editor; it never falls back to the default in that case, so
     * a broken config fails loudly instead of silently swapping in different
     * rules than the workspace asked for.
     */
    private async lintAndPush(editorId: string, reflectInStatusBar: boolean): Promise<boolean> {
        let results: LintResults | null;
        try {
            const dir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const configPath = await this.locator.findNearestConfig(dir);
            const usingDefault = configPath === undefined;

            const effectiveConfigPath = configPath ?? defaultConfigPathFor(dir);
            const config = configPath
                ? (JSON.parse(await this.locator.readConfig(configPath)) as Record<
                      string,
                      unknown
                  >)
                : DEFAULT_BPMNLINT_CONFIG;

            const xml = this.vsDocument.getContent(editorId);
            const { results: lintResults, unresolved } = await this.lintRunner.lint(
                xml,
                effectiveConfigPath,
                config,
            );

            this.diagnostics.publish(editorId, xml, lintResults);
            if (reflectInStatusBar) {
                if (unresolved.length > 0) {
                    this.statusBar.showBpmnlintUnresolved(effectiveConfigPath, unresolved);
                } else if (usingDefault) {
                    this.statusBar.showBpmnlintDefault();
                } else {
                    this.statusBar.showBpmnlintActive(effectiveConfigPath);
                }
            }
            if (unresolved.length > 0) {
                // The finding was previously buried in the output channel while
                // the status bar still showed a green tick — surface it plainly.
                this.notifier.logWarning(
                    `bpmnlint: ${unresolved.length} rule(s)/config(s) could not be resolved and were skipped: ${unresolved.join(
                        ", ",
                    )}`,
                );
            }
            this.notifier.logInfo(
                usingDefault
                    ? "No .bpmnlintrc found; linting with the bundled default correctness rules"
                    : `bpmnlint applied from ${effectiveConfigPath}`,
            );
            results = lintResults;
        } catch (error) {
            // A malformed .bpmnlintrc, unparsable diagram XML, or a linter
            // blow-up must not crash the editor — warn, fall back to the
            // no-config state, and tell the webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to lint diagram: ${(error as Error).message}`),
            );
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            this.diagnostics.clear(editorId);
            results = null;
        }

        return this.pushResults(editorId, results);
    }

    /**
     * Posts the results to the webview, the sole results transport.
     *
     * A hidden panel (no `retainContextWhenHidden`) makes `postMessage` reject;
     * the webview re-requests on reload, so the drop is recoverable. Swallowing it
     * here — at warning level, mirroring `CodeLinkMapService.pushStatus` — keeps
     * fire-and-forget callers from leaking an unhandled rejection.
     */
    private async pushResults(editorId: string, results: LintResults | null): Promise<boolean> {
        try {
            return await this.editorStore.postMessage(editorId, new BpmnlintResultsQuery(results));
        } catch (error) {
            this.notifier.logWarning(
                `[bpmnlint] results push skipped: ${(error as Error).message}`,
            );
            return false;
        }
    }
}
