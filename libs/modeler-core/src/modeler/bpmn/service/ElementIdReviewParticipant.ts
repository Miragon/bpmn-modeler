import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { ElementIdReviewService } from "./ElementIdReviewService";

/** Ends a host's element ID review with the editor whose diagram it reviews. */
export class ElementIdReviewParticipant implements EditorSessionParticipant {
    constructor(private readonly elementIdReview: ElementIdReviewService) {}

    onResolve(session: EditorSessionContext): void {
        session.onDispose(() => this.elementIdReview.end(session.editorId));
    }
}
