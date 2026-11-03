import { describe, expect, it } from "vitest";

import type { Diagnostic } from "./diagnostics";
import { problemSummary } from "./problemSummary";

const diagnostics = (...severities: Diagnostic["severity"][]): Diagnostic[] =>
    severities.map((severity) => ({ path: [], severity, message: "" }));

describe("problemSummary", () => {
    it.each<[string, Diagnostic["severity"][], unknown]>([
        ["nothing", [], [["No Issues"]]],
        ["only notes", ["info"], [["No Issues"]]],
        ["one error", ["error"], [["1 Error"]]],
        ["errors", ["error", "error"], [["{count} Errors", { count: "2" }]]],
        ["one warning", ["warning"], [["1 Warning"]]],
        ["warnings", ["warning", "warning", "warning"], [["{count} Warnings", { count: "3" }]]],
        [
            "both",
            ["warning", "error", "warning"],
            [["1 Error"], ["{count} Warnings", { count: "2" }]],
        ],
    ])("counts %s", (_, severities, summary) => {
        expect(problemSummary(diagnostics(...severities))).toEqual(summary);
    });
});
