import { ArtifactService } from "@miragon/bpmn-modeler-core";
import { BpmnElementTemplatesService } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Keeps element templates in sync for a BPMN session: reloads on `configFolder`
 * setting changes and starts the filesystem watcher over the artifact
 * directories. Watcher disposables join the session bag; setup errors surface to
 * the user.
 */
export class ElementTemplatesParticipant implements EditorSessionParticipant {
    constructor(
        private readonly templatesSvc: BpmnElementTemplatesService,
        private readonly artifactSvc: ArtifactService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async onResolve(session: EditorSessionContext): Promise<void> {
        // Other modeler settings are owned by the settings broadcaster; only the
        // templates branch lives here because it drives a different service.
        session.onSettingChange((event, editorId) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                this.templatesSvc.setElementTemplates(editorId);
            }
        });

        const { disposables, errors } = await this.artifactSvc.createWatcher(
            session.editorId,
            this.templatesSvc,
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
}
