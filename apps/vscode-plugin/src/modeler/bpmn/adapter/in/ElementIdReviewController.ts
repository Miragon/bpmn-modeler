import {
    commands,
    type ExtensionContext,
    type TreeCheckboxChangeEvent,
    TreeItemCheckboxState,
} from "vscode";

import type { ElementIdsService, LoggerPort } from "@miragon/bpmn-modeler-core";

import {
    type ElementIdReviewNode,
    REVEAL_ELEMENT_ID_ROW_CMD,
    rowIdsOf,
    type VsCodeElementIdReview,
} from "../out/VsCodeElementIdReview";

export const APPLY_ELEMENT_IDS_CMD = "bpmn-modeler.elementIdReview.apply";
export const DISCARD_ELEMENT_IDS_CMD = "bpmn-modeler.elementIdReview.discard";

/** Hands the review panel's title actions, row clicks and checkboxes to the core. */
export class ElementIdReviewController {
    constructor(
        private readonly review: VsCodeElementIdReview,
        private readonly elementIds: Pick<
            ElementIdsService,
            "apply" | "discard" | "reveal" | "setChecked"
        >,
        private readonly logger: Pick<LoggerPort, "logError">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(APPLY_ELEMENT_IDS_CMD, () =>
                this.run(() => this.elementIds.apply()),
            ),
            commands.registerCommand(DISCARD_ELEMENT_IDS_CMD, () =>
                this.run(() => this.elementIds.discard()),
            ),
            commands.registerCommand(REVEAL_ELEMENT_ID_ROW_CMD, (elementId: string) =>
                this.run(() => this.elementIds.reveal(elementId)),
            ),
            this.review.treeView.onDidChangeCheckboxState((event) => {
                void this.run(() => this.changeCheckboxes(event));
            }),
            this.review,
        );
    }

    private async changeCheckboxes(
        event: TreeCheckboxChangeEvent<ElementIdReviewNode>,
    ): Promise<void> {
        const checked = new Set<string>();
        const unchecked = new Set<string>();
        for (const [node, state] of event.items) {
            const ids = state === TreeItemCheckboxState.Checked ? checked : unchecked;
            rowIdsOf(node).forEach((id) => ids.add(id));
        }
        if (unchecked.size > 0) await this.elementIds.setChecked([...unchecked], false);
        if (checked.size > 0) await this.elementIds.setChecked([...checked], true);
    }

    private async run(action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error) {
            this.logger.logError(error as Error);
        }
    }
}
