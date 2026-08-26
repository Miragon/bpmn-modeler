import { posix } from "path";

import { BpmnLintDisabledQuery, BpmnlintResultsQuery } from "@miragon/bpmn-modeler-shared";
import { Engine, LintResults } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import { ExecutionPlatformNotDetectedError } from "../../../shared/domain/errors";
import {
    DiagnosticsPort,
    DocumentPort,
    LintRunnerPort,
    NotifierPort,
    SettingsPort,
    StatusBarPort,
} from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import {
    BpmnLintConfigLocator,
    BpmnlintChangeTarget,
} from "../../../shared/service/BpmnLintConfigLocator";
import { DefaultBpmnlintConfigService } from "./DefaultBpmnlintConfigService";

/**
 * Discovers the nearest `.bpmnlintrc` for an open BPMN document, runs bpmnlint
 * in the extension host, and pushes the resulting findings to the webview, which
 * only renders overlays. Running in the host (a full Node context) is what lets
 * custom `bpmnlint-plugin-*` rules and `plugin:<pkg>/recommended` configs resolve
 * against the workspace `node_modules` — the browser webview only ever saw the
 * built-in rules bundled into it.
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
        private readonly defaultConfig: DefaultBpmnlintConfigService,
        private readonly settings: SettingsPort,
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
     * Resolves the nearest `.bpmnlintrc`, lints the current document XML against
     * it, then pushes the findings to the webview and publishes them as
     * diagnostics. When none is found, lints against a bundled default selected
     * per execution platform instead of staying dormant (#1327). A read/parse/lint
     * failure — including a malformed `.bpmnlintrc` — degrades to the no-config
     * state rather than crashing the editor or silently swapping in the default.
     */
    private async lintAndPush(editorId: string, reflectInStatusBar: boolean): Promise<boolean> {
        // User opted out of linting entirely: skip the run and clear every
        // surface (overlays, Problems entries), so design-only users are not
        // shown automation rules. Distinct from the no-config state — nothing
        // failed — so the webview can offer a re-enable affordance.
        if (!this.settings.getLintingEnabled()) {
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintDisabled();
            }
            this.diagnostics.clear(editorId);
            return this.pushDisabled(editorId);
        }

        let results: LintResults | null;
        try {
            const dir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const configPath = await this.locator.findNearestConfig(dir);

            if (!configPath) {
                results = await this.lintWithBundledDefault(editorId, reflectInStatusBar);
            } else {
                const config = JSON.parse(await this.locator.readConfig(configPath)) as Record<
                    string,
                    unknown
                >;
                const xml = this.vsDocument.getContent(editorId);
                const { results: lintResults, unresolved } = await this.lintRunner.lint(
                    xml,
                    configPath,
                    config,
                );

                this.diagnostics.publish(editorId, xml, lintResults);
                if (reflectInStatusBar) {
                    if (unresolved.length > 0) {
                        this.statusBar.showBpmnlintUnresolved(configPath, unresolved);
                    } else {
                        this.statusBar.showBpmnlintActive(configPath);
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
                this.notifier.logInfo(`bpmnlint applied from ${configPath}`);
                results = lintResults;
            }
        } catch (error) {
            // A malformed .bpmnlintrc or a linter blow-up must not crash the
            // editor — warn, fall back to the no-config state, and tell the
            // webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to lint against .bpmnlintrc: ${(error as Error).message}`),
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
     * Lints against the host-bundled default when the workspace has no
     * `.bpmnlintrc`. The engine layer is chosen from the document's detected
     * execution platform (re-detected here so a mid-edit platform change is
     * reflected); a platform-less document gets the structural base only.
     */
    private async lintWithBundledDefault(
        editorId: string,
        reflectInStatusBar: boolean,
    ): Promise<LintResults> {
        const xml = this.vsDocument.getContent(editorId);
        const platform = this.detectPlatform(xml);
        const config = await this.defaultConfig.build(platform);

        // The default references only host-bundled rules, so the path is a mere
        // resolution anchor — the document's own path keeps it valid.
        const anchorPath = this.vsDocument.getFilePath(editorId);
        const { results, unresolved } = await this.lintRunner.lint(xml, anchorPath, config);

        this.diagnostics.publish(editorId, xml, results);
        if (reflectInStatusBar) {
            this.statusBar.showBpmnlintDefault(platform);
        }
        if (unresolved.length > 0) {
            // The bundled default should resolve entirely from the host; anything
            // unresolved is a packaging bug, not a workspace one — flag it loudly.
            this.notifier.logWarning(
                `bpmnlint default: ${unresolved.length} bundled rule(s)/config(s) unresolved: ${unresolved.join(
                    ", ",
                )}`,
            );
        }
        // Debug-level: this fires on every re-lint (each edit), so it belongs with
        // the other high-frequency lifecycle noise, not the always-on info log.
        this.notifier.logDebug(
            `bpmnlint applied bundled default (platform: ${platform ?? "generic"})`,
        );
        return results;
    }

    /**
     * Detects the execution platform for engine-layer selection, mapping an
     * undetectable document to `undefined` (the structural-only default) rather
     * than propagating {@link ExecutionPlatformNotDetectedError}.
     */
    private detectPlatform(xml: string): Engine | undefined {
        try {
            return new BpmnDocument(xml).detectPlatform();
        } catch (error) {
            if (error instanceof ExecutionPlatformNotDetectedError) {
                return undefined;
            }
            throw error;
        }
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

    /**
     * Tells the webview linting is user-disabled so it shows the re-enable chip
     * rather than hiding the pill (which {@link BpmnlintResultsQuery} `null`
     * does). Same recoverable-drop handling as {@link pushResults}: a hidden
     * panel makes the post reject, and the webview re-requests on reload.
     */
    private async pushDisabled(editorId: string): Promise<boolean> {
        try {
            return await this.editorStore.postMessage(editorId, new BpmnLintDisabledQuery());
        } catch (error) {
            this.notifier.logWarning(
                `[bpmnlint] disabled push skipped: ${(error as Error).message}`,
            );
            return false;
        }
    }
}
