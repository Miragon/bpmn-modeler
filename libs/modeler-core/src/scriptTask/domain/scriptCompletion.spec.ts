import { describe, expect, it } from "vitest";

import { matchVariableStringArg, parseEditorHashFromUri } from "./scriptCompletion";

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

describe("parseEditorHashFromUri", () => {
    it("returns the first path segment", () => {
        expect(parseEditorHashFromUri("/abc123/Task_1/script-task/Task_1.groovy")).toBe("abc123");
    });

    it("returns undefined for an empty path", () => {
        expect(parseEditorHashFromUri("/")).toBeUndefined();
    });
});
