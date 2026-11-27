import { describe, expect, it, vi } from "vitest";
import type { ExecutionPlatformDefinitions } from "@miragon/bpmn-modeler-types/domain";

import { ElementTemplateEngineRefresh } from "./ElementTemplateEngineRefresh";
import { ElementTemplateEngineRefreshModule } from "./elementTemplatesModules";

type ImportDone = { error: unknown };

const MODELER_NAMESPACE = "http://camunda.org/schema/modeler/1.0";

function definitionsDeclaring(attributes: Record<string, string>): ExecutionPlatformDefinitions {
    return {
        $attrs: { "xmlns:modeler": MODELER_NAMESPACE, ...attributes },
        $model: { getPackage: () => undefined },
        get: () => undefined,
    };
}

function harness(
    options: {
        definitions?: ExecutionPlatformDefinitions;
        withElementTemplates?: boolean;
    } = {},
) {
    const listeners: Array<{ event: string; priority: number; listener: (e: ImportDone) => void }> =
        [];
    const elementTemplates = { setEngines: vi.fn() };
    const lookups: string[] = [];
    const injector = {
        get: <T>(name: string, _strict: false): T | null => {
            lookups.push(name);
            return (
                name === "elementTemplates" && (options.withElementTemplates ?? true)
                    ? elementTemplates
                    : null
            ) as T | null;
        },
    };
    new ElementTemplateEngineRefresh(
        {
            on: (event: string, priority: number, listener: (e: ImportDone) => void) => {
                listeners.push({ event, priority, listener });
            },
        },
        { getDefinitions: () => options.definitions },
        injector,
    );
    const importDone = (error: unknown = null): void => {
        listeners
            .filter(({ event }) => event === "import.done")
            .forEach(({ listener }) => listener({ error }));
    };
    return { elementTemplates, lookups, listeners, importDone };
}

describe("ElementTemplateEngineRefresh", () => {
    it("hands the templates the engine version the imported diagram declares", () => {
        const { elementTemplates, importDone } = harness({
            definitions: definitionsDeclaring({
                "modeler:executionPlatform": "Camunda Cloud",
                "modeler:executionPlatformVersion": "8.7.0",
            }),
        });

        importDone();

        expect(elementTemplates.setEngines).toHaveBeenCalledExactlyOnceWith({ camunda: "8.7.0" });
    });

    it("clears the engines for a diagram that declares none", () => {
        const { elementTemplates, importDone } = harness({ definitions: definitionsDeclaring({}) });

        importDone();

        expect(elementTemplates.setEngines).toHaveBeenCalledExactlyOnceWith({});
    });

    it("ignores a failed import", () => {
        const { elementTemplates, lookups, importDone } = harness({
            definitions: definitionsDeclaring({}),
        });

        importDone(new Error("unparsable"));

        expect(elementTemplates.setEngines).not.toHaveBeenCalled();
        expect(lookups).toEqual([]);
    });

    it("tolerates a surface without element templates", () => {
        const { importDone } = harness({ withElementTemplates: false });

        expect(() => importDone()).not.toThrow();
    });

    it("looks the templates up only when an import is done", () => {
        const { lookups } = harness();

        expect(lookups).toEqual([]);
    });

    it("runs below every default-priority import.done listener and bpmnlint's 500", () => {
        const { listeners } = harness();

        expect(listeners.map(({ event }) => event)).toEqual(["import.done"]);
        expect(listeners[0].priority).toBeLessThan(500);
    });

    it("registers under its DI name and builds at init", () => {
        expect(ElementTemplateEngineRefreshModule).toEqual({
            __init__: ["elementTemplateEngineRefresh"],
            elementTemplateEngineRefresh: ["type", ElementTemplateEngineRefresh],
        });
    });
});
