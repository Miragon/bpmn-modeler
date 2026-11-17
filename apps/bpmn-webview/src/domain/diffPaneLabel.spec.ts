import { describe, expect, it } from "vitest";

import { DiffPaneLabelFacts, diffPaneLabel } from "./diffPaneLabel";

const untranslated = (key: string) => key;

describe("diffPaneLabel", () => {
    it.each<[string, DiffPaneLabelFacts, string | undefined]>([
        [
            "names a merge pane by its caption",
            {
                origin: "merge",
                paneFilename: "order.bpmn",
                mergeCaption: { side: "current", role: "branch", ref: "main" },
            },
            "Current: your branch main",
        ],
        [
            "names a compare-files pane by its file",
            { origin: "compare-files", paneFilename: "b.bpmn" },
            "b.bpmn",
        ],
        [
            "leaves an SCM pane to its tab title",
            { origin: "scm", paneFilename: "order.bpmn" },
            undefined,
        ],
    ])("%s", (_case, facts, expected) => {
        expect(diffPaneLabel(facts, untranslated)).toBe(expected);
    });
});
