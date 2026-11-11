import { ElementIdReviewCommand, GenerateElementIdsQuery } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { elementIdReviewNotice } from "../domain/elementIdTexts";

/** Generate IDs from Names for every host: the VS Code command and the IntelliJ action each make one call. */
export class ElementIdsService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
    ) {}

    /** The webview answers with an {@link ElementIdReviewCommand}; see {@link reportReview}. */
    async generate(editorId: string): Promise<void> {
        await this.editorStore.postMessage(editorId, new GenerateElementIdsQuery());
    }

    reportReview(message: ElementIdReviewCommand): void {
        const notice = elementIdReviewNotice(message.status);
        if (notice) this.notifier.showInfo(notice);
    }
}
