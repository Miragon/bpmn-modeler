import { describe, expect, it } from "vitest";

import {
    classifyLocateResult,
    LocatedFile,
    locatedFileChoices,
    LocateResult,
    outcomeAfterReading,
    SearchOutcome,
} from "./locateResult";
import { ChoiceItem } from "./prompts";

describe("outcomeAfterReading", () => {
    it.each<{
        behaviour: string;
        attempted: number;
        readFailures: string[];
        paths: string[];
        outcome: SearchOutcome<{ paths: string[] }>;
    }>([
        {
            behaviour: "keeps what was found when every read succeeded",
            attempted: 2,
            readFailures: [],
            paths: ["/a.bpmn"],
            outcome: { kind: "matches", paths: ["/a.bpmn"], readFailures: [] },
        },
        {
            behaviour: "keeps the failed reads next to what was found",
            attempted: 2,
            readFailures: ["Could not read /b.bpmn"],
            paths: ["/a.bpmn"],
            outcome: {
                kind: "matches",
                paths: ["/a.bpmn"],
                readFailures: ["Could not read /b.bpmn"],
            },
        },
        {
            behaviour: "found nothing when the readable candidates did not match",
            attempted: 2,
            readFailures: ["Could not read /b.bpmn"],
            paths: [],
            outcome: { kind: "matches", paths: [], readFailures: ["Could not read /b.bpmn"] },
        },
        {
            behaviour: "searched nothing when every read failed",
            attempted: 2,
            readFailures: ["Could not read /a.bpmn", "Could not read /b.bpmn"],
            paths: [],
            outcome: {
                kind: "all-unreadable",
                failures: ["Could not read /a.bpmn", "Could not read /b.bpmn"],
            },
        },
        {
            behaviour: "searched nothing when the only candidate failed to read",
            attempted: 1,
            readFailures: ["Could not read /a.bpmn"],
            paths: [],
            outcome: { kind: "all-unreadable", failures: ["Could not read /a.bpmn"] },
        },
        {
            behaviour: "found nothing, rather than nothing readable, without candidates",
            attempted: 0,
            readFailures: [],
            paths: [],
            outcome: { kind: "matches", paths: [], readFailures: [] },
        },
    ])("$behaviour", ({ attempted, readFailures, paths, outcome }) => {
        expect(outcomeAfterReading(attempted, readFailures, { paths })).toEqual(outcome);
    });

    it("carries any kind of match", () => {
        const declarations = [{ id: "Form_A", path: "/a.form" }];

        expect(outcomeAfterReading(1, [], { declarations })).toEqual({
            kind: "matches",
            declarations,
            readFailures: [],
        });
    });
});

describe("classifyLocateResult", () => {
    it.each<{ behaviour: string; result: LocateResult; located: LocatedFile }>([
        {
            behaviour: "has no scope when there is no folder or source document to search",
            result: { kind: "no-search-scope" },
            located: { kind: "noScope" },
        },
        {
            behaviour: "is unreadable when every candidate failed to read",
            result: {
                kind: "all-unreadable",
                failures: ["Could not read /a.bpmn", "Could not read /b.bpmn"],
            },
            located: {
                kind: "unreadable",
                failures: ["Could not read /a.bpmn", "Could not read /b.bpmn"],
            },
        },
        {
            behaviour: "is not found when no candidate matched",
            result: { kind: "matches", paths: [], readFailures: [] },
            located: { kind: "notFound", readFailures: [] },
        },
        {
            behaviour: "keeps the read failures of a search that found nothing",
            result: { kind: "matches", paths: [], readFailures: ["Could not read /bad.bpmn"] },
            located: { kind: "notFound", readFailures: ["Could not read /bad.bpmn"] },
        },
        {
            behaviour: "is a single file when exactly one candidate matched",
            result: { kind: "matches", paths: ["/a.bpmn"], readFailures: [] },
            located: { kind: "single", path: "/a.bpmn", readFailures: [] },
        },
        {
            behaviour: "keeps the read failures next to a single match",
            result: {
                kind: "matches",
                paths: ["/good.bpmn"],
                readFailures: ["Could not read /bad.bpmn"],
            },
            located: {
                kind: "single",
                path: "/good.bpmn",
                readFailures: ["Could not read /bad.bpmn"],
            },
        },
        {
            behaviour: "is ambiguous when two candidates matched",
            result: { kind: "matches", paths: ["/a.bpmn", "/b.bpmn"], readFailures: [] },
            located: { kind: "ambiguous", paths: ["/a.bpmn", "/b.bpmn"], readFailures: [] },
        },
        {
            behaviour: "keeps the search order and read failures of many matches",
            result: {
                kind: "matches",
                paths: ["/z.bpmn", "/a.bpmn", "/m.bpmn"],
                readFailures: ["Could not read /bad.bpmn"],
            },
            located: {
                kind: "ambiguous",
                paths: ["/z.bpmn", "/a.bpmn", "/m.bpmn"],
                readFailures: ["Could not read /bad.bpmn"],
            },
        },
    ])("$behaviour", ({ result, located }) => {
        expect(classifyLocateResult(result)).toEqual(located);
    });
});

describe("locatedFileChoices", () => {
    const placeholder = "Select the file to open";
    const file = (path: string, label: string): ChoiceItem<string> => ({
        label,
        path,
        value: path,
    });

    it.each<{ behaviour: string; outcome: LocateResult }>([
        { behaviour: "there is nothing to search", outcome: { kind: "no-search-scope" } },
        {
            behaviour: "no candidate was readable",
            outcome: { kind: "all-unreadable", failures: ["Could not read /work/a.bpmn"] },
        },
        {
            behaviour: "nothing matched",
            outcome: { kind: "matches", paths: [], readFailures: [] },
        },
        {
            behaviour: "a single file matched",
            outcome: { kind: "matches", paths: ["/work/a.bpmn"], readFailures: [] },
        },
    ])("leaves no choice when $behaviour", ({ outcome }) => {
        expect(locatedFileChoices(outcome, { placeholder, workspaceFolders: ["/work"] })).toBe(
            undefined,
        );
    });

    it.each<{
        behaviour: string;
        paths: string[];
        workspaceFolders: string[];
        items: ChoiceItem<string>[];
    }>([
        {
            behaviour: "offers every match by its file name, ordered by its path below the folder",
            paths: ["/work/z/order.bpmn", "/work/a/order.bpmn", "/work/m.bpmn"],
            workspaceFolders: ["/work"],
            items: [
                file("/work/a/order.bpmn", "order.bpmn"),
                file("/work/m.bpmn", "m.bpmn"),
                file("/work/z/order.bpmn", "order.bpmn"),
            ],
        },
        {
            behaviour: "orders the matches of several folders by folder name, not by absolute path",
            paths: ["/a-repos/lib/order.bpmn", "/z-repos/app/order.bpmn"],
            workspaceFolders: ["/z-repos/app", "/a-repos/lib"],
            items: [
                file("/z-repos/app/order.bpmn", "order.bpmn"),
                file("/a-repos/lib/order.bpmn", "order.bpmn"),
            ],
        },
        {
            behaviour: "orders the matches next to a loose file by their path",
            paths: ["/loose/z.bpmn", "/loose/a.bpmn"],
            workspaceFolders: [],
            items: [file("/loose/a.bpmn", "a.bpmn"), file("/loose/z.bpmn", "z.bpmn")],
        },
    ])("$behaviour", ({ paths, workspaceFolders, items }) => {
        const outcome: LocateResult = {
            kind: "matches",
            paths,
            readFailures: ["Could not read /work/bad.bpmn"],
        };

        expect(locatedFileChoices(outcome, { placeholder, workspaceFolders })).toEqual({
            id: "locatedFile",
            placeholder,
            items,
        });
    });
});
