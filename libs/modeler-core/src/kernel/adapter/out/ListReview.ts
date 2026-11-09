import { ReviewAnswer } from "../../domain/codeApproval";
import { ApprovalReviewPort, ApprovalReviewRequest } from "../../port/approvalPorts";
import { PickerPort } from "../../port/hostPorts";

/** Reviews pending code in the host's checklist, so the answer is always the checked ids. */
export class ListReview implements ApprovalReviewPort {
    constructor(private readonly picker: PickerPort) {}

    async review({ prompt }: ApprovalReviewRequest): Promise<ReviewAnswer> {
        return { kind: "checked", ids: await this.picker.chooseMany(prompt) };
    }
}
