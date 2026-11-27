import { afterEach, describe, expect, it, vi } from "vitest";
import type { Engine } from "@miragon/bpmn-modeler-types";

import { createModeler } from "./composition/createModeler";
import type { BpmnModeler } from "./composition/presets/bpmnModeler";
import { START_EVENT_XML } from "./__fixtures__/bpmnXml";
import { declaringCamunda87Under } from "./__fixtures__/modelerModdle";
import { mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

interface ElementTemplatesEngines {
    getEngines(): { camunda?: string };
    setEngines(engines: object): void;
}

interface ImportDoneBus {
    on(event: "import.done", listener: () => void): void;
}

const handles: BpmnModeler[] = [];

afterEach(() => {
    handles.forEach((handle) => handle.destroy());
    handles.length = 0;
    removeMounts();
});

async function openModeler(engine: Engine, additionalModules: object[] = []): Promise<BpmnModeler> {
    const { container, panel } = mountWithPanel();
    const handle = await createModeler(container, {
        engine,
        propertiesPanel: { parent: panel },
        linting: false,
        additionalModules,
    });
    handles.push(handle);
    return handle;
}

function elementTemplates(handle: BpmnModeler): ElementTemplatesEngines {
    return handle.getService<ElementTemplatesEngines>("elementTemplates");
}

describe("element template engines after an import", () => {
    it("follow the engine version each imported diagram declares", async () => {
        const handle = await openModeler("c8");

        await handle.loadDiagram(declaringCamunda87Under("cm", START_EVENT_XML));
        expect(elementTemplates(handle).getEngines().camunda).toBe("8.7.0");

        await handle.loadDiagram(START_EVENT_XML);
        expect(elementTemplates(handle).getEngines().camunda).toBeUndefined();
    });

    it("are refreshed on a Camunda 7 modeler too, once per import", async () => {
        const handle = await openModeler("c7");
        const setEngines = vi.spyOn(elementTemplates(handle), "setEngines");

        await handle.loadDiagram(START_EVENT_XML);
        await handle.newDiagram();

        expect(setEngines.mock.calls).toEqual([[{}], [{}]]);
    });

    it("are refreshed after every default-priority import.done listener", async () => {
        const seenAtImportDone: Array<string | undefined> = [];
        const live: { handle?: BpmnModeler } = {};
        class ImportDoneProbe {
            static $inject = ["eventBus"];
            constructor(eventBus: ImportDoneBus) {
                eventBus.on("import.done", () => {
                    if (live.handle) {
                        seenAtImportDone.push(elementTemplates(live.handle).getEngines().camunda);
                    }
                });
            }
        }
        const handle = await openModeler("c8", [
            { __init__: ["importDoneProbe"], importDoneProbe: ["type", ImportDoneProbe] },
        ]);
        live.handle = handle;

        await handle.loadDiagram(declaringCamunda87Under("cm", START_EVENT_XML));

        expect(seenAtImportDone).toEqual([undefined]);
        expect(elementTemplates(handle).getEngines().camunda).toBe("8.7.0");
    });

    it("are left alone by a failed import", async () => {
        const handle = await openModeler("c8");
        await handle.loadDiagram(declaringCamunda87Under("cm", START_EVENT_XML));
        const setEngines = vi.spyOn(elementTemplates(handle), "setEngines");

        await expect(handle.loadDiagram("<not-bpmn")).rejects.toThrow();

        expect(setEngines).not.toHaveBeenCalled();
        expect(elementTemplates(handle).getEngines().camunda).toBe("8.7.0");
    });

    it("are not refreshed on a modeler destroyed while it imports", async () => {
        const handle = await openModeler("c8");
        const setEngines = vi.spyOn(elementTemplates(handle), "setEngines");

        const loading = handle.loadDiagram(START_EVENT_XML);
        handle.destroy();

        await expect(loading).rejects.toThrow();
        expect(setEngines).not.toHaveBeenCalled();
    });
});
