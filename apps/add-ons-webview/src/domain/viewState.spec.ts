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
    reveal: { kind: "rows", revealId, addOnIds } satisfies AddOnRevealPayload,
});
const review = (revealId: number): ViewEvent => ({
    kind: "revealArrived",
    reveal: { kind: "needsReview", revealId } satisfies AddOnRevealPayload,
});
const BROKEN = {
    ...PALETTE,
    id: "plugin:/work/.camunda/plugins/broken",
    name: "broken",
    problem: "Does not run: you have not trusted this project.",
};
const WITH_BROKEN: AddOnCatalogPayload = {
    ...CATALOG,
    groups: [
        {
            ...CATALOG.groups[0]!,
            sources: [
                { ...CONFIG_SOURCE, addOns: [BROKEN, PALETTE, RESIZE] },
                CATALOG.groups[0]!.sources[1]!,
            ],
        },
        CATALOG.groups[1]!,
    ],
};

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

        it("selects the first add-on to review", () => {
            expect(selectedIdOf(after([shown()]).state)).toBe(RESIZE.id);
        });

        it("moves the selection to its neighbour in sight, as the list orders it, when a push removes it", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                shown(without(PALETTE.id)),
            ]);

            expect([selectedIdOf(state), state.pane]).toEqual([ACME.id, "list"]);
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

        it("focuses the selection's neighbour when the model after a revoke no longer lists the row", () => {
            const revoked = after([
                shown(),
                { kind: "addOnSelected", addOnId: PALETTE.id },
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                shown(without(PALETTE.id, withRevision(11))),
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);

            const { state, focus } = nextViewState(
                revoked.state,
                shown(without(PALETTE.id, withRevision(12))),
            );

            expect([focus, state.awaitingFocus]).toEqual([
                { kind: "head", headId: ACME.id },
                undefined,
            ]);
        });

        it("waits for the row while the model stays the same", () => {
            const revoked = after([
                shown(),
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                shown(without(PALETTE.id, withRevision(11))),
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
                { kind: "toggled", key: CONFIG_SOURCE.id },
            ]);

            expect([revoked.focus, revoked.state.awaitingFocus]).toEqual([
                undefined,
                { kind: "head", headId: PALETTE.id },
            ]);
        });

        it("ends the wait with no focus when nothing is left to take it", () => {
            const revoked = after([
                shown(),
                { kind: "actionChosen", actionKind: "revoke", targetId: PALETTE.id },
                shown(without(PALETTE.id, withRevision(11))),
                { kind: "resultArrived", requestId: 1, result: { kind: "done" } },
            ]);
            const nothing = { ...CATALOG, revision: 12, groups: [] };

            const { state, focus } = nextViewState(revoked.state, shown(nothing));

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
        it("opens the row's ancestors, selects it and focuses it once a model holds it", () => {
            const { state, focus } = after([reveal(3, [MAIL.id]), shown()]);

            expect([
                state.expansion.get(MARKETPLACE_SOURCE.id),
                selectedIdOf(state),
                state.pane,
                state.lastRevealId,
                focus,
            ]).toEqual([
                true,
                MAIL.id,
                "detail",
                3,
                { kind: "head", headId: MAIL.id, reveal: true },
            ]);
        });

        it("opens no header for a row Needs attention lists, and lands on its detail", () => {
            const { state } = after([reveal(3, [RESIZE.id]), shown()]);

            expect([[...state.expansion], state.pane]).toEqual([[], "detail"]);
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
                { kind: "queryChanged", query: "palette" },
                { kind: "toggled", key: CONFIG_SOURCE.id },
                reveal(1, [PALETTE.id]),
            ]);

            expect([state.filter.query, state.filterExpansion.get(CONFIG_SOURCE.id)]).toEqual([
                "palette",
                true,
            ]);
        });

        it("lands on the first revealed row in the order the list shows them", () => {
            expect(selectedIdOf(after([shown(), reveal(1, [PALETTE.id, RESIZE.id])]).state)).toBe(
                RESIZE.id,
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

            expect([selectedIdOf(state), focus]).toEqual([RESIZE.id, undefined]);
        });
    });

    describe("Review Add-ons", () => {
        it.each<{ case: string; before: ViewEvent[] }>([
            {
                case: "a search and a kind",
                before: [
                    { kind: "queryChanged", query: "mail" },
                    { kind: "kindChosen", addOnKind: "elementTemplate" },
                ],
            },
            { case: "the detail pane", before: [{ kind: "addOnSelected", addOnId: MAIL.id }] },
        ])(
            "shows the whole list and focuses the first add-on to review, coming from $case",
            ({ before }) => {
                const { state, focus } = after([shown(), ...before, review(1)]);

                expect([
                    state.filter,
                    state.pane,
                    selectedIdOf(state),
                    state.reviewCount,
                    focus,
                ]).toEqual([
                    NO_FILTER,
                    "list",
                    RESIZE.id,
                    2,
                    { kind: "head", headId: RESIZE.id, requested: true },
                ]);
            },
        );

        it("keeps a selection that waits for a review", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: ACME.id },
                review(1),
            ]);

            expect(selectedIdOf(state)).toBe(ACME.id);
        });

        it("passes over a row whose problem keeps Allow away", () => {
            const { state } = after([shown(WITH_BROKEN), review(1)]);

            expect(selectedIdOf(state)).toBe(RESIZE.id);
        });

        it("keeps the selection and focuses the list's start when nothing waits", () => {
            const settled = without(RESIZE.id, without(ACME.id));
            const { state, focus } = after([
                shown(settled),
                { kind: "toggled", key: MARKETPLACE_SOURCE.id },
                { kind: "addOnSelected", addOnId: MAIL.id },
                review(1),
            ]);

            expect([selectedIdOf(state), state.reviewCount, focus]).toEqual([
                MAIL.id,
                0,
                { kind: "listStart", requested: true },
            ]);
        });

        it("keeps saying what it found across the refresh that follows it", () => {
            const { state } = after([shown(), review(1), shown(withRevision(11))]);

            expect(state.reviewCount).toBe(2);
        });

        it("stops saying what it found once the user acts on a row", () => {
            const { state } = after([
                shown(),
                review(1),
                { kind: "actionChosen", actionKind: "allow", targetId: RESIZE.id },
            ]);

            expect(state.reviewCount).toBeUndefined();
        });

        it("stops saying what it found once the user searches", () => {
            const { state } = after([shown(), review(1), { kind: "queryChanged", query: "p" }]);

            expect(state.reviewCount).toBeUndefined();
        });

        it("waits for a model, then applies", () => {
            const { state, focus } = after([review(5), shown()]);

            expect([state.lastRevealId, focus]).toEqual([
                5,
                { kind: "head", headId: RESIZE.id, requested: true },
            ]);
        });

        it("ignores one it applied before", () => {
            const { state } = after(
                [shown(), { kind: "queryChanged", query: "x" }, review(5)],
                initialViewState({ lastRevealId: 5 }),
            );

            expect(state.filter.query).toBe("x");
        });

        it("lands on a row a later Review… reveals", () => {
            const { state } = after([shown(), review(1), reveal(2, [ACME.id])]);

            expect([selectedIdOf(state), state.pane]).toEqual([ACME.id, "detail"]);
        });
    });

    describe("selection", () => {
        it("selects no template while every marketplace is closed", () => {
            const { state } = after([
                shown(without(RESIZE.id, without(ACME.id, without(PALETTE.id)))),
            ]);

            expect(selectedIdOf(state)).toBeUndefined();
        });

        it("selects the first template of a marketplace the user opens", () => {
            const { state } = after([
                shown(without(RESIZE.id, without(ACME.id, without(PALETTE.id)))),
                { kind: "toggled", key: MARKETPLACE_SOURCE.id },
            ]);

            expect(selectedIdOf(state)).toBe(MAIL.id);
        });

        it("starts on the first add-on in Needs attention that waits, before anything below", () => {
            expect(selectedIdOf(after([shown(WITH_BROKEN)]).state)).toBe(RESIZE.id);
        });

        it("moves the selection to its first match when a filter hides it", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: RESIZE.id },
                { kind: "kindChosen", addOnKind: "rulePackage" },
            ]);

            expect(selectedIdOf(state)).toBe(ACME.id);
        });

        it("moves the selection to the nearest match when a search hides it", () => {
            const { state } = after([
                shown(),
                { kind: "addOnSelected", addOnId: ACME.id },
                { kind: "queryChanged", query: "resize" },
            ]);

            expect(selectedIdOf(state)).toBe(RESIZE.id);
        });

        it("drops the selection while nothing matches, and picks one again after", () => {
            const none = after([shown(), { kind: "queryChanged", query: "nothing like this" }]);
            const again = nextViewState(none.state, { kind: "filtersCleared" });

            expect([selectedIdOf(none.state), selectedIdOf(again.state)]).toEqual([
                undefined,
                RESIZE.id,
            ]);
        });

        it("keeps the rows of the only folder in sight though an older page closed its header", () => {
            const { state } = after(
                [shown(without(RESIZE.id, without(ACME.id)))],
                initialViewState({ expansion: [["folder:/work", false]] }),
            );

            expect(selectedIdOf(state)).toBe(PALETTE.id);
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
        it("takes the query, one kind, and clears them all", () => {
            const steps = after([
                shown(),
                { kind: "queryChanged", query: "re" },
                { kind: "kindChosen", addOnKind: "rulePackage" },
                { kind: "kindChosen", addOnKind: "plugin" },
            ]);
            const cleared = nextViewState(steps.state, { kind: "filtersCleared" });

            expect([
                steps.state.filter.query,
                steps.state.filter.kind,
                cleared.state.filter,
            ]).toEqual(["re", "plugin", NO_FILTER]);
        });

        it("shows every kind again on All", () => {
            const { state } = after([
                shown(),
                { kind: "kindChosen", addOnKind: "plugin" },
                { kind: "kindChosen" },
            ]);

            expect(state.filter.kind).toBeUndefined();
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

        it("keeps no choice about a key that names no header", () => {
            const { state } = after([shown(), { kind: "toggled", key: `review:${RESIZE.id}` }]);

            expect(state.expansion.size).toBe(0);
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
            { case: "a kind", refined: { kind: "kindChosen", addOnKind: "plugin" } },
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
                filterOn: { kind: "kindChosen", addOnKind: "plugin" },
                filterOff: { kind: "filtersCleared" },
            },
            {
                case: "the query is emptied",
                filterOn: { kind: "queryChanged", query: "r" },
                filterOff: { kind: "queryChanged", query: " " },
            },
            {
                case: "All is chosen again",
                filterOn: { kind: "kindChosen", addOnKind: "plugin" },
                filterOff: { kind: "kindChosen" },
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
        const restored = after([shown()], initialViewState(persistedChoicesOf(state))).state;

        expect(persistedChoicesOf(state)).toEqual({
            expansion: [
                ["marketplaces", true],
                [MARKETPLACE_SOURCE.id, true],
                [CONFIG_SOURCE.id, false],
            ],
            selectedId: MAIL.id,
            lastRevealId: 4,
        });
        expect([
            restored.pending.size,
            restored.banner,
            selectedIdOf(restored),
            restored.filter,
        ]).toEqual([0, undefined, MAIL.id, NO_FILTER]);
    });

    it.each<{ case: string; saved: object; selected: string | undefined }>([
        { case: "the selection itself", saved: { selectedId: PALETTE.id }, selected: PALETTE.id },
        {
            case: "an older page's workspace selection",
            saved: { selection: { workspace: PALETTE.id, marketplaces: MAIL.id } },
            selected: PALETTE.id,
        },
        {
            case: "an older page's selection that is no text",
            saved: { selection: { workspace: 3 } },
            selected: undefined,
        },
        { case: "a selection that is no object", saved: { selection: "x" }, selected: undefined },
        { case: "nothing", saved: {}, selected: undefined },
    ])("restores $case", ({ saved, selected }) => {
        expect(selectedIdOf(initialViewState(saved as never))).toBe(selected);
    });

    describe("a list whose rows open the detail in a tab", () => {
        const tabbed = () => initialViewState(undefined, "listWithTab");

        it("selects a clicked row, stays on the list and asks for the tab", () => {
            const { state, openDetail } = after(
                [shown(), { kind: "addOnSelected", addOnId: PALETTE.id }],
                tabbed(),
            );

            expect([selectedIdOf(state), state.pane, openDetail]).toEqual([
                PALETTE.id,
                "list",
                PALETTE.id,
            ]);
        });

        it("asks for the tab of the row a Review… reveals, and stays on the list", () => {
            const { state, openDetail } = after([shown(), reveal(1, [ACME.id])], tabbed());

            expect([selectedIdOf(state), state.pane, openDetail]).toEqual([
                ACME.id,
                "list",
                ACME.id,
            ]);
        });

        it("asks for no tab when it merely settles its selection", () => {
            expect(after([shown()], tabbed()).openDetail).toBeUndefined();
        });
    });

    describe("a detail tab's page", () => {
        const page = () => initialViewState(undefined, "detail");
        const showsMail: ViewEvent = { kind: "addOnShown", addOnId: MAIL.id };

        it("shows the add-on the host names, though a closed marketplace hides its row", () => {
            const { state } = after([showsMail, shown()], page());

            expect([selectedIdOf(state), state.pane]).toEqual([MAIL.id, "detail"]);
        });

        it("keeps showing it when a newer model arrives", () => {
            const { state } = after([showsMail, shown(), shown(withRevision(11))], page());

            expect(selectedIdOf(state)).toBe(MAIL.id);
        });

        it("drops the last add-on's banner when the tab shows another", () => {
            const { state } = after(
                [
                    showsMail,
                    shown(),
                    { kind: "actionChosen", actionKind: "disable", targetId: MAIL.id },
                    {
                        kind: "resultArrived",
                        requestId: 1,
                        result: { kind: "done", message: "Disabled Mail." },
                    },
                    { kind: "addOnShown", addOnId: PALETTE.id },
                ],
                page(),
            );

            expect([selectedIdOf(state), state.banner]).toEqual([PALETTE.id, undefined]);
        });

        it("keeps the banner when the host names the add-on it already shows", () => {
            const { state } = after(
                [
                    showsMail,
                    shown(),
                    { kind: "actionChosen", actionKind: "disable", targetId: MAIL.id },
                    {
                        kind: "resultArrived",
                        requestId: 1,
                        result: { kind: "done", message: "Disabled Mail." },
                    },
                    showsMail,
                ],
                page(),
            );

            expect(state.banner).toBeDefined();
        });

        it("keeps no selection of its own across a reload", () => {
            const { state } = after([showsMail, shown()], page());

            expect(persistedChoicesOf(state).selectedId).toBeUndefined();
        });
    });
});
