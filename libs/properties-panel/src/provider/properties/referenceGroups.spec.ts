import { describe, expect, it } from "vitest";

import {
    BPMN_NAMESPACES,
    collectWindowErrors,
    renderPanel,
    type ModdleElement,
} from "../../__fixtures__/panelHarness";

// Root elements are declared out of order and in mixed case, so the option list
// only comes out as [alpha, Beta] if it sorts case-insensitively by name.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" />
    <bpmn:endEvent id="ErrorEnd"><bpmn:errorEventDefinition id="ErrorEnd_Def" /></bpmn:endEvent>
    <bpmn:endEvent id="ErrorEnd_Linked"><bpmn:errorEventDefinition id="ErrorEnd_Linked_Def" errorRef="Error_Beta" /></bpmn:endEvent>
    <bpmn:intermediateThrowEvent id="EscalationThrow"><bpmn:escalationEventDefinition id="EscalationThrow_Def" /></bpmn:intermediateThrowEvent>
    <bpmn:intermediateThrowEvent id="EscalationThrow_Linked"><bpmn:escalationEventDefinition id="EscalationThrow_Linked_Def" escalationRef="Escalation_Beta" /></bpmn:intermediateThrowEvent>
    <bpmn:intermediateCatchEvent id="MessageCatch"><bpmn:messageEventDefinition id="MessageCatch_Def" /></bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="MessageCatch_Linked"><bpmn:messageEventDefinition id="MessageCatch_Linked_Def" messageRef="Message_Beta" /></bpmn:intermediateCatchEvent>
    <bpmn:receiveTask id="Receive" />
    <bpmn:receiveTask id="Receive_Linked" messageRef="Message_Beta" />
    <bpmn:intermediateCatchEvent id="SignalCatch"><bpmn:signalEventDefinition id="SignalCatch_Def" /></bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="SignalCatch_Linked"><bpmn:signalEventDefinition id="SignalCatch_Linked_Def" signalRef="Signal_Beta" /></bpmn:intermediateCatchEvent>
  </bpmn:process>
  <bpmn:error id="Error_Beta" name="Beta" errorCode="B" />
  <bpmn:error id="Error_alpha" name="alpha" errorCode="A" />
  <bpmn:escalation id="Escalation_Beta" name="Beta" escalationCode="B" />
  <bpmn:escalation id="Escalation_alpha" name="alpha" escalationCode="A" />
  <bpmn:message id="Message_Beta" name="Beta" />
  <bpmn:message id="Message_alpha" name="alpha" />
  <bpmn:signal id="Signal_Beta" name="Beta" />
  <bpmn:signal id="Signal_alpha" name="alpha" />
</bpmn:definitions>`;

interface ReferenceGroupCase {
    label: string;
    group: string;
    refEntry: string;
    nameEntry: string;
    code?: { entry: string; property: string };
    refProperty: string;
    rootType: string;
    /** Element without a reference, and the moddle element that holds its ref. */
    unlinked: { element: string; holder: string };
    /** Element referencing the `Beta` definition, and its ref holder. */
    linked: { element: string; holder: string };
    alphaId: string;
    betaId: string;
}

const CASES: ReferenceGroupCase[] = [
    {
        label: "error end event",
        group: "error",
        refEntry: "errorRef",
        nameEntry: "errorName",
        code: { entry: "errorCode", property: "errorCode" },
        refProperty: "errorRef",
        rootType: "bpmn:Error",
        unlinked: { element: "ErrorEnd", holder: "ErrorEnd_Def" },
        linked: { element: "ErrorEnd_Linked", holder: "ErrorEnd_Linked_Def" },
        alphaId: "Error_alpha",
        betaId: "Error_Beta",
    },
    {
        label: "escalation throw event",
        group: "escalation",
        refEntry: "escalationRef",
        nameEntry: "escalationName",
        code: { entry: "escalationCode", property: "escalationCode" },
        refProperty: "escalationRef",
        rootType: "bpmn:Escalation",
        unlinked: { element: "EscalationThrow", holder: "EscalationThrow_Def" },
        linked: { element: "EscalationThrow_Linked", holder: "EscalationThrow_Linked_Def" },
        alphaId: "Escalation_alpha",
        betaId: "Escalation_Beta",
    },
    {
        label: "message catch event",
        group: "message",
        refEntry: "messageRef",
        nameEntry: "messageName",
        refProperty: "messageRef",
        rootType: "bpmn:Message",
        unlinked: { element: "MessageCatch", holder: "MessageCatch_Def" },
        linked: { element: "MessageCatch_Linked", holder: "MessageCatch_Linked_Def" },
        alphaId: "Message_alpha",
        betaId: "Message_Beta",
    },
    {
        label: "receive task (the task itself holds messageRef)",
        group: "message",
        refEntry: "messageRef",
        nameEntry: "messageName",
        refProperty: "messageRef",
        rootType: "bpmn:Message",
        unlinked: { element: "Receive", holder: "Receive" },
        linked: { element: "Receive_Linked", holder: "Receive_Linked" },
        alphaId: "Message_alpha",
        betaId: "Message_Beta",
    },
    {
        label: "signal catch event",
        group: "signal",
        refEntry: "signalRef",
        nameEntry: "signalName",
        refProperty: "signalRef",
        rootType: "bpmn:Signal",
        unlinked: { element: "SignalCatch", holder: "SignalCatch_Def" },
        linked: { element: "SignalCatch_Linked", holder: "SignalCatch_Linked_Def" },
        alphaId: "Signal_alpha",
        betaId: "Signal_Beta",
    },
];

function detailEntries(testCase: ReferenceGroupCase): string[] {
    return [testCase.nameEntry, ...(testCase.code ? [testCase.code.entry] : [])];
}

describe("neutral root-element reference groups", () => {
    it("are absent on elements without a matching event definition", async () => {
        const panel = await renderPanel(XML, "Task_1");

        expect(panel.groupIds()).toEqual(["general", "documentation"]);
    });

    describe.each(CASES)("$label", (testCase) => {
        const { group, refEntry, nameEntry, refProperty, unlinked, linked } = testCase;

        it("shows only the reference select until a definition is linked", async () => {
            const unlinkedPanel = await renderPanel(XML, unlinked.element);
            const linkedPanel = await renderPanel(XML, linked.element);

            expect(unlinkedPanel.entryIds(group)).toEqual([refEntry]);
            expect(linkedPanel.entryIds(group)).toEqual([refEntry, ...detailEntries(testCase)]);
        });

        it("offers none, create-new, then the definitions sorted by name", async () => {
            const panel = await renderPanel(XML, linked.element);

            expect(panel.optionValues(refEntry)).toEqual([
                "",
                "create-new",
                testCase.alphaId,
                testCase.betaId,
            ]);
            expect(panel.control<HTMLSelectElement>(refEntry).value).toBe(testCase.betaId);
        });

        it("links the chosen definition and unlinks it again with <none>", async () => {
            const panel = await renderPanel(XML, unlinked.element);
            const holder = panel.elementsById[unlinked.holder];

            await panel.selectOption(refEntry, testCase.alphaId);

            expect(holder.get(refProperty)).toBe(panel.elementsById[testCase.alphaId]);
            expect(panel.entryIds(group)).toEqual([refEntry, ...detailEntries(testCase)]);

            await panel.selectOption(refEntry, "");

            expect(holder.get(refProperty)).toBeUndefined();
        });

        it("creates a named definition under the definitions and links it in one undo step", async () => {
            const panel = await renderPanel(XML, unlinked.element);
            const holder = panel.elementsById[unlinked.holder];
            const rootElementsBefore = [...panel.definitions.get("rootElements")];

            await panel.selectOption(refEntry, "create-new");

            const created: ModdleElement = holder.get(refProperty);
            const localName = testCase.rootType.replace("bpmn:", "");
            expect(created.$type).toBe(testCase.rootType);
            expect(created.$parent).toBe(panel.definitions);
            expect(created.id).toMatch(new RegExp(`^${localName}_`));
            expect(created.get("name")).toMatch(new RegExp(`^${localName}_`));
            expect(panel.definitions.get("rootElements")).toEqual([...rootElementsBefore, created]);
            expect(panel.control(nameEntry).value).toBe(created.get("name"));

            await panel.undo();

            expect(holder.get(refProperty)).toBeUndefined();
            expect(panel.definitions.get("rootElements")).toEqual(rootElementsBefore);
        });

        it("edits the linked definition, not the event", async () => {
            const panel = await renderPanel(XML, linked.element);
            const beta = panel.elementsById[testCase.betaId];

            await panel.typeText(nameEntry, "Renamed");
            if (testCase.code) {
                await panel.typeText(testCase.code.entry, "NEW_CODE");
            }

            expect(beta.get("name")).toBe("Renamed");
            expect(panel.elementsById[linked.element].get("name")).toBeUndefined();
            if (testCase.code) {
                expect(beta.get(testCase.code.property)).toBe("NEW_CODE");
            }
        });

        it("is disabled in the viewer and ignores forced edits", async () => {
            const panel = await renderPanel(XML, linked.element, { readonly: true });
            const windowErrors = collectWindowErrors();
            const holder = panel.elementsById[linked.holder];
            const beta = panel.elementsById[testCase.betaId];

            await panel.selectOption(refEntry, testCase.alphaId);
            await panel.typeText(nameEntry, "Renamed");

            const entryIds = [refEntry, ...detailEntries(testCase)];
            expect(entryIds.every((entryId) => panel.control(entryId).disabled)).toBe(true);
            expect(holder.get(refProperty)).toBe(beta);
            expect(beta.get("name")).toBe("Beta");
            expect(windowErrors).toEqual([]);
        });
    });
});
