import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../modeler/editor-session/EditorSessionParticipant";
import { CodeLinkMapService } from "@miragon/bpmn-modeler-core";

/**
 * Releases a session's slice of the activity→code map (and its share of the
 * shared source-file watcher) when the editor closes.
 *
 * The map itself is built and maintained by the incoming
 * {@link SyncActivitiesCommand}s, not on resolve — the webview drives it — so
 * this participant carries only the teardown half of the lifecycle.
 */
export class CodeLinkParticipant implements EditorSessionParticipant {
    constructor(private readonly mapService: CodeLinkMapService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.mapService.disposeEditor(session.editorId));
    }
}
