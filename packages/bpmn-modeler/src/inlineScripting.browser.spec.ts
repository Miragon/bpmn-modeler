import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    InlineScriptingPort,
    OpenScriptEditorEvent,
} from "@miragon/bpmn-modeler-inline-scripting";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { C7_SCRIPTS_XML, SCRIPTS_XML } from "./__fixtures__/bpmnXml";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

/**
 * Pins the inline-scripting modules against the real C7 context pad, keyboard
 * and properties panel they hook into by DI name, group/entry id and panel root.
 * The library's own specs fake that DOM, so an upstream id rename or a dropped
 * module only fails here. Runs in Chromium: jsdom cannot load bpmn-js.
 */

interface ContextPadEntry {
    action: { click(event: Event, element: unknown): void };
}

interface ContextPadService {
    getEntries(element: unknown): Record<string, ContextPadEntry>;
}

interface InjectorService {
    get(name: string, strict: false): unknown;
}

const SCRIPT_TASK_OPENED = {
    elementId: "ScriptTask_1",
    kind: "script-task",
    listenerIndex: undefined,
    eventName: undefined,
    scriptFormat: "groovy",
    content: "x = 1",
} satisfies OpenScriptEditorEvent;

const SCRIPT_GROUP = '[data-group-id="group-CamundaPlatform__Script"]';

const modelers: BpmnModeler[] = [];

async function openScriptingModeler(engine: "c7" | "c8" = "c7", xml = C7_SCRIPTS_XML) {
    const port = {
        openScriptEditor: vi.fn(),
        scriptSourceChanged: vi.fn(),
    } satisfies InlineScriptingPort;
    const { container, panel } = mountWithPanel();
    const modeler = await createModeler(container, {
        engine,
        propertiesPanel: { parent: panel },
        capabilities: { scripting: port },
        linting: false,
    });
    modelers.push(modeler);
    await modeler.loadDiagram(xml);
    await afterPaint();
    return { modeler, panel, port };
}

function select(modeler: BpmnModeler, elementId: string): unknown {
    const element = modeler.getService("elementRegistry").get(elementId);
    modeler.getService("selection").select(element ?? null);
    return element;
}

function query<T extends Element>(root: ParentNode, selector: string): () => T | null {
    return () => root.querySelector<T>(selector);
}

afterEach(async () => {
    await afterPaint();
    modelers.splice(0).forEach((modeler) => modeler.destroy());
    removeMounts();
});

describe("inline scripting on a C7 modeler with a scripting port", () => {
    it("registers every scripting service and the supplied port", async () => {
        const { modeler, port } = await openScriptingModeler();

        for (const serviceName of [
            "scriptTaskContextPadProvider",
            "scriptEditorOpener",
            "scriptEditorButtons",
            "scriptEditorKeyboard",
            "openScriptEditorsStore",
            "scriptLockPropertiesProvider",
            "scriptSourceWatcher",
            "inlineScriptingPortForwarder",
        ]) {
            expect(modeler.getService(serviceName), serviceName).toBeTruthy();
        }
        expect(modeler.getService("inlineScriptingPort")).toBe(port);
    });

    it("opens a script task from its context pad entry and offers none on other tasks", async () => {
        const { modeler, port } = await openScriptingModeler();
        const contextPad = modeler.getService<ContextPadService>("contextPad");
        const elementRegistry = modeler.getService("elementRegistry");
        const scriptTask = elementRegistry.get("ScriptTask_1");

        expect(contextPad.getEntries(elementRegistry.get("Task_Listeners"))).not.toHaveProperty(
            "edit-script",
        );
        contextPad
            .getEntries(scriptTask)
            ["edit-script"].action.click(new MouseEvent("click"), scriptTask);

        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith(SCRIPT_TASK_OPENED);
    });

    it("opens a script task from the button on the C7 Script group header", async () => {
        const { modeler, panel, port } = await openScriptingModeler();
        const headerButton = query<HTMLButtonElement>(
            panel,
            `${SCRIPT_GROUP} .script-editor-button`,
        );

        select(modeler, "ScriptTask_1");
        await expect.poll(headerButton).not.toBeNull();
        headerButton()!.click();

        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith(SCRIPT_TASK_OPENED);
    });

    it("opens a script task listener from its C7 list row", async () => {
        const { modeler, panel, port } = await openScriptingModeler();
        const rowButton = query<HTMLButtonElement>(
            panel,
            '[data-entry-id="UserTask_1-taskListener-0"] .script-editor-button',
        );

        select(modeler, "UserTask_1");
        await expect.poll(rowButton).not.toBeNull();
        rowButton()!.click();

        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith({
            elementId: "UserTask_1",
            kind: "task-listener",
            listenerIndex: 0,
            eventName: "create",
            scriptFormat: "groovy",
            content: "priority = 1",
        });
    });

    it("turns a class execution listener into a script as one undoable step", async () => {
        const { modeler, panel, port } = await openScriptingModeler();
        const rowButton = query<HTMLButtonElement>(
            panel,
            '[data-entry-id="Task_Listeners-executionListener-0"] .script-editor-button',
        );

        select(modeler, "Task_Listeners");
        await expect.poll(rowButton).not.toBeNull();
        rowButton()!.click();

        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith({
            elementId: "Task_Listeners",
            kind: "execution-listener",
            listenerIndex: 0,
            eventName: "start",
            scriptFormat: "",
            content: "",
        });
        expect(await modeler.exportDiagram()).not.toContain("org.example.Audit");
        modeler.getService("commandStack").undo();
        expect(await modeler.exportDiagram()).toContain('class="org.example.Audit"');
    });

    it("opens the selected script task with the o shortcut", async () => {
        const { modeler, port } = await openScriptingModeler();
        const canvasSvg = modeler.getService("canvas").getContainer().querySelector("svg")!;

        select(modeler, "ScriptTask_1");
        canvasSvg.dispatchEvent(
            new KeyboardEvent("keydown", { key: "o", bubbles: true, cancelable: true }),
        );

        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith(SCRIPT_TASK_OPENED);
    });

    it("locks the C7 script field while a host tab owns it and reveals that tab", async () => {
        const { modeler, panel, port } = await openScriptingModeler();
        const scriptField = query<HTMLTextAreaElement>(
            panel,
            '[data-entry-id="scriptValue"] textarea',
        );
        select(modeler, "ScriptTask_1");
        await expect.poll(query(panel, SCRIPT_GROUP)).not.toBeNull();
        // The panel re-binds its providersChanged handler to the new selection only after paint.
        await afterPaint();

        modeler.applyOpenScriptEditors([
            {
                elementId: "ScriptTask_1",
                kind: "script-task",
                listenerIndex: undefined,
                fileName: "ScriptTask_1.groovy",
            },
        ]);

        await expect.poll(() => scriptField()?.readOnly).toBe(true);
        expect(scriptField()!.value).toBe("x = 1");
        expect(panel.querySelector(".script-lock-badge")).not.toBeNull();
        panel.querySelector<HTMLElement>(".script-lock-hint")!.click();
        expect(port.openScriptEditor).toHaveBeenCalledExactlyOnceWith(SCRIPT_TASK_OPENED);

        modeler.applyOpenScriptEditors([]);
        await expect.poll(() => scriptField()?.readOnly).toBe(false);
    });

    it("keeps each modeler's panel buttons on its own port", async () => {
        const first = await openScriptingModeler();
        const second = await openScriptingModeler();
        const headerButton = (panel: HTMLElement) =>
            query<HTMLButtonElement>(panel, `${SCRIPT_GROUP} .script-editor-button`);

        select(first.modeler, "ScriptTask_1");
        select(second.modeler, "ScriptTask_1");
        await expect.poll(headerButton(first.panel)).not.toBeNull();
        await expect.poll(headerButton(second.panel)).not.toBeNull();
        headerButton(second.panel)()!.click();

        expect(second.port.openScriptEditor).toHaveBeenCalledExactlyOnceWith(SCRIPT_TASK_OPENED);
        expect(first.port.openScriptEditor).not.toHaveBeenCalled();
    });
});

describe("inline scripting on a C8 modeler with a scripting port", () => {
    it("registers no script surface", async () => {
        const { modeler, panel } = await openScriptingModeler("c8", SCRIPTS_XML);
        const idField = query<HTMLInputElement>(panel, "#bio-properties-panel-id");

        const scriptTask = select(modeler, "ScriptTask_1");
        await expect.poll(() => idField()?.value).toBe("ScriptTask_1");

        expect(
            modeler.getService<InjectorService>("injector").get("scriptEditorOpener", false),
        ).toBeNull();
        expect(
            modeler.getService<ContextPadService>("contextPad").getEntries(scriptTask),
        ).not.toHaveProperty("edit-script");
        expect(panel.querySelector(".script-editor-button")).toBeNull();
    });
});
