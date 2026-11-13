import { commands, type Disposable, type ExtensionContext } from "vscode";

import type { ElementIdsService, LoggerPort } from "@miragon/bpmn-modeler-core";

export const APPLY_ELEMENT_IDS_CMD = "bpmn-modeler.elementIdReview.apply";
export const DISCARD_ELEMENT_IDS_CMD = "bpmn-modeler.elementIdReview.discard";
export const REVEAL_ELEMENT_ID_ROW_CMD = "bpmn-modeler.elementIdReview.reveal";

/** The review panel's checkboxes, as the panel reports them. */
interface ElementIdReviewChecks extends Disposable {
    onDidChangeChecks(listener: (ids: string[], checked: boolean) => void): Disposable;
}

/**
 * Hands the review panel's title actions, row clicks and checkboxes to the
 * core. The commands are registered on every VS Code the manifest declares
 * them for; before 1.80 there is no panel, and the core has no review to act on.
 */
export class ElementIdReviewController {
    constructor(
        private readonly review: ElementIdReviewChecks | undefined,
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
        );
        if (this.review) {
            context.subscriptions.push(
                this.review.onDidChangeChecks((ids, checked) => {
                    void this.run(() => this.elementIds.setChecked(ids, checked));
                }),
                this.review,
            );
        }
    }

    private async run(action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error) {
            this.logger.logError(error as Error);
        }
    }
}
