import { describe, expect, it, vi } from "vitest";

import { applyOpenScriptEditors, writeSurfaceScriptField } from "./surfaceScripts";

function injectorWith(services: Record<string, unknown>) {
    return {
        get<T>(name: string, strict?: false): T | null {
            if (name in services) return services[name] as T;
            if (strict === false) return null;
            throw new Error(`No provider for "${name}"!`);
        },
    };
}

const SCRIPT_TASK = {
    businessObject: { $type: "bpmn:ScriptTask", scriptFormat: "groovy", script: "a" },
};

function surface(extra: Record<string, unknown> = {}) {
    const modeling = { updateModdleProperties: vi.fn() };
    const scriptSourceWatcher = { noteApplied: vi.fn() };
    const elementRegistry = {
        get: (id: string) => (id === "Task_1" ? SCRIPT_TASK : undefined),
    };
    return {
        modeling,
        scriptSourceWatcher,
        injector: injectorWith({ modeling, elementRegistry, scriptSourceWatcher, ...extra }),
    };
}

const TASK_SCRIPT = { elementId: "Task_1", kind: "script-task", listenerIndex: undefined } as const;

describe("writeSurfaceScriptField", () => {
    it("writes the script content and notes it as applied before the write", () => {
        const { injector, modeling, scriptSourceWatcher } = surface();

        expect(writeSurfaceScriptField(injector, TASK_SCRIPT, "content", "b")).toBe("written");

        expect(scriptSourceWatcher.noteApplied).toHaveBeenCalledWith(
            "Task_1",
            "script-task",
            undefined,
            "b",
        );
        expect(modeling.updateModdleProperties).toHaveBeenCalledWith(
            SCRIPT_TASK,
            SCRIPT_TASK.businessObject,
            { script: "b" },
        );
        expect(scriptSourceWatcher.noteApplied.mock.invocationCallOrder[0]).toBeLessThan(
            modeling.updateModdleProperties.mock.invocationCallOrder[0]!,
        );
    });

    it("writes the script format without noting content", () => {
        const { injector, modeling, scriptSourceWatcher } = surface();

        expect(writeSurfaceScriptField(injector, TASK_SCRIPT, "format", "js")).toBe("written");

        expect(scriptSourceWatcher.noteApplied).not.toHaveBeenCalled();
        expect(modeling.updateModdleProperties).toHaveBeenCalledWith(
            SCRIPT_TASK,
            SCRIPT_TASK.businessObject,
            { scriptFormat: "js" },
        );
    });

    it("reports an element the diagram does not hold", () => {
        const { injector, modeling } = surface();

        expect(
            writeSurfaceScriptField(
                injector,
                { ...TASK_SCRIPT, elementId: "Gone" },
                "content",
                "b",
            ),
        ).toBe("elementNotFound");
        expect(modeling.updateModdleProperties).not.toHaveBeenCalled();
    });

    it("reports an element without that inline script", () => {
        const { injector, modeling } = surface();

        expect(
            writeSurfaceScriptField(
                injector,
                { ...TASK_SCRIPT, kind: "execution-listener", listenerIndex: 0 },
                "content",
                "b",
            ),
        ).toBe("noInlineScript");
        expect(modeling.updateModdleProperties).not.toHaveBeenCalled();
    });

    it("writes on a surface without the script source watcher", () => {
        const modeling = { updateModdleProperties: vi.fn() };
        const injector = injectorWith({
            modeling,
            elementRegistry: { get: () => SCRIPT_TASK },
        });

        expect(writeSurfaceScriptField(injector, TASK_SCRIPT, "content", "b")).toBe("written");
    });
});

describe("applyOpenScriptEditors", () => {
    const refs = [
        {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            fileName: "a.groovy",
        },
    ] as const;

    it("hands the refs to the surface's store", () => {
        const openScriptEditorsStore = { set: vi.fn() };

        applyOpenScriptEditors(injectorWith({ openScriptEditorsStore }), [...refs]);

        expect(openScriptEditorsStore.set).toHaveBeenCalledWith([...refs]);
    });

    it("ignores the refs on a surface without inline scripting", () => {
        expect(() => applyOpenScriptEditors(injectorWith({}), [...refs])).not.toThrow();
    });
});
