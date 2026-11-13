import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { ElementIdsService } from "./ElementIdsService";

/** Ends a host's element ID review with the editor whose diagram it reviews. */
export class ElementIdReviewParticipant implements EditorSessionParticipant {
    constructor(private readonly elementIds: ElementIdsService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.elementIds.end(session.editorId));
    }
}
