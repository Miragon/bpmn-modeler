import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { InlineScriptingPort } from "@miragon/bpmn-modeler-inline-scripting";
import type { LintRunEvent } from "@miragon/bpmn-modeler-types";

import * as lintModule from "./bpmnlint/index";
import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { C7_SCRIPTS_XML, FAR_FROM_ORIGIN_XML, START_EVENT_XML } from "./__fixtures__/bpmnXml";
import { MODELER_MODDLE, declaringCamunda87Under } from "./__fixtures__/modelerModdle";
import { animationFrames, mountWithPanel, removeMounts, wait } from "./__fixtures__/surfaceMount";

/**
 * The modeler-only facade methods the webview bootstrap wires to host commands
 * (script tab sync, element templates, align-to-origin, Design/Implement). They
 * resolve stringly-named DI services of the real engine stack, which jsdom
 * cannot stand up, so they run against a real modeler here.
 */

const SCRIPT_TASK_MORPHED_XML = C7_SCRIPTS_XML.replace(
    /<bpmn:scriptTask id="ScriptTask_1"[\s\S]*?<\/bpmn:scriptTask>/,
    '<bpmn:userTask id="ScriptTask_1" />',
);

const LEGACY_SCRIPT_FORMAT_XML = C7_SCRIPTS_XML.replace(
    '<bpmn:scriptTask id="ScriptTask_1" scriptFormat="groovy">',
    '<bpmn:scriptTask id="ScriptTask_1" camunda:scriptFormat="javascript">',
);

const SERVICE_TASK_WITHOUT_JOB_TYPE_XML = FAR_FROM_ORIGIN_XML.replace(
    '<bpmn:task id="Task_1" name="A" />',
    '<bpmn:serviceTask id="Task_1" name="A" />',
);

interface FlowElement {
    id: string;
    script?: string;
}

interface BpmnReplaceService {
    replaceElement(element: unknown, target: { type: string }): unknown;
}

interface ShapeBounds {
    x: number;
    y: number;
}

function scriptOf(modeler: BpmnModeler, elementId: string): string | undefined {
    const process = modeler.getDefinitions().rootElements[0] as unknown as {
        flowElements: FlowElement[];
    };
    return process.flowElements.find((element) => element.id === elementId)?.script;
}

function boundsOf(modeler: BpmnModeler, elementId: string): ShapeBounds {
    return modeler.getService("elementRegistry").get(elementId) as unknown as ShapeBounds;
}

describe("BpmnModeler inline-script sync (C7 with a scripting port)", () => {
    const scriptingPort = {
        openScriptEditor: vi.fn(),
        scriptSourceChanged: vi.fn(),
    } satisfies InlineScriptingPort;
    const onWarning = vi.fn();
    let modeler: BpmnModeler;

    beforeAll(async () => {
        const { container, panel } = mountWithPanel();
        modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
            capabilities: { scripting: scriptingPort },
            linting: false,
            onWarning,
        });
    });

    beforeEach(async () => {
        modeler.applyOpenScriptEditors([]);
        // A re-import also resets the command stack between tests.
        await modeler.loadDiagram(C7_SCRIPTS_XML);
        vi.clearAllMocks();
    });

    afterAll(() => {
        modeler.destroy();
        removeMounts();
    });

    it("collects only inline script tasks for the generate-script-files command", () => {
        expect(modeler.collectInlineScriptTasks()).toEqual([
            { elementId: "ScriptTask_1", scriptFormat: "groovy", content: "x = 1" },
        ]);
    });

    it("writes script-task content into the live model as one undoable step", async () => {
        modeler.updateScriptContent("ScriptTask_1", "script-task", undefined, "x = 2");

        expect(scriptOf(modeler, "ScriptTask_1")).toBe("x = 2");
        expect(await modeler.exportDiagram()).toContain("<bpmn:script>x = 2</bpmn:script>");

        modeler.getService("commandStack").undo();
        expect(scriptOf(modeler, "ScriptTask_1")).toBe("x = 1");
    });

    it("writes a script-task format to the plain BPMN attribute", async () => {
        modeler.updateScriptFormat("ScriptTask_1", "script-task", undefined, "javascript");

        const xml = await modeler.exportDiagram();
        expect(xml).toMatch(/<bpmn:scriptTask id="ScriptTask_1" scriptFormat="javascript">/);
        expect(xml).not.toContain("camunda:scriptFormat");
    });

    it("reads back a script-task format written over a legacy camunda:scriptFormat", async () => {
        await modeler.loadDiagram(LEGACY_SCRIPT_FORMAT_XML);
        expect(modeler.collectInlineScriptTasks()).toContainEqual({
            elementId: "ScriptTask_1",
            scriptFormat: "javascript",
            content: "x = 1",
        });

        modeler.updateScriptFormat("ScriptTask_1", "script-task", undefined, "groovy");

        expect(modeler.collectInlineScriptTasks()).toContainEqual({
            elementId: "ScriptTask_1",
            scriptFormat: "groovy",
            content: "x = 1",
        });
    });

    it("writes listener scripts into the addressed listener's camunda:script", async () => {
        modeler.updateScriptContent("Task_Listeners", "execution-listener", 1, "done = false");
        modeler.updateScriptFormat("Task_Listeners", "execution-listener", 1, "groovy");
        modeler.updateScriptContent("UserTask_1", "task-listener", 0, "priority = 2");

        const xml = await modeler.exportDiagram();
        expect(xml).toContain(
            '<camunda:script scriptFormat="groovy">done = false</camunda:script>',
        );
        expect(xml).toContain(
            '<camunda:script scriptFormat="groovy">priority = 2</camunda:script>',
        );
        expect(onWarning).not.toHaveBeenCalled();
    });

    it.each([
        {
            target: "an unknown element",
            write: (handle: BpmnModeler) =>
                handle.updateScriptContent("Nope", "script-task", undefined, "x"),
            warning: "Element not found: Nope",
        },
        {
            target: "a class-based listener",
            write: (handle: BpmnModeler) =>
                handle.updateScriptFormat("Task_Listeners", "execution-listener", 0, "groovy"),
            warning: "camunda:ExecutionListener #0 on Task_Listeners has no inline script",
        },
    ])("warns the host log and leaves the model untouched for $target", ({ write, warning }) => {
        write(modeler);

        expect(onWarning).toHaveBeenCalledExactlyOnceWith(warning);
        expect(modeler.getService("commandStack").canUndo()).toBe(false);
    });

    it.each([
        {
            field: "content",
            push: (handle: BpmnModeler) =>
                handle.updateScriptContent("ScriptTask_1", "script-task", undefined, "x = 2"),
        },
        {
            field: "format",
            push: (handle: BpmnModeler) =>
                handle.updateScriptFormat("ScriptTask_1", "script-task", undefined, "javascript"),
        },
    ])(
        "drops a script $field push for a task the user turned into a user task",
        async ({ push }) => {
            const scriptTask = modeler.getService("elementRegistry").get("ScriptTask_1");
            // A replace-menu morph keeps the element id, so a late push still finds it.
            modeler.getService<BpmnReplaceService>("bpmnReplace").replaceElement(scriptTask, {
                type: "bpmn:UserTask",
            });

            push(modeler);

            const xml = await modeler.exportDiagram();
            const userTaskTag = xml.match(/<bpmn:userTask id="ScriptTask_1"[^>]*>/)?.[0];
            expect(userTaskTag).toBeDefined();
            expect(userTaskTag).not.toContain("script");
            expect(onWarning).toHaveBeenCalledExactlyOnceWith("ScriptTask_1 has no inline script");
        },
    );

    it("reports model-side changes to an open script tab but never echoes the tab's own edits", () => {
        modeler.applyOpenScriptEditors([
            {
                elementId: "ScriptTask_1",
                kind: "script-task",
                listenerIndex: undefined,
                fileName: "ScriptTask_1.groovy",
            },
        ]);

        modeler.updateScriptContent("ScriptTask_1", "script-task", undefined, "x = 2");
        expect(scriptingPort.scriptSourceChanged).not.toHaveBeenCalled();

        modeler.getService("commandStack").undo();
        expect(scriptingPort.scriptSourceChanged).toHaveBeenCalledExactlyOnceWith({
            elementId: "ScriptTask_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: "x = 1",
        });
    });
});

describe("BpmnModeler host pushes without the matching capability", () => {
    afterEach(removeMounts);

    it("ignores script-editor and implementation-status pushes on a C8 modeler", async () => {
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c8",
            propertiesPanel: { parent: panel },
            linting: false,
        });

        expect(() =>
            modeler.applyOpenScriptEditors([
                {
                    elementId: "Task_1",
                    kind: "script-task",
                    listenerIndex: undefined,
                    fileName: "Task_1.js",
                },
            ]),
        ).not.toThrow();
        expect(() => modeler.applyImplementationStatus({ Task_1: true })).not.toThrow();

        modeler.destroy();
    });

    it("reports ignored lint pushes through onWarning and still mirrors them to the console", async () => {
        const onWarning = vi.fn();
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c8",
            propertiesPanel: { parent: panel },
            linting: false,
            onWarning,
        });
        const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

        modeler.applyLintResults({});
        modeler.applyLintingDisabled();
        modeler.startInPageLinting();
        const consoleMessages = consoleWarn.mock.calls.map(([message]) => message);
        consoleWarn.mockRestore();

        const expectedWarnings = [
            "applyLintResults",
            "applyLintingDisabled",
            "startInPageLinting",
        ].map((method) => `${method} ignored: this surface was created without a lint module`);
        expect(onWarning.mock.calls.map(([message]) => message)).toEqual(expectedWarnings);
        expect(consoleMessages).toEqual(expectedWarnings);

        modeler.destroy();
    });
});

describe("BpmnModeler open script tabs on a freshly created modeler", () => {
    const scriptingPort = {
        openScriptEditor: vi.fn(),
        scriptSourceChanged: vi.fn(),
    } satisfies InlineScriptingPort;
    const scriptTaskTab = {
        elementId: "ScriptTask_1",
        kind: "script-task",
        listenerIndex: undefined,
        fileName: "ScriptTask_1.groovy",
    } as const;
    let modeler: BpmnModeler;

    beforeEach(async () => {
        vi.clearAllMocks();
        const { container, panel } = mountWithPanel();
        modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
            capabilities: { scripting: scriptingPort },
            linting: false,
        });
    });

    afterEach(async () => {
        // Tearing down before the panel's after-paint effects trips them on a destroyed canvas.
        await animationFrames(1);
        await wait(0);
        modeler.destroy();
        removeMounts();
    });

    it("closes the tab of a script task that changed type while the webview was hidden", async () => {
        // A rebuilt webview imports the current XML before the host re-broadcasts its open tabs.
        await modeler.loadDiagram(SCRIPT_TASK_MORPHED_XML);

        modeler.applyOpenScriptEditors([scriptTaskTab]);

        expect(scriptingPort.scriptSourceChanged).toHaveBeenCalledExactlyOnceWith({
            elementId: "ScriptTask_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: undefined,
        });
    });

    it("judges tabs applied before the first import against the imported diagram", async () => {
        modeler.applyOpenScriptEditors([scriptTaskTab]);

        await modeler.loadDiagram(C7_SCRIPTS_XML);
        expect(scriptingPort.scriptSourceChanged).not.toHaveBeenCalled();

        modeler.updateScriptContent("ScriptTask_1", "script-task", undefined, "x = 2");
        modeler.getService("commandStack").undo();
        expect(scriptingPort.scriptSourceChanged).toHaveBeenCalledExactlyOnceWith({
            elementId: "ScriptTask_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: "x = 1",
        });
    });

    it("closes a tab applied before the first import when the imported diagram lacks it", async () => {
        modeler.applyOpenScriptEditors([scriptTaskTab]);

        await modeler.loadDiagram(SCRIPT_TASK_MORPHED_XML);

        expect(scriptingPort.scriptSourceChanged).toHaveBeenCalledExactlyOnceWith({
            elementId: "ScriptTask_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: undefined,
        });
    });

    it("keeps tabs applied before a failed first import open", async () => {
        modeler.applyOpenScriptEditors([scriptTaskTab]);

        await expect(modeler.loadDiagram("<not-bpmn")).rejects.toThrow();
        modeler.applyOpenScriptEditors([scriptTaskTab]);

        expect(scriptingPort.scriptSourceChanged).not.toHaveBeenCalled();
    });
});

describe("BpmnModeler element templates", () => {
    const VALID_TEMPLATE = {
        name: "Audit task",
        id: "com.example.audit",
        appliesTo: ["bpmn:Task"],
        properties: [],
    };
    const C8_TEMPLATE = {
        ...VALID_TEMPLATE,
        $schema:
            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
    };

    afterEach(removeMounts);

    it("reports invalid initial templates and still applies the valid ones", async () => {
        const onElementTemplatesErrors = vi.fn();
        const { container, panel } = mountWithPanel();

        const modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
            linting: false,
            elementTemplates: [{ name: "Missing id and appliesTo" }, VALID_TEMPLATE],
            onElementTemplatesErrors,
        });

        expect(onElementTemplatesErrors).toHaveBeenCalledOnce();
        expect(onElementTemplatesErrors.mock.calls[0][0].length).toBeGreaterThan(0);
        expect(templateIds(modeler)).toEqual(["com.example.audit"]);

        modeler.destroy();
    });

    it("replaces the template set on a live push", async () => {
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c7",
            propertiesPanel: { parent: panel },
            linting: false,
            elementTemplates: [VALID_TEMPLATE],
        });
        expect(templateIds(modeler)).toEqual(["com.example.audit"]);

        modeler.setElementTemplates([{ ...VALID_TEMPLATE, id: "com.example.review" }]);

        expect(templateIds(modeler)).toEqual(["com.example.review"]);
        modeler.destroy();
    });

    it.each<{ registers: string; moddleExtensions: Record<string, object> }>([
        { registers: "no package", moddleExtensions: {} },
        { registers: "a modeler package", moddleExtensions: { modeler: MODELER_MODDLE } },
    ])(
        "gates templates on the engine version a diagram declares under any modeler prefix when moddle registers $registers",
        async ({ moddleExtensions }) => {
            const { container, panel } = mountWithPanel();
            const modeler = await createModeler(container, {
                engine: "c8",
                propertiesPanel: { parent: panel },
                linting: false,
                moddleExtensions,
                elementTemplates: [
                    { ...C8_TEMPLATE, id: "com.example.audit-8-7", engines: { camunda: "^8.7" } },
                    { ...C8_TEMPLATE, id: "com.example.audit-8-8", engines: { camunda: "^8.8" } },
                ],
            });

            await modeler.loadDiagram(declaringCamunda87Under("cm", START_EVENT_XML));

            expect(latestTemplateIds(modeler)).toEqual(["com.example.audit-8-7"]);
            modeler.destroy();
        },
    );

    function templateIds(modeler: BpmnModeler): string[] {
        return modeler
            .getService<{ getAll(): Array<{ id: string }> }>("elementTemplates")
            .getAll()
            .map((template) => template.id);
    }

    function latestTemplateIds(modeler: BpmnModeler): string[] {
        return modeler
            .getService<{ getLatest(): Array<{ id: string }> }>("elementTemplates")
            .getLatest()
            .map((template) => template.id);
    }
});

describe("BpmnModeler align to origin", () => {
    let modeler: BpmnModeler;

    beforeEach(async () => {
        const { container, panel } = mountWithPanel();
        modeler = await createModeler(container, {
            engine: "c8",
            propertiesPanel: { parent: panel },
            linting: false,
        });
        await modeler.loadDiagram(FAR_FROM_ORIGIN_XML);
    });

    afterEach(() => {
        modeler.destroy();
        removeMounts();
    });

    it("leaves the diagram in place while the setting is off", () => {
        modeler.alignElementsToOrigin();

        expect(boundsOf(modeler, "StartEvent_1")).toMatchObject({ x: 5000, y: 4000 });
        expect(modeler.getService("commandStack").canUndo()).toBe(false);
    });

    it("moves the diagram to the origin offset only when asked, never on a plain export", async () => {
        modeler.setSettings({ alignToOrigin: true });

        await modeler.exportDiagram();
        expect(boundsOf(modeler, "StartEvent_1").x).toBe(5000);

        modeler.alignElementsToOrigin();
        expect(boundsOf(modeler, "StartEvent_1").x).toBe(150);
        expect(boundsOf(modeler, "Task_1").y).toBe(150);

        const commandStack = modeler.getService("commandStack");
        commandStack.undo();
        expect(commandStack.canUndo()).toBe(false);
        expect(boundsOf(modeler, "StartEvent_1")).toMatchObject({ x: 5000, y: 4000 });
        expect(boundsOf(modeler, "Task_2")).toMatchObject({ x: 5300, y: 3980 });
    });
});

describe("BpmnModeler design/implement mode", () => {
    afterEach(removeMounts);

    it("opens in the requested mode and marks container and panel", async () => {
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c8",
            mode: "design",
            propertiesPanel: { parent: panel },
            linting: false,
        });

        expect(modeler.getMode()).toBe("design");
        expect(container.dataset.bpmnMode).toBe("design");
        expect(panel.dataset.bpmnMode).toBe("design");
        modeler.destroy();
    });

    it("switches live, notifying once per actual change", async () => {
        const onModeChanged = vi.fn();
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c8",
            mode: "design",
            propertiesPanel: { parent: panel },
            linting: false,
            onModeChanged,
        });

        modeler.setMode("implement");
        modeler.setMode("implement");

        expect(modeler.getMode()).toBe("implement");
        expect(onModeChanged).toHaveBeenCalledExactlyOnceWith("implement");
        expect(container.dataset.bpmnMode).toBe("implement");
        expect(panel.dataset.bpmnMode).toBe("implement");
        modeler.destroy();
    });

    it("re-resolves the in-page lint rules for the new mode", async () => {
        const lintRuns: LintRunEvent[] = [];
        const { container, panel } = mountWithPanel();
        const modeler = await createModeler(container, {
            engine: "c8",
            propertiesPanel: { parent: panel },
            linting: { module: lintModule },
            onLintResults: (event) => lintRuns.push(event),
        });
        const engineRulesInLatestRun = () =>
            Object.keys(lintRuns.at(-1)?.results ?? {}).filter((rule) =>
                rule.startsWith("camunda-compat/"),
            );
        await modeler.loadDiagram(SERVICE_TASK_WITHOUT_JOB_TYPE_XML);
        await expect.poll(engineRulesInLatestRun).toContain("camunda-compat/implementation");

        modeler.setMode("design");
        await expect.poll(engineRulesInLatestRun).toEqual([]);

        modeler.setMode("implement");
        await expect.poll(engineRulesInLatestRun).toContain("camunda-compat/implementation");
        modeler.destroy();
    });
});
