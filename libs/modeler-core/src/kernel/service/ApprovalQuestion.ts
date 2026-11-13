import { ActionNotice } from "../domain/actionNotice";
import { ApprovalNoticeAction, ReviewAnswer } from "../domain/approvalAnswer";
import { ChoicePrompt } from "../domain/prompts";
import { ApprovalReviewPort } from "../port/approvalPorts";
import { ActionNotifierPort, WorkspacePort } from "../port/hostPorts";
import { QuestionQueue } from "./QuestionQueue";

/** What an {@link ApprovalQuestion} needs of one approval kind's catalog. */
export interface ApprovalCatalog<Found, Pending, Allowed> {
    /** Those of `found` that no answer settled since they were found. */
    stillPendingOf(found: readonly Found[]): readonly Pending[];
    reviewNotice(pending: readonly Pending[]): ActionNotice<ApprovalNoticeAction>;
    reviewPrompt(
        pending: readonly Pending[],
        workspaceFolders: readonly string[],
    ): ChoicePrompt<string>;
    /** No checked id declines every pending artifact; `leftForView` declines none. */
    applyAnswer(pending: readonly Pending[], answer: ReviewAnswer): Promise<readonly Allowed[]>;
}

/**
 * Asks the user which pending artifacts of one approval kind to allow: a
 * notice first, the review only on "Review…". Something found while a question
 * is open, of this or another kind on the same queue, is asked afterwards,
 * about what the earlier answers left pending. A review that leaves the code
 * to a view answers at once, so the queue does not wait on the view. Knows no
 * editor, so every host shares it.
 */
export class ApprovalQuestion<Found, Pending, Allowed> {
    constructor(
        private readonly catalog: ApprovalCatalog<Found, Pending, Allowed>,
        private readonly review: ApprovalReviewPort,
        private readonly actionNotifier: ActionNotifierPort,
        private readonly workspace: WorkspacePort,
        private readonly questions: QuestionQueue,
    ) {}

    /** @returns what the answer allowed; nothing when nothing was left to ask. */
    ask(found: readonly Found[]): Promise<readonly Allowed[]> {
        return this.questions.ask(() => this.askStillPending(found));
    }

    private async askStillPending(found: readonly Found[]): Promise<readonly Allowed[]> {
        const pending = this.catalog.stillPendingOf(found);
        if (pending.length === 0) {
            return [];
        }
        const action = await this.actionNotifier.offer(this.catalog.reviewNotice(pending));
        const answer: ReviewAnswer =
            action === "review" ? await this.reviewed(pending) : { kind: "checked", ids: [] };
        return this.catalog.applyAnswer(pending, answer);
    }

    private reviewed(pending: readonly Pending[]): Promise<ReviewAnswer> {
        const workspaceFolders = this.workspace.getWorkspaceFolderPaths();
        const prompt = this.catalog.reviewPrompt(pending, workspaceFolders);
        return this.review.review({
            prompt,
            artifactIds: prompt.items.map(({ value }) => value),
            workspaceFolders,
        });
    }
}
