import { describe, expect, it } from "vitest";
import { localDeclarationDetail, processVariableDetail } from "./scriptCompletionDetail";

describe("processVariableDetail", () => {
    it("names the type hint of a typed process variable", () => {
        expect(processVariableDetail({ typeHint: "SpinJsonNode" })).toBe("SpinJsonNode");
    });

    it("calls a variable without a type hint a process variable", () => {
        expect(processVariableDetail({})).toBe("process variable");
    });
});

describe("localDeclarationDetail", () => {
    it("calls a function a local function", () => {
        expect(localDeclarationDetail({ kind: "function" })).toBe("local function");
    });

    it("names the type hint of a cast-typed local variable", () => {
        expect(localDeclarationDetail({ kind: "variable", typeHint: "SpinJsonNode" })).toBe(
            "SpinJsonNode",
        );
    });

    it("calls a variable without a type hint a local variable", () => {
        expect(localDeclarationDetail({ kind: "variable" })).toBe("local variable");
    });
});
