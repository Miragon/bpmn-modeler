import type {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import type { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import type { LoggerPort, SettingsPort } from "../../../kernel/port/hostPorts";

/**
 * Follows language changes in an open template preview. The initial language
 * rides on the file itself, so this only sends what changes afterwards.
 */
export class TemplateEditorLanguageParticipant implements EditorSessionParticipant {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly settings: Pick<SettingsPort, "getLanguage">,
        private readonly logger: LoggerPort,
    ) {}

    onResolve(session: EditorSessionContext): void {
        session.onSettingChange((event, editorId) => {
            if (!event.affects("language")) {
                return;
            }
            this.editorStore.pushLanguage(editorId, this.settings.getLanguage(), this.logger);
        });
    }
}
