import { handMergeableSide, handMergeStartOf } from "@miragon/bpmn-modeler-merge";

import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { LoggerPort } from "../../kernel/port/hostPorts";
import {
    elementXmlMergeNotOpened,
    ElementXmlMerges,
    NO_ELEMENT_XML_MERGE_EDITOR,
} from "../domain/elementXmlMerge";
import { ElementXmlMergeEditor } from "../port/ElementXmlMergeEditor";
import { MergeEditorAvailability } from "../port/MergeEditorAvailability";
import { DiffSession } from "./DiffSession";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

type ElementXmlMergeFinishListener = (elementId: string, written: string | undefined) => void;

/**
 * Opens an element's XML in the host's merge editor, on the version the
 * user's pick keeps or with a pick of its own, and takes what the user saved
 * there as the element's version. Each merge view has its own editors, which
 * close with it.
 */
export class ElementXmlMergeService {
    private readonly mergesBySession = new Map<MergeSession, ElementXmlMerges>();

    private sessionCount = 0;

    private readonly finishedListeners = new Set<ElementXmlMergeFinishListener>();

    constructor(
        private readonly sessions: Pick<MergeSessionStore, "ofDiffSession" | "onSessionEnded">,
        private readonly decisions: Pick<
            MergeDecisionService,
            "mergeByHand" | "discardHandMerge" | "onDecided"
        >,
        private readonly editor: ElementXmlMergeEditor,
        private readonly availability: MergeEditorAvailability,
        private readonly logger: LoggerPort,
    ) {
        sessions.onSessionEnded((session) => void this.sessionEnded(session));
        decisions.onDecided((session) => this.mergesBySession.get(session)?.forgetRefusals());
    }

    /**
     * Opens the editor on an element whose pick a hand merge may replace, or
     * brings its open one to the front. `resume` starts from the text the
     * merge refused last.
     */
    async open(diffSession: DiffSession, elementId: string, resume = false): Promise<void> {
        const session = this.sessions.ofDiffSession(diffSession);
        if (!session || !(await this.hostOpens(elementId))) return;
        await this.openPicked(session, elementId, { resume });
    }

    /**
     * Merge XML on an element no pick decides yet: opens the editor once
     * `pick` kept the element from a side. Nothing is picked where the host
     * has no merge editor or the element's XML cannot be merged by hand, and
     * closing that editor without a save takes the pick back.
     */
    async openWithPick(
        diffSession: DiffSession,
        elementId: string,
        pick: () => Promise<boolean>,
    ): Promise<void> {
        const session = this.sessions.ofDiffSession(diffSession);
        if (!session || !(await this.hostOpens(elementId))) return;
        const { decisions, sources } = session;
        if (handMergeStartOf(decisions, sources.handMergeTexts, elementId) !== "withPick") {
            this.notOpened(elementId, "a pick decides it already, or its base equals a side");
            return;
        }
        if (await pick()) await this.openPicked(session, elementId, { startedByPick: true });
    }

    private async hostOpens(elementId: string): Promise<boolean> {
        const opens = await this.availability.ready;
        if (!opens) this.notOpened(elementId, NO_ELEMENT_XML_MERGE_EDITOR);
        return opens;
    }

    private async openPicked(
        session: MergeSession,
        elementId: string,
        { resume = false, startedByPick = false },
    ): Promise<void> {
        const { decisions, sources } = session;
        const side = handMergeableSide(decisions, sources.handMergeTexts, elementId);
        const texts = sources.handMergeTexts.get(elementId);
        if (side === undefined || texts === undefined) {
            this.notOpened(elementId, "it is not picked, or its base equals a side");
            return;
        }
        const opening = this.mergesOf(session).open({
            elementId,
            side,
            texts,
            captions: session.captions,
            resume,
            handMergedText: decisions.handMergeOf(elementId)?.shownText,
            startedByPick,
        });
        try {
            if (opening.kind === "focus") await this.editor.focus(opening.key);
            else await this.editor.open(opening.request);
        } catch (error) {
            this.logger.logError(error as Error);
        }
    }

    /** Takes what the user saved in the editor `key`, or shows that they saved nothing. */
    async finish(key: string, written: string | undefined): Promise<void> {
        for (const [session, merges] of this.mergesBySession) {
            const finish = merges.finish(key, written);
            if (finish === undefined) continue;
            if (finish.kind === "discarded") {
                await this.decisions.discardHandMerge(
                    session,
                    finish.elementId,
                    finish.takesBackPick ? finish.side : undefined,
                );
            } else {
                merges.answered(finish, await this.decisions.mergeByHand(session, finish));
            }
            this.tellFinished(finish.elementId, written);
            return;
        }
    }

    /**
     * Calls `listener` with the element and the text of each finished merge,
     * once the panes show the answer; a merge whose view ended has no text.
     */
    onFinished(listener: ElementXmlMergeFinishListener): EditorSubscription {
        this.finishedListeners.add(listener);
        return { dispose: () => this.finishedListeners.delete(listener) };
    }

    private notOpened(elementId: string, reason: string): void {
        this.logger.logInfo(elementXmlMergeNotOpened(elementId, reason));
    }

    private mergesOf(session: MergeSession): ElementXmlMerges {
        let merges = this.mergesBySession.get(session);
        if (!merges) {
            this.sessionCount += 1;
            merges = new ElementXmlMerges(`element-xml-merge-${this.sessionCount}`);
            this.mergesBySession.set(session, merges);
        }
        return merges;
    }

    // Forgotten before the editors close, so their finishes answer no ended merge view.
    private async sessionEnded(session: MergeSession): Promise<void> {
        const merges = this.mergesBySession.get(session);
        if (!merges) return;
        this.mergesBySession.delete(session);
        for (const key of merges.openKeys) {
            const finish = merges.finish(key);
            try {
                await this.editor.close(key);
            } catch (error) {
                this.logger.logError(error as Error);
            }
            if (finish) this.tellFinished(finish.elementId, undefined);
        }
    }

    private tellFinished(elementId: string, written: string | undefined): void {
        for (const listener of this.finishedListeners) listener(elementId, written);
    }
}
