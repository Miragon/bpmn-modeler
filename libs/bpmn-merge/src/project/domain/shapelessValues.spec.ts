import { ENGINE_NAMESPACE, MODELER_NAMESPACE_URI } from "@miragon/bpmn-modeler-types/engine";
import { describe, expect, it } from "vitest";

import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge } from "../../classify/service/computeMerge";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";
import { mergePaneView, type ShapelessRow } from "./mergePaneView";
import type { MergeSide } from "../../kernel/domain/mergeResult";
import type { MergeVersions } from "../../classify/service/mergeVersions";

interface DocumentContent {
    readonly inProcess?: string;
    readonly inSubA?: string;
    readonly inSubB?: string;
    readonly definitionsAttributes?: string;
}

const CAMUNDA_7 = `xmlns:camunda="${ENGINE_NAMESPACE.c7.uri}" xmlns:modeler="${MODELER_NAMESPACE_URI}" modeler:executionPlatform="Camunda Platform"`;

/** A document with `roots` beside a drawn process with two collapsed sub-processes. */
function documentWith(
    roots: string,
    { inProcess = "", inSubA = "", inSubB = "", definitionsAttributes = "" }: DocumentContent = {},
): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:custom="urn:example:custom" ${definitionsAttributes} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
${roots}
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_A" name="Send invoice" />
    <bpmn:subProcess id="Sub_A">${inSubA}</bpmn:subProcess>
    <bpmn:subProcess id="Sub_B">${inSubB}</bpmn:subProcess>
${inProcess}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_A_di" bpmnElement="Sub_A" isExpanded="false">
        <dc:Bounds x="260" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_B_di" bpmnElement="Sub_B" isExpanded="false">
        <dc:Bounds x="420" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

const error = (attributes: string) => `  <bpmn:error id="Error_A" ${attributes} />`;

const message = (subscriptionKey: string) => `  <bpmn:message id="Message_A" name="Order received">
    <bpmn:extensionElements>
      <custom:subscription key="${subscriptionKey}" />
    </bpmn:extensionElements>
  </bpmn:message>`;

async function rowOf(
    versions: MergeVersions,
    id: string,
    side: MergeSide = "current",
): Promise<ShapelessRow | undefined> {
    const [result, sources] = await Promise.all([
        computeMerge(versions),
        prepareMergeSources(versions),
    ]);
    return mergePaneView(MergeDecisions.from(result), side, sources).shapelessRows.find(
        (row) => row.id === id,
    );
}

function valuesOf(row: ShapelessRow | undefined) {
    return row === undefined
        ? undefined
        : {
              current: row.current,
              incoming: row.incoming,
              lackingSide: row.lackingSide,
              differences: row.differences,
              moreDiffers: row.moreDiffers,
          };
}

describe("a shape-less row's values", () => {
    it.each([
        {
            what: "an error whose name differs",
            current: 'name="Payment declined" errorCode="E1"',
            incoming: 'name="Payment rejected" errorCode="E1"',
            differences: [
                { attribute: "name", current: "Payment declined", incoming: "Payment rejected" },
            ],
            names: ["Payment declined", "Payment rejected"],
        },
        {
            what: "an error whose code differs under the same name",
            current: 'name="Payment failed" errorCode="E2"',
            incoming: 'name="Payment failed" errorCode="E3"',
            differences: [{ attribute: "errorCode", current: "E2", incoming: "E3" }],
            names: ["Payment failed", "Payment failed"],
        },
        {
            what: "an error one side gave a foreign attribute and the other a new code",
            current: 'name="Payment failed" errorCode="E1" custom:flag="x"',
            incoming: 'name="Payment failed" errorCode="E3"',
            differences: [
                { attribute: "errorCode", current: "E1", incoming: "E3" },
                { attribute: "custom:flag", current: "x" },
            ],
            names: ["Payment failed", "Payment failed"],
        },
    ])(
        "gives each side's value of exactly the attributes that differ for $what",
        async ({ current, incoming, differences, names }) => {
            const row = await rowOf(
                {
                    base: documentWith(error('name="Payment failed" errorCode="E1"')),
                    current: documentWith(error(current)),
                    incoming: documentWith(error(incoming)),
                },
                "Error_A",
            );

            expect(valuesOf(row)).toStrictEqual({
                current: { name: names[0] },
                incoming: { name: names[1] },
                lackingSide: undefined,
                differences,
                moreDiffers: undefined,
            });
        },
    );

    it("names an attribute of the loaded engine package by its qualified name", async () => {
        const camundaDocument = (errorMessage: string) =>
            documentWith(error(`name="Payment failed" camunda:errorMessage="${errorMessage}"`), {
                definitionsAttributes: CAMUNDA_7,
            });

        const row = await rowOf(
            {
                base: camundaDocument("Card declined"),
                current: camundaDocument("Card expired"),
                incoming: camundaDocument("Card blocked"),
            },
            "Error_A",
        );

        expect(row?.differences).toStrictEqual([
            {
                attribute: "camunda:errorMessage",
                current: "Card expired",
                incoming: "Card blocked",
            },
        ]);
    });

    it("lists no difference for a namespace one side declares on the element itself", async () => {
        const row = await rowOf(
            {
                base: documentWith(error('name="Payment failed" errorCode="E1"')),
                current: documentWith(
                    error('xmlns:other="urn:example:other" name="Payment failed" errorCode="E2"'),
                ),
                incoming: documentWith(error('name="Payment failed" errorCode="E3"')),
            },
            "Error_A",
        );

        expect(row?.differences).toStrictEqual([
            { attribute: "errorCode", current: "E2", incoming: "E3" },
        ]);
    });

    it("writes a reference as the id of its target", async () => {
        const items = `  <bpmn:itemDefinition id="Item_A" />
  <bpmn:itemDefinition id="Item_B" />`;
        const withItem = (item: string) =>
            documentWith(`${items}\n${error(`name="Payment failed" structureRef="${item}"`)}`);

        const row = await rowOf(
            { current: withItem("Item_A"), incoming: withItem("Item_B") },
            "Error_A",
        );

        expect(row?.differences).toStrictEqual([
            { attribute: "structureRef", current: "Item_A", incoming: "Item_B" },
        ]);
    });

    it("lists no value a side writes as the descriptor's default", async () => {
        const dataStore = (attributes: string) =>
            documentWith(`  <bpmn:dataStore id="DataStore_A" ${attributes} />`);

        const row = await rowOf(
            {
                base: dataStore('name="Ledger"'),
                current: dataStore('name="Archive" isUnlimited="true"'),
                incoming: dataStore('name="Records"'),
            },
            "DataStore_A",
        );

        expect(row?.differences).toStrictEqual([
            { attribute: "name", current: "Archive", incoming: "Records" },
        ]);
        expect(row?.moreDiffers).toBeUndefined();
    });

    it("lists a value a side writes as the engine package's default, as the side's XML holds it", async () => {
        const withProcess = (attributes: string) =>
            documentWith(`  <bpmn:process id="Process_B" isExecutable="false" ${attributes} />`, {
                definitionsAttributes: CAMUNDA_7,
            });

        const row = await rowOf(
            {
                current: withProcess('camunda:isStartableInTasklist="true"'),
                incoming: withProcess(""),
            },
            "Process_B",
        );

        expect(row?.differences).toStrictEqual([
            { attribute: "camunda:isStartableInTasklist", current: "true" },
        ]);
        expect(row?.moreDiffers).toBeUndefined();
    });

    it("says that more differs, and lists no value, for a reference the element writes as a child", async () => {
        const withOperation = (operation: string) =>
            documentWith(`  <bpmn:interface id="Interface_A" name="Orders">
    <bpmn:operation id="Operation_A" name="Place" />
    <bpmn:operation id="Operation_B" name="Cancel" />
  </bpmn:interface>
  <bpmn:messageEventDefinition id="Definition_A">
    <bpmn:operationRef>${operation}</bpmn:operationRef>
  </bpmn:messageEventDefinition>`);

        const row = await rowOf(
            { current: withOperation("Operation_A"), incoming: withOperation("Operation_B") },
            "Definition_A",
        );

        expect(row?.differences).toStrictEqual([]);
        expect(row?.moreDiffers).toBe(true);
    });

    it("says that more differs than the attributes for a message that differs only in an extension", async () => {
        const row = await rowOf(
            {
                base: documentWith(message("a")),
                current: documentWith(message("b")),
                incoming: documentWith(message("c")),
            },
            "Message_A",
        );

        expect(valuesOf(row)).toStrictEqual({
            current: { name: "Order received" },
            incoming: { name: "Order received" },
            lackingSide: undefined,
            differences: [],
            moreDiffers: true,
        });
    });

    it("says that more differs than the attributes for a data object the sides put in different parents", async () => {
        const dataObject = '<bpmn:dataObject id="DataObject_A" />';

        const row = await rowOf(
            {
                base: documentWith("", { inProcess: dataObject }),
                current: documentWith("", { inSubA: dataObject }),
                incoming: documentWith("", { inSubB: dataObject }),
            },
            "DataObject_A",
        );

        expect(row?.differences).toStrictEqual([]);
        expect(row?.moreDiffers).toBe(true);
    });

    it("gives the name of the one side that holds an element the other removed, with the base", async () => {
        const row = await rowOf(
            {
                base: documentWith(error('name="Payment failed"')),
                current: documentWith(error('name="Payment declined"')),
                incoming: documentWith(""),
            },
            "Error_A",
            "incoming",
        );

        expect(valuesOf(row)).toStrictEqual({
            current: { name: "Payment declined" },
            incoming: undefined,
            lackingSide: { side: "incoming", lack: "removed" },
            differences: [],
            moreDiffers: undefined,
        });
    });

    it("gives the name of the one side that holds an element, without a base", async () => {
        const row = await rowOf(
            { current: documentWith(error('name="Payment failed"')), incoming: documentWith("") },
            "Error_A",
        );

        expect(valuesOf(row)).toStrictEqual({
            current: { name: "Payment failed" },
            incoming: undefined,
            lackingSide: { side: "incoming", lack: "missing" },
            differences: [],
            moreDiffers: undefined,
        });
    });

    it("gives a side without a name as present and unnamed", async () => {
        const row = await rowOf(
            {
                base: documentWith(error('errorCode="E1"')),
                current: documentWith(error('errorCode="E2"')),
                incoming: documentWith(error('errorCode="E3"')),
            },
            "Error_A",
        );

        expect(row?.current).toStrictEqual({});
        expect(row?.incoming).toStrictEqual({});
    });

    it("keeps the values after a pick of either side", async () => {
        const versions = {
            base: documentWith(error('name="Payment failed" errorCode="E1"')),
            current: documentWith(error('name="Payment failed" errorCode="E2"')),
            incoming: documentWith(error('name="Payment failed" errorCode="E3"')),
        };
        const [result, sources] = await Promise.all([
            computeMerge(versions),
            prepareMergeSources(versions),
        ]);
        const decisions = MergeDecisions.from(result);
        const values = () =>
            valuesOf(
                mergePaneView(decisions, "current", sources).shapelessRows.find(
                    ({ id }) => id === "Error_A",
                ),
            );
        const before = values();

        decisions.pick("Error_A", "incoming");

        expect(values()).toStrictEqual(before);
    });
});
