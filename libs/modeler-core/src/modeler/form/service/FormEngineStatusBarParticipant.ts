import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { StatusItemOwnership } from "../../../editorSession/domain/StatusItemOwnership";
import { DocumentPort, StatusBarPort } from "../../../kernel/port/hostPorts";
import { formEngineStatusView, readFormEngineMetadata } from "../domain/formEngine";

export class FormEngineStatusBarParticipant implements EditorSessionParticipant {
    constructor(
        private readonly statusBar: StatusBarPort,
        private readonly documents: DocumentPort,
        private readonly ownership: StatusItemOwnership,
    ) {}

    onResolve(session: EditorSessionContext): void {
        const show = () => {
            if (!session.isCurrent() || !session.isFocused()) return;
            this.ownership.claim(session.editorId);
            this.statusBar.show(
                "engineVersion",
                formEngineStatusView(
                    readFormEngineMetadata(this.documents.getContent(session.editorId)),
                ),
            );
        };
        const release = () => {
            if (this.ownership.release(session.editorId) === "hide")
                this.statusBar.hide("engineVersion");
        };
        show();
        session.onFocusChange((focused) => (focused ? show() : release()));
        session.onDocumentChange((event) => {
            if (event.hasContentChanges() && event.documentUriString() === session.editorId) show();
        });
        session.onDispose(release);
    }
}
