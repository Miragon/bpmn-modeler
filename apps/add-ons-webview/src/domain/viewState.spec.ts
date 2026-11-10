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
import { NO_FILTER } from "./catalogFilter";
import { reviewKeyOf } from "./expansion";
import {
    CATALOG_TARGET,
    initialViewState,
    isBusy,
    nextViewState,
    persistedChoicesOf,
    selectedIdOf,
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

        it("selects the tab's first add-on to review", () => {
            expect(selectedIdOf(after([shown()]).state)).toBe(RESIZE.id);
        });

        it("moves the selection to its neighbour when a push removes it, back to the list", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                shown(without(PALETTE.id)),
            ]);

            expect([selectedIdOf(state), state.pane]).toEqual([RESIZE.id, "list"]);
        });

        it("keeps the selection and the pane when a push keeps the add-on", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                shown(withRevision(11)),
            ]);

            expect([selectedIdOf(state), state.pane]).toEqual([PALETTE.id, "detail"]);
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

        it("focuses the selection's neighbour when the model after a read no longer lists the row", () => {
            const read = after([
                shown(),
                { kind: "addOnSelected", addOnId: ACME.id },
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            const { state, focus } = nextViewState(read.state, shown(without(ACME.id)));

            expect([focus, state.awaitingFocus]).toEqual([
                { kind: "head", headId: RESIZE.id },
                undefined,
            ]);
        });

        it("waits for the review while the model stays the same", () => {
            const read = after([
                shown(),
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
                { kind: "toggled", key: CONFIG_SOURCE.id },
            ]);

            expect([read.focus, read.state.awaitingFocus]).toEqual([
                undefined,
                { kind: "review", addOnId: ACME.id },
            ]);
        });

        it("ends the wait with no focus when nothing is left to take it", () => {
            const read = after([
                shown(),
                { kind: "actionChosen", actionKind: "inspect", targetId: ACME.id },
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);
            const nothing = { ...CATALOG, revision: 11, groups: [] };

            const { state, focus } = nextViewState(read.state, shown(nothing));

            expect([focus, state.awaitingFocus]).toEqual([undefined, undefined]);
        });

        it("focuses the source once a newer model no longer offers the switch's slot", () => {
            const fewer = withRevision(11, {
                ...CATALOG,
                groups: [
                    CATALOG.groups[0]!,
                    { ...CATALOG.groups[1]!, sources: [{ ...MARKETPLACE_SOURCE, actions: [] }] },
                ],
            });
            const answered = after([
                shown(),
                {
                    kind: "actionChosen",
                    actionKind: "disableTemplates",
                    targetId: MARKETPLACE_SOURCE.id,
                },
                shown(fewer),
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            expect([
                answered.focus,
                nextViewState(answered.state, shown(withRevision(12, fewer))).focus,
            ]).toEqual([undefined, { kind: "head", headId: MARKETPLACE_SOURCE.id }]);
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
        it("opens the row's tab, ancestors and review, selects it and focuses it once a model holds it", () => {
            const { state, focus } = after([reveal(3, [MAIL.id]), shown()]);

            expect([
                state.scope,
                state.expansion.get(MARKETPLACE_SOURCE.id),
                selectedIdOf(state),
                state.pane,
                state.lastRevealId,
                focus,
            ]).toEqual([
                "marketplaces",
                true,
                MAIL.id,
                "detail",
                3,
                { kind: "head", headId: MAIL.id, reveal: true },
            ]);
        });

        it("opens a review the user closed", () => {
            const { state } = after([
                shown(),
                { kind: "toggled", key: reviewKeyOf(RESIZE.id) },
                reveal(1, [RESIZE.id]),
            ]);

            expect(state.expansion.get(reviewKeyOf(RESIZE.id))).toBe(true);
        });

        it("clears a filter that hides the row, and keeps one that shows it", () => {
            const hidden = after([
                shown(),
                { kind: "queryChanged", query: "palette" },
                reveal(1, [RESIZE.id]),
            ]);
            const kept = after([
                shown(),
                { kind: "queryChanged", query: "resize" },
                reveal(1, [RESIZE.id]),
            ]);

            expect([hidden.state.filter, kept.state.filter.query]).toEqual([NO_FILTER, "resize"]);
        });

        it("opens the row's heads the user closed while a kept filter is on", () => {
            const { state } = after([
                shown(),
                { kind: "queryChanged", query: "resize" },
                { kind: "toggled", key: "folder:/work" },
                reveal(1, [RESIZE.id]),
            ]);

            expect([state.filter.query, state.filterExpansion.get("folder:/work")]).toEqual([
                "resize",
                true,
            ]);
        });

        it("lands on the first revealed row in model order", () => {
            expect(selectedIdOf(after([shown(), reveal(1, [RESIZE.id, PALETTE.id])]).state)).toBe(
                PALETTE.id,
            );
        });

        it("waits for a model that holds one of its rows", () => {
            const waiting = after([
                shown(without(RESIZE.id)),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                reveal(1, [RESIZE.id]),
            ]);
            const { state } = nextViewState(waiting.state, shown(withRevision(11)));

            expect([selectedIdOf(waiting.state), selectedIdOf(state)]).toEqual([
                PALETTE.id,
                RESIZE.id,
            ]);
        });

        it("ignores a reveal it applied before, as the panel posts it again when the page reloads", () => {
            const { state, focus } = after(
                [shown(), reveal(2, [MAIL.id])],
                initialViewState({ lastRevealId: 2 }),
            );

            expect([state.scope, focus]).toEqual(["workspace", undefined]);
        });
    });

    describe("tabs and selection", () => {
        it("starts each tab on its own first add-on to review, else its first", () => {
            const { state } = after([shown(), { kind: "scopeChosen", scope: "marketplaces" }]);

            expect(state.selection).toEqual({ workspace: RESIZE.id, marketplaces: MAIL.id });
        });

        it("keeps each tab's selection across a switch", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: ACME.id },
                { kind: "scopeChosen", scope: "marketplaces" },
                { kind: "scopeChosen", scope: "workspace" },
            ]);

            expect(selectedIdOf(state)).toBe(ACME.id);
        });

        it("moves a tab's selection to its first match when a filter hides it there", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                { kind: "scopeChosen", scope: "marketplaces" },
                { kind: "kindToggled", addOnKind: "rulePackage" },
                { kind: "scopeChosen", scope: "workspace" },
            ]);

            expect(selectedIdOf(state)).toBe(ACME.id);
        });

        it("moves the selection to the nearest match when a search hides it", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: RESIZE.id },
                { kind: "queryChanged", query: "acme" },
            ]);

            expect(selectedIdOf(state)).toBe(ACME.id);
        });

        it("drops the selection while nothing matches, and picks one again after", () => {
            const none = after([shown(), { kind: "queryChanged", query: "nothing like this" }]);
            const again = nextViewState(none.state, { kind: "filtersCleared" });

            expect([none.state.selection, selectedIdOf(again.state)]).toEqual([{}, RESIZE.id]);
        });

        it("shows the detail of a chosen add-on and goes back to the list", () => {
            const chosen = after([shown(), { kind: "addOnSelected", addOnId: PALETTE.id }]);
            const back = nextViewState(chosen.state, { kind: "backChosen" });

            expect([chosen.state.pane, back.state.pane, selectedIdOf(back.state)]).toEqual([
                "detail",
                "list",
                PALETTE.id,
            ]);
        });
    });

    describe("the filter", () => {
        it("takes the query, toggles kinds and the review chip, and clears them all", () => {
            const steps = after([
                shown(),
                { kind: "queryChanged", query: "res" },
                { kind: "kindToggled", addOnKind: "plugin" },
                { kind: "needsReviewToggled" },
            ]);
            const cleared = nextViewState(steps.state, { kind: "filtersCleared" });

            expect([
                steps.state.filter.query,
                [...steps.state.filter.kinds],
                steps.state.filter.onlyNeedsReview,
                cleared.state.filter,
            ]).toEqual(["res", ["plugin"], true, NO_FILTER]);
        });

        it("toggles the review chip off again", () => {
            const { state } = after([
                shown(),
                { kind: "needsReviewToggled" },
                { kind: "needsReviewToggled" },
            ]);

            expect(state.filter.onlyNeedsReview).toBe(false);
        });
    });

    describe("open and closed heads", () => {
        it("closes an open header and opens it again", () => {
            const closed = after([shown(), { kind: "toggled", key: CONFIG_SOURCE.id }]);
            const opened = nextViewState(closed.state, { kind: "toggled", key: CONFIG_SOURCE.id });

            expect([
                closed.state.expansion.get(CONFIG_SOURCE.id),
                opened.state.expansion.get(CONFIG_SOURCE.id),
            ]).toEqual([false, true]);
        });

        it("closes a row's review and opens it again", () => {
            const closed = after([shown(), { kind: "toggled", key: reviewKeyOf(RESIZE.id) }]);
            const opened = nextViewState(closed.state, {
                kind: "toggled",
                key: reviewKeyOf(RESIZE.id),
            });

            expect([
                closed.state.expansion.get(reviewKeyOf(RESIZE.id)),
                opened.state.expansion.get(reviewKeyOf(RESIZE.id)),
            ]).toEqual([false, true]);
        });

        it("keeps a head the user toggles while filtering apart from their kept choices", () => {
            const before = after([shown(), { kind: "toggled", key: MARKETPLACE_SOURCE.id }]);
            const { state } = after(
                [
                    { kind: "queryChanged", query: "a" },
                    { kind: "toggled", key: CONFIG_SOURCE.id },
                    { kind: "toggled", key: MARKETPLACE_SOURCE.id },
                ],
                before.state,
            );

            expect([[...state.filterExpansion], persistedChoicesOf(state)]).toEqual([
                [
                    [CONFIG_SOURCE.id, false],
                    [MARKETPLACE_SOURCE.id, false],
                ],
                persistedChoicesOf(before.state),
            ]);
        });

        it.each<{ case: string; refined: ViewEvent }>([
            { case: "a refined query", refined: { kind: "queryChanged", query: "re" } },
            { case: "a kind chip", refined: { kind: "kindToggled", addOnKind: "plugin" } },
            { case: "the review chip", refined: { kind: "needsReviewToggled" } },
        ])("keeps what the user closed while filtering across $case", ({ refined }) => {
            const { state } = after([
                shown(),
                { kind: "queryChanged", query: "r" },
                { kind: "toggled", key: CONFIG_SOURCE.id },
                refined,
            ]);

            expect([...state.filterExpansion]).toEqual([[CONFIG_SOURCE.id, false]]);
        });

        it.each<{ case: string; filterOn: ViewEvent; filterOff: ViewEvent }>([
            {
                case: "the filters are cleared",
                filterOn: { kind: "kindToggled", addOnKind: "plugin" },
                filterOff: { kind: "filtersCleared" },
            },
            {
                case: "the query is emptied",
                filterOn: { kind: "queryChanged", query: "r" },
                filterOff: { kind: "queryChanged", query: " " },
            },
            {
                case: "the last chip goes off",
                filterOn: { kind: "needsReviewToggled" },
                filterOff: { kind: "needsReviewToggled" },
            },
        ])(
            "forgets what the user toggled while filtering once $case",
            ({ filterOn, filterOff }) => {
                const layout = after([shown(), { kind: "toggled", key: CONFIG_SOURCE.id }]);
                const { state } = after(
                    [
                        filterOn,
                        { kind: "toggled", key: "folder:/work" },
                        { kind: "toggled", key: CONFIG_SOURCE.id },
                        filterOff,
                    ],
                    layout.state,
                );

                expect([state.filterExpansion.size, state.expansion]).toEqual([
                    0,
                    layout.state.expansion,
                ]);
            },
        );

        it("toggles nothing before the first model", () => {
            expect(after([{ kind: "toggled", key: CONFIG_SOURCE.id }]).state.expansion.size).toBe(
                0,
            );
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
            { kind: "queryChanged", query: "mail" },
        ]);
        const restored = initialViewState(persistedChoicesOf(state));

        expect(persistedChoicesOf(state)).toEqual({
            expansion: [
                ["marketplaces", true],
                [MARKETPLACE_SOURCE.id, true],
                [CONFIG_SOURCE.id, false],
            ],
            scope: "marketplaces",
            selection: { workspace: RESIZE.id, marketplaces: MAIL.id },
            lastRevealId: 4,
        });
        expect([
            restored.pending.size,
            restored.banner,
            restored.scope,
            selectedIdOf(restored),
            restored.filter,
        ]).toEqual([0, undefined, "marketplaces", MAIL.id, NO_FILTER]);
    });

    it.each<{ case: string; saved: object }>([
        { case: "an unknown tab", saved: { scope: "elsewhere", selection: { workspace: 3 } } },
        { case: "a selection that is no object", saved: { selection: "x" } },
        { case: "nothing", saved: {} },
    ])("starts on the workspace tab with no selection from $case", ({ saved }) => {
        const restored = initialViewState(saved as never);

        expect([restored.scope, restored.selection]).toEqual(["workspace", {}]);
    });
});
