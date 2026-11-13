import type { AddOnCatalogPayload, CodeAddOnPayload } from "@miragon/bpmn-modeler-shared";
import { AddOnRequestCommand, OpenAddOnDetailCommand } from "@miragon/bpmn-modeler-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ACME,
    CATALOG,
    CONFIG_SOURCE,
    MAIL,
    MARKETPLACE_SOURCE,
    PACKAGES_SOURCE,
    PALETTE,
    RESIZE,
    without,
    withRevision,
} from "../../__fixtures__/catalogs";
import { mountedView } from "../../__fixtures__/mountedView";

const ADD = { kind: "addMarketplace", label: "Add marketplace…" } as const;
const UPDATE = { kind: "updateMarketplaces", label: "Update marketplaces" } as const;
const PRUNE = { kind: "pruneCache", label: "Remove unused plugin copies" } as const;

const FOLDER = CATALOG.groups[0]!;
const MARKETPLACES = CATALOG.groups[1]!;

const OTHER_PALETTE = {
    ...PALETTE,
    id: "plugin:/other/.camunda/plugins/palette",
    name: "Other Palette",
};
const OTHER_FOLDER = {
    id: "folder:/other",
    kind: "folder" as const,
    label: "other",
    description: "/other",
    sources: [{ ...CONFIG_SOURCE, id: "config:/other/.camunda", addOns: [OTHER_PALETTE] }],
};
/** Two folders: each shows its own header under Installed. */
const TWO_FOLDERS: AddOnCatalogPayload = {
    ...CATALOG,
    groups: [FOLDER, OTHER_FOLDER, MARKETPLACES],
};

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
        it("lists Needs attention first, then Installed, and selects the first add-on to review", () => {
            const { root, rowNames, row, detailName, sectionLabels, head } = mountedView(CATALOG);
            const list = root.querySelector(".av-list")!;

            expect([
                sectionLabels(),
                rowNames(),
                row(RESIZE.name).getAttribute("aria-current"),
                detailName(),
                list.getAttribute("aria-label"),
                list.getAttribute("aria-busy"),
                head(FOLDER.id),
            ]).toEqual([
                ["Needs attention", "Installed"],
                [RESIZE.name, ACME.name, PALETTE.name],
                "true",
                RESIZE.name,
                "Add-ons",
                null,
                null,
            ]);
        });

        it("says in the header line what waits and what is not loaded", () => {
            const { root } = mountedView(changed(PALETTE.id, { problem: "Broken." }));

            expect(text(root.querySelector(".av-summary"))).toBe("2 waiting · 1 not loaded");
        });

        it("names each row's kind for a screen reader, its status by word, and stays quiet when settled", () => {
            const { row } = mountedView(changed(PALETTE.id, { problem: "Broken." }));
            const settled = mountedView(CATALOG).row(PALETTE.name);

            expect([
                text(row(RESIZE.name).querySelector(".av-vh")),
                text(row(RESIZE.name).querySelector(".av-status-word")),
                text(row(PALETTE.name).querySelector(".av-status-word")),
                text(row(ACME.name).querySelector(".av-vh")),
                settled.querySelector(".av-status"),
            ]).toEqual(["Plugin, ", "Waiting", "Not loaded", "Rule package, ", null]);
        });

        it("says where a row of Needs attention sits, and only its detail below", () => {
            const { row } = mountedView(CATALOG);

            expect([
                text(row(RESIZE.name).querySelector(".av-row-detail")),
                row(PALETTE.name).querySelector(".av-row-detail"),
            ]).toEqual([`${RESIZE.detail} · ${CONFIG_SOURCE.label}`, null]);
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

        it("closes a source and keeps its count and summary in its header", () => {
            const { head, rowNames, events } = mountedView(CATALOG);
            head(CONFIG_SOURCE.id)!.focus();

            head(CONFIG_SOURCE.id)!.click();
            const closed = head(CONFIG_SOURCE.id)!;

            expect([
                closed.getAttribute("aria-expanded"),
                rowNames(),
                text(closed.querySelector(".ds-count")),
                closed.querySelectorAll(".av-dot").length,
                text(closed.querySelector(".av-head-summary .av-vh")),
                events.at(-1),
                document.activeElement,
            ]).toEqual([
                "false",
                [RESIZE.name, ACME.name],
                "1",
                0,
                ", 1 add-on",
                { kind: "toggled", key: CONFIG_SOURCE.id },
                closed,
            ]);
        });

        it("keeps a source whose rows all wait above, with its header", () => {
            const { head } = mountedView(CATALOG);

            expect(head(PACKAGES_SOURCE.id)).toBeNull();
            expect(
                [...document.querySelectorAll(".av-source-label")].map((each) => each.textContent),
            ).toContain(PACKAGES_SOURCE.label);
        });

        it("names a folder's and a source's path in their tooltip only", () => {
            const { head } = mountedView(TWO_FOLDERS);

            expect([
                head(FOLDER.id)?.title,
                head(FOLDER.id)?.querySelector(".av-group-text .av-vh"),
                head(CONFIG_SOURCE.id)?.title,
            ]).toEqual([FOLDER.description, null, CONFIG_SOURCE.description]);
        });

        it.each([
            { case: "one folder", model: CATALOG, levels: ["H2", "H2", "H3", "H3", "H2", "H3"] },
            {
                case: "two folders",
                model: TWO_FOLDERS,
                levels: ["H2", "H2", "H3", "H4", "H4", "H3", "H4", "H2", "H3"],
            },
        ])("nests its headings by section with $case", ({ model, levels }) => {
            const { root } = mountedView(model);

            expect(
                [...root.querySelectorAll(".av-list h2, .av-list h3, .av-list h4")].map(
                    ({ tagName }) => tagName,
                ),
            ).toEqual(levels);
        });

        it("shows a header per folder once there are two, and closes a folder with all of its sources", () => {
            const { head, rowNames } = mountedView(TWO_FOLDERS);

            head(FOLDER.id)!.click();

            expect(rowNames()).toEqual([RESIZE.name, ACME.name, OTHER_PALETTE.name]);
        });

        it("keeps a folder's problem in sight while the folder is closed", () => {
            const model = {
                ...TWO_FOLDERS,
                groups: [
                    { ...FOLDER, problem: "Could not read the folder." },
                    ...TWO_FOLDERS.groups.slice(1),
                ],
            };
            const { root, head } = mountedView(model);

            head(FOLDER.id)!.click();

            expect(text(root.querySelector(".av-group-problem"))).toBe(
                "Could not read the folder.",
            );
        });

        it("shows the catalog's problem above its sections", () => {
            const { root } = mountedView({ ...CATALOG, problem: "Could not read it again." });

            expect(text(root.querySelector(".av-catalog-problem"))).toBe(
                "Could not read it again.",
            );
        });
    });

    describe("the marketplaces", () => {
        it("follow Installed as a group whose marketplaces start closed, with their actions only in the menu", () => {
            const { root, head, button } = mountedView({
                ...CATALOG,
                actions: [ADD, UPDATE, PRUNE],
            });

            expect([
                text(head(MARKETPLACES.id)?.querySelector(".av-group-label")),
                head(MARKETPLACE_SOURCE.id)?.getAttribute("aria-expanded"),
                root.querySelectorAll(".av-list .ds-btn-secondary").length,
                button("More actions") !== undefined,
            ]).toEqual([MARKETPLACES.label, "false", 0, true]);
        });

        it("are left out while none is registered", () => {
            const { head } = mountedView({
                ...CATALOG,
                groups: [FOLDER, { ...MARKETPLACES, sources: [] }],
            });

            expect(head(MARKETPLACES.id)).toBeNull();
        });

        it("show a marketplace's template once the user opens it", () => {
            const { head, rowNames } = mountedView(CATALOG);

            head(MARKETPLACE_SOURCE.id)!.click();

            expect(rowNames()).toEqual([RESIZE.name, ACME.name, PALETTE.name, MAIL.name]);
        });
    });

    describe("search and filters", () => {
        it("show All and each kind as segments with their counts, All chosen first", () => {
            const { segment } = mountedView(CATALOG);

            expect(
                ["All", "Plugins", "Rule packages", "Templates"].map((name) => [
                    text(segment(name).querySelector(".av-kind-label")),
                    text(segment(name).querySelector(".av-kind-count")),
                    segment(name).getAttribute("aria-checked"),
                    segment(name).tabIndex,
                ]),
            ).toEqual([
                ["All", "4", "true", 0],
                ["Plugins", "2", "false", -1],
                ["Lint", "1", "false", -1],
                ["Templates", "1", "false", -1],
            ]);
        });

        it("keep the matches of a chosen kind, count what waits of it and announce how many", () => {
            const { chooseKind, rowNames, segment, root } = mountedView(CATALOG);

            chooseKind("Rule packages");

            expect([
                rowNames(),
                segment("Rule packages").getAttribute("aria-checked"),
                segment("All").getAttribute("aria-checked"),
                text(root.querySelector(".av-summary")),
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual([[ACME.name], "true", "false", "1 waiting", "1 add-on shown"]);
        });

        it("move through the segments with the arrow keys, Home and End, choosing as focus moves", () => {
            const { segment, press, events } = mountedView(CATALOG);
            segment("All").focus();
            const visited: (string | null)[] = [];

            for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home"]) {
                press(key);
                visited.push(document.activeElement?.getAttribute("title") ?? null);
            }

            expect([visited, events.at(-1)]).toEqual([
                ["Plugins", "Rule packages", "Plugins", "Templates", "All"],
                { kind: "kindChosen" },
            ]);
        });

        it("let the user close a source while filtering, summed up over its matches", () => {
            const { type, head, rowNames, search } = mountedView(CATALOG);
            type("palette");
            head(CONFIG_SOURCE.id)!.focus();

            head(CONFIG_SOURCE.id)!.click();
            const closed = head(CONFIG_SOURCE.id)!;

            expect([
                closed.getAttribute("aria-expanded"),
                rowNames(),
                text(closed.querySelector(".ds-count")),
                search().value,
                document.activeElement,
            ]).toEqual(["false", [], "1", "palette", closed]);
        });

        it("let the user close a folder while filtering, and keep it closed as the query grows", () => {
            const { type, head, rowNames } = mountedView(TWO_FOLDERS);
            type("pa");

            head(FOLDER.id)!.click();
            type("pal");

            expect([head(FOLDER.id)?.getAttribute("aria-expanded"), rowNames()]).toEqual([
                "false",
                [OTHER_PALETTE.name],
            ]);
        });

        it("restore the user's own layout once the filter is cleared", () => {
            const { type, head, button, rowNames } = mountedView(CATALOG);
            head(MARKETPLACE_SOURCE.id)!.click();
            type("palette");
            head(CONFIG_SOURCE.id)!.click();
            type("nothing like this");

            button("Clear search and filters").click();

            expect([
                head(CONFIG_SOURCE.id)?.getAttribute("aria-expanded"),
                head(MARKETPLACE_SOURCE.id)?.getAttribute("aria-expanded"),
                rowNames(),
            ]).toEqual(["true", "true", [RESIZE.name, ACME.name, PALETTE.name, MAIL.name]]);
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

        it("open the search field from its button, focus it, and close it with Escape when empty", () => {
            const { root, button, search, press } = mountedView(CATALOG);
            const toggle = button("Search add-ons");
            const row = root.querySelector<HTMLElement>(".av-search-row")!;
            const closedAtFirst = [row.hidden, toggle.getAttribute("aria-expanded")];

            toggle.click();
            const opened = [
                row.hidden,
                toggle.getAttribute("aria-expanded"),
                document.activeElement,
            ];
            press("Escape", search());

            expect([closedAtFirst, opened, row.hidden, document.activeElement]).toEqual([
                [true, "false"],
                [false, "true", search()],
                true,
                toggle,
            ]);
        });

        it("close the field and drop its query from the search button", () => {
            const { root, type, button, search } = mountedView(CATALOG);
            type("acme");

            button("Search add-ons").click();

            expect([
                root.querySelector<HTMLElement>(".av-search-row")!.hidden,
                search().value,
                document.activeElement,
            ]).toEqual([true, "", button("Search add-ons")]);
        });

        it("keep the field open while it holds a query", () => {
            const { root, type } = mountedView(CATALOG);

            type("acme");

            expect(root.querySelector<HTMLElement>(".av-search-row")!.hidden).toBe(false);
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

        it("clear the query with Escape before closing the field", () => {
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
            const { type, chooseKind, segment, root, button, rowNames, row } = mountedView(CATALOG);
            chooseKind("Templates");
            type("nothing like this");

            const said = text(root.querySelector(".av-empty-text"));
            const announced = text(root.querySelector("[aria-live=polite].av-vh"));
            button("Clear search and filters").click();

            expect([
                said,
                announced,
                rowNames().length,
                segment("All").getAttribute("aria-checked"),
            ]).toEqual([
                "No add-ons match your search and filters.",
                "No add-ons match your search and filters.",
                3,
                "true",
            ]);
            expect(row(RESIZE.name)).toBeDefined();
        });

        it("focus the list's first row after clearing", () => {
            const { type, button, row } = mountedView(CATALOG);
            type("nothing like this");

            button("Clear search and filters").click();

            expect(document.activeElement).toBe(row(RESIZE.name));
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
                    { label: "Allowed in", value: "every worktree of /work" },
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

        it("shows the review open, with its heading, warning, facts and Allow at its end", () => {
            const { root } = mountedView(changed(RESIZE.id, reviewed));
            const review = root.querySelector(".av-review")!;
            const allow = review.querySelector<HTMLElement>(".av-review-end button")!;
            const warning = review.querySelector(".av-box-warning .av-box-text")!;

            expect([
                review.querySelector("button[aria-expanded]"),
                text(review.querySelector("h3")),
                text(warning),
                [...review.querySelectorAll("dt")].map(text),
                [...review.querySelectorAll("dd")].map(text),
                text(allow),
                allow.getAttribute("aria-describedby"),
                warning.compareDocumentPosition(allow) & Node.DOCUMENT_POSITION_FOLLOWING,
            ]).toEqual([
                null,
                RESIZE.review!.heading,
                RESIZE.review!.warning,
                ["Folder", "Allowed in"],
                [".camunda/plugins/resize", "every worktree of /work"],
                "Allow",
                warning.id,
                Node.DOCUMENT_POSITION_FOLLOWING,
            ]);
        });

        it("leads the state line with Not loaded when a problem keeps the add-on from running", () => {
            const { root, row } = mountedView(changed(PALETTE.id, { problem: "Broken." }));
            row(PALETTE.name).click();
            const line = root.querySelector(".av-state-line")!;

            expect([
                [...line.querySelectorAll(".av-state-word")].map(text),
                line.querySelector(".av-sep")?.getAttribute("aria-hidden"),
                line.classList.contains("av-tone-danger"),
            ]).toEqual([["Not loaded", PALETTE.stateText], "true", true]);
        });

        it("rebuilds no detail when a header in the list opens or closes", () => {
            const { root, head } = mountedView(CATALOG);
            const card = root.querySelector(".av-detail-card");

            head(CONFIG_SOURCE.id)!.click();

            expect(root.querySelector(".av-detail-card")).toBe(card);
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

            button("Allow").click();

            expect([
                host.posted.at(-1),
                root.querySelector(".av-detail-card")?.getAttribute("aria-busy"),
                row(RESIZE.name).parentElement?.getAttribute("aria-busy"),
                button("Allow").getAttribute("aria-disabled"),
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
            button("Allow").click();

            button("Allow").click();

            expect(host.posted.length).toBe(1);
        });

        // The view selects an add-on whenever its list shows one, so the hint only meets an empty list.
        it("says nothing is selected, never asks to select, while the list shows no add-on", () => {
            const { type, root } = mountedView(CATALOG);

            type("nothing like this");

            expect(text(root.querySelector(".av-hint"))).toBe("No add-on selected.");
        });

        it("keeps the separators of its meta and location lines from a screen reader", () => {
            const { root } = mountedView(changed(RESIZE.id, reviewed));

            expect(
                [...root.querySelectorAll(".av-detail-card .av-sep")].map((sep) =>
                    sep.getAttribute("aria-hidden"),
                ),
            ).toEqual(["true", "true"]);
        });
    });

    describe("the result banner", () => {
        it("swaps the text of a live region that stays in the page", () => {
            const { root, button, session } = mountedView(CATALOG);
            const status = root.querySelector("[role=status]")!;
            button("Allow").click();

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
            button("Allow").click();
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
            const { button, root } = mountedView(CATALOG);

            button("Source actions: /shared").click();
            const items = [...root.querySelectorAll<HTMLElement>("[role=menu] [role=menuitem]")];

            expect([
                items.map(text),
                document.activeElement,
                button("Source actions: /shared").getAttribute("aria-expanded"),
            ]).toEqual([["Remove", "Disable templates"], items[0], "true"]);
        });

        it("move through their items with the arrow keys, Home and End", () => {
            const { button, root, press } = mountedView(CATALOG);
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
            const { button, root, press } = mountedView(CATALOG);
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
            const { button, root, press } = mountedView(CATALOG);
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
            root.querySelector<HTMLElement>(".av-section-label")!.click();
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
        it("say the core's text, offer only Add marketplace… and hide the toolbar", () => {
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
            ]).toEqual(["empty", "Nothing here.", [ADD.label]]);
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

        it("say the core's text under Installed without a folder, above the marketplaces", () => {
            const { root, head } = mountedView({
                ...CATALOG,
                groups: [MARKETPLACES],
                emptyText: "Open a folder.",
            });

            expect([
                text(root.querySelector(".av-section-text")),
                head(MARKETPLACES.id) !== null,
            ]).toEqual(["Open a folder.", true]);
        });

        it("show unreadable marketplaces' problem in their group", () => {
            const { root } = mountedView({
                ...CATALOG,
                groups: [
                    FOLDER,
                    { ...MARKETPLACES, problem: "Could not read the marketplaces.", sources: [] },
                ],
            });

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
            const { root, head } = mountedView({
                ...CATALOG,
                groups: [FOLDER, { ...MARKETPLACES, sources: [MARKETPLACE_SOURCE, broken] }],
            });

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
            reveal: { kind: "rows" as const, revealId, addOnIds: [addOnId] },
        });

        it("clears a hiding filter, opens the row's source, rings and focuses the row", () => {
            vi.useFakeTimers();
            vi.spyOn(document, "hasFocus").mockReturnValue(true);
            const { session, root, row, type, head, layout, search } = mountedView(CATALOG);
            type("palette");

            session.dispatch(reveal(MAIL.id));
            const ringed = row(MAIL.name).classList.contains("av-revealed");
            vi.advanceTimersByTime(2400);

            expect([
                search().value,
                head(MARKETPLACE_SOURCE.id)?.getAttribute("aria-expanded"),
                ringed,
                document.activeElement,
                layout.scrolledIntoView,
                root.querySelectorAll(".av-revealed").length,
            ]).toEqual(["", "true", true, row(MAIL.name), [row(MAIL.name)], 0]);
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

    describe("Review Add-ons", () => {
        const review = {
            kind: "revealArrived" as const,
            reveal: { kind: "needsReview" as const, revealId: 1 },
        };
        const SETTLED = without(ACME.id, without(RESIZE.id));

        it("clears the search and filter, focuses the first add-on to review and says how many wait", () => {
            const { session, root, chooseKind, segment, row, search, type } = mountedView(CATALOG);
            type("mail");
            chooseKind("Plugins");

            session.dispatch(review);

            expect([
                segment("All").getAttribute("aria-checked"),
                search().value,
                row(RESIZE.name).getAttribute("aria-current"),
                document.activeElement,
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual(["true", "", "true", row(RESIZE.name), "2 add-ons need review"]);
        });

        it("says nothing needs review and focuses the list's first control", () => {
            const { session, root, head } = mountedView(SETTLED);

            session.dispatch(review);

            expect([
                document.activeElement,
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual([head(CONFIG_SOURCE.id), "No add-ons need review."]);
        });

        it.each<{
            case: string;
            model: AddOnCatalogPayload;
            focused: (view: ReturnType<typeof mountedView>) => Element | null;
        }>([
            {
                case: "the first add-on to review",
                model: CATALOG,
                focused: ({ row }) => row(RESIZE.name),
            },
            {
                case: "the list's first control when nothing needs review",
                model: SETTLED,
                focused: ({ head }) => head(CONFIG_SOURCE.id),
            },
        ])("moves focus from the search box to $case", ({ model, focused }) => {
            const view = mountedView(model);
            view.type("zzz");
            view.search().focus();

            view.session.dispatch(review);

            expect([view.search().value, document.activeElement]).toEqual(["", focused(view)]);
        });

        it("closes an open menu as it moves focus to the list", () => {
            const { session, root, button, row } = mountedView(CATALOG);
            button("More actions").click();

            session.dispatch(review);

            expect([
                root.querySelectorAll("[role=menu]").length,
                button("More actions").getAttribute("aria-expanded"),
                document.activeElement,
            ]).toEqual([0, "false", row(RESIZE.name)]);
        });

        it("says nothing waits where no folder is open, beside the core's own text", () => {
            const emptyText = "Open a folder to see its add-ons.";
            const { session, root } = mountedView({
                ...CATALOG,
                groups: [MARKETPLACES],
                emptyText,
            });

            session.dispatch(review);

            expect([
                text(root.querySelector(".av-section-text")),
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual([emptyText, "No add-ons need review."]);
        });
    });

    describe("the sticky toolbar", () => {
        it("keeps the page's scroll padding at its height, so focus never lands beneath it", () => {
            const { layout } = mountedView(CATALOG, { narrow: true });

            layout.resize(".av-toolbar", 160);

            expect(document.documentElement.style.getPropertyValue("--av-sticky-top")).toBe(
                "160px",
            );
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

        it("goes to the toolbar's first button when nothing is selected", () => {
            const { view, type, button } = mountedView(CATALOG);
            type("nothing like this");
            document.querySelector<HTMLElement>("#outside")!.focus();

            view.focusFromOutside();

            expect(document.activeElement).toBe(button("Search add-ons"));
        });

        it("stays where it is inside the view", () => {
            const { view, segment } = mountedView(CATALOG);
            segment("Plugins").focus();

            view.focusFromOutside();

            expect(document.activeElement).toBe(segment("Plugins"));
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
            button("Allow").click();

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

        it("stays on a switch that takes its own place", () => {
            const { head, row, button, session, arrive } = mountedView(CATALOG);
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
            const { button, session } = mountedView(CATALOG);
            button("Source actions: /shared").click();
            button("Disable templates").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });

            expect(document.activeElement).toBe(button("Source actions: /shared"));
        });

        it("returns to the More actions button after a catalog action", () => {
            const { button, session } = mountedView({ ...CATALOG, actions: [ADD, UPDATE] });
            button("More actions").click();
            button(UPDATE.label).click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });

            expect(document.activeElement).toBe(button("More actions"));
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

            expect(document.activeElement).toBe(row(ACME.name));
        });

        it("moves to the add-on selected in its place when a revoke's answer comes before the push", () => {
            const { row, button, session, arrive, detailName } = mountedView(CATALOG);
            row(PALETTE.name).click();
            button("Revoke").click();

            session.dispatch({ kind: "resultArrived", requestId: 1, result: { kind: "done" } });
            arrive(withRevision(11, without(PALETTE.id)));

            expect([document.activeElement, detailName()]).toEqual([row(ACME.name), ACME.name]);
        });

        it("moves to the toolbar's first button when the list has no control left", () => {
            const { row, arrive, button } = mountedView(CATALOG);
            row(PALETTE.name).focus();

            arrive({
                ...CATALOG,
                revision: 11,
                groups: [{ ...MARKETPLACES, sources: [] }],
                emptyText: "Open a folder.",
            });

            expect(document.activeElement).toBe(button("Search add-ons"));
        });
    });

    describe("a list whose rows open the detail in a tab", () => {
        it("asks the host for the tab, marks the row and shows no detail of its own", () => {
            const { row, host, root } = mountedView(CATALOG, { page: "listWithTab", narrow: true });

            row(PALETTE.name).click();

            expect([
                host.posted.at(-1),
                row(PALETTE.name).getAttribute("aria-current"),
                root.querySelector<HTMLElement>(".av-app")?.dataset.pane,
            ]).toEqual([new OpenAddOnDetailCommand(PALETTE.id), "true", "list"]);
        });
    });

    describe("a detail tab's page", () => {
        it("shows only the add-on the host names, without toolbar, list or Back", () => {
            const { root, detailName, layout } = mountedView(CATALOG, {
                page: "detail",
                shows: MAIL.id,
            });
            const shown = (selector: string) => layout.isShown(root.querySelector(selector)!);

            expect([
                detailName(),
                shown(".av-toolbar"),
                shown(".av-list"),
                shown(".av-back"),
                text(root.querySelector("[aria-live=polite].av-vh")),
            ]).toEqual([MAIL.name, false, false, false, ""]);
        });

        it("says when the list no longer holds its add-on", () => {
            const { root } = mountedView(CATALOG, { page: "detail", shows: "plugin:/gone" });

            expect(text(root.querySelector(".av-hint-text"))).toBe(
                "This add-on is no longer listed.",
            );
        });

        it("returns focus to its heading after Allow, as it has no row", () => {
            const { button, session, arrive, root } = mountedView(CATALOG, {
                page: "detail",
                shows: RESIZE.id,
            });
            button("Allow").click();

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

            expect(document.activeElement).toBe(root.querySelector(".av-detail-name"));
        });
    });
});
