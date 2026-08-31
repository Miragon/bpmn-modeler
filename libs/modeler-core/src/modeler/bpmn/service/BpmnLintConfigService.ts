import { posix } from "path";

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";
import {
    BpmnlintConfig,
    Engine,
    LintResults,
    staticUnresolvedModdleExtensions,
} from "@miragon/bpmn-modeler-types";

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
 * host-side (escalated) Node run against a discovered `.bpmnlintrc`; `"in-page"`
 * is a webview run — either the zero-config default (#1373 Phase B, no
 * `configPath`) or the #1384 covered workspace tier (`configPath` set, so it
 * shows the `showBpmnlintActive` indicator rather than `showBpmnlintDefault`).
 */
type LintFindingsSource =
    | { kind: "workspace"; configPath: string }
    | { kind: "in-page"; platform: Engine | undefined; configPath?: string };

/**
 * The last in-page lint event received from the webview for one editor, cached
 * so a panel re-activation (`setBpmnlintConfig` from the panel-active hook) can
 * restore the Problems panel + status bar instead of going blank until the next
 * edit re-runs the webview linter. `configPath` records which tier produced it
 * (set = #1384 covered workspace config; undefined = #1373 zero-config default)
 * so a replay restores the right status-bar indicator.
 */
interface CachedInPageEvent {
    readonly xml: string;
    readonly results: LintResults;
    readonly unresolved: readonly string[];
    readonly platform: Engine | undefined;
    readonly configPath?: string;
}

/**
 * The per-(editor × config-version) escalation decision for a workspace
 * `.bpmnlintrc` (#1384). Version identity is `configPath` + `rawConfig` (the
 * exact bytes read from disk): editing either mints a fresh decision. `decision`
 * starts `"in-page"` (the webview lints the covered config itself) and only ever
 * flips forward to `"escalated"` — when the static pre-check, or the webview's
 * reported `unresolved`, proves the bundled resolver cannot cover the config, so
 * the host takes over with the Node linter. It never de-escalates within one
 * version. `token` is the opaque stamp carried on {@link BpmnlintInPageQuery} and
 * echoed on {@link UpdateLintResultsCommand}: a stale in-page run against a
 * superseded version echoes an old token and is dropped, so it can never
 * (de-)escalate the current version.
 */
interface LintNegotiation {
    readonly configPath: string;
    readonly rawConfig: string;
    readonly token: string;
    decision: "in-page" | "escalated";
}

/**
 * Decides *where* an open BPMN document is linted and routes the resulting
 * findings to the host's chrome (Problems panel, status bar) and the webview.
 *
 * Three tiers, chosen per document:
 *
 *  - **No config** (#1373 Phase B) — no workspace `.bpmnlintrc`: the host tells
 *    the webview to run its own engine-aware default in-page (payload-free
 *    {@link BpmnlintInPageQuery}); the webview pushes findings back through
 *    {@link applyWebviewLintResults}. The host does not lint, so a non-workspace
 *    diagram never pays for a host-side re-lint.
 *  - **Covered workspace config** (#1384) — a `.bpmnlintrc` exists and the
 *    bundled resolver can cover it: the host pushes the config down
 *    ({@link BpmnlintInPageQuery} carrying `config`) and the webview lints it
 *    in-page, so a covered config also skips the host re-lint per edit. A static
 *    pre-check ({@link staticUnresolvedModdleExtensions}) escalates immediately;
 *    otherwise the webview's reported `unresolved` triggers escalation.
 *  - **Escalated workspace config** — the config references rules/moddle
 *    extensions the bundled resolver cannot cover: the host runs bpmnlint in a
 *    full Node context ({@link LintRunnerPort}) so custom `bpmnlint-plugin-*`
 *    rules resolve against the workspace `node_modules`, then pushes the findings
 *    to the webview (which only paints overlays). Any such push wins.
 *
 * The escalation decision per (editor × config version) lives in the
 * {@link negotiations} map so VS Code and the modeler-bridge inherit it
 * identically. A per-editor {@link lintModes} map tracks whether the live tier is
 * in-page or external so the VS Code participant can skip its debounced re-lint
 * for in-page sessions, and so a stale webview push arriving after an escalation
 * or takeover is ignored (the mode flips to `"external"` *before* the takeover
 * push — ordering matters).
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

    /** The settled escalation decision per editor for its current config version. */
    private readonly negotiations = new Map<string, LintNegotiation>();

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
     * closing editor so neither the Problems panel nor the mode/cache/negotiation
     * maps retain state for a document that is no longer open. The single teardown
     * entry point, so it is also where the escalation decision is forgotten. */
    clearDiagnostics(editorId: string): void {
        this.diagnostics.clear(editorId);
        this.lintModes.delete(editorId);
        this.lastInPageEvents.delete(editorId);
        this.negotiations.delete(editorId);
    }

    /**
     * Applies findings the webview computed in an in-page run (the #1373 default
     * tier or the #1384 covered workspace tier) to the host's chrome. Guarded so
     * a push that arrives after an escalation or a workspace-config takeover — or
     * while linting is disabled — is ignored: the mode flips to `"external"`
     * *before* the takeover push, so a late in-page push finds the wrong mode.
     *
     * For a workspace-config session, `configToken` pairs the run with a config
     * version: a run echoing a superseded token is dropped, and a non-empty
     * `unresolved` escalates the session to the Node linter (the webview proved
     * the bundled resolver cannot cover this config). The decision flips
     * *synchronously* so a second event for the same token is dropped, and the
     * partial in-page findings are **not** applied — the escalated Node run is
     * the authority.
     *
     * A clean covered run is cached so a later panel re-activation can restore
     * it. The Problems panel is global, so diagnostics always publish; the status
     * bar reflects an async push only for the active editor (a background editor's
     * push must not steal the visible indicator).
     */
    applyWebviewLintResults(
        editorId: string,
        results: LintResults,
        unresolved: readonly string[],
        configToken?: string,
    ): void {
        if (this.getLintMode(editorId) !== "in-page" || !this.settings.getLintingEnabled()) {
            return;
        }

        const negotiation = this.negotiations.get(editorId);
        if (negotiation) {
            // Workspace-config in-page tier (#1384). Drop a run paired with a
            // superseded config version, or one arriving after this version
            // already escalated (the synchronous double-event guard).
            if (configToken !== negotiation.token) {
                this.notifier.logDebug(
                    "[bpmnlint] dropping in-page results for a superseded config version",
                );
                return;
            }
            if (negotiation.decision === "escalated") {
                return;
            }
            if (unresolved.length > 0) {
                // The bundled resolver could not cover the config — escalate to
                // the Node linter. Flip *before* the async lint so a second
                // same-token event is dropped above; the partial in-page findings
                // are discarded. runWorkspaceLint owns its own catch, so this
                // fire-and-forget never leaks an unhandled rejection.
                negotiation.decision = "escalated";
                void this.runWorkspaceLint(
                    editorId,
                    negotiation.configPath,
                    JSON.parse(negotiation.rawConfig) as Record<string, unknown>,
                    this.isActiveEditor(editorId),
                );
                return;
            }
            const xml = this.vsDocument.getContent(editorId);
            const platform = this.detectPlatform(xml);
            this.lastInPageEvents.set(editorId, {
                xml,
                results,
                unresolved,
                platform,
                configPath: negotiation.configPath,
            });
            this.applyFindings(editorId, xml, results, unresolved, this.isActiveEditor(editorId), {
                kind: "in-page",
                platform,
                configPath: negotiation.configPath,
            });
            return;
        }

        // No negotiation: the #1373 payload-free default tier. A token here means
        // the run belongs to a since-deleted config era — drop it.
        if (configToken !== undefined) {
            this.notifier.logDebug(
                "[bpmnlint] dropping in-page results from a superseded config era",
            );
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
     * Resolves the nearest `.bpmnlintrc` and drives the right tier. No config →
     * the webview's in-page default (#1373 Phase B). A config → consult the
     * per-editor negotiation: a cached decision re-lints in its settled tier
     * (in-page instruction or Node run); a new/changed version re-negotiates,
     * escalating immediately when the static pre-check proves the bundled
     * resolver cannot cover it, otherwise lints it in-page (#1384). A
     * read/parse/lint failure — including a malformed `.bpmnlintrc` — degrades to
     * the no-config-*failure* state (linting off in the webview) rather than
     * crashing the editor, and forgets the negotiation so a later valid edit
     * re-negotiates cleanly.
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

            const rawConfig = await this.locator.readConfig(configPath);
            // Parse up-front: a cache-hit rawConfig always parses (a negotiation is
            // only stored after a successful parse), so a throw here is always a
            // new/malformed version and belongs in the catch.
            const config = JSON.parse(rawConfig) as Record<string, unknown>;
            const existing = this.negotiations.get(editorId);

            // Cache hit — same config version: reuse the settled decision and
            // re-lint (the document may have changed) without re-negotiating.
            if (
                existing &&
                existing.configPath === configPath &&
                existing.rawConfig === rawConfig
            ) {
                if (existing.decision === "escalated") {
                    return this.runWorkspaceLint(editorId, configPath, config, reflectInStatusBar);
                }
                return this.reinstructCoveredInPage(
                    editorId,
                    configPath,
                    config as BpmnlintConfig,
                    existing.token,
                    reflectInStatusBar,
                );
            }

            // New or changed version: mint a fresh negotiation and drop any cached
            // in-page event from the prior version.
            const token = this.mintToken();
            this.negotiations.set(editorId, {
                configPath,
                rawConfig,
                token,
                decision: "in-page",
            });
            this.lastInPageEvents.delete(editorId);

            // Static pre-check: escalate immediately (no webview round trip) when
            // the bundled resolver provably cannot cover the config — a Node-only
            // string moddleExtension, or an object one under an unregistered prefix.
            if (staticUnresolvedModdleExtensions(config as BpmnlintConfig).length > 0) {
                const negotiation = this.negotiations.get(editorId);
                if (negotiation) {
                    negotiation.decision = "escalated";
                }
                return this.runWorkspaceLint(editorId, configPath, config, reflectInStatusBar);
            }

            // Covered: the webview lints the workspace config in-page. Provisional
            // Active indicator while its first run is in flight (no cache yet).
            this.lintModes.set(editorId, "in-page");
            this.diagnostics.clear(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintActive(configPath);
            }
            return this.postInPageInstruction(editorId, config as BpmnlintConfig, token);
        } catch (error) {
            // A malformed .bpmnlintrc or a linter blow-up must not crash the
            // editor — warn, fall back to the no-config-failure state, forget the
            // negotiation, and tell the webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to lint against .bpmnlintrc: ${(error as Error).message}`),
            );
            this.setExternalMode(editorId);
            this.negotiations.delete(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            this.diagnostics.clear(editorId);
            return this.pushResults(editorId, null);
        }
    }

    /**
     * Runs bpmnlint host-side against a discovered `.bpmnlintrc` and pushes the
     * findings (the escalated tier). Flips the mode to `"external"` *before* the
     * push so a stale in-page run already in flight is dropped by
     * {@link applyWebviewLintResults} — the no-duplicate-markers invariant.
     *
     * Owns its own catch so escalation callers can fire-and-forget it without
     * leaking an unhandled rejection: a failure degrades to the no-config-failure
     * state and forgets the negotiation so a later valid edit re-negotiates.
     */
    private async runWorkspaceLint(
        editorId: string,
        configPath: string,
        config: Record<string, unknown>,
        reflectInStatusBar: boolean,
    ): Promise<boolean> {
        try {
            const xml = this.vsDocument.getContent(editorId);
            const { results, unresolved } = await this.lintRunner.lint(xml, configPath, config);

            this.setExternalMode(editorId);
            this.applyFindings(editorId, xml, results, unresolved, reflectInStatusBar, {
                kind: "workspace",
                configPath,
            });
            return this.pushResults(editorId, results);
        } catch (error) {
            this.notifier.logError(
                new Error(`Failed to lint against .bpmnlintrc: ${(error as Error).message}`),
            );
            this.setExternalMode(editorId);
            this.negotiations.delete(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            this.diagnostics.clear(editorId);
            return this.pushResults(editorId, null);
        }
    }

    /**
     * Cache-hit covered branch: the config version is unchanged and its settled
     * decision is in-page, so re-assert the in-page mode and replay the last
     * cached event (panel re-activation) — or clear + a provisional Active
     * indicator when there is none — then re-send the instruction carrying the
     * *same* token (the webview dedups on it; a freshly reloaded webview applies).
     */
    private reinstructCoveredInPage(
        editorId: string,
        configPath: string,
        config: BpmnlintConfig,
        token: string,
        reflectInStatusBar: boolean,
    ): Promise<boolean> {
        this.lintModes.set(editorId, "in-page");
        const cached = this.lastInPageEvents.get(editorId);
        if (cached) {
            this.applyFindings(
                editorId,
                cached.xml,
                cached.results,
                cached.unresolved,
                reflectInStatusBar,
                { kind: "in-page", platform: cached.platform, configPath: cached.configPath },
            );
        } else {
            this.diagnostics.clear(editorId);
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintActive(configPath);
            }
        }
        return this.postInPageInstruction(editorId, config, token);
    }

    /** Mints the next opaque config-version token. */
    private mintToken(): string {
        return `lint-cfg-${++this.tokenCounter}`;
    }

    /**
     * Switches the editor to the in-page **default** path (no workspace config)
     * and tells the webview to run its own engine-aware default. Forgets any
     * negotiation — this is the de-escalation direction (config deleted / never
     * present). Replays the last cached default event if one exists (panel
     * re-activation) so the Problems panel + status bar are restored instead of
     * blanking; a cached *covered* event (from a since-deleted config) is stale
     * for the default tier, so it is dropped in favour of a provisional default
     * indicator while the webview's first default run is in flight.
     */
    private instructInPage(editorId: string, reflectInStatusBar: boolean): Promise<boolean> {
        this.lintModes.set(editorId, "in-page");
        this.negotiations.delete(editorId);

        const cached = this.lastInPageEvents.get(editorId);
        if (cached && cached.configPath === undefined) {
            this.applyFindings(
                editorId,
                cached.xml,
                cached.results,
                cached.unresolved,
                reflectInStatusBar,
                { kind: "in-page", platform: cached.platform },
            );
        } else {
            this.lastInPageEvents.delete(editorId);
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
            } else if (source.configPath !== undefined) {
                // #1384 covered workspace tier: linted in-page, but against a real
                // .bpmnlintrc — surface it as Active, not the zero-config default.
                this.statusBar.showBpmnlintActive(source.configPath);
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
     * Tells the webview to run its in-page linter. Payload-free = the #1373
     * engine-aware default (no workspace config); with `config` + `configToken` =
     * the #1384 covered workspace tier, the config to lint plus the version stamp
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
