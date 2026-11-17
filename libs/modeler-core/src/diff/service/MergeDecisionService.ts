import {
    type MergeDecisions,
    mergeElementNames,
    mergePaneSteps,
    mergePaneView,
    type PickOutcome,
} from "@miragon/bpmn-modeler-merge";
import {
    ApplyMergeStatesQuery,
    type MergePaneAction,
    type MergePaneStepList,
    type MergePaneStepping,
    type MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import { LoggerPort } from "../../kernel/port/hostPorts";
import { mergeSideOfPane } from "../domain/mergePaneSide";
import { restoreOfferOnPane } from "../domain/pickFeedback";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { ArmedDiff } from "./DiffPaneRelay";
import { DiffSession } from "./DiffSession";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";
import { idsTheLegendNames, type MergePickFeedback, mergePickFeedback } from "./mergePickFeedback";

/**
 * Shows each merge view's decisions on its two panes and takes the user's
 * picks: the markers of the elements a pane draws, what it lists for want of
 * a shape, the user's picks and their consequences, the last outcome and the
 * stepper's lists. Every post carries the full state, never a change, so a
 * pane that reloaded rebuilds from it. The picks live in the merge view's
 * decisions and end with it.
 */
export class MergeDecisionService {
    // Per tab, since each tab's two panes step together and apart from another tab's.
    private readonly stepping = new WeakMap<DiffSession, MergePaneStepping>();

    private readonly feedback = new WeakMap<MergeSession, MergePickFeedback>();

    constructor(
        private readonly sessions: Pick<MergeSessionStore, "ofDiffSession" | "diffSessionsOf">,
        private readonly logger: LoggerPort,
    ) {}

    /** Whether the diff session is a tab of a live merge view. */
    shows(diffSession: DiffSession): boolean {
        return this.sessions.ofDiffSession(diffSession) !== undefined;
    }

    /** Keeps the element from the pane's side, as far as `scope` reaches, and sends every pane of the view its states. */
    async pick(
        armed: ArmedDiff,
        pane: DiffPaneHandle,
        elementId: string,
        scope: MergePickScope,
        elementXmlChanges: boolean,
    ): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        const paneSide = armed.session.sideFor(pane.uri);
        if (!session || !paneSide) return;
        const side = mergeSideOfPane(paneSide);
        await this.decide(session, elementId, elementXmlChanges, (decisions) => ({
            action: decisions.holds(elementId, side) ? "pick" : "leaveOut",
            outcome: decisions.pickScoped(elementId, side, scope),
            keptSide: side,
        }));
    }

    /** Takes the user's pick back, as far as `scope` reaches, and sends every pane of the view its states; a stale Undo of no pick changes nothing. */
    async unpick(
        armed: ArmedDiff,
        elementId: string,
        scope: MergePickScope,
        elementXmlChanges: boolean,
    ): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        if (!session) return;
        await this.decide(session, elementId, elementXmlChanges, (decisions) =>
            decisions.originOf(elementId) === "picked"
                ? { action: "unpick", outcome: decisions.unpickScoped(elementId, scope) }
                : undefined,
        );
    }

    /** Sends both panes of a merge view's tab the full state of its decisions. */
    async broadcast(armed: ArmedDiff, elementXmlChanges: boolean): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        if (!session) return;
        const stepping = this.steppingOf(armed.session);
        const feedback = this.feedback.get(session);
        await this.post(
            armed.before,
            statesFor(session, "before", stepping, feedback, elementXmlChanges),
        );
        await this.post(
            armed.after,
            statesFor(session, "after", stepping, feedback, elementXmlChanges),
        );
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

    private async decide(
        session: MergeSession,
        elementId: string,
        elementXmlChanges: boolean,
        decide: (decisions: MergeDecisions) => DecidedPick | undefined,
    ): Promise<void> {
        const openBefore = openIds(session.decisions);
        let decided: ReturnType<typeof decide>;
        try {
            decided = decide(session.decisions);
        } catch (error) {
            this.logger.logError(error as Error);
            return;
        }
        if (decided === undefined) return;
        this.feedback.set(
            session,
            mergePickFeedback({
                ...decided,
                elementId,
                openBefore,
                openAfter: openIds(session.decisions),
            }),
        );
        await this.broadcastSession(session, elementXmlChanges);
    }

    /** Sends the panes of every tab of the merge view the full state of its decisions. */
    async broadcastSession(session: MergeSession, elementXmlChanges: boolean): Promise<void> {
        for (const tab of this.sessions.diffSessionsOf(session)) {
            const panes = tab.armedPanes();
            if (panes) await this.broadcast({ session: tab, ...panes }, elementXmlChanges);
        }
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

interface DecidedPick {
    readonly action: MergePaneAction;
    readonly outcome: PickOutcome;
    readonly keptSide?: MergeSide;
}

function openIds(decisions: MergeDecisions): string[] {
    return decisions.openConflicts.map(({ id }) => id);
}

function statesFor(
    session: MergeSession,
    paneSide: DiffSide,
    stepping: MergePaneStepping,
    feedback: MergePickFeedback | undefined,
    elementXmlChanges: boolean,
): ApplyMergeStatesQuery {
    const side = mergeSideOfPane(paneSide);
    const view = mergePaneView(session.decisions, side);
    const steps = mergePaneSteps(session.decisions, session.navigationOrder, side);
    const restoreOffer = restoreOfferOnPane(feedback?.offer, side);
    return new ApplyMergeStatesQuery(
        paneSide,
        {
            caption: session.captions[side],
            marks: view.marks,
            shapeless: view.shapeless,
            counts: view.counts,
            openConflictSteps: steps.openConflicts,
            allSteps: steps.all,
            openConflicts: session.decisions.openConflicts.length,
            stepping,
            badges: view.badges,
            picksNotDrawn: view.picksNotDrawn,
            consequences: view.consequences,
            pickable: view.pickable,
            ...(feedback === undefined ? {} : { lastOutcome: feedback.outcome }),
            ...(restoreOffer === undefined ? {} : { restoreOffer }),
            names: mergeElementNames(
                session.sources,
                session.decisions,
                idsTheLegendNames(view.picksNotDrawn, feedback?.outcome),
            ),
            build: {
                canBuild: session.decisions.canBuild,
                openConflicts: session.decisions.openConflicts.length,
                built: session.lastBuild !== undefined,
                notes: session.lastBuild?.notes ?? [],
            },
        },
        elementXmlChanges,
    );
}
