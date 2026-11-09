import { afterEach, describe, expect, it, vi } from "vitest";

import { AddOnRequestCommand } from "@miragon/bpmn-modeler-shared";

import {
    ACME,
    CATALOG,
    MAIL,
    MARKETPLACE_SOURCE,
    PALETTE,
    RESIZE,
    withRevision,
} from "../../__fixtures__/catalogs";
import { mountedView } from "../../__fixtures__/mountedView";

const describedBy = (element: Element) =>
    (element.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" | ");

describe("CatalogView", () => {
    describe("before the first model", () => {
        it("says it is loading and marks the outline busy", () => {
            const { root } = mountedView();
            const outline = root.querySelector(".outline")!;

            expect([outline.getAttribute("aria-busy"), outline.textContent]).toEqual([
                "true",
                "Loading…",
            ]);
        });
    });

    describe("the outline", () => {
        it("names the outline in a role that may carry a name, and points to the hint", () => {
            const { root } = mountedView(CATALOG);
            const outline = root.querySelector(".outline")!;

            expect([
                outline.getAttribute("role"),
                outline.getAttribute("aria-label"),
                describedBy(outline),
                outline.getAttribute("aria-busy"),
            ]).toEqual(["group", "Artifacts", "Press Tab for actions", "false"]);
        });

        it("heads groups and sources with disclosure buttons in headings", () => {
            const { root } = mountedView(CATALOG);
            const headers = [...root.querySelectorAll("h2 > button, h3 > button")];

            expect(
                headers.map((each) => [
                    each.parentElement!.tagName,
                    each.textContent,
                    each.getAttribute("aria-expanded"),
                    document.getElementById(each.getAttribute("aria-controls")!)?.hidden,
                ]),
            ).toEqual([
                ["H2", "work", "true", false],
                ["H3", ".camunda", "true", false],
                ["H3", "node_modules", "true", false],
                ["H2", "Marketplaces", "true", false],
                ["H3", "/shared", "false", true],
            ]);
        });

        it("lists add-ons as list items named by the add-on and described by the core's texts", () => {
            const { head } = mountedView(CATALOG);
            const row = head("Resize Tasks");

            expect([
                row.tagName,
                document.getElementById(row.getAttribute("aria-labelledby")!)?.textContent,
            ]).toEqual(["LI", "Resize Tasks"]);
            expect(describedBy(row)).toContain("BPMN plugin");
            expect(describedBy(row)).toContain("Not allowed yet");
        });

        it("gives exactly one head a tab stop", () => {
            const { root } = mountedView(CATALOG);

            expect(
                [...root.querySelectorAll('[data-head][tabindex="0"]')].map(
                    (each) => each.textContent,
                ),
            ).toEqual(["work"]);
        });

        it("describes each button by the row it acts on", () => {
            const { head, button } = mountedView(CATALOG);

            expect(describedBy(button("Revoke", head("Palette")))).toBe("Palette");
        });
    });

    describe("a row to review", () => {
        it("opens the review, lists its facts and ends it with Allow", () => {
            const { head } = mountedView(CATALOG);
            const review = head("Resize Tasks").querySelector(".review")!;
            const toggle = review.querySelector("button")!;

            expect([toggle.textContent, toggle.getAttribute("aria-expanded")]).toEqual([
                "Review Resize Tasks before you allow it",
                "true",
            ]);
            expect(review.querySelector("[role=note]")?.textContent).toBe(
                "Plugin risk. Allow it only if you trust it.",
            );
            expect([...review.querySelectorAll("dt, dd")].map((each) => each.textContent)).toEqual([
                "Folder",
                ".camunda/plugins/resize",
                "Content hash",
                "ab12",
            ]);
            expect([...review.querySelectorAll("button")].at(-1)?.textContent).toBe(
                "Allow this content",
            );
        });

        it("puts no Allow on the row line", () => {
            const { head } = mountedView(CATALOG);

            expect(head("Resize Tasks").querySelector(".row-line .actions")?.textContent).toBe("");
        });

        it("asks the host to allow the content shown when Allow is clicked", () => {
            const { host, button } = mountedView(CATALOG);

            button("Allow this content").click();

            expect(host.posted.at(-1)).toEqual(
                new AddOnRequestCommand(1, { kind: "allow", addOnId: RESIZE.id, revision: 10 }),
            );
        });

        it("closes the review on its disclosure", () => {
            const { button } = mountedView(CATALOG);
            const toggle = button("Review Resize Tasks before you allow it");

            toggle.click();

            const reopened = button("Review Resize Tasks before you allow it");
            expect([
                reopened.getAttribute("aria-expanded"),
                document.getElementById(reopened.getAttribute("aria-controls")!)?.hidden,
            ]).toEqual(["false", true]);
        });
    });

    describe("while a request is in flight", () => {
        it("marks the row busy and its buttons disabled for assistive technology, keeping them focusable", () => {
            const { head, button } = mountedView(CATALOG);

            button("Revoke", head("Palette")).click();

            const row = head("Palette");
            expect([
                row.getAttribute("aria-busy"),
                button("Revoke", row).getAttribute("aria-disabled"),
                button("Revoke", row).disabled,
            ]).toEqual(["true", "true", false]);
        });
    });

    describe("the catalog's own parts", () => {
        it("offers the catalog's actions in a named toolbar", () => {
            const { root } = mountedView(CATALOG);
            const toolbar = root.querySelector("[role=toolbar]")!;

            expect([
                toolbar.getAttribute("aria-label"),
                [...toolbar.querySelectorAll("button")].map((each) => each.textContent),
            ]).toEqual(["Artifacts actions", ["Add marketplace…", "Remove unused plugin copies"]]);
        });

        it("shows why the catalog could not be read", () => {
            const { root } = mountedView({ ...CATALOG, problem: "Could not list the add-ons." });

            expect(root.querySelector(".catalog-problem")?.textContent).toBe(
                "Could not list the add-ons.",
            );
        });

        it("says when nothing is listed and keeps the toolbar", () => {
            const { root } = mountedView({ ...CATALOG, groups: [], emptyText: "Open a folder." });

            expect([
                root.querySelector(".empty")?.textContent,
                root.querySelectorAll("[role=toolbar] button").length,
            ]).toEqual(["Open a folder.", 2]);
        });

        it("shows a result in a status banner the user can dismiss", () => {
            const { session, root, button } = mountedView(CATALOG);
            session.dispatch({ kind: "actionChosen", actionKind: "pruneCache" });
            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "done", message: "Removed 2 copies." },
            });
            const status = root.querySelector("[role=status]")!;
            const before = status.textContent;

            button("Dismiss", root.querySelector(".banner-status")!).click();

            expect([before, status.textContent]).toEqual(["Removed 2 copies.", ""]);
        });

        it("shows a refusal in an alert", () => {
            const { session, root } = mountedView(CATALOG);
            session.dispatch({ kind: "actionChosen", actionKind: "pruneCache" });
            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "refused", reason: "staleView", message: "Stale." },
            });

            expect(root.querySelector("[role=alert]")?.textContent).toBe("Stale.");
        });
    });

    describe("templates and sources", () => {
        it("offers a marketplace's actions on its header line and a template's switch on its row", () => {
            const { root, head, session } = mountedView(CATALOG);
            session.dispatch({ kind: "toggled", key: MARKETPLACE_SOURCE.id });
            const source = root.querySelector('[data-source="marketplace:shared"]')!;

            expect(
                [...source.querySelectorAll(":scope > .source-line .actions button")].map(
                    (each) => each.textContent,
                ),
            ).toEqual(["Remove", "Disable templates"]);
            expect(head("Mail").querySelector(".actions")?.textContent).toBe("Disable");
        });
    });

    it("renders workspace text as text, never as markup", () => {
        const { root } = mountedView({
            ...CATALOG,
            groups: [
                {
                    ...CATALOG.groups[0],
                    sources: [
                        {
                            ...CATALOG.groups[0].sources[0],
                            addOns: [{ ...PALETTE, name: '<img src=x onerror="alert(1)">' }],
                        },
                    ],
                },
            ],
        });

        expect([root.querySelectorAll("img").length, root.textContent]).toEqual([
            0,
            expect.stringContaining("<img src=x"),
        ]);
    });

    it("keeps the element of a row whose view did not change", () => {
        const { head, session } = mountedView(CATALOG);
        const before = head("Palette");
        const changedBefore = head("bpmnlint-plugin-acme");

        session.dispatch({
            kind: "modelArrived",
            model: withRevision(11, {
                ...CATALOG,
                groups: [
                    {
                        ...CATALOG.groups[0],
                        sources: [
                            CATALOG.groups[0].sources[0],
                            {
                                ...CATALOG.groups[0].sources[1],
                                addOns: [{ ...ACME, stateText: "Changed" }],
                            },
                        ],
                    },
                    CATALOG.groups[1],
                ],
            }),
        });

        expect([
            head("Palette") === before,
            head("bpmnlint-plugin-acme") === changedBefore,
        ]).toEqual([true, false]);
    });

    describe("focus", () => {
        it("does not take focus the page does not hold", () => {
            const { session } = mountedView(CATALOG);
            const outside = document.getElementById("outside")!;
            outside.focus();

            session.dispatch({ kind: "toggled", key: "folder:/work" });
            session.dispatch({ kind: "modelArrived", model: withRevision(11) });

            expect(document.activeElement).toBe(outside);
        });

        it("leaves focus outside the page when an allow it asked for is done", () => {
            const { session, button } = mountedView(CATALOG);
            button("Allow this content").click();
            const outside = document.getElementById("outside")!;
            outside.focus();

            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "done", message: "Allowed." },
            });

            expect(document.activeElement).toBe(outside);
        });

        describe("on a reveal while focus is outside the page", () => {
            afterEach(() => vi.restoreAllMocks());

            it.each([
                { window: "has focus", hasFocus: true, lands: "Mail" },
                { window: "does not have focus", hasFocus: false, lands: "Outside" },
            ])("lands on $lands when the window $window", ({ hasFocus, lands }) => {
                const { session } = mountedView(CATALOG);
                document.getElementById("outside")!.focus();
                vi.spyOn(document, "hasFocus").mockReturnValue(hasFocus);

                session.dispatch({
                    kind: "revealArrived",
                    reveal: { revealId: 1, addOnIds: [MAIL.id] },
                });

                const focused = document.activeElement!;
                expect(focused.querySelector(".name")?.textContent ?? focused.textContent).toBe(
                    lands,
                );
            });
        });

        it("returns to the row after an allow, not to the button that replaced Allow", () => {
            const { session, button, head } = mountedView(CATALOG);
            button("Allow this content").focus();
            button("Allow this content").click();

            session.dispatch({
                kind: "resultArrived",
                requestId: 1,
                result: { kind: "done", message: "Allowed." },
            });

            expect(document.activeElement).toBe(head("Resize Tasks"));
        });

        it("keeps focus on its row when a push replaces the row's element", () => {
            const { session, head } = mountedView(CATALOG);
            head("Palette").focus();

            session.dispatch({
                kind: "modelArrived",
                model: withRevision(11, {
                    ...CATALOG,
                    groups: [
                        {
                            ...CATALOG.groups[0],
                            sources: [
                                {
                                    ...CATALOG.groups[0].sources[0],
                                    addOns: [{ ...PALETTE, stateText: "Now" }, RESIZE],
                                },
                                CATALOG.groups[0].sources[1],
                            ],
                        },
                        CATALOG.groups[1],
                    ],
                }),
            });

            expect(document.activeElement).toBe(head("Palette"));
        });

        it("lands on a revealed row, its ancestors open", () => {
            const { session, head } = mountedView(CATALOG);
            head("work").focus();

            session.dispatch({
                kind: "revealArrived",
                reveal: { revealId: 1, addOnIds: [MAIL.id] },
            });

            expect([document.activeElement, head("Mail").getAttribute("tabindex")]).toEqual([
                head("Mail"),
                "0",
            ]);
        });

        it("focuses the active head when the window gets focus and nothing inside has it", () => {
            const { view, head } = mountedView(CATALOG);
            document.getElementById("outside")!.blur();

            view.focusActiveHeadFromOutside();

            expect(document.activeElement).toBe(head("work"));
        });
    });
});
