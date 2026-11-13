import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { DocumentPort, StatusBarPort } from "../../../kernel/port/hostPorts";
import { formEngineStatusView, readFormEngineMetadata } from "../domain/formEngine";

export class FormEngineStatusBarParticipant implements EditorSessionParticipant {
    constructor(
        private readonly statusBar: StatusBarPort,
        private readonly documents: DocumentPort,
    ) {}

    onResolve(session: EditorSessionContext): void {
        const show = () => {
            if (!session.claimStatusSlot("engineVersion")) return;
            this.statusBar.show(
                "engineVersion",
                formEngineStatusView(
                    readFormEngineMetadata(this.documents.getContent(session.editorId)),
                ),
            );
        };
        const release = () => {
            if (session.releaseStatusSlot("engineVersion") === "hide")
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
