import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../shared/domain/EditorSessionParticipant";
import { DefinitionSearchService } from "../service/DefinitionSearchService";

/** Releases the definition index's watchers when their BPMN editor session closes. */
export class DefinitionSearchParticipant implements EditorSessionParticipant {
    constructor(private readonly searchService: DefinitionSearchService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.searchService.releaseEditor(session.editorId));
    }
}
