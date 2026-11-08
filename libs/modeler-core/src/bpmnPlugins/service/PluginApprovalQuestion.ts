import { ActionNotifierPort, PickerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import { PendingApproval, WorkspacePlugin } from "../domain/pluginApproval";
import { PluginCatalog } from "./PluginCatalog";

/**
 * Asks the user which pending plugins to allow: a notice first, the list only
 * on "Review…". A request found while a question is open, of this or another
 * approval kind on the same queue, is asked afterwards, about what the earlier
 * answers left pending. Knows no editor, so every host that serves plugins
 * shares it.
 */
export class PluginApprovalQuestion {
    constructor(
        private readonly catalog: PluginCatalog,
        private readonly picker: PickerPort,
        private readonly actionNotifier: ActionNotifierPort,
        private readonly workspace: WorkspacePort,
        private readonly questions: QuestionQueue,
    ) {}

    /** @returns the plugins the answer allowed; none when nothing was left to ask. */
    ask(found: readonly PendingApproval[]): Promise<readonly WorkspacePlugin[]> {
        return this.questions.ask(() => this.askStillPending(found));
    }

    private async askStillPending(
        found: readonly PendingApproval[],
    ): Promise<readonly WorkspacePlugin[]> {
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
