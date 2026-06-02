import { ScriptTaskService } from "../../../../scriptTask/index";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Disposes a session's inline script-task editors and buffered replays on close.
 * Script-task resync/open are router handlers (message-driven); only teardown is
 * a lifecycle concern, so this participant carries nothing else.
 */
export class ScriptTaskTeardownParticipant implements EditorSessionParticipant {
    constructor(private readonly scriptTaskSvc: ScriptTaskService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.scriptTaskSvc.disposeForEditor(session.editorId));
    }
}
