import { describe, expect, it } from "vitest";

import { DiffPaneLabelFacts, diffPaneLabel } from "./diffPaneLabel";

describe("diffPaneLabel", () => {
    it.each<[string, DiffPaneLabelFacts, string | undefined]>([
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
        expect(diffPaneLabel(facts)).toBe(expected);
    });
});
