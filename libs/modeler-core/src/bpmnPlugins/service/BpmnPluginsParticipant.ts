import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../editorSession/domain/EditorSessionParticipant";
import { BpmnPluginService } from "./BpmnPluginService";

/** Forgets on close which plugins an editor was offered, so an approval no longer reloads it. */
export class BpmnPluginsParticipant implements EditorSessionParticipant {
    constructor(private readonly plugins: BpmnPluginService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.plugins.releaseEditor(session.editorId));
    }
}
