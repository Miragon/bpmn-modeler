import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../editorSession/domain/EditorSessionParticipant";
import { ScriptVariableStore } from "../domain/ScriptVariableStore";
import { ScriptTabService } from "./ScriptTabService";

/**
 * A closed editor takes its script tabs, its script files and its process
 * variables with it, so a reopened editor never completes stale variables.
 * Opening and syncing scripts are message-driven; only the teardown is a
 * lifecycle concern.
 */
export class ScriptEditorParticipant implements EditorSessionParticipant {
    constructor(
        private readonly scriptTabs: ScriptTabService,
        private readonly variables: ScriptVariableStore,
    ) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => {
            this.scriptTabs.disposeEditor(session.editorId);
            this.variables.clear(session.editorId);
        });
    }
}
