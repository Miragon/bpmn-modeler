import { beforeEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("vscode", () => {
    class Position {
        constructor(
            readonly line: number,
            readonly character: number,
        ) {}
    }
    class Range {
        constructor(
            readonly start: Position,
            readonly end: Position,
        ) {}
    }
    class Diagnostic {
        code: unknown;
        source: string | undefined;
        constructor(
            readonly range: Range,
            readonly message: string,
            readonly severity: number,
        ) {}
    }
    return {
        Diagnostic,
        Range,
        Position,
        Uri: { parse: (value: string) => ({ value, toString: () => value }) },
        DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
        languages: {
            createDiagnosticCollection: () => ({ set: setMock, delete: deleteMock }),
        },
    };
});

import { LintResults } from "@miragon/bpmn-modeler-types";

import { VsCodeDiagnostics } from "./VsCodeDiagnostics";

const XML = `<?xml version="1.0"?><bpmn:task id="Task_1" /><bpmn:process id="Process_1" />`;
const DOC = "file:///diagram.bpmn";
const FOCUS_CMD = "bpmn-modeler.focusLintElement";

/** The single diagnostic set on the collection by the last `publish` call. */
function publishedDiagnostic(results: LintResults, focusCommandId?: string) {
    new VsCodeDiagnostics(focusCommandId).publish(DOC, XML, results);
    return setMock.mock.calls.at(-1)?.[1][0];
}

beforeEach(() => {
    setMock.mockClear();
    deleteMock.mockClear();
});

describe("VsCodeDiagnostics element-specific navigation", () => {
    it("links an element finding to the focus command with editor + element id", () => {
        const diagnostic = publishedDiagnostic(
            {
                "label-required": [
                    {
                        id: "Task_1",
                        message: "Label required",
                        category: "error",
                        rule: "label-required",
                    },
                ],
            },
            FOCUS_CMD,
        );

        expect(diagnostic.code.value).toBe("label-required");
        const target = diagnostic.code.target.toString() as string;
        const [scheme, query] = target.split("?");
        expect(scheme).toBe(`command:${FOCUS_CMD}`);
        expect(JSON.parse(decodeURIComponent(query))).toEqual([DOC, "Task_1"]);
    });

    it("leaves a diagram-wide finding (no element id) as a plain rule code", () => {
        const diagnostic = publishedDiagnostic(
            {
                "no-implementation-process": [
                    { message: "…", category: "warn", rule: "no-implementation-process" },
                ],
            },
            FOCUS_CMD,
        );

        expect(diagnostic.code).toBe("no-implementation-process");
    });

    it("omits the link when no focus command is wired", () => {
        const diagnostic = publishedDiagnostic(
            {
                "label-required": [
                    {
                        id: "Task_1",
                        message: "Label required",
                        category: "error",
                        rule: "label-required",
                    },
                ],
            },
            undefined,
        );

        expect(diagnostic.code).toBe("label-required");
    });
});
