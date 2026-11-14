import { basename } from "path";

import {
    ApplyElementIdsQuery,
    CloseElementIdReviewQuery,
    type Command,
    type ElementIdProposalsCommand,
    ElementIdProposalsQuery,
    type ElementIdsAppliedCommand,
    FocusElementQuery,
    type Query,
} from "@miragon/bpmn-modeler-shared";
import type { ElementIdRow } from "@miragon/bpmn-modeler-types";

import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import {
    elementIdReviewView,
    hiddenEditorReviewView,
    unsupportedReviewView,
} from "../domain/elementIdReviewView";
import {
    ELEMENT_ID_REVIEW_UNAVAILABLE,
    SWITCH_MODE_TO_GENERATE_IDS,
} from "../domain/elementIdTexts";
import type { ElementIdReviewPort } from "../port/bpmnPorts";

/** The review a host shows in its own panel; the core keeps which rows are unchecked. */
interface HostReview {
    readonly editorId: string;
    readonly title: string;
    rows: readonly ElementIdRow[];
    /** `null` until the editor lists the rows the review starts with. */
    unchecked: Set<string> | null;
}

/**
 * Generate IDs from Names for every host: the VS Code command and the IntelliJ
 * action each make one call. The host shows the review in its own
 * {@link ElementIdReviewPort} and hands its actions back here.
 */
export class ElementIdsService {
    private review: HostReview | undefined;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
        private readonly reviewPanel?: ElementIdReviewPort,
    ) {}

    /** Only then does the editor offer "Review all IDs…" under the ID field. */
    get hasReviewPanel(): boolean {
        return this.reviewPanel !== undefined;
    }

    /**
     * Opens the review of the editor's diagram. Running it again on the same
     * diagram keeps the choices made; on another diagram it moves there.
     */
    async generate(editorId: string): Promise<void> {
        if (!this.reviewPanel) {
            this.notifier.showInfo(ELEMENT_ID_REVIEW_UNAVAILABLE);
            return;
        }
        const previous = this.review;
        if (previous?.editorId !== editorId) {
            this.review = {
                editorId,
                title: basename(this.editorStore.requireHandle(editorId).documentPath()),
                rows: [],
                unchecked: null,
            };
            if (previous) {
                await this.postQuietly(previous.editorId, new CloseElementIdReviewQuery());
            }
        }
        await this.askForRows();
    }

    reportProposals(editorId: string, message: ElementIdProposalsCommand): void {
        const review = this.reviewOf(editorId);
        if (!review || !this.reviewPanel) return;
        if (message.status === "unsupported") {
            if (review.unchecked === null) {
                this.review = undefined;
                this.notifier.showInfo(SWITCH_MODE_TO_GENERATE_IDS);
            } else {
                this.reviewPanel.show(unsupportedReviewView(review.title));
            }
            return;
        }
        review.rows = message.rows;
        review.unchecked = new Set(message.unchecked);
        this.reviewPanel.show(elementIdReviewView(review.title, review.rows, review.unchecked));
    }

    async setChecked(ids: readonly string[], checked: boolean): Promise<void> {
        const review = this.review;
        if (!review?.unchecked) return;
        for (const id of ids) {
            if (checked) review.unchecked.delete(id);
            else review.unchecked.add(id);
        }
        this.reviewPanel?.show(elementIdReviewView(review.title, review.rows, review.unchecked));
        await this.askForRows();
    }

    async apply(): Promise<void> {
        const review = this.review;
        if (!review?.unchecked) return;
        await this.postToReview(new ApplyElementIdsQuery([...review.unchecked]));
    }

    reportApplied(editorId: string, _message: ElementIdsAppliedCommand): void {
        if (this.reviewOf(editorId)) this.end(editorId);
    }

    async discard(): Promise<void> {
        const review = this.review;
        if (!review) return;
        this.end(review.editorId);
        await this.postQuietly(review.editorId, new CloseElementIdReviewQuery());
    }

    async reveal(elementId: string): Promise<void> {
        await this.postToReview(new FocusElementQuery(elementId));
    }

    /** The editor's page restarted, so it lists the open review's rows again. */
    async resume(editorId: string): Promise<void> {
        if (this.reviewOf(editorId)?.unchecked) await this.askForRows();
    }

    /** The review is over for this editor: applied, discarded or closed. */
    end(editorId: string): void {
        if (!this.reviewOf(editorId)) return;
        this.review = undefined;
        this.reviewPanel?.close();
    }

    private reviewOf(editorId: string): HostReview | undefined {
        return this.review?.editorId === editorId ? this.review : undefined;
    }

    private async askForRows(): Promise<void> {
        const unchecked = this.review?.unchecked;
        await this.postToReview(new ElementIdProposalsQuery(unchecked ? [...unchecked] : null));
    }

    /** A hidden editor's page cannot answer until it is shown, so the panel says so. */
    private async postToReview(message: Command | Query): Promise<void> {
        const review = this.review;
        if (!review) return;
        const outcome = await this.editorStore.postUnlessHidden(review.editorId, message);
        if (outcome === "hidden" && review.unchecked && this.review === review) {
            this.reviewPanel?.show(
                hiddenEditorReviewView(
                    elementIdReviewView(review.title, review.rows, review.unchecked),
                ),
            );
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
