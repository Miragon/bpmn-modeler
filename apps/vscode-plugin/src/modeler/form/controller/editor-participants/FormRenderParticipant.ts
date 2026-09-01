import { FormModelerService } from "@miragon/bpmn-modeler-core";

import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

export class FormRenderParticipant implements EditorSessionParticipant {
    constructor(
        private readonly formService: FormModelerService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    onResolve(session: EditorSessionContext): void {
        this.formService.registerSession(session.editorId);
        session.onDocumentChange((event) => {
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(".form") &&
                session.editorId === event.documentUriString()
            ) {
                this.notifier.logDebug("OnDidChangeTextDocument -> display form");
                void this.formService.display(session.editorId, true);
            }
        });
        session.onDispose(() => this.formService.disposeSession(session.editorId));
    }
}
