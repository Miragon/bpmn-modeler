import { describe, expect, it } from "vitest";

import {
    matchVariableStringArg,
    parseEditorHashFromUri,
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

    it("returns undefined without the marker", () => {
        expect(parseScriptPath("/abc123/Task_1/script-task/Task_1.groovy")).toBeUndefined();
    });

    it("returns undefined when the marker isn't followed by exactly four segments", () => {
        expect(parseScriptPath("/ws/tmp/scripting/abc123/Task_1/Task_1.groovy")).toBeUndefined();
        expect(
            parseScriptPath("/ws/tmp/scripting/a/b/c/script-task/Task_1.groovy"),
        ).toBeUndefined();
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
