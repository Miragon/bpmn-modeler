import { ActionNotice } from "../domain/actionNotice";
import { ApprovalNoticeAction } from "../domain/codeApproval";
import { ChoicePrompt } from "../domain/prompts";
import { ActionNotifierPort, PickerPort, WorkspacePort } from "../port/hostPorts";
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
    /** No checked id declines every pending artifact. */
    applyAnswer(
        pending: readonly Pending[],
        checkedIds: readonly string[],
    ): Promise<readonly Allowed[]>;
}

/**
 * Asks the user which pending artifacts of one approval kind to allow: a
 * notice first, the list only on "Review…". Something found while a question
 * is open, of this or another kind on the same queue, is asked afterwards,
 * about what the earlier answers left pending. Knows no editor, so every host
 * shares it.
 */
export class ApprovalQuestion<Found, Pending, Allowed> {
    constructor(
        private readonly catalog: ApprovalCatalog<Found, Pending, Allowed>,
        private readonly picker: PickerPort,
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
        const checked =
            action === "review"
                ? await this.picker.chooseMany(
                      this.catalog.reviewPrompt(pending, this.workspace.getWorkspaceFolderPaths()),
                  )
                : [];
        return this.catalog.applyAnswer(pending, checked);
    }
}
