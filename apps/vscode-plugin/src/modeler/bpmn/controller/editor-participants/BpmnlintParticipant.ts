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
 * Keeps the `.bpmnlintrc` config in sync for a BPMN session: re-discovers on
 * `configFolder` setting changes and starts the filesystem watcher over the
 * config file. Watcher disposables join the session bag; setup errors surface to
 * the user. The host status item tracks editor focus and is cleared on dispose so
 * it does not show another editor's state or linger once the editor closes
 * (mirrors {@link EngineVersionStatusBarParticipant}).
 */
export class BpmnlintParticipant implements EditorSessionParticipant {
    constructor(
        private readonly lintSvc: BpmnLintConfigService,
        private readonly locator: BpmnLintConfigLocator,
        private readonly statusBar: VsCodeStatusBar,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async onResolve(session: EditorSessionContext): Promise<void> {
        session.onSettingChange((event, editorId) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                this.lintSvc.setBpmnlintConfig(editorId, session.panel.active);
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

        const watcherTarget: BpmnlintChangeTarget = {
            setBpmnlintConfig: (editorId) =>
                this.lintSvc.setBpmnlintConfig(editorId, session.panel.active),
        };
        const { disposables, errors } = await this.locator.createWatcher(
            session.editorId,
            watcherTarget,
        );
        for (const disposable of disposables) {
            session.addDisposable(disposable);
        }
        for (const error of errors) {
            this.notifier.showError(error.message);
            this.notifier.logError(error);
        }

        session.onDispose(() => this.statusBar.hideBpmnlintStatus());
    }
}
