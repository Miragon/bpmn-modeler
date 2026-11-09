import { describeApprovalReviewContract, ScriptedPicker } from "../../../testing";
import { ListReview } from "./ListReview";

describeApprovalReviewContract("ListReview", async () => {
    const answers: Record<string, unknown> = {};
    return {
        review: new ListReview(new ScriptedPicker(answers)),
        userChecks: (prompt, rows) => {
            answers[prompt.id] = rows.map((row) => prompt.items[row].value);
        },
        userDismisses: (prompt) => {
            delete answers[prompt.id];
        },
    };
});
