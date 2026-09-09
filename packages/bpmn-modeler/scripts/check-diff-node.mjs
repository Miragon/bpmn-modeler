// Node smoke test for the `./diff` data-layer entry (#1378).
//
// Imports the built `dist/diff.js` under plain Node — no jsdom, no DOM globals —
// and runs `computeDiff` on two inline XML strings. This mechanises the
// "browser + Node" acceptance criterion and catches DOM/CSS leakage into the
// shared Rollup chunks the diff entry pulls in: any such import would throw at
// module-eval time here, where `window`/`document` do not exist.
import { computeDiff, sideView } from "../dist/diff.js";

const BEFORE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:custom="urn:custom" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:serviceTask id="ExecutionTask_1" camunda:class="OldDelegate">
      <bpmn:extensionElements><zeebe:taskDefinition type="old-job" /></bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:task id="CustomTask_1" custom:value="old" />
  </bpmn:process>
</bpmn:definitions>`;

const AFTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:custom="urn:custom" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:serviceTask id="ExecutionTask_1" camunda:class="NewDelegate">
      <bpmn:extensionElements><zeebe:taskDefinition type="new-job" /></bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:task id="CustomTask_1" custom:value="new" />
    <bpmn:task id="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

function fail(message) {
    console.error(`check-diff-node: ${message}`);
    process.exit(1);
}

const result = await computeDiff(BEFORE, AFTER);

for (const key of ["added", "removed", "changed", "layoutChanged", "navigationOrder"]) {
    if (!Array.isArray(result[key])) fail(`result.${key} is not an array`);
}
if (typeof result.counts?.added !== "number") fail("result.counts.added is not a number");
if (!result.added.includes("Task_1")) fail("expected the added Task_1 in result.added");
if (!result.changed.includes("ExecutionTask_1")) fail("expected execution properties to change");
if (!result.changed.includes("CustomTask_1")) fail("expected the custom attribute to change");

const before = sideView(result, "before");
if (before.added.length !== 0) fail("sideView(before).added should be blank");
const after = sideView(result, "after");
if (!after.added.includes("Task_1")) fail("sideView(after).added should carry Task_1");

console.log("check-diff-node: dist/diff.js runs under Node and returns a DiffResult.");
