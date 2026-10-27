import { describe, expect, it } from "vitest";

import { classifyLocateResult, LocatedFile, LocateResult } from "./locateResult";

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
