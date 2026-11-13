import { ReviewAnswer } from "../kernel/domain/approvalAnswer";
import { ApprovalReviewPort, ApprovalReviewRequest } from "../kernel/port/approvalPorts";

/** Scripted review answers keyed by prompt id: the checked ids, or the code left to a view. */
export type ReviewAnswers = Readonly<Record<string, readonly string[] | "leftForView">>;

/**
 * Answers each review from `answers` by its prompt id; an unanswered one is a
 * dismissed list. Checked ids come back in the prompt's order, and an id the
 * review did not offer throws, so a test cannot allow code nobody was shown.
 */
export class ScriptedReview implements ApprovalReviewPort {
    readonly requests: ApprovalReviewRequest[] = [];

    constructor(readonly answers: ReviewAnswers = {}) {}

    async review(request: ApprovalReviewRequest): Promise<ReviewAnswer> {
        this.requests.push(request);
        const answer = this.answers[request.prompt.id] ?? [];
        if (answer === "leftForView") {
            return { kind: "leftForView" };
        }
        const unoffered = answer.find((id) => !request.artifactIds.includes(id));
        if (unoffered !== undefined) {
            throw new Error(`"${unoffered}" is not offered by review "${request.prompt.id}"`);
        }
        return { kind: "checked", ids: request.artifactIds.filter((id) => answer.includes(id)) };
    }
}
