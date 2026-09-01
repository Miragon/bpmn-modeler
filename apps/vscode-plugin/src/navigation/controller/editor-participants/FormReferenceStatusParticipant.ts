import { FormReferenceStatusService } from "../../index";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../modeler/editor-session/EditorSessionParticipant";

/** Releases form-status watchers when their BPMN editor session closes. */
export class FormReferenceStatusParticipant implements EditorSessionParticipant {
    constructor(private readonly statusService: FormReferenceStatusService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.statusService.disposeEditor(session.editorId));
    }
}
