import { describe, expect, it } from "vitest";

import {
    matchMemberAccess,
    matchVariableStringArg,
    parseEditorHashFromUri,
    parseKindFromUri,
    parseScriptPath,
} from "./scriptCompletion";

/**
 * Pure-function tests for the variable-completion helpers behind the script
 * completion provider — exercised without the `vscode`-bound provider class.
 */
describe("matchVariableStringArg", () => {
    it("matches getVariable with a double quote and a partial name", () => {
        expect(matchVariableStringArg(`execution.getVariable("am`)).toEqual({
            methodName: "getVariable",
            partial: "am",
        });
    });

    it("matches a single quote and an empty partial right after the quote", () => {
        expect(matchVariableStringArg(`execution.setVariable('`)).toEqual({
            methodName: "setVariable",
            partial: "",
        });
    });

    it("recognises the Local suffix", () => {
        expect(matchVariableStringArg(`execution.setVariableLocal("x`)?.methodName).toBe(
            "setVariableLocal",
        );
    });

    it("recognises has/remove variants", () => {
        expect(matchVariableStringArg(`execution.hasVariable("`)?.methodName).toBe("hasVariable");
        expect(matchVariableStringArg(`execution.removeVariable("`)?.methodName).toBe(
            "removeVariable",
        );
    });

    it("returns undefined once the string argument is closed", () => {
        expect(matchVariableStringArg(`execution.getVariable("amount")`)).toBeUndefined();
    });

    it("returns undefined for an ordinary string literal", () => {
        expect(matchVariableStringArg(`def label = "hello`)).toBeUndefined();
    });
});

describe("matchMemberAccess", () => {
    it.each([
        { linePrefix: "execution.", bean: "execution" },
        { linePrefix: "  task.", bean: "task" },
        { linePrefix: "def x = execution.", bean: "execution" },
        { linePrefix: "foo.bar.", bean: "bar" },
        { linePrefix: "execution. ", bean: "execution" },
        { linePrefix: "execution", bean: undefined },
        { linePrefix: "execution.get", bean: undefined },
        { linePrefix: "1.", bean: undefined },
    ])("'$linePrefix' asks for the members of $bean", ({ linePrefix, bean }) => {
        expect(matchMemberAccess(linePrefix)).toBe(bean);
    });
});

describe("parseScriptPath", () => {
    it("anchors on the tmp/scripting marker regardless of the base directory", () => {
        expect(
            parseScriptPath("/ws/.camunda/tmp/scripting/abc123/Task_1/script-task/Task_1.groovy"),
        ).toEqual({
            editorHash: "abc123",
            elementId: "Task_1",
            slug: "script-task",
            filename: "Task_1.groovy",
        });
    });

    it("accepts Windows separators (fsPath form)", () => {
        expect(
            parseScriptPath(
                "c:\\ws\\.camunda\\tmp\\scripting\\abc123\\Task_1\\script-task\\Task_1.js",
            )?.editorHash,
        ).toBe("abc123");
    });

    it("anchors on the innermost marker when a folder is itself named tmp/scripting", () => {
        expect(
            parseScriptPath("/tmp/scripting/.camunda/tmp/scripting/h/Task_1/script-task/Task_1.js")
                ?.editorHash,
        ).toBe("h");
    });

    it.each([
        {
            place: "an element named tmp",
            path: "/ws/tmp/scripting/h/tmp/script-task/tmp.js",
            elementId: "tmp",
        },
        {
            place: "an element named scripting",
            path: "/ws/tmp/scripting/h/scripting/script-task/scripting.js",
            elementId: "scripting",
        },
        {
            place: "the marker at the start",
            path: "/tmp/scripting/h/Task_1/script-task/Task_1.js",
            elementId: "Task_1",
        },
        {
            place: "a doubled separator",
            path: "/ws/tmp/scripting//h/Task_1/script-task/Task_1.js",
            elementId: "Task_1",
        },
    ])("finds the four segments after the marker with $place", ({ path, elementId }) => {
        expect(parseScriptPath(path)).toEqual({
            editorHash: "h",
            elementId,
            slug: "script-task",
            filename: `${elementId}.js`,
        });
    });

    it.each([
        "/Task_1/script-task/Task_1.groovy",
        "/abc123/Task_1/script-task/Task_1.groovy",
        "/ws/abc123/Task_1/script-task/Task_1.groovy",
    ])("returns undefined without the marker: %s", (path) => {
        expect(parseScriptPath(path)).toBeUndefined();
    });

    it("returns undefined when the marker isn't followed by exactly four segments", () => {
        expect(parseScriptPath("/ws/tmp/scripting/abc123/Task_1/Task_1.groovy")).toBeUndefined();
        expect(
            parseScriptPath("/ws/tmp/scripting/a/b/c/script-task/Task_1.groovy"),
        ).toBeUndefined();
    });
});

describe("parseKindFromUri", () => {
    it.each([
        { slug: "script-task", kind: "script-task" },
        { slug: "execution-listener-0-start", kind: "execution-listener" },
        { slug: "task-listener-1-create", kind: "task-listener" },
        { slug: "unknown-0", kind: undefined },
    ])("reads the slug $slug as $kind", ({ slug, kind }) => {
        expect(parseKindFromUri(`/ws/.camunda/tmp/scripting/h/Task_1/${slug}/Task_1.js`)).toBe(
            kind,
        );
    });

    it("reads no kind from a file outside the script folder", () => {
        expect(parseKindFromUri("/ws/Task_1.js")).toBeUndefined();
    });
});

describe("parseEditorHashFromUri", () => {
    it("returns the editor-hash segment after the marker", () => {
        expect(
            parseEditorHashFromUri("/ws/.camunda/tmp/scripting/abc123/Task_1/script-task/T.groovy"),
        ).toBe("abc123");
    });

    it("returns undefined for an empty path", () => {
        expect(parseEditorHashFromUri("/")).toBeUndefined();
    });
});
