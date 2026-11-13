import { ReviewAnswer } from "../../../kernel/domain/approvalAnswer";
import { ApprovalReviewPort, ApprovalReviewRequest } from "../../../kernel/port/approvalPorts";
import { addOnIdOf, CodeAddOnKind } from "../../domain/addOnIds";
import { leavesToView } from "../../domain/addOnScope";
import { AddOnViewRevealPort } from "../../port/addOnViewPorts";

/**
 * Leaves pending code to the host's add-ons view at the rows that list it,
 * and answers at once, so the question queue does not wait on the view. The
 * fallback reviews what the view does not list, or when it cannot open.
 */
export class ViewReview implements ApprovalReviewPort {
    constructor(
        private readonly kind: CodeAddOnKind,
        private readonly view: AddOnViewRevealPort,
        private readonly fallback: ApprovalReviewPort,
    ) {}

    async review(request: ApprovalReviewRequest): Promise<ReviewAnswer> {
        if (!leavesToView(request.artifactIds, request.workspaceFolders)) {
            return this.fallback.review(request);
        }
        const addOnIds = request.artifactIds.map((id) => addOnIdOf(this.kind, id));
        const shown = await this.view.reveal(addOnIds).catch(() => false);
        return shown ? { kind: "leftForView" } : this.fallback.review(request);
    }
}
