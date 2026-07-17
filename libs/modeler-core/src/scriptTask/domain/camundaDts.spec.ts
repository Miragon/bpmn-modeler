import { describe, expect, it } from "vitest";

import { generateCamundaDts, SCRIPT_JSCONFIG } from "./camundaDts";

/**
 * The generated d.ts is what tsserver serves to JavaScript scripts — these
 * tests pin the kind scoping (which beans exist per surface) and the SPIN
 * gate, the two behaviours that must match the completion provider's rules
 * for the other languages.
 */
describe("generateCamundaDts", () => {
    it("declares the execution bean with its typed interface for a script task", () => {
        const dts = generateCamundaDts("script-task", true);
        expect(dts).toContain("interface DelegateExecution {");
        expect(dts).toContain("declare const execution: DelegateExecution;");
        expect(dts).toContain("getVariable(name: string): any;");
    });

    it("scopes beans by kind — `task` only exists for task listeners", () => {
        expect(generateCamundaDts("script-task", true)).not.toContain("declare const task:");
        expect(generateCamundaDts("execution-listener", true)).not.toContain("declare const task:");
        const taskListener = generateCamundaDts("task-listener", true);
        expect(taskListener).toContain("declare const task: DelegateTask;");
        expect(taskListener).toContain("declare const eventName: string;");
    });

    it("gates the SPIN globals on the setting", () => {
        const withSpin = generateCamundaDts("script-task", true);
        expect(withSpin).toContain("declare function S(input: any): SpinJsonNode;");

        const withoutSpin = generateCamundaDts("script-task", false);
        expect(withoutSpin).not.toContain("declare function S(");
        expect(withoutSpin).not.toContain("interface JSON {");
        // The interfaces stay — they cross-reference each other and are
        // harmless without a value of the type in scope.
        expect(withoutSpin).toContain("interface SpinJsonNode {");
    });

    it("emits built-in-colliding globals as an interface merge, not a declare function", () => {
        // `declare function JSON` would duplicate lib.es5's `var JSON` and the
        // call site would keep resolving to the (non-callable) built-in;
        // merging a call signature into the built-in `JSON` interface keeps
        // JSON.parse intact and types `JSON('…')` as SpinJsonNode.
        const withSpin = generateCamundaDts("script-task", true);
        expect(withSpin).not.toContain("declare function JSON(");
        expect(withSpin).toContain("interface JSON {");
        expect(withSpin).toContain("    (input: any): SpinJsonNode;");
    });

    it("carries catalog descriptions as JSDoc for hover documentation", () => {
        expect(generateCamundaDts("script-task", true)).toContain(
            "/** Returns the value of a process variable. */",
        );
    });
});

describe("SCRIPT_JSCONFIG", () => {
    it("includes the script and its ambient declarations", () => {
        const parsed = JSON.parse(SCRIPT_JSCONFIG);
        expect(parsed.include).toEqual(["*.js", "*.d.ts"]);
        expect(parsed.compilerOptions.allowJs).toBe(true);
    });
});
