import { beforeEach, describe, expect, it, vi } from "vitest";

const setMock = vi.fn();
const deleteMock = vi.fn();
const positionIndexesBuilt = vi.hoisted(() => vi.fn());

vi.mock("../../domain/elementIdPositions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../domain/elementIdPositions")>();
    return {
        ElementIdPositions: class extends actual.ElementIdPositions {
            constructor(xml: string) {
                super(xml);
                positionIndexesBuilt();
            }
        },
    };
});

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
    positionIndexesBuilt.mockClear();
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

describe("VsCodeDiagnostics element ranges", () => {
    const TASK_COUNT = 5000;
    // One task per line after the header, so Task_<n> sits on line n + 1.
    const largeXml = [
        `<?xml version="1.0"?><bpmn:definitions id="Definitions_1">`,
        ...Array.from({ length: TASK_COUNT }, (_, n) => `  <bpmn:task id="Task_${n}" />`),
        `</bpmn:definitions>`,
    ].join("\n");

    function publishedRanges(results: LintResults): { line: number; character: number }[] {
        new VsCodeDiagnostics().publish(DOC, largeXml, results);
        return (
            setMock.mock.calls[0][1] as { range: { start: { line: number; character: number } } }[]
        ).map((diagnostic) => diagnostic.range.start);
    }

    it("locates every finding of a push from one scan of the XML", () => {
        const findings = Array.from({ length: 2000 }, (_, n) => ({
            id: `Task_${n * 2}`,
            message: "Label required",
            category: "warn",
        }));

        const starts = publishedRanges({ "label-required": findings });

        expect(positionIndexesBuilt).toHaveBeenCalledOnce();
        expect(starts[0]).toEqual({ line: 1, character: 12 });
        expect(starts[1999]).toEqual({ line: 3999, character: 12 });
    });

    it("places diagram-level and unknown findings at the document start without scanning", () => {
        const starts = publishedRanges({
            "no-implementation-process": [{ message: "…", category: "warn" }],
        });

        expect(positionIndexesBuilt).not.toHaveBeenCalled();
        expect(starts).toEqual([{ line: 0, character: 0 }]);

        setMock.mockClear();
        expect(
            publishedRanges({ "label-required": [{ id: "Gone", message: "…", category: "warn" }] }),
        ).toEqual([{ line: 0, character: 0 }]);
    });
});
