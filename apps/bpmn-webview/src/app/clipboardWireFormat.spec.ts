import { describe, it, expect } from "vitest";
import { BpmnModdle } from "bpmn-moddle";
import { createReviver } from "bpmn-js-native-copy-paste/lib/PasteUtil.js";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";

/**
 * Executable statement of the cross-engine clipboard policy (#1374): unsupported,
 * fails soft. The wire format is engine-agnostic — a Camunda-7 element pasted
 * into a Camunda-8 modeler revives its shared bpmn: base, and the reviver
 * silently drops every extension node whose `$type` the target moddle does not
 * know (`camunda:*` in a C8 moddle), replacing it with `null` rather than
 * throwing. This spec is the policy; the README describes what it proves.
 *
 * The fixture is a real moddle serialisation, not a hand-written string: a C7
 * service task with `camunda:class` and a `camunda:Properties` extension,
 * serialised exactly as `NativeCopyPaste`/`BridgedClipboard` do
 * (`JSON.stringify(copyTree)`).
 */

const c7Moddle = (): ReturnType<typeof BpmnModdle> => BpmnModdle({ camunda: camundaModdle });
const c8Moddle = (): ReturnType<typeof BpmnModdle> => BpmnModdle({ zeebe: zeebeModdle });

/** Builds the copyTree a C7 service-task copy produces, then serialises it. */
function c7ServiceTaskPayload(): string {
    const moddle = c7Moddle();
    const property = moddle.create("camunda:Property", { name: "foo", value: "bar" });
    const properties = moddle.create("camunda:Properties", { values: [property] });
    const extensionElements = moddle.create("bpmn:ExtensionElements", { values: [properties] });
    const businessObject = moddle.create("bpmn:ServiceTask", {
        id: "ServiceTask_1",
        name: "Call",
        class: "com.acme.Handler",
        extensionElements,
    });
    const tree = { "0": [{ businessObject, id: "ServiceTask_1", name: "Call" }] };
    return JSON.stringify(tree);
}

type RevivedTree = Record<string, { businessObject: Record<string, any> }[]>;

describe("clipboard wire format — cross-engine paste policy", () => {
    it("serialises a copyTree the reviver can read back (round-trip is the wire contract)", () => {
        const json = c7ServiceTaskPayload();
        expect(json).toContain('"$type":"bpmn:ServiceTask"');
        expect(json).toContain('"$type":"camunda:Properties"');
    });

    it("C7 → C7: keeps the camunda extension untouched", () => {
        const revived = JSON.parse(
            c7ServiceTaskPayload(),
            createReviver(c7Moddle()),
        ) as RevivedTree;
        const bo = revived["0"][0].businessObject;

        expect(bo.$type).toBe("bpmn:ServiceTask");
        expect(bo.class).toBe("com.acme.Handler");
        const values = bo.extensionElements.values as { $type: string; values: unknown[] }[];
        expect(values[0].$type).toBe("camunda:Properties");
        expect(values[0].values[0]).toMatchObject({
            $type: "camunda:Property",
            name: "foo",
            value: "bar",
        });
    });

    it("C7 → C8: revives the shared bpmn base and drops the unknown camunda nodes without throwing", () => {
        const payload = c7ServiceTaskPayload();
        let revived: RevivedTree | undefined;

        expect(() => {
            revived = JSON.parse(payload, createReviver(c8Moddle())) as RevivedTree;
        }).not.toThrow();

        const bo = revived!["0"][0].businessObject;
        // The shared bpmn: base survives...
        expect(bo.$type).toBe("bpmn:ServiceTask");
        // ...but the camunda: extension node is unknown to a C8 moddle and is
        // dropped: the reviver returns undefined for the unknown $type, leaving a
        // hole in the array (reads as `undefined`; re-serialises to `null`).
        const values = bo.extensionElements.values as unknown[];
        expect(values).toHaveLength(1);
        expect(values[0]).toBeUndefined();
    });
});
