import { describe, expect, it } from "vitest";

import type { AddOnCatalogPayload, AddOnRevealPayload } from "@miragon/bpmn-modeler-shared";

import {
    ACME,
    CATALOG,
    CONFIG_SOURCE,
    MAIL,
    MARKETPLACE_SOURCE,
    PALETTE,
    RESIZE,
    without,
    withRevision,
} from "../__fixtures__/catalogs";
import { reviewKeyOf } from "./outline";
import {
    CATALOG_TARGET,
    initialViewState,
    isBusy,
    nextViewState,
    persistedChoicesOf,
    Transition,
    ViewEvent,
    ViewState,
} from "./viewState";

function after(events: ViewEvent[], state: ViewState = initialViewState()): Transition {
    return events.reduce<Transition>((last, event) => nextViewState(last.state, event), { state });
}

const shown = (model: AddOnCatalogPayload = CATALOG): ViewEvent => ({
    kind: "modelArrived",
    model,
});
const reveal = (revealId: number, addOnIds: string[]): ViewEvent => ({
    kind: "revealArrived",
    reveal: { revealId, addOnIds } satisfies AddOnRevealPayload,
});

describe("nextViewState", () => {
    describe("models", () => {
        it.each([
            { case: "a newer revision", revision: 11, taken: 11 },
            {
                case: "the same revision, as a failed re-read sends one with a problem",
                revision: 10,
                taken: 10,
            },
            { case: "not an older revision", revision: 9, taken: 10 },
        ])("takes $case", ({ revision, taken }) => {
            const { state } = after([shown(), shown({ ...withRevision(revision), problem: "p" })]);

            expect(state.model?.revision).toBe(taken);
        });

        it("makes the first head active when none is", () => {
            expect(after([shown()]).state.activeHead).toBe("folder:/work");
        });

        it("moves the active head to a neighbour when a push removes it", () => {
            const { state } = after([
                shown(),
                { kind: "headActivated", headId: PALETTE.id },
                shown(without(PALETTE.id)),
            ]);

            expect(state.activeHead).toBe(RESIZE.id);
        });

        it("drops choices about heads the model no longer has", () => {
            const { state } = after([
                shown(),
                { kind: "toggled", key: CONFIG_SOURCE.id },
                { kind: "toggled", key: reviewKeyOf(RESIZE.id) },
                shown({ ...without(RESIZE.id), revision: 11 }),
            ]);

            expect([...state.expansion]).toEqual([[CONFIG_SOURCE.id, false]]);
        });
    });

    describe("actions", () => {
        it("asks for an allow with the revision on screen, and marks its row busy", () => {
            const { state, send } = after([
                shown(),
                { kind: "actionChosen", actionKind: "allow", targetId: RESIZE.id },
            ]);

            expect(send).toEqual({
                requestId: 1,
                request: { kind: "allow", addOnId: RESIZE.id, revision: 10 },
            });
            expect([
                isBusy(state, RESIZE.id),
                isBusy(state, PALETTE.id),
                state.nextRequestId,
            ]).toEqual([true, false, 2]);
        });

        it("asks nothing for a row that has a request in flight", () => {
            const { send } = after([
                shown(),
                { kind: "actionChosen", actionKind: "allow", targetId: RESIZE.id },
                { kind: "actionChosen", actionKind: "allow", targetId: RESIZE.id },
            ]);

            expect(send).toBeUndefined();
        });

        it.each<{ case: string; event: ViewEvent }>([
            {
                case: "an id the model does not hold",
                event: { kind: "actionChosen", actionKind: "revoke", targetId: "plugin:/x" },
            },
            {
                case: "an action the row does not offer",
                event: { kind: "actionChosen", actionKind: "revoke", targetId: RESIZE.id },
            },
            {
                case: "an Allow on a row without a review",
                event: { kind: "actionChosen", actionKind: "allow", targetId: PALETTE.id },
            },
            {
                case: "an action kind no table names",
                event: { kind: "actionChosen", actionKind: "deleteEverything" },
            },
        ])("asks nothing for $case", ({ event }) => {
            expect(after([shown(), event]).send).toBeUndefined();
        });

        it("asks nothing before the first model", () => {
            expect(
                after([{ kind: "actionChosen", actionKind: "pruneCache" }]).send,
            ).toBeUndefined();
        });

        it.each<{ case: string; event: ViewEvent; request: object }>([
            {
                case: "a source's action",
                event: {
                    kind: "actionChosen",
                    actionKind: "disableTemplates",
                    targetId: MARKETPLACE_SOURCE.id,
                },
                request: { kind: "disableTemplates", sourceId: MARKETPLACE_SOURCE.id },
            },
            {
                case: "a catalog action",
                event: { kind: "actionChosen", actionKind: "pruneCache" },
                request: { kind: "pruneCache" },
            },
        ])("asks for $case", ({ event, request }) => {
            expect(after([shown(), event]).send?.request).toEqual(request);
        });

        it("clears the banner when the user acts again", () => {
            const { state } = after([
                shown(),
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "failed", message: "No." } },
                { kind: "actionChosen", actionKind: "pruneCache" },
            ]);

            expect([state.banner, isBusy(state, CATALOG_TARGET)]).toEqual([undefined, true]);
        });
    });

    describe("results", () => {
        it("frees its row, shows the core's message and returns focus to the row", () => {
            const { state, focus } = after([
                shown(),
                { kind: "actionChosen", actionKind: "allow", targetId: RESIZE.id },
                {
                    kind: "resultArrived",
                    requestId: 1,
                    result: { kind: "done", message: "Allowed Resize Tasks." },
                },
            ]);

            expect([isBusy(state, RESIZE.id), state.banner, focus]).toEqual([
                false,
                { tone: "status", text: "Allowed Resize Tasks." },
                { kind: "head", headId: RESIZE.id },
            ]);
        });

        it("ignores a result for a request it did not make, as one from before a reload", () => {
            const { state, focus } = after([
                shown(),
                { kind: "resultArrived", requestId: 7, result: { kind: "failed", message: "x" } },
            ]);

            expect([state.banner, focus]).toEqual([undefined, undefined]);
        });

        it("shows a refusal as an alert and moves no focus", () => {
            const { state, focus } = after([
                shown(),
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                {
                    kind: "resultArrived",
                    requestId: 1,
                    result: { kind: "refused", reason: "staleView", message: "Stale." },
                },
            ]);

            expect([state.banner, focus]).toEqual([{ tone: "alert", text: "Stale." }, undefined]);
        });

        it("focuses the review a read offers once a model holds it", () => {
            const read = after([
                shown(),
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                {
                    kind: "resultArrived",
                    requestId: 1,
                    result: { kind: "done", message: "Read it." },
                },
            ]);
            const withReview = withRevision(11, {
                ...CATALOG,
                groups: [
                    {
                        ...CATALOG.groups[0],
                        sources: [
                            CONFIG_SOURCE,
                            {
                                ...CATALOG.groups[0].sources[1],
                                addOns: [{ ...ACME, review: RESIZE.review }],
                            },
                        ],
                    },
                    CATALOG.groups[1],
                ],
            });

            const { focus } = nextViewState(read.state, shown(withReview));

            expect([read.focus, focus]).toEqual([undefined, { kind: "review", addOnId: ACME.id }]);
        });

        it("focuses the row when the model after a read offers no review", () => {
            const read = after([
                shown(),
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            expect(nextViewState(read.state, shown(withRevision(11))).focus).toEqual({
                kind: "head",
                headId: ACME.id,
            });
        });

        it("focuses a neighbour when the model after a read no longer lists the row", () => {
            const read = after([
                shown(),
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            expect(nextViewState(read.state, shown(without(ACME.id))).focus).toEqual({
                kind: "head",
                headId: "packages:/work/node_modules",
            });
        });

        it("keeps a switch's place in its row", () => {
            const { focus } = after([
                shown(),
                {
                    kind: "actionChosen",
                    actionKind: "disableTemplates",
                    targetId: MARKETPLACE_SOURCE.id,
                },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            expect(focus).toEqual({ kind: "action", targetId: MARKETPLACE_SOURCE.id, slot: 1 });
        });
    });

    describe("reveals", () => {
        it("opens the row's ancestors, makes it active and focuses it once a model holds it", () => {
            const { state, focus } = after([reveal(3, [MAIL.id]), shown()]);

            expect([
                state.expansion.get(MARKETPLACE_SOURCE.id),
                state.activeHead,
                state.lastRevealId,
                focus,
            ]).toEqual([true, MAIL.id, 3, { kind: "head", headId: MAIL.id, reveal: true }]);
        });

        it("lands on the first revealed row in model order", () => {
            expect(after([shown(), reveal(1, [RESIZE.id, PALETTE.id])]).state.activeHead).toBe(
                PALETTE.id,
            );
        });

        it("waits for a model that holds one of its rows", () => {
            const waiting = after([shown(without(RESIZE.id)), reveal(1, [RESIZE.id])]);
            const { state } = nextViewState(waiting.state, shown(withRevision(11)));

            expect([waiting.state.activeHead, state.activeHead]).toEqual([
                "folder:/work",
                RESIZE.id,
            ]);
        });

        it("ignores a reveal it applied before, as the panel posts it again when the page reloads", () => {
            const { state, focus } = after(
                [shown(), reveal(2, [MAIL.id])],
                initialViewState({ lastRevealId: 2 }),
            );

            expect([state.activeHead, focus]).toEqual(["folder:/work", undefined]);
        });
    });

    describe("the outline", () => {
        it("closes an open header and opens it again", () => {
            const closed = after([shown(), { kind: "toggled", key: CONFIG_SOURCE.id }]);
            const opened = nextViewState(closed.state, { kind: "toggled", key: CONFIG_SOURCE.id });

            expect([
                closed.state.expansion.get(CONFIG_SOURCE.id),
                opened.state.expansion.get(CONFIG_SOURCE.id),
            ]).toEqual([false, true]);
        });

        it("moves the active head and focus to a header that hides it", () => {
            const { state, focus } = after([
                shown(),
                { kind: "headActivated", headId: RESIZE.id },
                { kind: "toggled", key: CONFIG_SOURCE.id },
            ]);

            expect([state.activeHead, focus]).toEqual([
                CONFIG_SOURCE.id,
                { kind: "head", headId: CONFIG_SOURCE.id },
            ]);
        });

        it("closes a row's review and keeps its row active", () => {
            const { state, focus } = after([
                shown(),
                { kind: "headActivated", headId: RESIZE.id },
                { kind: "toggled", key: reviewKeyOf(RESIZE.id) },
            ]);

            expect([state.expansion.get(reviewKeyOf(RESIZE.id)), state.activeHead, focus]).toEqual([
                false,
                RESIZE.id,
                undefined,
            ]);
        });

        it("ignores a head the model does not show", () => {
            expect(
                after([shown(), { kind: "headActivated", headId: MAIL.id }]).state.activeHead,
            ).toBe("folder:/work");
        });

        it("dismisses the banner", () => {
            const { state } = after([
                shown(),
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                {
                    kind: "resultArrived",
                    requestId: 1,
                    result: { kind: "done", message: "Revoked." },
                },
                { kind: "bannerDismissed" },
            ]);

            expect(state.banner).toBeUndefined();
        });
    });

    it("keeps only the user's choices across a reload of the page", () => {
        const { state } = after([
            shown(),
            reveal(4, [MAIL.id]),
            { kind: "actionChosen", actionKind: "pruneCache" },
            { kind: "toggled", key: CONFIG_SOURCE.id },
        ]);
        const restored = initialViewState(persistedChoicesOf(state));

        expect(persistedChoicesOf(state)).toEqual({
            expansion: [
                ["marketplaces", true],
                [MARKETPLACE_SOURCE.id, true],
                [CONFIG_SOURCE.id, false],
            ],
            activeHead: MAIL.id,
            lastRevealId: 4,
        });
        expect([restored.pending.size, restored.banner, restored.activeHead]).toEqual([
            0,
            undefined,
            MAIL.id,
        ]);
    });
});
