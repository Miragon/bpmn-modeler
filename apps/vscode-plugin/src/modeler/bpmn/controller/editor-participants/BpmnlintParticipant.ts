import {
    BpmnLintConfigLocator,
    BpmnLintConfigService,
    BpmnlintChangeTarget,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { VsCodeStatusBar } from "../../../../shared/infrastructure/VsCodeStatusBar";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Coalescing window for re-linting on diagram edits. Linting runs in the host
 * (parse + resolve + traverse), so debouncing keeps a burst of keystroke-driven
 * document syncs from triggering a lint per change.
 */
const RELINT_DEBOUNCE_MS = 400;

/**
 * Drives host-side bpmnlint for a BPMN session: re-lints on document change
 * (debounced), on `configFolder` setting changes, and whenever the `.bpmnlintrc`
 * changes on disk; the initial lint is triggered by the webview's
 * `GetBpmnlintConfigCommand` on load. The status item tracks editor focus and is
 * cleared — along with the published diagnostics — on dispose so neither lingers
 * for a closed editor (mirrors {@link EngineVersionStatusBarParticipant}).
 *
 * A single instance serves every editor, so the debounce timers are keyed by
 * editorId.
 */
export class BpmnlintParticipant implements EditorSessionParticipant {
    private readonly relintTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly lintSvc: BpmnLintConfigService,
        private readonly locator: BpmnLintConfigLocator,
        private readonly statusBar: VsCodeStatusBar,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async onResolve(session: EditorSessionContext): Promise<void> {
        session.onSettingChange((event, editorId) => {
            if (
                event.affectsConfiguration("miragon.bpmnModeler.configFolder") ||
                event.affectsConfiguration("miragon.bpmnModeler.linting.enabled")
            ) {
                this.lintSvc.setBpmnlintConfig(editorId, session.panel.active);
            }
        });

        // Re-lint on edits: the custom text editor syncs webview edits into the
        // TextDocument, so the host always lints the current XML. Filter to this
        // session's `.bpmn` document so an edit elsewhere never re-lints it.
        // In-page sessions (no workspace config, #1373 Phase B) lint in the
        // webview on every diagram change already, so a host re-lint would be
        // pure churn — skip it and let the webview's own push drive the chrome.
        session.onDocumentChange((event) => {
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(".bpmn") &&
                session.editorId === event.documentUriString() &&
                this.lintSvc.getLintMode(session.editorId) !== "in-page"
            ) {
                this.scheduleRelint(session);
            }
        });

        const subscription = session.panel.onDidChangeViewState(() => {
            if (session.panel.active) {
                this.lintSvc.setBpmnlintConfig(session.editorId);
            } else {
                this.statusBar.hideBpmnlintStatus();
            }
        });
        session.addDisposable(subscription);

        session.onDispose(() => {
            const timer = this.relintTimers.get(session.editorId);
            if (timer) {
                clearTimeout(timer);
                this.relintTimers.delete(session.editorId);
            }
            this.statusBar.hideBpmnlintStatus();
            this.lintSvc.clearDiagnostics(session.editorId);
        });

        const watcherTarget: BpmnlintChangeTarget = {
            setBpmnlintConfig: (editorId) =>
                this.lintSvc.setBpmnlintConfig(editorId, session.panel.active),
        };
        const { disposables, errors } = await this.locator.createWatcher(
            session.editorId,
            watcherTarget,
        );
        if (!session.isCurrent()) {
            disposables.forEach((disposable) => disposable.dispose());
            return;
        }
        for (const disposable of disposables) {
            session.addDisposable(disposable);
        }
        for (const error of errors) {
            this.notifier.showError(error.message);
            this.notifier.logError(error);
        }
    }

    private scheduleRelint(session: EditorSessionContext): void {
        const existing = this.relintTimers.get(session.editorId);
        if (existing) {
            clearTimeout(existing);
        }
        this.relintTimers.set(
            session.editorId,
            setTimeout(() => {
                this.relintTimers.delete(session.editorId);
                this.lintSvc.setBpmnlintConfig(session.editorId, session.panel.active);
            }, RELINT_DEBOUNCE_MS),
        );
    }
}
