import { FormValuesController } from "../FormValuesController";
import { EditorSessionContext, EditorSessionParticipant } from "@miragon/bpmn-modeler-core";

export class FormValuesParticipant implements EditorSessionParticipant {
    constructor(private readonly formValues: FormValuesController) {}

    onResolve(session: EditorSessionContext): void {
        this.formValues.registerSession(session.editorId);
        session.onDispose(() => void this.formValues.disposeSession(session.editorId));
    }
}
