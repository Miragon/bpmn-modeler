import { ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { ScriptTaskService } from "../../../../scriptTask/index";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Disposes a session's inline script-task editors and buffered replays on close,
 * and drops its process-variable model so a reopened editor never sees stale
 * completions. Script-task resync/open are router handlers (message-driven);
 * only teardown is a lifecycle concern, so this participant carries nothing else.
 */
export class ScriptTaskTeardownParticipant implements EditorSessionParticipant {
    constructor(
        private readonly scriptTaskSvc: ScriptTaskService,
        private readonly variableStore: ScriptVariableStore,
    ) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => {
            this.scriptTaskSvc.disposeForEditor(session.editorId);
            this.variableStore.clear(session.editorId);
        });
    }
}
