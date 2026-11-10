import { describeApprovalReviewContract } from "./approvalReviewContract";
import { ReviewAnswers, ScriptedReview } from "./ScriptedReview";

describeApprovalReviewContract("ScriptedReview", async () => {
    const answers: Record<string, ReviewAnswers[string]> = {};
    return {
        review: new ScriptedReview(answers),
        userChecks: (prompt, rows) => {
            answers[prompt.id] = rows.map((row) => prompt.items[row].value);
        },
        userDismisses: (prompt) => {
            delete answers[prompt.id];
        },
    };
});
