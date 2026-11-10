import type { AddOnCatalogPayload, CodeAddOnPayload } from "@miragon/bpmn-modeler-shared";
import { AddOnRequestCommand } from "@miragon/bpmn-modeler-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

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
} from "../../__fixtures__/catalogs";
import { mountedView } from "../../__fixtures__/mountedView";

const DIGEST = "526573697a65205461736b7300000000000000000000000000000000000000ab";
const ADD = { kind: "addMarketplace", label: "Add marketplace…" } as const;
const UPDATE = { kind: "updateMarketplaces", label: "Update marketplaces" } as const;
const PRUNE = { kind: "pruneCache", label: "Remove unused plugin copies" } as const;

const FOLDER = CATALOG.groups[0]!;
const MARKETPLACES = CATALOG.groups[1]!;

/** The catalog with these changes to one add-on. */
function changed(addOnId: string, change: object, model = CATALOG): AddOnCatalogPayload {
    return {
        ...model,
        groups: model.groups.map((group) => ({
            ...group,
            sources: group.sources.map((source) => ({
                ...source,
                addOns: source.addOns.map((addOn) =>
                    addOn.id === addOnId ? ({ ...addOn, ...change } as typeof addOn) : addOn,
                ),
            })),
        })),
    };
}

const text = (element: Element | null | undefined) => element?.textContent ?? undefined;

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("AddOnsView", () => {
    describe("while the catalog loads", () => {
        it("shows a busy list with a loading status and no toolbar", () => {
            const { root } = mountedView();
            const list = root.querySelector(".av-list")!;

            expect([
                list.getAttribute("aria-busy"),
                list.getAttribute("aria-label"),
                text(list.querySelector("[role=status]")),
                root.querySelector<HTMLElement>(".av-app")?.dataset.phase,
            ]).toEqual(["true", "Add-ons", "Loading…", "loading"]);
        });

        it("ignores the host focusing it", () => {
            const { root } = mountedView();

            window.dispatchEvent(new FocusEvent("focus"));
            mountedView().view.focusFromOutside();

            expect(root.contains(document.activeElement)).toBe(false);
        });
    });

    describe("the list", () => {
        it("groups the workspace by folder and source and selects the first add-on to review", () => {
            const { root, rowNames, row, detailName } = mountedView(CATALOG);
            const list = root.querySelector(".av-list")!;

            expect([
                rowNames(),
                row(RESIZE.name).getAttribute("aria-current"),
                detailName(),
                list.getAttribute("role"),
                list.getAttribute("aria-labelledby"),
                list.getAttribute("aria-busy"),
            ]).toEqual([
                [PALETTE.name, RESIZE.name, ACME.name],
                "true",
                RESIZE.name,
                "tabpanel",
                "av-tab-workspace",
                null,
            ]);
        });

        it("names each row's kind for a screen reader and its status by word", () => {
            const { row } = mountedView(changed(PALETTE.id, { problem: "Broken." }));

            expect([
                text(row(RESIZE.name).querySelector(".av-vh")),
                text(row(RESIZE.name).querySelector(".av-status-word")),
                text(row(PALETTE.name).querySelector(".av-status-word")),
                text(row(ACME.name).querySelector(".av-vh")),
            ]).toEqual(["Plugin, ", "Needs review", "Problem", "Rule package, "]);
        });

        it("shows a row's detail beside its name", () => {
            const { row } = mountedView(CATALOG);

            expect(text(row(RESIZE.name).querySelector(".av-row-detail"))).toBe(RESIZE.detail);
        });

        it("selects a clicked row and shows its detail", () => {
            const { row, detailName, events } = mountedView(CATALOG);

            row(PALETTE.name).click();

            expect([
                detailName(),
                row(PALETTE.name).getAttribute("aria-current"),
                events.at(-1),
            ]).toEqual([PALETTE.name, "true", { kind: "addOnSelected", addOnId: PALETTE.id }]);
        });

        it("closes a source and keeps its count, review dot and summary in its header", () => {
            const { head, rowNames, events } = mountedView(CATALOG);
            head(CONFIG_SOURCE.id)!.focus();

            head(CONFIG_SOURCE.id)!.click();
            const closed = head(CONFIG_SOURCE.id)!;

            expect([
                closed.getAttribute("aria-expanded"),
                rowNames(),
                text(closed.querySelector(".ds-count")),
                closed.querySelectorAll(".av-dot").length,
                text(closed.querySelector(".av-vh")),
                events.at(-1),
                document.activeElement,
            ]).toEqual([
                "false",
                [ACME.name],
                "2",
                1,
                ", 2 add-ons, 1 needs review",
                { kind: "toggled", key: CONFIG_SOURCE.id },
                closed,
            ]);
        });

        it("closes a folder with all of its sources", () => {
            const { head, rowNames, root } = mountedView(CATALOG);

            head(FOLDER.id)!.click();

            expect([rowNames(), root.querySelectorAll(".av-source").length]).toEqual([[], 0]);
        });

        it("keeps a folder's problem in sight while the folder is closed", () => {
            const model = {
                ...CATALOG,
                groups: [{ ...FOLDER, problem: "Could not read the folder." }, MARKETPLACES],
            };
            const { root, head } = mountedView(model);

            head(FOLDER.id)!.click();

            expect(text(root.querySelector(".av-group-problem"))).toBe(
                "Could not read the folder.",
            );
        });

        it("shows the catalog's problem above its folders", () => {
            const { root } = mountedView({ ...CATALOG, problem: "Could not read it again." });

            expect(text(root.querySelector(".av-catalog-problem"))).toBe(
                "Could not read it again.",
            );
        });
    });

    describe("the tabs", () => {
        it("count each tab's add-ons and mark the chosen one", () => {
            const { tab } = mountedView(CATALOG);

            expect([
                text(tab("Workspace").querySelector(".ds-count")),
                text(tab("Marketplaces").querySelector(".ds-count")),
                tab("Workspace").getAttribute("aria-selected"),
                tab("Workspace").tabIndex,
                tab("Marketplaces").tabIndex,
            ]).toEqual(["3", "1", "true", 0, -1]);
        });

        it("list the marketplaces flat, closed, under Add marketplace…", () => {
            const { tab, root, head, button } = mountedView({
                ...CATALOG,
                actions: [ADD, UPDATE, PRUNE],
            });

            tab("Marketplaces").click();

            expect([
                tab("Marketplaces").getAttribute("aria-selected"),
                text(root.querySelector(".av-group-intro")),
                root.querySelector(".av-group-head"),
                head(MARKETPLACE_SOURCE.id)?.getAttribute("aria-expanded"),
                [...root.querySelectorAll(".av-scope-actions .ds-btn")].map(text),
                button("More actions") !== undefined,
            ]).toEqual([
                "true",
                MARKETPLACES.description,
                null,
                "false",
                [ADD.label, UPDATE.label],
                true,
            ]);
        });

        it("keep each tab's own selection", () => {
            const { tab, row, detailName } = mountedView(CATALOG);
            row(PALETTE.name).click();

            tab("Marketplaces").click();
            const marketplaces = detailName();
            tab("Workspace").click();

            expect([marketplaces, detailName()]).toEqual([MAIL.name, PALETTE.name]);
        });

        it.each([
            ["ArrowRight", "Workspace", "Marketplaces"],
            ["ArrowLeft", "Workspace", "Marketplaces"],
            ["End", "Workspace", "Marketplaces"],
            ["Home", "Marketplaces", "Workspace"],
        ])("move with %s from %s to %s and take focus", (key, from, to) => {
            const { tab, press } = mountedView(CATALOG);
            tab(from).click();
            tab(from).focus();

            press(key);

            expect([tab(to).getAttribute("aria-selected"), document.activeElement]).toEqual([
                "true",
                tab(to),
            ]);
        });

        it("ignore other keys", () => {
            const { tab, press, events } = mountedView(CATALOG);
            const before = events.length;

            press("ArrowDown", tab("Workspace"));

            expect(events.length).toBe(before);
        });
    });

    describe("search and filters", () => {
        it("count each kind and what needs review in the tab", () => {
            const { chip } = mountedView(CATALOG);

            expect(
                ["Needs review", "Plugins", "Rule packages", "Templates"].map((name) => [
                    text(chip(name).querySelector(".ds-count")),
                    chip(name).getAttribute("aria-pressed"),
                ]),
            ).toEqual([
                ["2", "false"],
                ["2", "false"],
                ["1", "false"],
                ["0", "false"],
            ]);
        });

        it("keep the matches of a chosen kind, with plain headers, and announce how many", () => {
            const { chip, rowNames, head, root } = mountedView(CATALOG);

            chip("Plugins").click();

            expect([
                chip("Plugins").getAttribute("aria-pressed"),
                rowNames(),
                head(CONFIG_SOURCE.id),
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual(["true", [PALETTE.name, RESIZE.name], null, "2 add-ons shown"]);
        });

        it("keep only what needs review", () => {
            const { chip, rowNames } = mountedView(CATALOG);

            chip("Needs review").click();

            expect(rowNames()).toEqual([RESIZE.name, ACME.name]);
        });

        it("find rows inside a closed source and leave it closed", () => {
            const { head, type, rowNames } = mountedView(CATALOG);
            head(CONFIG_SOURCE.id)!.click();

            type("palette");
            const found = rowNames();
            type("");

            expect([found, head(CONFIG_SOURCE.id)?.getAttribute("aria-expanded")]).toEqual([
                [PALETTE.name],
                "false",
            ]);
        });

        it("show the clear button only with a query and clear the field with it", () => {
            const { type, search, button, rowNames } = mountedView(CATALOG);
            const clear = button("Clear search");
            const hiddenBefore = clear.hidden;

            type("acme");
            const shownWithQuery = !clear.hidden;
            clear.click();

            expect([
                hiddenBefore,
                shownWithQuery,
                clear.hidden,
                search().value,
                document.activeElement,
                rowNames().length,
            ]).toEqual([true, true, true, "", search(), 3]);
        });

        it("clear the query with Escape and leave an empty field alone", () => {
            const { type, search, press, events } = mountedView(CATALOG);
            type("acme");

            press("Escape", search());
            const cleared = search().value;
            const count = events.length;
            press("Escape", search());

            expect([cleared, events.length]).toEqual(["", count]);
        });

        it("keep the field's element while typing", () => {
            const { type, search } = mountedView(CATALOG);
            const field = search();

            type("a");
            type("ac");

            expect(search()).toBe(field);
        });

        it("say when nothing matches and clear every filter on request", () => {
            const { type, chip, root, button, search, rowNames } = mountedView(CATALOG);
            chip("Templates").click();
            type("nothing like this");

            const said = text(root.querySelector(".av-empty-text"));
            const announced = text(root.querySelector("[aria-live=polite].av-vh"));
            button("Clear filters").click();

            expect([
                said,
                announced,
                rowNames().length,
                chip("Templates").getAttribute("aria-pressed"),
                document.activeElement,
            ]).toEqual([
                "No add-ons match your search and filters.",
                "No add-ons match your search and filters.",
                3,
                "false",
                search(),
            ]);
        });

        it("scroll the chip row sideways with a wheel when it overflows", () => {
            const { root } = mountedView(CATALOG);
            const chips = root.querySelector<HTMLElement>(".av-chips")!;
            Object.defineProperty(chips, "scrollWidth", { value: 400 });
            Object.defineProperty(chips, "clientWidth", { value: 200 });

            chips.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, cancelable: true }));
            chips.dispatchEvent(
                new WheelEvent("wheel", { deltaX: 40, deltaY: 1, cancelable: true }),
            );

            expect(chips.scrollLeft).toBe(40);
        });
    });

    describe("the detail", () => {
        const reviewed: CodeAddOnPayload = {
            ...RESIZE,
            note: "Code it already ran stays loaded.",
            review: {
                ...RESIZE.review!,
                facts: [
                    { label: "Folder", value: ".camunda/plugins/resize" },
                    { label: "Content hash", value: DIGEST },
                ],
            },
        };

        it("says what the add-on is, where it sits and what state it is in", () => {
            const { root } = mountedView(changed(RESIZE.id, reviewed));
            const detail = root.querySelector(".av-detail-card")!;

            expect([
                text(detail.querySelector(".ds-kind-tag")),
                text(detail.querySelector(".av-state-line")),
                text(detail.querySelector(".av-detail-meta")),
                text(detail.querySelector(".av-location")),
                text(detail.querySelector(".av-note")),
                detail.getAttribute("aria-label"),
            ]).toEqual([
                "Plugin",
                RESIZE.stateText,
                "BPMN plugin·plugins/resize",
                "work›.camunda",
                reviewed.note,
                RESIZE.name,
            ]);
        });

        it("shows the review open, with its warning, facts, the hash in mono and Allow at its end", () => {
            const { root } = mountedView(changed(RESIZE.id, reviewed));
            const review = root.querySelector(".av-review")!;

            expect([
                review.querySelector(".av-review-toggle")?.getAttribute("aria-expanded"),
                text(review.querySelector(".av-box-warning")),
                [...review.querySelectorAll("dt")].map(text),
                [...review.querySelectorAll(".av-mono")].map(text),
                text(review.querySelector(".av-review-end button")),
            ]).toEqual([
                "true",
                RESIZE.review!.warning,
                ["Folder", "Content hash"],
                [DIGEST],
                "Allow this content",
            ]);
        });

        it("closes the review", () => {
            const { root, events } = mountedView(CATALOG);
            root.querySelector<HTMLElement>(".av-review-toggle")!.focus();

            root.querySelector<HTMLElement>(".av-review-toggle")!.click();

            expect([
                root.querySelector(".av-review-body"),
                events.at(-1),
                document.activeElement,
            ]).toEqual([
                null,
                { kind: "toggled", key: `review:${RESIZE.id}` },
                root.querySelector(".av-review-toggle"),
            ]);
        });

        it("shows a problem and the row's actions as buttons", () => {
            const { root, row } = mountedView(changed(PALETTE.id, { problem: "Broken." }));
            row(PALETTE.name).click();

            expect([
                text(root.querySelector(".av-detail .av-box-danger")),
                [...root.querySelectorAll(".av-actions button")].map(text),
                root.querySelector(".av-actions button")?.classList.contains("ds-btn-danger"),
            ]).toEqual(["Broken.", ["Revoke"], true]);
        });

        it("asks for Allow and marks the add-on busy until the result", () => {
            const { button, host, root, row } = mountedView(CATALOG);

            button("Allow this content").click();

            expect([
                host.posted.at(-1),
                root.querySelector(".av-detail-card")?.getAttribute("aria-busy"),
                row(RESIZE.name).parentElement?.getAttribute("aria-busy"),
                button("Allow this content").getAttribute("aria-disabled"),
            ]).toEqual([
                new AddOnRequestCommand(1, {
                    kind: "allow",
                    addOnId: RESIZE.id,
                    revision: CATALOG.revision,
                }),
                "true",
                "true",
                "true",
            ]);
        });

        it("asks nothing for a busy button", () => {
            const { button, host } = mountedView(CATALOG);
            button("Allow this content").click();

            button("Allow this content").click();

            expect(host.posted.length).toBe(1);
        });

        it("hints at what to do while nothing is selected", () => {
            const { type, root } = mountedView(CATALOG);

            type("nothing like this");

            expect(text(root.querySelector(".av-hint"))).toBe(
                "Select an add-on to read what it is and what you can do with it.",
            );
        });
    });

    describe("the result banner", () => {
        it("swaps the text of a live region that stays in the page", () => {
            const { root, button, session } = mountedView(CATALOG);
            const status = root.querySelector("[role=status]")!;
            button("Allow this content").click();

            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "done", message: "Allowed Resize Tasks." },
            });

            expect([
                root.querySelector("[role=status]"),
                text(status),
                status.parentElement?.hasAttribute("data-empty"),
            ]).toEqual([status, "Allowed Resize Tasks.", false]);
        });

        it("shows a refusal as an alert and dismisses it", () => {
            const { root, button, session, events } = mountedView(CATALOG);
            button("Allow this content").click();
            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "refused", reason: "staleView", message: "Stale." },
            });
            const alert = root.querySelector("[role=alert]")!;
            const said = text(alert);

            alert.parentElement!.querySelector<HTMLElement>("[data-dismiss-banner]")!.click();

            expect([
                said,
                text(alert),
                alert.parentElement?.hasAttribute("data-empty"),
                events.at(-1),
            ]).toEqual(["Stale.", "", true, { kind: "bannerDismissed" }]);
        });
    });

    describe("menus", () => {
        it("open a source's actions and focus the first", () => {
            const { tab, button, root } = mountedView(CATALOG);
            tab("Marketplaces").click();

            button("Source actions: /shared").click();
            const items = [...root.querySelectorAll<HTMLElement>("[role=menu] [role=menuitem]")];

            expect([
                items.map(text),
                document.activeElement,
                button("Source actions: /shared").getAttribute("aria-expanded"),
            ]).toEqual([["Remove", "Disable templates"], items[0], "true"]);
        });

        it("move through their items with the arrow keys, Home and End", () => {
            const { tab, button, root, press } = mountedView(CATALOG);
            tab("Marketplaces").click();
            button("Source actions: /shared").click();
            const items = [...root.querySelectorAll<HTMLElement>("[role=menuitem]")];
            const visited: (Element | null)[] = [];

            for (const key of ["ArrowDown", "ArrowDown", "ArrowUp", "End", "Home", "a"]) {
                press(key);
                visited.push(document.activeElement);
            }

            expect(visited).toEqual([items[1], items[0], items[1], items[1], items[0], items[0]]);
        });

        it("keep their items out of the Tab order", () => {
            const { button, root } = mountedView(CATALOG);
            button("More actions").click();

            expect(
                [...root.querySelectorAll<HTMLElement>("[role=menuitem]")].map(
                    ({ tabIndex }) => tabIndex,
                ),
            ).toEqual([-1, -1]);
        });

        it("close when Tab leaves them, from their button, so Tab moves on from there", () => {
            const { tab, button, root, press } = mountedView(CATALOG);
            tab("Marketplaces").click();
            button("Source actions: /shared").click();
            press("ArrowDown");

            const tabbed = press("Tab");

            expect([tabbed, root.querySelector("[role=menu]"), document.activeElement]).toEqual([
                true,
                null,
                button("Source actions: /shared"),
            ]);
        });

        it("close with Escape and return focus to their button", () => {
            const { tab, button, root, press } = mountedView(CATALOG);
            tab("Marketplaces").click();
            button("Source actions: /shared").click();

            press("Escape");

            expect([root.querySelector("[role=menu]"), document.activeElement]).toEqual([
                null,
                button("Source actions: /shared"),
            ]);
        });

        it("close on a click outside them and on their button", () => {
            const { button, root } = mountedView(CATALOG);
            button("More actions").click();
            root.querySelector<HTMLElement>(".av-group-path")!.click();
            const afterOutside = root.querySelector("[role=menu]");
            button("More actions").click();
            button("More actions").click();

            expect([afterOutside, root.querySelector("[role=menu]")]).toEqual([null, null]);
        });

        it("send a chosen item, close and return focus to their button", () => {
            const { button, host, root } = mountedView(CATALOG);
            button("More actions").click();

            button(PRUNE.label).click();

            expect([
                host.posted.at(-1),
                root.querySelector("[role=menu]"),
                document.activeElement,
            ]).toEqual([
                new AddOnRequestCommand(1, { kind: "pruneCache" }),
                null,
                button("More actions"),
            ]);
        });

        it("close without sending a busy item", () => {
            const { button, host, root } = mountedView(CATALOG);
            button("More actions").click();
            button(PRUNE.label).click();
            button("More actions").click();

            button(PRUNE.label).click();

            expect([host.posted.length, root.querySelector("[role=menu]")]).toEqual([1, null]);
        });

        it("leave the Escape key alone while closed", () => {
            const { press, root, events } = mountedView(CATALOG);
            const count = events.length;

            press("Escape", root.querySelector(".av-row")!);

            expect(events.length).toBe(count);
        });
    });

    describe("empty and failed catalogs", () => {
        it("say the core's text with every catalog action and hide the toolbar", () => {
            const { root } = mountedView({
                revision: 1,
                groups: [],
                actions: [ADD, PRUNE],
                emptyText: "Nothing here.",
            });

            expect([
                root.querySelector<HTMLElement>(".av-app")?.dataset.phase,
                text(root.querySelector(".av-empty-text")),
                [...root.querySelectorAll(".av-empty-actions button")].map(text),
                root.querySelector(".av-list")?.getAttribute("role"),
            ]).toEqual(["empty", "Nothing here.", [ADD.label, PRUNE.label], null]);
        });

        it("drop the tab panel's role when a catalog empties", () => {
            const { root, arrive } = mountedView(CATALOG);

            arrive({ revision: 11, groups: [], actions: [], emptyText: "Nothing here." });
            const list = root.querySelector(".av-list")!;

            expect([
                list.getAttribute("role"),
                list.getAttribute("aria-labelledby"),
                list.getAttribute("aria-label"),
            ]).toEqual([null, null, "Add-ons"]);
        });

        it("leave the word to the problem of a catalog that could not be read", () => {
            const { root } = mountedView({
                revision: 1,
                groups: [],
                actions: [],
                problem: "Could not list the add-ons.",
            });

            expect([
                root.querySelector<HTMLElement>(".av-app")?.dataset.phase,
                text(root.querySelector(".av-catalog-problem")),
                root.querySelector(".av-empty"),
            ]).toEqual(["failed", "Could not list the add-ons.", null]);
        });

        it("say the core's text in a workspace tab without folders", () => {
            const { root } = mountedView({
                ...CATALOG,
                groups: [MARKETPLACES],
                emptyText: "Open a folder.",
            });

            expect(text(root.querySelector(".av-empty-text"))).toBe("Open a folder.");
        });

        it("offer Add marketplace… in a marketplaces tab without one", () => {
            const { root, tab } = mountedView({
                ...CATALOG,
                groups: [FOLDER],
                actions: [ADD, UPDATE, PRUNE],
            });

            tab("Marketplaces").click();

            expect([
                text(root.querySelector(".av-empty-text")),
                [...root.querySelectorAll(".av-empty-actions button")].map(text),
            ]).toEqual(["No marketplaces registered yet.", [ADD.label]]);
        });

        it("show unreadable marketplaces' problem in their own tab", () => {
            const { root, tab } = mountedView({
                ...CATALOG,
                groups: [
                    FOLDER,
                    { ...MARKETPLACES, problem: "Could not read the marketplaces.", sources: [] },
                ],
            });

            tab("Marketplaces").click();

            expect(text(root.querySelector(".av-group-problem"))).toBe(
                "Could not read the marketplaces.",
            );
        });

        it("show a source without rows as a plain header with its problem", () => {
            const broken = {
                ...MARKETPLACE_SOURCE,
                id: "marketplace:broken",
                label: "broken",
                problem: "404.",
                addOns: [],
            };
            const { root, tab, head } = mountedView({
                ...CATALOG,
                groups: [FOLDER, { ...MARKETPLACES, sources: [MARKETPLACE_SOURCE, broken] }],
            });

            tab("Marketplaces").click();

            expect([
                head("marketplace:broken"),
                text(root.querySelector(".av-source-problem")),
            ]).toEqual([null, "404."]);
        });
    });

    describe("the drill-down of a narrow view", () => {
        it("opens the detail in the list's place, at the top, with focus on its heading", () => {
            const { row, root, layout } = mountedView(CATALOG, { narrow: true });
            layout.pageTop = 120;

            row(PALETTE.name).click();

            expect([
                root.querySelector<HTMLElement>(".av-app")?.dataset.pane,
                layout.scrolledTo.at(-1),
                document.activeElement,
            ]).toEqual(["detail", 0, root.querySelector(".av-detail-name")]);
        });

        it("goes back to the list where it was, with focus on the row", () => {
            const { row, root, layout, button } = mountedView(CATALOG, { narrow: true });
            layout.pageTop = 120;
            row(PALETTE.name).click();

            button("Back").click();

            expect([
                root.querySelector<HTMLElement>(".av-app")?.dataset.pane,
                layout.scrolledTo.at(-1),
                document.activeElement,
            ]).toEqual(["list", 120, row(PALETTE.name)]);
        });

        it("goes back to the list when a push removes the add-on it shows", () => {
            const { row, root, arrive } = mountedView(CATALOG, { narrow: true });
            row(PALETTE.name).click();

            arrive(without(PALETTE.id));

            expect(root.querySelector<HTMLElement>(".av-app")?.dataset.pane).toBe("list");
        });

        it("goes back to the list start when the selected row is gone", () => {
            const { row, root, button, session } = mountedView(CATALOG, { narrow: true });
            row(PALETTE.name).click();
            session.dispatch({ kind: "queryChanged", query: "nothing like this" });

            button("Back").click();

            expect(document.activeElement).toBe(root.querySelector(".av-list [data-focus]"));
        });

        it("keeps the list's place in a wide view", () => {
            const { row, layout } = mountedView(CATALOG);
            row(PALETTE.name).focus();

            row(PALETTE.name).click();

            expect([layout.scrolledTo, document.activeElement]).toEqual([[], row(PALETTE.name)]);
        });
    });

    describe("a reveal", () => {
        const reveal = (addOnId: string, revealId = 1) => ({
            kind: "revealArrived" as const,
            reveal: { revealId, addOnIds: [addOnId] },
        });

        it("switches the tab, clears a hiding filter, rings and focuses the row", () => {
            vi.useFakeTimers();
            vi.spyOn(document, "hasFocus").mockReturnValue(true);
            const { session, root, row, type, head, layout, search } = mountedView(CATALOG);
            type("palette");

            session.dispatch(reveal(MAIL.id));
            const ringed = row(MAIL.name).classList.contains("av-revealed");
            vi.advanceTimersByTime(2400);

            expect([
                root.querySelector("[aria-selected=true]")?.textContent?.startsWith("Marketplaces"),
                search().value,
                head(MARKETPLACE_SOURCE.id)?.getAttribute("aria-expanded"),
                ringed,
                document.activeElement,
                layout.scrolledIntoView,
                root.querySelectorAll(".av-revealed").length,
            ]).toEqual([true, "", "true", true, row(MAIL.name), [row(MAIL.name)], 0]);
        });

        it("focuses the detail's heading in a narrow view", () => {
            vi.spyOn(document, "hasFocus").mockReturnValue(true);
            const { session, root, layout } = mountedView(CATALOG, { narrow: true });

            session.dispatch(reveal(ACME.id));

            expect([
                document.activeElement,
                layout.scrolledTo.at(-1),
                root.querySelector(".av-detail-head.av-revealed") !== null,
            ]).toEqual([root.querySelector(".av-detail-name"), 0, true]);
        });

        it("leaves focus to the host while the page has none", () => {
            vi.spyOn(document, "hasFocus").mockReturnValue(false);
            const { session, root } = mountedView(CATALOG);

            session.dispatch(reveal(ACME.id));

            expect(root.contains(document.activeElement)).toBe(false);
        });
    });

    describe("focus from the host", () => {
        it("goes to the selected row", () => {
            const { view, row } = mountedView(CATALOG);

            view.focusFromOutside();

            expect(document.activeElement).toBe(row(RESIZE.name));
        });

        it("goes to the detail's heading in a narrow view that shows it", () => {
            const { view, row, root } = mountedView(CATALOG, { narrow: true });
            row(PALETTE.name).click();
            document.querySelector<HTMLElement>("#outside")!.focus();

            view.focusFromOutside();

            expect(document.activeElement).toBe(root.querySelector(".av-detail-name"));
        });

        it("goes to the tab when nothing is selected", () => {
            const { view, type, tab } = mountedView(CATALOG);
            type("nothing like this");
            document.querySelector<HTMLElement>("#outside")!.focus();

            view.focusFromOutside();

            expect(document.activeElement).toBe(tab("Workspace"));
        });

        it("stays where it is inside the view", () => {
            const { view, chip } = mountedView(CATALOG);
            chip("Plugins").focus();

            view.focusFromOutside();

            expect(document.activeElement).toBe(chip("Plugins"));
        });

        it("goes nowhere in an empty catalog", () => {
            const { view, root } = mountedView({ revision: 1, groups: [], actions: [] });

            view.focusFromOutside();

            expect(root.contains(document.activeElement)).toBe(false);
        });
    });

    describe("focus after an action", () => {
        it("returns to the row after an allow, never to the button that replaced Allow", () => {
            const { button, session, row, arrive } = mountedView(CATALOG);
            button("Allow this content").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(
                withRevision(
                    11,
                    changed(RESIZE.id, {
                        state: "approved",
                        review: undefined,
                        actions: [{ kind: "revoke", label: "Revoke" }],
                    }),
                ),
            );

            expect(document.activeElement).toBe(row(RESIZE.name));
        });

        it("goes to the review a read offers", () => {
            const { row, button, session, arrive, root } = mountedView(CATALOG);
            row(ACME.name).click();
            button("Review…").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(
                withRevision(
                    11,
                    changed(ACME.id, {
                        review: RESIZE.review,
                        actions: [{ kind: "allow", label: "Allow this content" }],
                    }),
                ),
            );

            expect(document.activeElement).toBe(root.querySelector(".av-review-toggle"));
        });

        it("stays on a switch that takes its own place", () => {
            const { tab, head, row, button, session, arrive } = mountedView(CATALOG);
            tab("Marketplaces").click();
            head(MARKETPLACE_SOURCE.id)!.click();
            row(MAIL.name).click();
            button("Disable").focus();
            button("Disable").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(
                withRevision(
                    11,
                    changed(MAIL.id, {
                        state: "disabled",
                        actions: [{ kind: "enable", label: "Enable" }],
                    }),
                ),
            );

            expect(document.activeElement).toBe(button("Enable"));
        });

        it("returns to a source's menu button after a switch from its menu", () => {
            const { tab, button, session } = mountedView(CATALOG);
            tab("Marketplaces").click();
            button("Source actions: /shared").click();
            button("Disable templates").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });

            expect(document.activeElement).toBe(button("Source actions: /shared"));
        });

        it("returns to a marketplaces button after its catalog action", () => {
            const { tab, button, session } = mountedView({ ...CATALOG, actions: [ADD, UPDATE] });
            tab("Marketplaces").click();
            button(UPDATE.label).click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });

            expect(document.activeElement).toBe(button(UPDATE.label));
        });

        it("goes to the list's first control when the forgotten row leaves nothing to select", () => {
            const lone = {
                ...CATALOG,
                groups: [
                    { ...FOLDER, sources: [{ ...CONFIG_SOURCE, addOns: [PALETTE] }] },
                    MARKETPLACES,
                ],
            };
            const { button, session, arrive, root } = mountedView(lone);
            button("Revoke").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(withRevision(11, without(PALETTE.id, lone)));

            expect(document.activeElement).toBe(root.querySelector(".av-list [data-focus]"));
        });
    });

    describe("focus a render took away", () => {
        it("moves to the add-on selected in its place when a push removes the focused row", () => {
            const { row, arrive } = mountedView(CATALOG);
            row(PALETTE.name).click();
            row(PALETTE.name).focus();

            arrive(withRevision(11, without(PALETTE.id)));

            expect(document.activeElement).toBe(row(RESIZE.name));
        });

        it("moves to the add-on selected in its place when a revoke's answer comes before the push", () => {
            const { row, button, session, arrive, detailName } = mountedView(CATALOG);
            row(PALETTE.name).click();
            button("Revoke").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(withRevision(11, without(PALETTE.id)));

            expect([document.activeElement, detailName()]).toEqual([row(RESIZE.name), RESIZE.name]);
        });

        it("moves to the tab when the list has no control left", () => {
            const { row, arrive, tab } = mountedView(CATALOG);
            row(PALETTE.name).focus();

            arrive({ ...CATALOG, revision: 11, groups: [MARKETPLACES] });

            expect(document.activeElement).toBe(tab("Workspace"));
        });
    });
});
