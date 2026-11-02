import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { NotifierPort } from "../../../kernel/domain/hostPorts";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { BpmnElementTemplatesService } from "../service/BpmnElementTemplatesService";

/**
 * Keeps element templates in sync for a BPMN session: starts the filesystem
 * watcher over the artifact directories, re-arms it and reloads on
 * `configFolder` setting changes and on a re-seed, and releases the session's
 * cached templates when it closes. Setup errors surface to the user.
 */
export class ElementTemplatesParticipant implements EditorSessionParticipant {
    constructor(
        private readonly templatesSvc: BpmnElementTemplatesService,
        private readonly artifactSvc: ArtifactService,
        private readonly notifier: NotifierPort,
    ) {}

    async onResolve(session: EditorSessionContext): Promise<void> {
        let templateWatchers: { dispose(): void }[] = [];
        let latestArming = 0;
        const disposeTemplateWatchers = () => {
            templateWatchers.forEach((watcher) => watcher.dispose());
            templateWatchers = [];
        };
        const armTemplateWatchers = async (): Promise<void> => {
            const arming = ++latestArming;
            const { disposables, errors } = await this.artifactSvc.createWatcher(
                session.editorId,
                this.templatesSvc,
            );
            if (arming !== latestArming || !session.isCurrent()) {
                disposables.forEach((disposable) => disposable.dispose());
                return;
            }
            disposeTemplateWatchers();
            templateWatchers = disposables;
            for (const error of errors) {
                this.notifier.showError(error.message);
                this.notifier.logError(error);
            }
        };

        session.onDispose(() => {
            latestArming++;
            disposeTemplateWatchers();
            this.templatesSvc.releaseEditor(session.editorId);
        });

        // Other modeler settings are owned by the settings broadcaster; only the
        // templates branch lives here because it drives a different service.
        session.onSettingChange((event, editorId) => {
            if (event.affects("configFolder")) {
                // The watcher reads the config folder when it is armed.
                armTemplateWatchers().catch((error) => this.notifier.logError(error as Error));
                this.templatesSvc.refreshElementTemplates(editorId);
            }
        });

        session.onReseed(async () => {
            await armTemplateWatchers();
            await this.templatesSvc.setElementTemplates(session.editorId);
        });

        await armTemplateWatchers();
    }
}
