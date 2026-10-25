import { describe, expect, it } from "vitest";

import {
    BPMN_NAMESPACES,
    collectWindowErrors,
    renderPanel,
    type ModdleElement,
    type PanelHarness,
} from "../../__fixtures__/panelHarness";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_WithProcess" name="Pool" processRef="Process_Main" />
    <bpmn:participant id="Participant_Empty" name="Empty pool" />
  </bpmn:collaboration>
  <bpmn:process id="Process_Main" name="Main">
    <bpmn:task id="Task_Plain" />
    <bpmn:task id="Task_MultiInstance"><bpmn:multiInstanceLoopCharacteristics id="Task_MultiInstance_Loop" /></bpmn:task>
    <bpmn:task id="Task_StandardLoop"><bpmn:standardLoopCharacteristics /></bpmn:task>
    <bpmn:adHocSubProcess id="AdHoc" />
    <bpmn:subProcess id="SubProcess_Plain" />
    <bpmn:subProcess id="SubProcess_ForCompensation" name="Undo" isForCompensation="true" />
    <bpmn:callActivity id="CallActivity_1" name="Charge card" />
    <bpmn:task id="Task_Compensable" name="Reserve stock" />
    <bpmn:boundaryEvent id="Boundary_Compensate" attachedToRef="Task_Compensable"><bpmn:compensateEventDefinition /></bpmn:boundaryEvent>
    <bpmn:task id="Task_Timed" name="Wait" />
    <bpmn:boundaryEvent id="TimerBoundary_Duration" attachedToRef="Task_Timed">
      <bpmn:timerEventDefinition id="TimerBoundary_Duration_Def"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT15M</bpmn:timeDuration></bpmn:timerEventDefinition>
    </bpmn:boundaryEvent>
    <bpmn:startEvent id="TimerStart_Untyped"><bpmn:timerEventDefinition id="TimerStart_Untyped_Def" /></bpmn:startEvent>
    <bpmn:intermediateCatchEvent id="LinkCatch"><bpmn:linkEventDefinition id="LinkCatch_Def" name="Loop" /></bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="CompensateEnd"><bpmn:compensateEventDefinition id="CompensateEnd_Def" /></bpmn:endEvent>
    <bpmn:subProcess id="EventSubProcess" name="On failure" triggeredByEvent="true">
      <bpmn:callActivity id="CallActivity_Inner" name="Inner refund" />
      <bpmn:intermediateThrowEvent id="CompensateThrow_Inner"><bpmn:compensateEventDefinition /></bpmn:intermediateThrowEvent>
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>`;

describe("neutral property groups", () => {
    describe("applicability", () => {
        it.each([
            { element: "LinkCatch", group: "link", entries: ["linkName"] },
            {
                element: "Task_MultiInstance",
                group: "multiInstance",
                entries: ["loopCardinality", "completionCondition"],
            },
            {
                element: "AdHoc",
                group: "adHocCompletion",
                entries: ["completionCondition", "cancelRemainingInstances"],
            },
            {
                element: "CompensateEnd",
                group: "compensation",
                entries: ["waitForCompletion", "activityRef"],
            },
            {
                element: "TimerStart_Untyped",
                group: "timer",
                entries: ["timerEventDefinitionType"],
            },
            {
                element: "TimerBoundary_Duration",
                group: "timer",
                entries: ["timerEventDefinitionType", "timerEventDefinitionValue"],
            },
            {
                element: "Participant_WithProcess",
                group: "general",
                entries: ["name", "id", "processId", "processName", "isExecutable"],
            },
            { element: "Participant_Empty", group: "general", entries: ["name", "id"] },
        ])("$element shows $group with $entries", async ({ element, group, entries }) => {
            const panel = await renderPanel(XML, element);

            expect(panel.entryIds(group)).toEqual(entries);
        });

        it.each(["Task_Plain", "Task_StandardLoop", "SubProcess_Plain"])(
            "%s shows only the general groups",
            async (element) => {
                const panel = await renderPanel(XML, element);

                expect(panel.groupIds()).toEqual(["general", "documentation"]);
            },
        );
    });

    interface EditCase {
        label: string;
        element: string;
        entry: string;
        edit: (panel: PanelHarness) => Promise<void>;
        read: (elementsById: Record<string, ModdleElement>) => unknown;
        expected: unknown;
    }

    const bodyOf = (expression: ModdleElement | undefined) => expression?.get("body");

    const EDITS: EditCase[] = [
        {
            label: "link name",
            element: "LinkCatch",
            entry: "linkName",
            edit: (panel) => panel.typeText("linkName", "Retry"),
            read: (byId) => byId.LinkCatch_Def.get("name"),
            expected: "Retry",
        },
        {
            label: "loop cardinality",
            element: "Task_MultiInstance",
            entry: "loopCardinality",
            edit: (panel) => panel.typeText("loopCardinality", "5"),
            read: (byId) => bodyOf(byId.Task_MultiInstance_Loop.get("loopCardinality")),
            expected: "5",
        },
        {
            label: "multi-instance completion condition",
            element: "Task_MultiInstance",
            entry: "completionCondition",
            edit: (panel) => panel.typeText("completionCondition", "${done}"),
            read: (byId) => bodyOf(byId.Task_MultiInstance_Loop.get("completionCondition")),
            expected: "${done}",
        },
        {
            label: "ad-hoc completion condition",
            element: "AdHoc",
            entry: "completionCondition",
            edit: (panel) => panel.typeText("completionCondition", "${done}"),
            read: (byId) => bodyOf(byId.AdHoc.get("completionCondition")),
            expected: "${done}",
        },
        {
            label: "ad-hoc cancel remaining instances (default on)",
            element: "AdHoc",
            entry: "cancelRemainingInstances",
            edit: (panel) => panel.toggleCheckbox("cancelRemainingInstances"),
            read: (byId) => byId.AdHoc.get("cancelRemainingInstances"),
            expected: false,
        },
        {
            label: "compensation wait for completion (default on)",
            element: "CompensateEnd",
            entry: "waitForCompletion",
            edit: (panel) => panel.toggleCheckbox("waitForCompletion"),
            read: (byId) => byId.CompensateEnd_Def.get("waitForCompletion"),
            expected: false,
        },
        {
            label: "compensation activity",
            element: "CompensateEnd",
            entry: "activityRef",
            edit: (panel) => panel.selectOption("activityRef", "CallActivity_1"),
            read: (byId) => byId.CompensateEnd_Def.get("activityRef")?.id,
            expected: "CallActivity_1",
        },
        {
            label: "timer value",
            element: "TimerBoundary_Duration",
            entry: "timerEventDefinitionValue",
            edit: (panel) => panel.typeText("timerEventDefinitionValue", "PT5M"),
            read: (byId) => bodyOf(byId.TimerBoundary_Duration_Def.get("timeDuration")),
            expected: "PT5M",
        },
        {
            label: "participant's process name",
            element: "Participant_WithProcess",
            entry: "processName",
            edit: (panel) => panel.typeText("processName", "Billing"),
            read: (byId) => [
                byId.Process_Main.get("name"),
                byId.Participant_WithProcess.get("name"),
            ],
            expected: ["Billing", "Pool"],
        },
        {
            label: "participant's process id",
            element: "Participant_WithProcess",
            entry: "processId",
            edit: (panel) => panel.typeText("processId", "Process_Billing"),
            read: (byId) => byId.Process_Main.id,
            expected: "Process_Billing",
        },
    ];

    describe("editing", () => {
        it.each(EDITS)(
            "$label is written through the command stack and undoable",
            async ({ element, edit, read, expected }) => {
                const panel = await renderPanel(XML, element);
                const before = read(panel.elementsById);

                await edit(panel);

                expect(read(panel.elementsById)).toEqual(expected);

                await panel.undo();

                expect(read(panel.elementsById)).toEqual(before);
            },
        );
    });

    describe("in the viewer", () => {
        it.each(EDITS)(
            "$label is disabled and ignores forced edits",
            async ({ element, entry, edit, read }) => {
                const panel = await renderPanel(XML, element, { readonly: true });
                const windowErrors = collectWindowErrors();
                const before = read(panel.elementsById);

                await edit(panel);

                expect(panel.control(entry).disabled).toBe(true);
                expect(read(panel.elementsById)).toEqual(before);
                expect(windowErrors).toEqual([]);
            },
        );
    });

    describe("timer type", () => {
        it("shows the current type and its expression", async () => {
            const panel = await renderPanel(XML, "TimerBoundary_Duration");

            expect(panel.control<HTMLSelectElement>("timerEventDefinitionType").value).toBe(
                "timeDuration",
            );
            expect(panel.control("timerEventDefinitionValue").value).toBe("PT15M");
        });

        it("switching replaces the expression with an empty one in one undo step", async () => {
            const panel = await renderPanel(XML, "TimerBoundary_Duration");
            const timer = panel.elementsById.TimerBoundary_Duration_Def;
            const duration = timer.get("timeDuration");

            await panel.selectOption("timerEventDefinitionType", "timeDate");

            const date: ModdleElement = timer.get("timeDate");
            expect(date.$type).toBe("bpmn:FormalExpression");
            expect(date.$parent).toBe(timer);
            expect(timer.get("timeDuration")).toBeUndefined();
            expect(timer.get("timeCycle")).toBeUndefined();
            expect(panel.control("timerEventDefinitionValue").value).toBe("");

            await panel.undo();

            expect(timer.get("timeDuration")).toBe(duration);
            expect(timer.get("timeDate")).toBeUndefined();
        });

        it("<none> removes every time expression", async () => {
            const panel = await renderPanel(XML, "TimerBoundary_Duration");
            const timer = panel.elementsById.TimerBoundary_Duration_Def;

            await panel.selectOption("timerEventDefinitionType", "");

            expect(
                ["timeDate", "timeDuration", "timeCycle"].map((type) => timer.get(type)),
            ).toEqual([undefined, undefined, undefined]);
            expect(panel.entryIds("timer")).toEqual(["timerEventDefinitionType"]);
        });
    });

    describe("participant's process id", () => {
        it.each([
            { value: "has space", error: "ID must not contain spaces." },
            { value: "Task_Plain", error: "ID must be unique." },
        ])("rejects $value and keeps the old id", async ({ value, error }) => {
            const panel = await renderPanel(XML, "Participant_WithProcess");

            await panel.typeText("processId", value);

            expect(panel.elementsById.Process_Main.id).toBe("Process_Main");
            expect(panel.entry("processId")!.textContent).toContain(error);
        });
    });

    describe("compensation activity options", () => {
        function optionLabels(panel: PanelHarness): string[] {
            const select = panel.control<HTMLSelectElement>("activityRef");
            return Array.from(select.options, (option) => option.textContent ?? "");
        }

        it("lists the compensable activities of the process, sorted by name", async () => {
            const panel = await renderPanel(XML, "CompensateEnd");

            expect(optionLabels(panel)).toEqual([
                "<none>",
                "(id=AdHoc)",
                "(id=SubProcess_Plain)",
                "Charge card (id=CallActivity_1)",
                "Reserve stock (id=Task_Compensable)",
            ]);
        });

        it("also lists the outer activities for a throw event inside an event subprocess", async () => {
            const panel = await renderPanel(XML, "CompensateThrow_Inner");

            expect(panel.optionValues("activityRef")).toEqual([
                "",
                "AdHoc",
                "SubProcess_Plain",
                "CallActivity_1",
                "CallActivity_Inner",
                "Task_Compensable",
            ]);
        });
    });
});
