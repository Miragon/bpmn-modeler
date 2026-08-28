import { posix } from "path";

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";
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

/**
 * Where a set of findings came from, so {@link BpmnLintConfigService.applyFindings}
 * can pick the right status-bar indicator and log line. `"workspace"` is a
 * host-side run against a discovered `.bpmnlintrc`; `"in-page"` is the webview's
 * own default run (#1373 Phase B), reflected with the same `showBpmnlintDefault`
 * indicator the old host-side default used (same ruleset, different execution site).
 */
type LintFindingsSource =
    | { kind: "workspace"; configPath: string }
    | { kind: "in-page"; platform: Engine | undefined };

/**
 * The last in-page lint event received from the webview for one editor, cached
 * so a panel re-activation (`setBpmnlintConfig` from the panel-active hook) can
 * restore the Problems panel + status bar instead of going blank until the next
 * edit re-runs the webview linter.
 */
interface CachedInPageEvent {
    readonly xml: string;
    readonly results: LintResults;
    readonly unresolved: readonly string[];
    readonly platform: Engine | undefined;
}

/**
 * Decides *where* an open BPMN document is linted and routes the resulting
 * findings to the host's chrome (Problems panel, status bar) and the webview.
 *
 * Two paths, chosen per document by whether a workspace `.bpmnlintrc` exists:
 *
 *  - **Workspace config** — the host runs bpmnlint in a full Node context
 *    ({@link LintRunnerPort}) so custom `bpmnlint-plugin-*` rules and
 *    `plugin:<pkg>/recommended` configs resolve against the workspace
 *    `node_modules`, then pushes the findings to the webview (which only paints
 *    overlays). This is the external tier — any push wins on the webview side.
 *  - **No config** (#1373 Phase B) — the host tells the webview to run its own
 *    engine-aware default in-page ({@link BpmnlintInPageQuery}); the webview
 *    pushes its findings back through {@link applyWebviewLintResults}, which
 *    feeds the very same host chrome. The host does not lint in this case, so a
 *    non-workspace diagram no longer pays for a host-side re-lint on every edit.
 *
 * A per-editor {@link lintModes} map tracks which path is live so the VS Code
 * participant can skip its debounced re-lint for in-page sessions, and so a
 * stale webview push arriving after a workspace-config takeover is ignored (the
 * mode flips to `"external"` *before* the takeover push — ordering matters).
 *
 * Filesystem discovery / reading / watching lives in {@link BpmnLintConfigLocator};
 * the actual host lint run is a {@link LintRunnerPort}. Implements
 * {@link BpmnlintChangeTarget} so the locator's watcher — and the
 * document-change trigger — can re-lint when the file or diagram changes.
 */
export class BpmnLintConfigService implements BpmnlintChangeTarget {
    /**
     * Per-editor lint path. Defaults to `"external"` for an untracked editor so
     * the participant only skips its re-lint once in-page is explicitly active.
     */
    private readonly lintModes = new Map<string, "external" | "in-page">();

    private readonly lastInPageEvents = new Map<string, CachedInPageEvent>();

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

    /**
     * Re-evaluates the lint path for the document and drives it (host run + push,
     * or in-page instruction). Named {@link BpmnlintChangeTarget.setBpmnlintConfig}
     * so the locator's watcher and the participant's hooks can call it uniformly.
     */
    setBpmnlintConfig(editorId: string, reflectInStatusBar = true): Promise<boolean> {
        return this.lintAndPush(editorId, reflectInStatusBar);
    }

    /** The live lint path for an editor — `"external"` unless in-page is active. */
    getLintMode(editorId: string): "external" | "in-page" {
        return this.lintModes.get(editorId) ?? "external";
    }

    /** Drops the published diagnostics and the per-editor lint bookkeeping for a
     * closing editor so neither the Problems panel nor the mode/cache maps retain
     * state for a document that is no longer open. */
    clearDiagnostics(editorId: string): void {
        this.diagnostics.clear(editorId);
        this.lintModes.delete(editorId);
        this.lastInPageEvents.delete(editorId);
    }

    /**
     * Applies findings the webview computed in its own in-page default run
     * (#1373 Phase B) to the host's chrome. Guarded so a push that arrives after
     * a workspace-config takeover — or while linting is disabled — is ignored:
     * the mode flips to `"external"` *before* the takeover push, so a late
     * in-page push finds the wrong mode and is dropped.
     *
     * The event is cached so a later panel re-activation can restore it. The
     * Problems panel is global, so diagnostics always publish; the status bar
     * reflects an async push only for the active editor (a background editor's
     * push must not steal the visible indicator).
     */
    applyWebviewLintResults(
        editorId: string,
        results: LintResults,
        unresolved: readonly string[],
    ): void {
        if (this.getLintMode(editorId) !== "in-page" || !this.settings.getLintingEnabled()) {
            return;
        }
        const xml = this.vsDocument.getContent(editorId);
        const platform = this.detectPlatform(xml);
        this.lastInPageEvents.set(editorId, { xml, results, unresolved, platform });
        this.applyFindings(editorId, xml, results, unresolved, this.isActiveEditor(editorId), {
            kind: "in-page",
            platform,
        });
    }

    /**
     * Resolves the nearest `.bpmnlintrc`. When one is found, lints the document
     * host-side against it and pushes the findings (external tier). When none is
     * found, hands linting to the webview's in-page default instead of linting
     * host-side (#1373 Phase B). A read/parse/lint failure — including a malformed
     * `.bpmnlintrc` — degrades to the no-config-*failure* state (linting off in
     * the webview) rather than crashing the editor.
     */
    private async lintAndPush(editorId: string, reflectInStatusBar: boolean): Promise<boolean> {
        // User opted out of linting entirely: skip the run and clear every
        // surface (overlays, Problems entries), so design-only users are not
        // shown automation rules. Distinct from the no-config state — nothing
        // failed — so the webview can offer a re-enable affordance.
        if (!this.settings.getLintingEnabled()) {
            this.setExternalMode(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintDisabled();
            }
            this.diagnostics.clear(editorId);
            return this.pushDisabled(editorId);
        }

        try {
            const dir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const configPath = await this.locator.findNearestConfig(dir);

            if (!configPath) {
                // Early return — must NOT fall through to a results push: a
                // trailing BpmnlintResultsQuery(null) would immediately deactivate
                // the in-page tier this instruction just started.
                return this.instructInPage(editorId, reflectInStatusBar);
            }

            const config = JSON.parse(await this.locator.readConfig(configPath)) as Record<
                string,
                unknown
            >;
            const xml = this.vsDocument.getContent(editorId);
            const { results, unresolved } = await this.lintRunner.lint(xml, configPath, config);

            // Flip the mode *before* the takeover push so a stale in-page push
            // already in flight is ignored by applyWebviewLintResults.
            this.setExternalMode(editorId);
            this.applyFindings(editorId, xml, results, unresolved, reflectInStatusBar, {
                kind: "workspace",
                configPath,
            });
            return this.pushResults(editorId, results);
        } catch (error) {
            // A malformed .bpmnlintrc or a linter blow-up must not crash the
            // editor — warn, fall back to the no-config-failure state, and tell
            // the webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to lint against .bpmnlintrc: ${(error as Error).message}`),
            );
            this.setExternalMode(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            this.diagnostics.clear(editorId);
            return this.pushResults(editorId, null);
        }
    }

    /**
     * Switches the editor to the in-page path and tells the webview to run its
     * own engine-aware default. Replays the last cached in-page event if one
     * exists (panel re-activation), so the Problems panel + status bar are
     * restored instead of blanking until the next webview push; otherwise clears
     * diagnostics and shows a provisional default indicator while the webview's
     * first run is in flight.
     */
    private instructInPage(editorId: string, reflectInStatusBar: boolean): Promise<boolean> {
        this.lintModes.set(editorId, "in-page");

        const cached = this.lastInPageEvents.get(editorId);
        if (cached) {
            this.applyFindings(
                editorId,
                cached.xml,
                cached.results,
                cached.unresolved,
                reflectInStatusBar,
                { kind: "in-page", platform: cached.platform },
            );
        } else {
            this.diagnostics.clear(editorId);
            if (reflectInStatusBar) {
                const platform = this.detectPlatform(this.vsDocument.getContent(editorId));
                this.statusBar.showBpmnlintDefault(platform);
            }
        }

        return this.postInPageInstruction(editorId);
    }

    /**
     * The single results→chrome mapping shared by the workspace-config run and
     * the in-page webview push, so both feed the Problems panel, status bar, and
     * unresolved warning identically (AC5 parity is structural). The status bar
     * is only touched when `reflectInStatusBar`; diagnostics always publish.
     */
    private applyFindings(
        editorId: string,
        xml: string,
        results: LintResults,
        unresolved: readonly string[],
        reflectInStatusBar: boolean,
        source: LintFindingsSource,
    ): void {
        this.diagnostics.publish(editorId, xml, results);

        if (reflectInStatusBar) {
            if (source.kind === "workspace") {
                if (unresolved.length > 0) {
                    this.statusBar.showBpmnlintUnresolved(source.configPath, [...unresolved]);
                } else {
                    this.statusBar.showBpmnlintActive(source.configPath);
                }
            } else {
                this.statusBar.showBpmnlintDefault(source.platform);
            }
        }

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

    /** Marks the editor external and drops any cached in-page event so a later
     * panel re-activation cannot replay stale in-page findings over a host run. */
    private setExternalMode(editorId: string): void {
        this.lintModes.set(editorId, "external");
        this.lastInPageEvents.delete(editorId);
    }

    private isActiveEditor(editorId: string): boolean {
        try {
            return this.editorStore.getActiveEditorId() === editorId;
        } catch {
            // No active editor (e.g. all panels hidden) — treat as not active.
            return false;
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
     * Tells the webview to run its in-page default (#1373 Phase B). Same
     * recoverable-drop handling as {@link pushResults}: a hidden panel makes the
     * post reject, and the webview re-requests on reload.
     */
    private async postInPageInstruction(editorId: string): Promise<boolean> {
        try {
            return await this.editorStore.postMessage(editorId, new BpmnlintInPageQuery());
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
