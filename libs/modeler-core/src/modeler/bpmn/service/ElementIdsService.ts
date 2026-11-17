import { basename } from "path";

import {
    ApplyElementIdsQuery,
    CloseElementIdReviewQuery,
    type Command,
    type ElementIdProposalsCommand,
    ElementIdProposalsQuery,
    FocusElementQuery,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import {
    CLOSED_ELEMENT_ID_REVIEW,
    type ElementIdReview,
    type ElementIdReviewAction,
    type ElementIdReviewEvent,
    reduceElementIdReview,
} from "../domain/elementIdReview";
import { ELEMENT_ID_REVIEW_UNAVAILABLE } from "../domain/elementIdTexts";
import type { ElementIdReviewPort } from "../port/bpmnPorts";

/**
 * Generate IDs from Names for every host: the VS Code command and the IntelliJ
 * action each make one call. The host shows the review in its own
 * {@link ElementIdReviewPort} and hands its actions back here; the review's
 * rules live in {@link reduceElementIdReview}.
 */
export class ElementIdsService {
    private review: ElementIdReview = CLOSED_ELEMENT_ID_REVIEW;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
        private readonly reviewPanel?: ElementIdReviewPort,
    ) {}

    /**
     * Opens the review of the editor's diagram. Running it again on the same
     * diagram keeps the choices made; on another diagram it moves there.
     */
    async generate(editorId: string): Promise<void> {
        if (!this.reviewPanel) {
            this.notifier.showInfo(ELEMENT_ID_REVIEW_UNAVAILABLE);
            return;
        }
        const title = basename(this.editorStore.requireHandle(editorId).documentPath());
        await this.dispatch({ type: "generate", editorId, title });
    }

    reportProposals(editorId: string, { status, rows, unchecked }: ElementIdProposalsCommand) {
        return this.dispatch({ type: "reported", editorId, status, rows, unchecked });
    }

    setChecked(ids: readonly string[], checked: boolean): Promise<void> {
        return this.dispatch({ type: "checked", ids, checked });
    }

    apply(): Promise<void> {
        return this.dispatch({ type: "apply" });
    }

    reportApplied(editorId: string): Promise<void> {
        return this.dispatch({ type: "applied", editorId });
    }

    discard(): Promise<void> {
        return this.dispatch({ type: "discard" });
    }

    reveal(elementId: string): Promise<void> {
        return this.dispatch({ type: "reveal", elementId });
    }

    /** The editor's page restarted, so it lists the open review's rows again. */
    resume(editorId: string): Promise<void> {
        return this.dispatch({ type: "resumed", editorId });
    }

    /** The review is over for this editor: its editor closed. Closing posts nothing, so it needs no await. */
    end(editorId: string): void {
        void this.dispatch({ type: "ended", editorId });
    }

    /** Stores the next review first, so a post's await already sees it. */
    private async dispatch(event: ElementIdReviewEvent): Promise<void> {
        const { next, actions } = reduceElementIdReview(this.review, event);
        this.review = next;
        for (const action of actions) {
            // Panel and notifier actions run synchronously, before any post's await.
            const posting = this.carryOut(action);
            if (posting) await posting;
        }
    }

    private carryOut(action: ElementIdReviewAction): Promise<void> | undefined {
        switch (action.kind) {
            case "askForRows":
                return this.post(action.editorId, new ElementIdProposalsQuery(action.unchecked));
            case "rename":
                return this.post(action.editorId, new ApplyElementIdsQuery(action.unchecked));
            case "reveal":
                return this.post(action.editorId, new FocusElementQuery(action.elementId));
            case "stopListing":
                return this.postQuietly(action.editorId, new CloseElementIdReviewQuery());
            case "show":
                this.reviewPanel?.show(action.view);
                return undefined;
            case "notify":
                this.notifier.showInfo(action.text);
                return undefined;
            case "closePanel":
                this.reviewPanel?.close();
                return undefined;
        }
    }

    private async post(editorId: string, message: Command | Query): Promise<void> {
        if ((await this.editorStore.postUnlessHidden(editorId, message)) === "hidden") {
            await this.dispatch({ type: "editorHidden", editorId });
        }
    }

    private async postQuietly(editorId: string, message: Command | Query): Promise<void> {
        try {
            await this.editorStore.postUnlessHidden(editorId, message);
        } catch (error) {
            this.notifier.logDebug(`Element ID review: ${String(error)}`);
        }
    }
}
