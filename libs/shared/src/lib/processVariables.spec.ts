import { describe, expect, it } from "vitest";

import {
    collectExpressionRefs,
    collectSetVariableNames,
    collectSpinTypedNames,
    dedupeVariables,
    extractProcessVariables,
    VariableDef,
} from "./processVariables";

/**
 * The extractor walks `$type`-discriminated plain objects, so the fixtures here
 * are hand-built moddle shapes — no bpmn-js dependency. Each test isolates one
 * evidence source (or the cross-source dedupe / recursion behaviour) so a
 * regression points straight at the rule that broke.
 */

/** Wraps flow elements in a single-process definitions object. */
function definitionsOf(...flowElements: any[]): any {
    return {
        rootElements: [{ $type: "bpmn:Process", id: "Process_1", flowElements }],
    };
}

function names(vars: VariableDef[]): string[] {
    return vars.map((v) => v.name).sort();
}

function byName(vars: VariableDef[], name: string): VariableDef | undefined {
    return vars.find((v) => v.name === name);
}

describe("collectSetVariableNames", () => {
    it("captures setVariable and setVariableLocal with either quote style", () => {
        const script = `execution.setVariable("a", 1); execution.setVariableLocal('b', 2);`;
        expect(collectSetVariableNames(script)).toEqual(["a", "b"]);
    });

    it("ignores method calls that are not setVariable", () => {
        expect(collectSetVariableNames(`execution.getVariable("a")`)).toEqual([]);
    });
});

describe("collectSpinTypedNames", () => {
    it("captures setVariable/setVariableLocal whose value is a SPIN call", () => {
        expect(collectSpinTypedNames(`execution.setVariable("a", S(x))`)).toEqual(["a"]);
        expect(collectSpinTypedNames(`execution.setVariableLocal('a', JSON(x))`)).toEqual(["a"]);
    });

    it("captures bare/var/def assignments whose value is a SPIN call", () => {
        expect(collectSpinTypedNames(`b = JSON(x)`)).toEqual(["b"]);
        expect(collectSpinTypedNames(`var c = S(x)`)).toEqual(["c"]);
        expect(collectSpinTypedNames(`def c = S(x)`)).toEqual(["c"]);
    });

    it("ignores a field write, comparison, or non-SPIN call", () => {
        expect(collectSpinTypedNames(`obj.d = S(x)`)).toEqual([]);
        expect(collectSpinTypedNames(`e == S(x)`)).toEqual([]);
        expect(collectSpinTypedNames(`e = myParse(x)`)).toEqual([]);
        expect(collectSpinTypedNames(`e = foo.S(x)`)).toEqual([]);
    });
});

describe("collectExpressionRefs", () => {
    it("captures the leading identifier of ${...} and #{...}", () => {
        expect(collectExpressionRefs("${approved} and #{amount}")).toEqual(["approved", "amount"]);
    });

    it("returns only the root identifier of a property path", () => {
        expect(collectExpressionRefs("${order.total}")).toEqual(["order"]);
    });

    it("filters reserved names", () => {
        expect(collectExpressionRefs("${execution} ${true} ${myVar}")).toEqual(["myVar"]);
    });
});

describe("extractProcessVariables", () => {
    it("returns nothing for an empty model", () => {
        expect(extractProcessVariables({ rootElements: [] })).toEqual([]);
        expect(extractProcessVariables(undefined)).toEqual([]);
    });

    it("reads input/output mapping parameter names as declared", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ServiceTask",
                id: "Task_1",
                extensionElements: {
                    values: [
                        {
                            $type: "camunda:InputOutput",
                            inputParameters: [{ name: "in1", value: "${src}" }],
                            outputParameters: [{ name: "out1" }],
                        },
                    ],
                },
            }),
        );
        expect(names(vars)).toEqual(["in1", "out1", "src"]);
        expect(byName(vars, "out1")?.confidence).toBe("declared");
        // The input parameter's value reads `src` → referenced.
        expect(byName(vars, "src")?.confidence).toBe("referenced");
    });

    it("reads form field ids with their declared type as a typeHint", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:UserTask",
                id: "UserTask_1",
                extensionElements: {
                    values: [
                        {
                            $type: "camunda:FormData",
                            fields: [{ id: "amount", type: "long" }],
                        },
                    ],
                },
            }),
        );
        expect(byName(vars, "amount")?.typeHint).toBe("long");
        expect(byName(vars, "amount")?.confidence).toBe("declared");
    });

    it("reads camunda:resultVariable as declared", () => {
        const vars = extractProcessVariables(
            definitionsOf({ $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "result" }),
        );
        expect(byName(vars, "result")?.confidence).toBe("declared");
    });

    it("reads CallActivity in.source as referenced and out.target as declared", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:CallActivity",
                id: "Call_1",
                extensionElements: {
                    values: [
                        { $type: "camunda:In", source: "inVar", target: "x" },
                        { $type: "camunda:Out", target: "outVar", source: "y" },
                    ],
                },
            }),
        );
        expect(byName(vars, "inVar")?.confidence).toBe("referenced");
        expect(byName(vars, "outVar")?.confidence).toBe("declared");
    });

    it("reads setVariable literals from script-task bodies and listener scripts", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                script: `execution.setVariable("scripted", 1)`,
                extensionElements: {
                    values: [
                        {
                            $type: "camunda:ExecutionListener",
                            script: { value: `execution.setVariable("listened", 2)` },
                        },
                    ],
                },
            }),
        );
        expect(names(vars)).toEqual(["listened", "scripted"]);
        expect(byName(vars, "scripted")?.confidence).toBe("declared");
    });

    it("types a setVariable SPIN value as SpinJsonNode", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                script: `execution.setVariable("out", S(execution.getVariable("p")))`,
            }),
        );
        expect(byName(vars, "out")?.typeHint).toBe("SpinJsonNode");
        expect(byName(vars, "out")?.confidence).toBe("declared");
    });

    it("types a var-assigned SPIN value as SpinJsonNode", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                script: `var node = JSON(execution.getVariable("p"))`,
            }),
        );
        expect(byName(vars, "node")?.typeHint).toBe("SpinJsonNode");
    });

    it("types a SPIN value assigned in a listener script", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                extensionElements: {
                    values: [
                        {
                            $type: "camunda:ExecutionListener",
                            script: { value: `var node = S(execution.getVariable("p"))` },
                        },
                    ],
                },
            }),
        );
        expect(byName(vars, "node")?.typeHint).toBe("SpinJsonNode");
    });

    it("keeps the typed entry when a name is seen as plain setVariable and SPIN value", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                script: `execution.setVariable("x", S(execution.getVariable("p")))`,
            }),
        );
        const x = vars.filter((v) => v.name === "x");
        expect(x).toHaveLength(1);
        expect(x[0].typeHint).toBe("SpinJsonNode");
    });

    it("leaves an ordinary setVariable value untyped", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:ScriptTask",
                id: "Task_1",
                script: `execution.setVariable("plain", 1)`,
            }),
        );
        expect(byName(vars, "plain")?.typeHint).toBeUndefined();
    });

    it("reads ${var} from sequence-flow condition expressions as referenced", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:SequenceFlow",
                id: "Flow_1",
                conditionExpression: { $type: "bpmn:FormalExpression", body: "${approved}" },
            }),
        );
        expect(byName(vars, "approved")?.confidence).toBe("referenced");
    });

    it("recurses into sub-process flow elements", () => {
        const vars = extractProcessVariables(
            definitionsOf({
                $type: "bpmn:SubProcess",
                id: "Sub_1",
                flowElements: [
                    { $type: "bpmn:ScriptTask", id: "Inner_1", resultVariable: "nested" },
                ],
            }),
        );
        expect(byName(vars, "nested")?.confidence).toBe("declared");
    });

    it("lets declared evidence win over a referenced occurrence of the same name", () => {
        const vars = extractProcessVariables(
            definitionsOf(
                {
                    $type: "bpmn:SequenceFlow",
                    id: "Flow_1",
                    conditionExpression: { body: "${shared}" },
                },
                {
                    $type: "bpmn:ScriptTask",
                    id: "Task_1",
                    extensionElements: {
                        values: [
                            {
                                $type: "camunda:InputOutput",
                                outputParameters: [{ name: "shared" }],
                            },
                        ],
                    },
                },
            ),
        );
        const shared = vars.filter((v) => v.name === "shared");
        expect(shared).toHaveLength(1);
        expect(shared[0].confidence).toBe("declared");
    });
});

describe("dedupeVariables", () => {
    it("prefers a typed entry over an untyped one of equal confidence", () => {
        const deduped = dedupeVariables([
            { name: "x", origin: "a", confidence: "declared" },
            { name: "x", origin: "b", typeHint: "String", confidence: "declared" },
        ]);
        expect(deduped).toHaveLength(1);
        expect(deduped[0].typeHint).toBe("String");
    });
});
