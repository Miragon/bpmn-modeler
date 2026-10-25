import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../shared/domain/EditorSessionParticipant";
import { FormReferenceStatusService } from "../service/FormReferenceStatusService";

/** Releases form-status watchers when their BPMN editor session closes. */
export class FormReferenceStatusParticipant implements EditorSessionParticipant {
    constructor(private readonly statusService: FormReferenceStatusService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.statusService.disposeEditor(session.editorId));
    }
}
