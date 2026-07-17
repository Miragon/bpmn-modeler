import { describe, expect, it } from "vitest";

import { ScriptXmlService } from "./ScriptXmlService";

/**
 * Fixture with the three script surfaces the service addresses: a script task,
 * and a user task carrying interleaved execution + task listeners so the
 * filtered-index addressing is exercised (index 0 of task listeners must skip
 * over the execution listener sitting between them).
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:scriptTask id="Task_1" name="ST" scriptFormat="groovy">
      <bpmn:script>x = 1</bpmn:script>
    </bpmn:scriptTask>
    <bpmn:userTask id="User_1">
      <bpmn:extensionElements>
        <camunda:taskListener event="create">
          <camunda:script scriptFormat="javascript">tl0</camunda:script>
        </camunda:taskListener>
        <camunda:executionListener event="start">
          <camunda:script scriptFormat="javascript">el0</camunda:script>
        </camunda:executionListener>
        <camunda:taskListener event="complete">
          <camunda:script scriptFormat="javascript">tl1</camunda:script>
        </camunda:taskListener>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:userTask id="User_2">
      <bpmn:extensionElements>
        <camunda:taskListener event="assignment" class="com.acme.Listener" />
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:scriptTask id="Task_Empty" scriptFormat="groovy" />
  </bpmn:process>
</bpmn:definitions>`;

describe("ScriptXmlService.applyScriptContents", () => {
    it("returns undefined for an empty update list", async () => {
        const svc = new ScriptXmlService();
        expect(await svc.applyScriptContents(FIXTURE, [])).toBeUndefined();
    });

    it("replaces a script task's inline body", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "y = 2",
            },
        ]);

        expect(out).toBeDefined();
        expect(out).toContain("<bpmn:script>y = 2</bpmn:script>");
        expect(out).not.toContain("<bpmn:script>x = 1</bpmn:script>");
    });

    it("sets a script task whose script was unset", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            {
                elementId: "Task_Empty",
                kind: "script-task",
                listenerIndex: undefined,
                content: "now = set",
            },
        ]);

        expect(out).toContain("now = set");
    });

    it("addresses the filtered index of interleaved task listeners", async () => {
        const svc = new ScriptXmlService();

        // taskListener[1] is the third extension element (an execution listener
        // sits between the two task listeners) so filtered indexing must land
        // on the `complete` listener, not the raw third child.
        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "User_1", kind: "task-listener", listenerIndex: 1, content: "tl1-new" },
        ]);

        expect(out).toContain("tl1-new");
        expect(out).not.toContain(">tl1<");
        // The execution listener and the other task listener are untouched.
        expect(out).toContain(">el0<");
        expect(out).toContain(">tl0<");
    });

    it("addresses an execution listener by its own filtered index", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            {
                elementId: "User_1",
                kind: "execution-listener",
                listenerIndex: 0,
                content: "el0-new",
            },
        ]);

        expect(out).toContain("el0-new");
        expect(out).toContain(">tl0<");
        expect(out).toContain(">tl1<");
    });

    it("returns undefined when the element is gone", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "Missing", kind: "script-task", listenerIndex: undefined, content: "x" },
        ]);

        expect(out).toBeUndefined();
    });

    it("returns undefined for an out-of-range listener index", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "User_1", kind: "task-listener", listenerIndex: 5, content: "x" },
        ]);

        expect(out).toBeUndefined();
    });

    it("returns undefined for a listener without an inline script", async () => {
        const svc = new ScriptXmlService();

        // User_2's only task listener is a `class` implementation, no <script>.
        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "User_2", kind: "task-listener", listenerIndex: 0, content: "x" },
        ]);

        expect(out).toBeUndefined();
    });

    it("returns undefined when the content already matches", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "x = 1",
            },
        ]);

        expect(out).toBeUndefined();
    });

    it("treats an unset script task as empty content (no-op)", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "Task_Empty", kind: "script-task", listenerIndex: undefined, content: "" },
        ]);

        expect(out).toBeUndefined();
    });

    it("serialises once for multiple updates and returns changed XML when any diverged", async () => {
        const svc = new ScriptXmlService();

        const out = await svc.applyScriptContents(FIXTURE, [
            // unchanged
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "x = 1",
            },
            // changed
            { elementId: "User_1", kind: "task-listener", listenerIndex: 0, content: "tl0-new" },
        ]);

        expect(out).toBeDefined();
        expect(out).toContain("tl0-new");
        // Task_1 stays as it was.
        expect(out).toContain("<bpmn:script>x = 1</bpmn:script>");
    });

    it("is byte-stable: re-applying the current value of a formatted round-trip is a no-op", async () => {
        const svc = new ScriptXmlService();

        // Normalise the fixture through the service's own writer first, so the
        // baseline is exactly what a webview `saveXML({ format: true })` export
        // would produce. A no-op update against that must return undefined.
        const normalized = await svc.applyScriptContents(FIXTURE, [
            { elementId: "Task_1", kind: "script-task", listenerIndex: undefined, content: "seed" },
        ]);
        expect(normalized).toBeDefined();

        const noop = await svc.applyScriptContents(normalized as string, [
            { elementId: "Task_1", kind: "script-task", listenerIndex: undefined, content: "seed" },
        ]);
        expect(noop).toBeUndefined();

        // A real change against the normalised XML differs only in the script text.
        const changed = await svc.applyScriptContents(normalized as string, [
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "seed2",
            },
        ]);
        expect(changed).toBeDefined();
        expect((changed as string).replace("seed2", "seed")).toBe(normalized);
    });

    it("escapes special characters and survives a re-parse", async () => {
        const svc = new ScriptXmlService();
        const tricky = 'if (a < b && c > d) {\n  x = "<tag>";\n}';

        const out = await svc.applyScriptContents(FIXTURE, [
            { elementId: "Task_1", kind: "script-task", listenerIndex: undefined, content: tricky },
        ]);

        expect(out).toBeDefined();
        // Serialised form must escape the XML metacharacters.
        expect(out).toContain("&lt;");
        expect(out).toContain("&amp;");
        expect(out).toContain("&gt;");

        // Re-parsing yields the original content unchanged (round-trip
        // fidelity): a no-op update with the same tricky content is undefined.
        const noop = await svc.applyScriptContents(out as string, [
            { elementId: "Task_1", kind: "script-task", listenerIndex: undefined, content: tricky },
        ]);
        expect(noop).toBeUndefined();
    });
});
