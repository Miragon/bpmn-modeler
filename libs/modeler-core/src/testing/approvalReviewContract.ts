import { describe, expect, it } from "vitest";

import { ChoicePrompt } from "../kernel/domain/prompts";
import { ApprovalReviewPort } from "../kernel/port/approvalPorts";

/**
 * One {@link ApprovalReviewPort} adapter under the
 * {@link describeApprovalReviewContract} scenarios, with the user who answers
 * the list it shows. Each answer is given before the review starts.
 */
export interface ApprovalReviewContractFixture {
    readonly review: ApprovalReviewPort;
    /** The user checks the rows at `rows` of the list shown for `prompt`, in that order, and accepts. */
    userChecks(prompt: ChoicePrompt<string>, rows: readonly number[]): void;
    /** The user closes the list shown for `prompt` without an answer. */
    userDismisses(prompt: ChoicePrompt<string>): void;
}

const PENDING: ChoicePrompt<string> = {
    id: "codeApproval",
    title: "Allow code from this workspace?",
    placeholder: "Check only the ones you trust.",
    items: [
        { label: "Resize Tasks", value: "/work/.camunda/plugins/resize-tasks" },
        { label: "Reduced Palette", value: "/work/.camunda/plugins/reduced-palette" },
        { label: "Token Simulation", value: "/work/.camunda/plugins/token-simulation" },
    ],
};

const request = {
    prompt: PENDING,
    artifactIds: PENDING.items.map(({ value }) => value),
};

/** What the core relies on of a review that shows the pending code as a list. */
export function describeApprovalReviewContract(
    name: string,
    createFixture: () => Promise<ApprovalReviewContractFixture>,
): void {
    describe(`${name} (approval review contract)`, () => {
        it("answers the checked ids in the order the list shows them", async () => {
            const fixture = await createFixture();
            fixture.userChecks(PENDING, [2, 0]);

            await expect(fixture.review.review(request)).resolves.toEqual({
                kind: "checked",
                ids: [PENDING.items[0].value, PENDING.items[2].value],
            });
        });

        it("checks nothing when the user closes the list", async () => {
            const fixture = await createFixture();
            fixture.userDismisses(PENDING);

            await expect(fixture.review.review(request)).resolves.toEqual({
                kind: "checked",
                ids: [],
            });
        });
    });
}
