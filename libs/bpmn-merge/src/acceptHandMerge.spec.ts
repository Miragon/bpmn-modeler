import { describe, expect, it } from "vitest";

import { handMergeVersions } from "./__fixtures__/handMergeVersions";
import { acceptHandMerge } from "./acceptHandMerge";
import { buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "./mergeResult";

const BOTH_CHANGED = ["Start_Order", "Task_Check", "Sub_Ship", "Task_Pack", "Flow_Yes"];
const CURRENCY_PARAMETER =
    '      <camunda:inputParameter name="currency">EUR</camunda:inputParameter>\n';
const AMOUNT_PARAMETER =
    '      <camunda:inputParameter name="amount">${order.amount}</camunda:inputParameter>\n';

async function pickedOn(side: MergeSide) {
    const versions = handMergeVersions();
    const [result, sources] = await Promise.all([
        computeMerge(versions),
        prepareMergeSources(versions),
    ]);
    const decisions = MergeDecisions.from(result);
    for (const id of BOTH_CHANGED) expect(decisions.pick(id, side).applied).toBe(true);
    const textOf = (id: string) => sources.handMergeTexts.get(id)![side];
    const accept = (id: string, text: string) => acceptHandMerge(sources, decisions, id, text);
    return { sources, decisions, textOf, accept };
}

const replaced = (text: string, from: string, to: string) => {
    expect(text).toContain(from);
    return text.replace(from, to);
};

describe("acceptHandMerge", () => {
    it("takes current's listener and incoming's input mapping into the built file", async () => {
        const { sources, decisions, textOf, accept } = await pickedOn("current");
        const merged = replaced(
            textOf("Task_Check"),
            AMOUNT_PARAMETER,
            AMOUNT_PARAMETER + CURRENCY_PARAMETER,
        );

        const outcome = await accept("Task_Check", merged);

        expect(outcome).toEqual({ applied: true });
        expect(decisions.handMergeOf("Task_Check")).toMatchObject({
            side: "current",
            scope: "ownContent",
            content: merged,
            attributes: { name: "Check order now" },
        });
        const { xml } = await buildMerged(sources, decisions);
        expect(xml).toMatch(/<camunda:executionListener [^>]*expression="\$\{audit\}"/);
        expect(xml).toContain(
            '<camunda:inputParameter name="currency">EUR</camunda:inputParameter>',
        );
        expect(xml).toContain('name="Check order now"');
    });

    it("accepts a reference to an element the result keeps from the other side", async () => {
        const { sources, decisions, textOf, accept } = await pickedOn("current");
        const merged = replaced(
            textOf("Start_Order"),
            'messageRef="Message_Order"',
            'messageRef="Message_New"',
        );

        expect(await accept("Start_Order", merged)).toEqual({ applied: true });
        expect(decisions.result.elements.find(({ id }) => id === "Start_Order")).toMatchObject({
            versions: {
                current: {
                    references: [
                        {
                            property: "bpmn:MessageEventDefinition#messageRef",
                            target: "Message_New",
                        },
                    ],
                },
            },
        });
        const { xml } = await buildMerged(sources, decisions);
        expect(xml).toContain('messageRef="Message_New"');
    });

    it("takes the picked side's own version back for a text equal to it", async () => {
        const { decisions, textOf, accept } = await pickedOn("current");
        await accept(
            "Task_Check",
            replaced(textOf("Task_Check"), AMOUNT_PARAMETER, AMOUNT_PARAMETER + CURRENCY_PARAMETER),
        );

        expect(await accept("Task_Check", textOf("Task_Check"))).toEqual({ applied: true });
        expect(decisions.handMergeOf("Task_Check")).toBeUndefined();
    });

    it("takes a container's attributes, keeping its children on the picked side", async () => {
        const { sources, decisions, textOf, accept } = await pickedOn("incoming");

        const outcome = await accept(
            "Sub_Ship",
            replaced(textOf("Sub_Ship"), 'name="Ship later"', 'name="Ship soon"'),
        );

        expect(outcome).toEqual({ applied: true });
        const { xml } = await buildMerged(sources, decisions);
        expect(xml).toContain('<bpmn:subProcess id="Sub_Ship" name="Ship soon">');
        expect(xml).toContain('<bpmn:userTask id="Task_Pack" name="Pack box"');
    });

    describe("refuses, changing nothing,", () => {
        const refusals: readonly {
            readonly name: string;
            readonly id: string;
            readonly text: (own: string) => string;
            readonly refusal: object;
        }[] = [
            {
                name: "a text with conflict markers left",
                id: "Task_Pack",
                text: (own) => `<<<<<<< current\n${own}\n=======\n${own}\n>>>>>>> incoming\n`,
                refusal: { kind: "conflictMarkersLeft" },
            },
            {
                name: "a text that does not parse",
                id: "Task_Pack",
                text: (own) => own.replace(" />", ">"),
                refusal: { kind: "unparsable" },
            },
            {
                name: "a text the parser warns about",
                id: "Task_Pack",
                text: (own) =>
                    own.replace('name="Pack parcel"', 'name="Pack parcel" bpmn:color="red"'),
                refusal: { kind: "unparsable" },
            },
            {
                name: "more than one element",
                id: "Task_Pack",
                text: (own) => `${own}\n${own}`,
                refusal: { kind: "notOneElement", found: 2 },
            },
            {
                name: "a changed type although the parser coerces bpmn:task to bpmn:UserTask",
                id: "Task_Pack",
                text: (own) => own.replace("<bpmn:userTask", "<bpmn:task"),
                refusal: { kind: "typeChanged", expected: "bpmn:UserTask", found: "bpmn:Task" },
            },
            {
                name: "a changed id",
                id: "Task_Pack",
                text: (own) => own.replace('id="Task_Pack"', 'id="Task_Packing"'),
                refusal: { kind: "idChanged", expected: "Task_Pack", found: "Task_Packing" },
            },
            {
                name: "a flow node inside a sub-process text",
                id: "Sub_Ship",
                text: (own) =>
                    own.replace(
                        ' name="Ship now" />',
                        ' name="Ship now"><bpmn:task id="Task_Inner" /></bpmn:subProcess>',
                    ),
                refusal: { kind: "holdsElementsOfTheirOwn", ids: ["Task_Inner"] },
            },
            {
                name: "a container's text beyond its attributes, documentation and extension elements",
                id: "Sub_Ship",
                text: (own) =>
                    own.replace(
                        ' name="Ship now" />',
                        ' name="Ship now"><bpmn:property id="Property_Ship" /></bpmn:subProcess>',
                    ),
                refusal: { kind: "beyondOwnAttributes", properties: ["bpmn:properties"] },
            },
            {
                name: "a namespace no version declares",
                id: "Task_Pack",
                text: (own) =>
                    own.replace(
                        'id="Task_Pack"',
                        'xmlns:other="urn:other" other:flag="1" id="Task_Pack"',
                    ),
                refusal: { kind: "unknownNamespace", namespaces: ["urn:other"] },
            },
            {
                name: "an engine attribute the engine's descriptor does not know",
                id: "Task_Check",
                text: (own) =>
                    own.replace(
                        'custom:owner="billing"',
                        'custom:owner="billing" camunda:noSuchSetting="1"',
                    ),
                refusal: { kind: "rejectedByEngine" },
            },
            {
                name: "moving a flow end",
                id: "Flow_Yes",
                text: (own) => own.replace('targetRef="Sub_Ship"', 'targetRef="End_Done"'),
                refusal: { kind: "changesStructure", properties: ["bpmn:SequenceFlow#targetRef"] },
            },
            {
                name: "a reference no version can resolve",
                id: "Start_Order",
                text: (own) =>
                    own.replace('messageRef="Message_Order"', 'messageRef="Message_Nowhere"'),
                refusal: { kind: "namesMissingElement", ids: ["Message_Nowhere"] },
            },
            {
                name: "a reference to an element the result leaves out",
                id: "Start_Order",
                text: (own) =>
                    own.replace('messageRef="Message_Order"', 'messageRef="Message_Old"'),
                refusal: { kind: "namesLeftOutElement", ids: ["Message_Old"] },
            },
            {
                name: "dropping a data input an association of the result targets",
                id: "Task_Check",
                text: (own) =>
                    own.replace(
                        '  <bpmn:property id="Property_Check" name="__targetRef_placeholder" />\n',
                        "",
                    ),
                refusal: { kind: "changesOtherDecisions", ids: ["DataInput_Order"] },
            },
        ];

        it.each(refusals)("$name", async ({ id, text, refusal }) => {
            const { sources, decisions, textOf, accept } = await pickedOn("current");
            const own = textOf(id);
            const edited = text(own);
            expect(edited).not.toBe(own);
            const before = await buildMerged(sources, decisions);

            const outcome = await accept(id, edited);

            expect(outcome).toEqual({ applied: false, refusal: expect.objectContaining(refusal) });
            expect(decisions.handMergeOf(id)).toBeUndefined();
            expect((await buildMerged(sources, decisions)).xml).toBe(before.xml);
        });

        it("an element the user has not picked", async () => {
            const { sources, decisions, textOf } = await pickedOn("current");
            decisions.unpick("Task_Pack");

            const outcome = await acceptHandMerge(
                sources,
                decisions,
                "Task_Pack",
                textOf("Task_Pack"),
            );

            expect(outcome).toEqual({ applied: false, refusal: { kind: "notHandMergeable" } });
        });

        it("an element without three texts to merge", async () => {
            const { sources, decisions } = await pickedOn("current");
            decisions.pick("Task_Reject", "incoming");

            const outcome = await acceptHandMerge(
                sources,
                decisions,
                "Task_Reject",
                sources.snapshots.incoming.get("Task_Reject")!.content,
            );

            expect(outcome).toEqual({ applied: false, refusal: { kind: "notHandMergeable" } });
        });
    });
});
