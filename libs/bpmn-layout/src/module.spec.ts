// @vitest-environment jsdom
import Modeler from "bpmn-js/lib/Modeler";
import { beforeAll, describe, expect, it } from "vitest";

import { MESSY_LANES_BOUNDARY_SUBPROCESS } from "./__fixtures__/integrationDiagrams";
import { installHeadlessDom } from "./__fixtures__/headlessDom";
import { createBpmnLayoutServiceModule, createBpmnLayoutUiModule } from "./module";

async function open(modules: unknown[]) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const modeler = new Modeler({ container, additionalModules: modules as never[] });
    await modeler.importXML(MESSY_LANES_BOUNDARY_SUBPROCESS);
    return modeler;
}

function paletteEntryIds(modeler: Modeler): string[] {
    const palette = modeler.get("palette") as { getEntries(): Record<string, unknown> };
    return Object.keys(palette.getEntries());
}

beforeAll(() => {
    installHeadlessDom();
});

describe("module composition", () => {
    it("formats without the palette entry when only the services are registered", async () => {
        const modeler = await open([createBpmnLayoutServiceModule()]);

        const outcome = await (
            modeler.get("bpmnLayouter") as { format(): Promise<{ status: string }> }
        ).format();

        expect(outcome.status).toBe("formatted");
        expect(paletteEntryIds(modeler)).not.toContain("format-diagram");
    });

    it("adds the palette entry once the UI module is registered too", async () => {
        const modeler = await open([createBpmnLayoutServiceModule(), createBpmnLayoutUiModule()]);

        expect(paletteEntryIds(modeler)).toContain("format-diagram");
    });
});
