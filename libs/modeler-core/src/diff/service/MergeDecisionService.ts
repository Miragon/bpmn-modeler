import { mergePaneSteps, mergePaneView } from "@miragon/bpmn-modeler-merge";
import { ApplyMergeStatesQuery } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { LoggerPort } from "../../kernel/port/hostPorts";
import { mergeSideOfPane } from "../domain/mergePaneSide";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { ArmedDiff } from "./DiffPaneRelay";
import { DiffSession } from "./DiffSession";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

/**
 * Shows each merge view's decisions on its two panes: the markers of the
 * elements a pane draws, what it lists for want of a shape, and the
 * stepper's lists. Every post carries the full state, never a change, so a
 * pane that reloaded rebuilds from it.
 */
export class MergeDecisionService {
    constructor(
        private readonly sessions: Pick<MergeSessionStore, "ofDiffSession">,
        private readonly logger: LoggerPort,
    ) {}

    /** Whether the diff session is a tab of a live merge view. */
    shows(diffSession: DiffSession): boolean {
        return this.sessions.ofDiffSession(diffSession) !== undefined;
    }

    /** Sends both panes of a merge view's tab the full state of its decisions. */
    async broadcast(armed: ArmedDiff, elementXmlChanges: boolean): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        if (!session) return;
        await this.post(armed.before, statesFor(session, "before", elementXmlChanges));
        await this.post(armed.after, statesFor(session, "after", elementXmlChanges));
    }

    // A pane that is hidden or gone drops the post; it gets everything again on its next ready.
    private async post(pane: DiffPaneHandle, query: ApplyMergeStatesQuery): Promise<void> {
        try {
            await pane.postMessage(query);
        } catch (error) {
            this.logger.logInfo(`ApplyMergeStates dropped: ${(error as Error).message}`);
        }
    }
}

function statesFor(
    session: MergeSession,
    paneSide: DiffSide,
    elementXmlChanges: boolean,
): ApplyMergeStatesQuery {
    const side = mergeSideOfPane(paneSide);
    const { marks, shapeless, counts } = mergePaneView(session.decisions, side);
    const steps = mergePaneSteps(session.decisions, session.navigationOrder, side);
    return new ApplyMergeStatesQuery(
        paneSide,
        {
            caption: session.captions[side],
            marks,
            shapeless,
            counts,
            openConflictSteps: steps.openConflicts,
            allSteps: steps.all,
            openConflicts: session.decisions.openConflicts.length,
        },
        elementXmlChanges,
    );
}
