import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../editorSession/domain/EditorSessionParticipant";
import { ScriptEditorPort } from "../domain/ports";
import { ScriptVariableStore } from "../domain/ScriptVariableStore";

/**
 * A closed editor takes its script tabs, its script files and its process
 * variables with it, so a reopened editor never completes stale variables.
 * Opening and syncing scripts are message-driven; only the teardown is a
 * lifecycle concern.
 */
export class ScriptEditorParticipant implements EditorSessionParticipant {
    constructor(
        private readonly scriptEditor: ScriptEditorPort,
        private readonly variables: ScriptVariableStore,
    ) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => {
            this.scriptEditor.disposeEditor(session.editorId);
            this.variables.clear(session.editorId);
        });
    }
}
