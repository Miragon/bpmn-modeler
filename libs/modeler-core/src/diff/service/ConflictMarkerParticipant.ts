import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../editorSession/domain/EditorSessionParticipant";
import { EditorSessionDocuments } from "../../editorSession/service/EditorSessionDocuments";
import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { ActionNotifierPort } from "../../kernel/port/hostPorts";
import { shouldOfferMergeView } from "../domain/conflictMarkerOffer";
import { conflictMarkerNotice } from "../domain/mergeViewTexts";
import { MergeViewOpener } from "./MergeViewOpener";

/**
 * Offers the merge view when a BPMN editor opens a file Git left its conflict
 * markers in, which the modeler cannot show: once per editor, and again only
 * after the markers left the document and came back.
 */
export class ConflictMarkerParticipant implements EditorSessionParticipant {
    constructor(
        private readonly documents: EditorSessionDocuments,
        private readonly actionNotifier: ActionNotifierPort,
        private readonly opener: Pick<MergeViewOpener, "open">,
    ) {}

    onResolve(session: EditorSessionContext): void {
        let hadMarkers: boolean | undefined;
        const read = () => {
            const hasMarkers = new BpmnDocument(
                this.documents.getContent(session.editorId),
            ).hasMergeConflictMarkers();
            if (shouldOfferMergeView(hadMarkers, hasMarkers)) void this.offer(session.editorId);
            hadMarkers = hasMarkers;
        };
        read();
        session.onDocumentChange((event) => {
            if (event.hasContentChanges() && event.documentUriString() === session.editorId) read();
        });
    }

    private async offer(fileUri: string): Promise<void> {
        const choice = await this.actionNotifier.offer(
            conflictMarkerNotice(uriDisplayName(fileUri)),
        );
        if (choice === "openMergeView") await this.opener.open(fileUri);
    }
}
