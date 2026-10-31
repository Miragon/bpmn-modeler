import { describe, expect, it, vi } from "vitest";

import { createTestHost, TestHostOptions } from "../../testing";
import { LocateResult } from "../domain/locateResult";
import { SearchPrompt } from "../domain/prompts";
import { LocatedFileRequest, openLocatedFile } from "./openLocatedFile";

function setup(
    result: LocateResult,
    options: Pick<TestHostOptions, "folders" | "promptAnswers"> = {},
) {
    const { notifier, picker, workspace } = createTestHost(options);
    const searches: LocateResult[] = [];
    const request: LocatedFileRequest = {
        reference: "ProcessB",
        locate: async () => {
            searches.push(result);
            return result;
        },
        searchSubject: "process",
        pickPlaceholder: "Select the file to open",
        noSearchScopeMessage: (reference) => `Nothing to search for "${reference}".`,
        notFoundMessage: (reference) => `Nothing declares "${reference}".`,
    };
    const open = (overrides: Partial<LocatedFileRequest> = {}) =>
        openLocatedFile({ ...request, ...overrides }, { notifier, picker, workspace });
    return { open, notifier, picker, searches };
}

const NOTHING_FOUND: LocateResult = { kind: "matches", paths: [], readFailures: [] };

describe("openLocatedFile", () => {
    it("runs the search behind the picker's busy list, naming the subject and reference", async () => {
        const { open, picker, searches } = setup({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await open();

        expect(picker.prompts).toEqual([
            {
                method: "searchAndChoose",
                args: [
                    expect.objectContaining({
                        id: "locateFile",
                        searchingPlaceholder: 'Searching for process "ProcessB"…',
                    }),
                ],
            },
        ]);
        // The scripted picker calls the thunk itself, so a pre-resolved result would not count.
        expect(searches).toHaveLength(1);
    });

    it("offers several matches under the request's placeholder, in workspace order", async () => {
        const several: LocateResult = {
            kind: "matches",
            paths: ["/a-repos/lib/b.bpmn", "/z-repos/app/a.bpmn"],
            readFailures: [],
        };
        const { open, picker } = setup(several, { folders: ["/z-repos/app", "/a-repos/lib"] });

        await open();

        expect(picker.prompts.map((prompt) => prompt.method)).toEqual(["searchAndChoose"]);
        const [search] = picker.prompts[0].args as [SearchPrompt<LocateResult>];
        expect(search.choices(several)).toEqual({
            id: "locatedFile",
            placeholder: "Select the file to open",
            items: [
                { label: "a.bpmn", path: "/z-repos/app/a.bpmn", value: "/z-repos/app/a.bpmn" },
                { label: "b.bpmn", path: "/a-repos/lib/b.bpmn", value: "/a-repos/lib/b.bpmn" },
            ],
        });
    });

    it("shortens a long reference in the busy-list placeholder", async () => {
        const { open, picker } = setup(NOTHING_FOUND);

        await open({ reference: "x".repeat(500) });

        expect(picker.prompts[0].args[0]).toMatchObject({
            searchingPlaceholder: `Searching for process "${"x".repeat(39)}…"…`,
        });
    });

    it("opens the file directly when the search returns a single match", async () => {
        const { open, notifier } = setup({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });

        await open();

        expect(notifier.openedDocuments).toEqual(["/a.bpmn"]);
    });

    it("opens the user's pick when the search returns multiple matches", async () => {
        const { open, notifier } = setup(
            { kind: "matches", paths: ["/a.bpmn", "/b.bpmn"], readFailures: [] },
            { promptAnswers: { locatedFile: "/b.bpmn" } },
        );

        await open();

        expect(notifier.openedDocuments).toEqual(["/b.bpmn"]);
    });

    it("does not open anything when the user dismisses the pick", async () => {
        const { open, notifier } = setup({
            kind: "matches",
            paths: ["/a.bpmn", "/b.bpmn"],
            readFailures: [],
        });

        await open();

        expect(notifier.openedDocuments).toEqual([]);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
    });

    it("tells the user nothing matched and where the search is logged", async () => {
        const { open, notifier } = setup(NOTHING_FOUND);

        await open();

        expect(notifier.infos).toEqual([
            'Nothing declares "ProcessB". (See Output → bpmn.modeler for what was searched.)',
        ]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("shows the request's no-scope message when there is nothing to search", async () => {
        const { open, notifier } = setup({ kind: "no-search-scope" });

        await open();

        expect(notifier.infos).toEqual(['Nothing to search for "ProcessB".']);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("logs each failure and shows an error when no candidate was readable", async () => {
        const { open, notifier } = setup({
            kind: "all-unreadable",
            failures: ["read /bad1 failed: EACCES", "read /bad2 failed: EACCES"],
        });

        await open();

        expect(notifier.logged("warning")).toEqual([
            "read /bad1 failed: EACCES",
            "read /bad2 failed: EACCES",
        ]);
        expect(notifier.errors).toEqual([
            'Could not search for "ProcessB" — none of the candidate files were readable.',
        ]);
        expect(notifier.openedDocuments).toEqual([]);
    });

    it("logs partial read failures alongside a successful match", async () => {
        const { open, notifier } = setup({
            kind: "matches",
            paths: ["/good.bpmn"],
            readFailures: ["read /bad failed: EACCES"],
        });

        await open();

        expect(notifier.logged("warning")).toEqual(["read /bad failed: EACCES"]);
        expect(notifier.openedDocuments).toEqual(["/good.bpmn"]);
    });

    it("surfaces an error when the file does not open", async () => {
        const { open, notifier } = setup({
            kind: "matches",
            paths: ["/a.bpmn"],
            readFailures: [],
        });
        const notFound = new Error("File not found");
        vi.spyOn(notifier, "openDocument").mockRejectedValueOnce(notFound);

        await open();

        expect(notifier.errors).toEqual(["Could not open /a.bpmn: File not found"]);
        expect(notifier.logged("error")).toEqual([notFound.stack]);
    });

    it("truncates a very long reference in user-facing notifications", async () => {
        const { open, notifier } = setup(NOTHING_FOUND);

        await open({ reference: "x".repeat(500) });

        expect(notifier.infos).toEqual([
            `Nothing declares "${"x".repeat(99)}…". ` +
                "(See Output → bpmn.modeler for what was searched.)",
        ]);
    });
});
