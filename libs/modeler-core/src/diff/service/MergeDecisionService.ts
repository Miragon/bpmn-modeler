import { mergePaneSteps, mergePaneView } from "@miragon/bpmn-modeler-merge";
import {
    ApplyMergeStatesQuery,
    type MergePaneStepList,
    type MergePaneStepping,
} from "@miragon/bpmn-modeler-shared";
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
    // Per tab, since each tab's two panes step together and apart from another tab's.
    private readonly stepping = new WeakMap<DiffSession, MergePaneStepping>();

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
        const stepping = this.steppingOf(armed.session);
        await this.post(armed.before, statesFor(session, "before", stepping, elementXmlChanges));
        await this.post(armed.after, statesFor(session, "after", stepping, elementXmlChanges));
    }

    /** Keeps the list a pane of the tab chose and sends both panes their states again. */
    async chooseStepList(
        armed: ArmedDiff,
        list: MergePaneStepList,
        elementXmlChanges: boolean,
    ): Promise<void> {
        this.stepping.set(armed.session, { ...this.steppingOf(armed.session), list });
        await this.broadcast(armed, elementXmlChanges);
    }

    /** Keeps the step a pane of the tab moved to, by its index in every step, or none after Show all. */
    noteCursor(diffSession: DiffSession, index: number): void {
        const session = this.sessions.ofDiffSession(diffSession);
        if (!session) return;
        const { list } = this.steppingOf(diffSession);
        const cursor = mergePaneSteps(session.decisions, session.navigationOrder, "current").all[
            index
        ]?.id;
        this.stepping.set(diffSession, cursor === undefined ? { list } : { list, cursor });
    }

    private steppingOf(diffSession: DiffSession): MergePaneStepping {
        return this.stepping.get(diffSession) ?? FIRST_STEPPING;
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

const FIRST_STEPPING: MergePaneStepping = { list: "openConflicts" };

function statesFor(
    session: MergeSession,
    paneSide: DiffSide,
    stepping: MergePaneStepping,
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
            stepping,
        },
        elementXmlChanges,
    );
}
