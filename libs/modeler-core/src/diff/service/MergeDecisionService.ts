import {
    acceptHandMerge,
    type HandMergeOutcome,
    type MergeDecisions,
    mergeElementNames,
    mergePaneSteps,
    mergePaneView,
    type PickOutcome,
} from "@miragon/bpmn-modeler-merge";
import {
    ApplyMergeStatesQuery,
    type MergeHostOffers,
    NO_MERGE_HOST_OFFERS,
    type MergePaneAction,
    type MergePaneStepList,
    type MergePaneStepping,
    type MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { mergeSideOfPane } from "../domain/mergePaneSide";
import { restoreOfferOnPane } from "../domain/pickFeedback";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { ArmedDiff } from "./DiffPaneRelay";
import { DiffSession } from "./DiffSession";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";
import {
    handMergeFeedback,
    idsNamedInWords,
    type MergePickFeedback,
    mergePickFeedback,
} from "./mergePickFeedback";

/**
 * Shows each merge view's decisions on its two panes and takes the user's
 * picks: the markers of the elements a pane draws, what it lists for want of
 * a shape, the user's picks and their consequences, the last outcome and the
 * stepper's lists. Every post carries the full state, never a change, so a
 * pane that reloaded rebuilds from it. The picks and the versions merged by
 * hand live in the merge view's decisions and end with it.
 */
export class MergeDecisionService {
    // Per tab, since each tab's two panes step together and apart from another tab's.
    private readonly stepping = new WeakMap<DiffSession, MergePaneStepping>();

    private readonly feedback = new WeakMap<MergeSession, MergePickFeedback>();

    private readonly decidedListeners = new Set<(session: MergeSession) => void>();

    /** @param offers What the host offers the panes besides their decisions, asked on every post. */
    constructor(
        private readonly sessions: Pick<MergeSessionStore, "ofDiffSession" | "diffSessionsOf">,
        private readonly logger: LoggerPort,
        private readonly offers: () => Promise<MergeHostOffers> = async () => NO_MERGE_HOST_OFFERS,
    ) {}

    /** Whether the diff session is a tab of a live merge view. */
    shows(diffSession: DiffSession): boolean {
        return this.sessions.ofDiffSession(diffSession) !== undefined;
    }

    /**
     * Keeps the element from the pick's side, or the pane's when it names
     * none, as far as `scope` reaches, and sends every pane of the view its
     * states. A pick that would move a version merged by hand off its side
     * drops it only when the request says so.
     */
    async pick(
        armed: ArmedDiff,
        pane: DiffPaneHandle,
        { elementId, scope, side: namedSide, dropsHandMerges }: MergePickRequest,
    ): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        const paneSide = armed.session.sideFor(pane.uri);
        if (!session || !paneSide) return;
        const side = namedSide ?? mergeSideOfPane(paneSide);
        await this.decide(session, elementId, (decisions) => ({
            action: decisions.holds(elementId, side) ? "pick" : "leaveOut",
            outcome: decisions.pickScoped(elementId, side, scope, {
                dropHandMerges: dropsHandMerges === true,
            }),
            keptSide: side,
        }));
    }

    /** Takes the user's pick back, as far as `scope` reaches, and sends every pane of the view its states; a stale Undo of no pick changes nothing. */
    async unpick(
        armed: ArmedDiff,
        { elementId, scope, dropsHandMerges }: MergeUnpickRequest,
    ): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        if (!session) return;
        await this.decide(session, elementId, (decisions) =>
            decisions.originOf(elementId) === "picked"
                ? {
                      action: "unpick",
                      outcome: decisions.unpickScoped(elementId, scope, {
                          dropHandMerges: dropsHandMerges === true,
                      }),
                  }
                : undefined,
        );
    }

    /**
     * Takes `text`, merged by hand for the element picked on `side`, as its
     * version, or refuses it and changes nothing; every pane of the view shows
     * the answer.
     */
    async mergeByHand(
        session: MergeSession,
        hand: { readonly elementId: string; readonly side: MergeSide; readonly text: string },
    ): Promise<HandMergeOutcome> {
        const outcome = await acceptHandMerge(
            session.sources,
            session.decisions,
            hand.elementId,
            hand.side,
            hand.text,
        );
        this.feedback.set(
            session,
            handMergeFeedback(hand.elementId, outcome, this.feedback.get(session)),
        );
        await this.broadcastSession(session);
        return outcome;
    }

    /** Shows every pane of the view that the user closed the element's merge editor without saving. */
    async discardHandMerge(session: MergeSession, elementId: string): Promise<void> {
        this.feedback.set(
            session,
            handMergeFeedback(elementId, "discarded", this.feedback.get(session)),
        );
        await this.broadcastSession(session);
    }

    /** Calls `listener` with each merge view whose picks a pick or an undo changed. */
    onDecided(listener: (session: MergeSession) => void): EditorSubscription {
        this.decidedListeners.add(listener);
        return { dispose: () => this.decidedListeners.delete(listener) };
    }

    /** Sends both panes of a merge view's tab the full state of its decisions. */
    async broadcast(armed: ArmedDiff): Promise<void> {
        const session = this.sessions.ofDiffSession(armed.session);
        if (!session) return;
        const offers = await this.offers();
        const stepping = this.steppingOf(armed.session);
        const feedback = this.feedback.get(session);
        await this.post(armed.before, statesFor(session, "before", stepping, feedback, offers));
        await this.post(armed.after, statesFor(session, "after", stepping, feedback, offers));
    }

    /** Keeps the list a pane of the tab chose and sends both panes their states again. */
    async chooseStepList(armed: ArmedDiff, list: MergePaneStepList): Promise<void> {
        this.stepping.set(armed.session, { ...this.steppingOf(armed.session), list });
        await this.broadcast(armed);
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
        if (decided.outcome.applied) {
            for (const listener of this.decidedListeners) listener(session);
        }
        await this.broadcastSession(session);
    }

    /** Sends the panes of every tab of the merge view the full state of its decisions. */
    async broadcastSession(session: MergeSession): Promise<void> {
        for (const tab of this.sessions.diffSessionsOf(session)) {
            const panes = tab.armedPanes();
            if (panes) await this.broadcast({ session: tab, ...panes });
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

/** A pane's pick: the element, how far it reaches, and the side to keep it from; absent means the pane's. */
export interface MergePickRequest {
    readonly elementId: string;
    readonly scope: MergePickScope;
    readonly side?: MergeSide;
    /** The user agreed to drop the versions merged by hand the pick moves off their side. */
    readonly dropsHandMerges?: boolean;
}

/** A pane's undo: the element and how far it reaches. */
export interface MergeUnpickRequest {
    readonly elementId: string;
    readonly scope: MergePickScope;
    /** As {@link MergePickRequest.dropsHandMerges}. */
    readonly dropsHandMerges?: boolean;
}

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
    offers: MergeHostOffers,
): ApplyMergeStatesQuery {
    const side = mergeSideOfPane(paneSide);
    const view = mergePaneView(session.decisions, side, session.sources);
    const steps = mergePaneSteps(session.decisions, session.navigationOrder, side);
    const restoreOffer = restoreOfferOnPane(feedback?.offer, side, view.shapelessRows);
    return new ApplyMergeStatesQuery(
        paneSide,
        {
            caption: session.captions[side],
            marks: view.marks,
            shapelessRows: view.shapelessRows,
            counts: view.counts,
            openConflictSteps: steps.openConflicts,
            allSteps: steps.all,
            openConflicts: session.decisions.openConflicts.length,
            stepping,
            badges: view.badges,
            consequences: view.consequences,
            pickable: view.pickable,
            ...(feedback === undefined ? {} : { lastOutcome: feedback.outcome }),
            ...(restoreOffer === undefined ? {} : { restoreOffer }),
            names: mergeElementNames(
                session.sources,
                session.decisions,
                idsNamedInWords(view.shapelessRows, feedback?.outcome),
            ),
            build: {
                canBuild: session.decisions.canBuild,
                openConflicts: session.decisions.openConflicts.length,
                built: session.lastBuild !== undefined,
                notes: session.lastBuild?.notes ?? [],
            },
        },
        offers,
    );
}
