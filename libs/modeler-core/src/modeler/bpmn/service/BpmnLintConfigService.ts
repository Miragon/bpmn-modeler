import { posix } from "path";

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";
import { BpmnlintConfig, Engine, LintResults } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../../kernel/domain/BpmnDocument";
import { ExecutionPlatformNotDetectedError } from "../../../kernel/domain/errors";
import {
    DocumentPort,
    NotifierPort,
    SettingsPort,
    StatusBarPort,
} from "../../../kernel/domain/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { BpmnLintConfigLocator, BpmnlintChangeTarget } from "./BpmnLintConfigLocator";
import { BpmnlintIndicator, indicatorForFindings } from "../domain/bpmnlintIndicator";
import { bpmnlintStatusView } from "../domain/bpmnlintStatusView";
import {
    LintAction,
    LintDropReason,
    LintFindings,
    LintSession,
    LintSessionEvent,
    lintsInPage,
    Negotiation,
    reduceLintSession,
    UNTRACKED_LINT_SESSION,
} from "../domain/LintSession";
import { DiagnosticsPort, LintRunnerPort } from "../domain/ports";

const DROP_LOG_LINES: Partial<Record<LintDropReason, string>> = {
    supersededVersion: "[bpmnlint] dropping in-page results for a superseded config version",
    supersededEra: "[bpmnlint] dropping in-page results from a superseded config era",
    supersededRun: "[bpmnlint] dropping host results from a superseded lint run",
};

/**
 * Decides *where* an open BPMN document is linted and routes the resulting
 * findings to the host's chrome (Problems panel, status bar) and the webview.
 *
 * Three tiers, chosen per document:
 *
 *  - **Zero-config default tier** — no workspace `.bpmnlintrc`: the webview runs
 *    its own engine-aware default in-page (payload-free
 *    {@link BpmnlintInPageQuery}) and pushes findings back through
 *    {@link applyWebviewLintResults}.
 *  - **Covered workspace tier** — the bundled resolver can cover the
 *    `.bpmnlintrc`: the host pushes the config down and the webview lints it
 *    in-page.
 *  - **Escalated workspace config** — the config needs rules or moddle
 *    extensions only Node can resolve: the host runs bpmnlint
 *    ({@link LintRunnerPort}) against the workspace `node_modules` and pushes
 *    the findings to the webview, which only paints overlays.
 *
 * Every rule lives in one {@link LintSession} per editor; this service stores the
 * next session, then carries out the action, so an action's awaits already see
 * the new tier. Config runs of one editor can finish out of order, so only the
 * newest one reaches the session. Filesystem discovery lives in
 * {@link BpmnLintConfigLocator}.
 */
export class BpmnLintConfigService implements BpmnlintChangeTarget {
    private readonly sessions = new Map<string, LintSession>();
    private readonly latestRuns = new Map<string, symbol>();

    /** Monotonic source for opaque config-version tokens; never reset. */
    private tokenCounter = 0;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly locator: BpmnLintConfigLocator,
        private readonly lintRunner: LintRunnerPort,
        private readonly diagnostics: DiagnosticsPort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
    ) {}

    /** Re-evaluates the lint tier for the document and drives it. */
    setBpmnlintConfig(editorId: string): Promise<boolean> {
        return this.lintAndPush(editorId);
    }

    getLintMode(editorId: string): "external" | "in-page" {
        return lintsInPage(this.sessionOf(editorId)) ? "in-page" : "external";
    }

    /** The teardown entry point for a closing editor. */
    clearDiagnostics(editorId: string): void {
        this.diagnostics.clear(editorId);
        this.sessions.delete(editorId);
        this.latestRuns.delete(editorId);
    }

    applyWebviewLintResults(
        editorId: string,
        results: LintResults,
        unresolved: readonly string[],
        configToken?: string,
    ): void {
        const xml = this.vsDocument.getContent(editorId);
        void this.dispatch(editorId, {
            type: "webviewLinted",
            output: { xml, results, unresolved },
            platform: this.detectPlatform(xml),
            configToken,
            lintingEnabled: this.settings.getLintingEnabled(),
        });
    }

    private async lintAndPush(editorId: string): Promise<boolean> {
        // Discovery reads the document path, which fails for a closed editor.
        if (!this.editorStore.hasEditor(editorId)) return false;
        // Registered first, so turning linting off also supersedes a run in flight.
        const run = Symbol(editorId);
        this.latestRuns.set(editorId, run);
        if (!this.settings.getLintingEnabled()) {
            return this.dispatch(editorId, { type: "lintingDisabled" });
        }

        try {
            const dir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const configPath = await this.locator.findNearestConfig(dir);
            if (this.isSuperseded(editorId, run)) return this.dropSupersededRun();
            if (!configPath) {
                return this.dispatch(editorId, { type: "noConfigFound" });
            }

            const rawConfig = await this.locator.readConfig(configPath);
            if (this.isSuperseded(editorId, run)) return this.dropSupersededRun();
            const config = JSON.parse(rawConfig) as BpmnlintConfig;
            return this.dispatch(editorId, {
                type: "configRead",
                version: { configPath, rawConfig, config },
                freshToken: this.mintToken(),
            });
        } catch (error) {
            // The newer run reads the config itself, so this failure is stale.
            if (this.isSuperseded(editorId, run)) return this.dropSupersededRun();
            // A malformed .bpmnlintrc or a linter blow-up must not crash the editor.
            this.logLintFailure(error);
            return this.dispatch(editorId, { type: "configFailed" });
        }
    }

    /** Owns its catch, so an escalation can fire and forget it. */
    private async lintOnHost(editorId: string, negotiation: Negotiation): Promise<boolean> {
        // Runs of one config version share its token; only the run tells their host lints apart.
        const run = this.latestRuns.get(editorId);
        const { configPath, config, token } = negotiation;
        try {
            const xml = this.vsDocument.getContent(editorId);
            const { results, unresolved } = await this.lintRunner.lint(
                xml,
                configPath,
                config as Record<string, unknown>,
            );
            if (this.isSuperseded(editorId, run)) return this.dropSupersededRun();
            return this.dispatch(editorId, {
                type: "hostLintFinished",
                token,
                output: { xml, results, unresolved },
            });
        } catch (error) {
            this.logLintFailure(error);
            if (this.isSuperseded(editorId, run)) return this.dropSupersededRun();
            return this.dispatch(editorId, { type: "hostLintFailed", token });
        }
    }

    private isSuperseded(editorId: string, run: symbol | undefined): boolean {
        return this.latestRuns.get(editorId) !== run;
    }

    private dropSupersededRun(): false {
        this.notifier.logDebug("[bpmnlint] dropping the outcome of a superseded config run");
        return false;
    }

    private dispatch(editorId: string, event: LintSessionEvent): Promise<boolean> {
        // A late event must not bring back the session that closing the editor deleted.
        if (!this.editorStore.hasEditor(editorId)) return Promise.resolve(false);
        const { next, action } = reduceLintSession(this.sessionOf(editorId), event);
        this.sessions.set(editorId, next);
        return this.carryOut(editorId, action);
    }

    private sessionOf(editorId: string): LintSession {
        return this.sessions.get(editorId) ?? UNTRACKED_LINT_SESSION;
    }

    private carryOut(editorId: string, action: LintAction): Promise<boolean> {
        switch (action.kind) {
            case "drop": {
                const logLine = DROP_LOG_LINES[action.reason];
                if (logLine) this.notifier.logDebug(logLine);
                return Promise.resolve(false);
            }
            case "disable":
                this.showStatusIfFocused(editorId, { state: "disabled" });
                this.diagnostics.clear(editorId);
                return this.pushDisabled(editorId);
            case "lintDefaultInPage":
                if (action.replay) {
                    this.applyFindings(editorId, action.replay);
                } else {
                    this.diagnostics.clear(editorId);
                    this.showStatusIfFocused(editorId, {
                        state: "default",
                        platform: this.detectPlatform(this.vsDocument.getContent(editorId)),
                    });
                }
                return this.postInPageInstruction(editorId);
            case "lintCoveredInPage": {
                const { configPath, config, token } = action.negotiation;
                if (action.replay) {
                    this.applyFindings(editorId, action.replay);
                } else {
                    this.diagnostics.clear(editorId);
                    this.showStatusIfFocused(editorId, { state: "active", configPath });
                }
                return this.postInPageInstruction(editorId, config, token);
            }
            case "lintOnHost":
                return this.lintOnHost(editorId, action.negotiation);
            case "applyInPageFindings":
                this.applyFindings(editorId, action.findings);
                return Promise.resolve(true);
            case "applyHostFindings":
                this.applyFindings(editorId, action.findings);
                return this.pushResults(editorId, action.findings.results);
            case "fail":
                this.showStatusIfFocused(editorId, { state: "failed" });
                this.diagnostics.clear(editorId);
                return this.pushResults(editorId, null);
        }
    }

    private mintToken(): string {
        return `lint-cfg-${++this.tokenCounter}`;
    }

    /** Feeds a host run and an in-page run to the same chrome. Diagnostics always publish. */
    private applyFindings(editorId: string, findings: LintFindings): void {
        const { xml, results, unresolved, source } = findings;
        this.diagnostics.publish(editorId, xml, results);

        this.showStatusIfFocused(editorId, indicatorForFindings(source, unresolved));

        if (unresolved.length > 0) {
            // Surface skipped rules plainly rather than burying them in the
            // output channel while the status bar shows a green tick.
            this.notifier.logWarning(
                source.kind === "workspace"
                    ? `bpmnlint: ${unresolved.length} rule(s)/config(s) could not be resolved and were skipped: ${unresolved.join(
                          ", ",
                      )}`
                    : `bpmnlint (in-page default): ${unresolved.length} rule(s)/config(s) unresolved: ${unresolved.join(
                          ", ",
                      )}`,
            );
        }

        if (source.kind === "workspace") {
            this.notifier.logInfo(`bpmnlint applied from ${source.configPath}`);
        } else {
            // Debug-level: fires on every webview push (each edit), so it belongs
            // with the other high-frequency lifecycle noise.
            this.notifier.logDebug(
                `bpmnlint applied in-page results (platform: ${source.platform ?? "generic"})`,
            );
        }
    }

    private logLintFailure(error: unknown): void {
        this.notifier.logError(
            new Error(`Failed to lint against .bpmnlintrc: ${(error as Error).message}`),
        );
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
     * The service's only status write. Discovery and host lints are async, so focus
     * is checked when the item is written, not when the run starts.
     */
    private showStatusIfFocused(editorId: string, indicator: BpmnlintIndicator): void {
        if (this.editorStore.isFocused(editorId)) {
            this.statusBar.show("bpmnlint", bpmnlintStatusView(indicator));
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
     * Tells the webview to run its in-page linter. Payload-free = the engine-aware
     * default (no workspace config); with `config` + `configToken` = the covered
     * workspace tier, the config to lint plus the version stamp
     * the webview echoes back on {@link UpdateLintResultsCommand}. Same
     * recoverable-drop handling as {@link pushResults}: a hidden panel makes the
     * post reject, and the webview re-requests on reload.
     */
    private async postInPageInstruction(
        editorId: string,
        config?: BpmnlintConfig,
        configToken?: string,
    ): Promise<boolean> {
        try {
            return await this.editorStore.postMessage(
                editorId,
                new BpmnlintInPageQuery(config, configToken),
            );
        } catch (error) {
            this.notifier.logWarning(
                `[bpmnlint] in-page instruction skipped: ${(error as Error).message}`,
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
