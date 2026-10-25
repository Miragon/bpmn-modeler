import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../shared/domain/EditorSessionParticipant";
import { CodeLinkMapService } from "../service/CodeLinkMapService";

/** Releases an editor's activity→code map and its share of the source watcher on close. */
export class CodeLinkParticipant implements EditorSessionParticipant {
    constructor(private readonly mapService: CodeLinkMapService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.mapService.disposeEditor(session.editorId));
    }
}
