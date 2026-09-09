import type { DiffResult } from "../diffResult";

export interface ExecutionPropertyFixture {
    name: string;
    before: string;
    after: string;
    expected: DiffResult;
}

interface ElementFixture {
    id: string;
    xml: string;
}

const NS = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
  xmlns:custom="urn:miragon:custom"`;

function definitions(rootElements: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Definitions_1" targetNamespace="urn:miragon:test">
${rootElements}
</bpmn:definitions>`;
}

function linear(elements: readonly ElementFixture[], processAttributes = ""): string {
    const nodes = [
        { id: "StartEvent_1", xml: '<bpmn:startEvent id="StartEvent_1" />' },
        ...elements,
        { id: "EndEvent_1", xml: '<bpmn:endEvent id="EndEvent_1" />' },
    ];
    const flows = nodes
        .slice(0, -1)
        .map(
            (node, index) =>
                `<bpmn:sequenceFlow id="Flow_${index + 1}" sourceRef="${node.id}" targetRef="${nodes[index + 1].id}" />`,
        );
    return definitions(`  <bpmn:process id="Process_1" isExecutable="true" ${processAttributes}>
    ${nodes.map((node) => node.xml).join("\n    ")}
    ${flows.join("\n    ")}
  </bpmn:process>`);
}

function expected(
    changed: readonly string[] = [],
    added: readonly string[] = [],
    removed: readonly string[] = [],
    navigationOrder: readonly string[] = [...changed, ...added, ...removed],
): DiffResult {
    return {
        added,
        removed,
        changed,
        layoutChanged: [],
        counts: {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
            layoutChanged: 0,
        },
        navigationOrder,
    };
}

const C7_ATTRIBUTES = [
    ["class", "com.example.OldDelegate", "com.example.NewDelegate"],
    ["delegateExpression", "${oldDelegate}", "${newDelegate}"],
    ["asyncBefore", "false", "true"],
    ["asyncAfter", "false", "true"],
    ["decisionRef", "old-decision", "new-decision"],
] as const;

const C7_ATTRIBUTE_FIXTURES: readonly ExecutionPropertyFixture[] = C7_ATTRIBUTES.map(
    ([attribute, beforeValue, afterValue]) => ({
        name: `Camunda 7 ${attribute}`,
        before: linear([
            {
                id: "BusinessRuleTask_1",
                xml: `<bpmn:businessRuleTask id="BusinessRuleTask_1" camunda:${attribute}="${beforeValue}" />`,
            },
        ]),
        after: linear([
            {
                id: "BusinessRuleTask_1",
                xml: `<bpmn:businessRuleTask id="BusinessRuleTask_1" camunda:${attribute}="${afterValue}" />`,
            },
        ]),
        expected: expected(["BusinessRuleTask_1"]),
    }),
);

const C7_EXTENSION_BEFORE = `<bpmn:serviceTask id="C7ExtensionTask_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="endpoint" value="old" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`;
const C7_EXTENSION_AFTER = C7_EXTENSION_BEFORE.replace('value="old"', 'value="new"');

const C8_TASK_DEFINITION_BEFORE = `<bpmn:serviceTask id="C8TaskDefinition_1">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="old-job" retries="3" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>`;
const C8_TASK_DEFINITION_AFTER = C8_TASK_DEFINITION_BEFORE.replace(
    'type="old-job" retries="3"',
    'type="new-job" retries="5"',
);

const C8_INPUT_MAPPING_BEFORE = `<bpmn:serviceTask id="C8InputTask_1">
      <bpmn:extensionElements>
        <zeebe:ioMapping>
          <zeebe:input source="= oldInput" target="input" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`;
const C8_INPUT_MAPPING_AFTER = C8_INPUT_MAPPING_BEFORE.replace("oldInput", "newInput");

const C8_OUTPUT_MAPPING_BEFORE = `<bpmn:serviceTask id="C8OutputTask_1">
      <bpmn:extensionElements>
        <zeebe:ioMapping>
          <zeebe:output source="= oldOutput" target="output" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`;
const C8_OUTPUT_MAPPING_AFTER = C8_OUTPUT_MAPPING_BEFORE.replace("oldOutput", "newOutput");

export const EXECUTION_PROPERTY_FIXTURES: readonly ExecutionPropertyFixture[] = [
    ...C7_ATTRIBUTE_FIXTURES,
    {
        name: "Camunda 7 extension elements",
        before: linear([{ id: "C7ExtensionTask_1", xml: C7_EXTENSION_BEFORE }]),
        after: linear([{ id: "C7ExtensionTask_1", xml: C7_EXTENSION_AFTER }]),
        expected: expected(["C7ExtensionTask_1"]),
    },
    {
        name: "Camunda 8 task definition",
        before: linear([{ id: "C8TaskDefinition_1", xml: C8_TASK_DEFINITION_BEFORE }]),
        after: linear([{ id: "C8TaskDefinition_1", xml: C8_TASK_DEFINITION_AFTER }]),
        expected: expected(["C8TaskDefinition_1"]),
    },
    {
        name: "Camunda 8 input and output mappings",
        before: linear([
            { id: "C8InputTask_1", xml: C8_INPUT_MAPPING_BEFORE },
            { id: "C8OutputTask_1", xml: C8_OUTPUT_MAPPING_BEFORE },
        ]),
        after: linear([
            { id: "C8InputTask_1", xml: C8_INPUT_MAPPING_AFTER },
            { id: "C8OutputTask_1", xml: C8_OUTPUT_MAPPING_AFTER },
        ]),
        expected: expected(["C8InputTask_1", "C8OutputTask_1"]),
    },
    {
        name: "custom attribute addition, removal, and parsed string value",
        before: linear([
            { id: "CustomAdd_1", xml: '<bpmn:task id="CustomAdd_1" />' },
            {
                id: "CustomRemove_1",
                xml: '<bpmn:task id="CustomRemove_1" custom:removed="yes" />',
            },
            {
                id: "CustomValue_1",
                xml: '<bpmn:task id="CustomValue_1" custom:value="old &amp; parsed" />',
            },
        ]),
        after: linear([
            { id: "CustomAdd_1", xml: '<bpmn:task id="CustomAdd_1" custom:added="yes" />' },
            { id: "CustomRemove_1", xml: '<bpmn:task id="CustomRemove_1" />' },
            {
                id: "CustomValue_1",
                xml: '<bpmn:task id="CustomValue_1" custom:value="new &amp; parsed" />',
            },
        ]),
        expected: expected(["CustomAdd_1", "CustomRemove_1", "CustomValue_1"]),
    },
    {
        name: "custom attributes on nested typed and generic extensions",
        before: linear([
            {
                id: "NestedExtensionTask_1",
                xml: `<bpmn:serviceTask id="NestedExtensionTask_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="typed" value="same" custom:flag="old" />
        </camunda:properties>
        <custom:container><custom:item custom:flag="old" /></custom:container>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`,
            },
        ]),
        after: linear([
            {
                id: "NestedExtensionTask_1",
                xml: `<bpmn:serviceTask id="NestedExtensionTask_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="typed" value="same" custom:flag="new" />
        </camunda:properties>
        <custom:container><custom:item custom:flag="new" /></custom:container>
      </bpmn:extensionElements>
    </bpmn:serviceTask>`,
            },
        ]),
        expected: expected(["NestedExtensionTask_1"]),
    },
    {
        name: "typed defaults and attribute reordering",
        before: linear([
            {
                id: "DefaultTask_1",
                xml: '<bpmn:task id="DefaultTask_1" camunda:asyncBefore="false" custom:a="1" custom:b="2" />',
            },
        ]),
        after: linear([
            {
                id: "DefaultTask_1",
                xml: '<bpmn:task custom:b="2" id="DefaultTask_1" custom:a="1" />',
            },
        ]),
        expected: expected(),
    },
    {
        name: "nested subprocess owner",
        before: linear([
            {
                id: "SubProcess_1",
                xml: `<bpmn:subProcess id="SubProcess_1">
      <bpmn:serviceTask id="NestedTask_1">
        <bpmn:extensionElements>
          <zeebe:taskDefinition type="nested" custom:version="old" />
        </bpmn:extensionElements>
      </bpmn:serviceTask>
    </bpmn:subProcess>`,
            },
        ]),
        after: linear([
            {
                id: "SubProcess_1",
                xml: `<bpmn:subProcess id="SubProcess_1">
      <bpmn:serviceTask id="NestedTask_1">
        <bpmn:extensionElements>
          <zeebe:taskDefinition type="nested" custom:version="new" />
        </bpmn:extensionElements>
      </bpmn:serviceTask>
    </bpmn:subProcess>`,
            },
        ]),
        expected: expected(["NestedTask_1"]),
    },
    {
        name: "mixed C7 and C8 properties deduplicate across passes",
        before: linear([
            {
                id: "MixedTask_1",
                xml: `<bpmn:serviceTask id="MixedTask_1" camunda:class="OldDelegate">
      <bpmn:extensionElements><zeebe:taskDefinition type="old-job" /></bpmn:extensionElements>
    </bpmn:serviceTask>`,
            },
        ]),
        after: linear([
            {
                id: "MixedTask_1",
                xml: `<bpmn:serviceTask id="MixedTask_1" camunda:class="NewDelegate">
      <bpmn:extensionElements><zeebe:taskDefinition type="new-job" /></bpmn:extensionElements>
    </bpmn:serviceTask>`,
            },
        ]),
        expected: expected(["MixedTask_1"]),
    },
    {
        name: "custom prefix rename is a textual change",
        before: linear([
            { id: "PrefixTask_1", xml: '<bpmn:task id="PrefixTask_1" custom:value="same" />' },
        ]),
        after: linear([
            { id: "PrefixTask_1", xml: '<bpmn:task id="PrefixTask_1" renamed:value="same" />' },
        ]).replace('xmlns:custom="urn:miragon:custom"', 'xmlns:renamed="urn:miragon:custom"'),
        expected: expected(["PrefixTask_1"]),
    },
];

export const STRUCTURAL_CUSTOM_ATTRIBUTE_FIXTURE: ExecutionPropertyFixture = {
    name: "custom attributes do not turn added or removed owners into changes",
    before: definitions(`  <bpmn:process id="Process_1">
    <bpmn:task id="RemovedTask_1" custom:value="before" />
  </bpmn:process>`),
    after: definitions(`  <bpmn:process id="Process_1">
    <bpmn:task id="AddedTask_1" custom:value="after" />
  </bpmn:process>`),
    expected: expected([], ["AddedTask_1"], ["RemovedTask_1"], ["AddedTask_1", "RemovedTask_1"]),
};

export const PARTICIPANT_OWNER_FIXTURE: ExecutionPropertyFixture = {
    name: "process attributes map to the participant visual",
    before: definitions(`  <bpmn:process id="Process_1" custom:version="old" />
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>`),
    after: definitions(`  <bpmn:process id="Process_1" custom:version="new" />
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>`),
    expected: expected(["Participant_1"]),
};

export const ALL_EXECUTION_PROPERTY_FIXTURES: readonly ExecutionPropertyFixture[] = [
    ...EXECUTION_PROPERTY_FIXTURES,
    STRUCTURAL_CUSTOM_ATTRIBUTE_FIXTURE,
    PARTICIPANT_OWNER_FIXTURE,
];
