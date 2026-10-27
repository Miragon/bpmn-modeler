import { describe, expect, it } from "vitest";

import { createTestHost, TestHostOptions } from "../../testing";
import { ModelNavigationService } from "./ModelNavigationService";
import { ReferencedModelLocator } from "./ReferencedModelLocator";

const bpmnWithProcess = (id: string) =>
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="${id}"/>
</bpmn:definitions>`;

function createService(options: TestHostOptions = {}) {
    const host = createTestHost(options);
    const locator = new ReferencedModelLocator(host.workspace, host.notifier);
    const service = new ModelNavigationService(locator, host.notifier, host.picker);
    return { service, host };
}

describe("ModelNavigationService.navigate", () => {
    it("searches for the process id and asks which referenced model to open", async () => {
        const { service, host } = createService({
            folders: ["/work"],
            files: {
                "/work/a.bpmn": bpmnWithProcess("Shared"),
                "/work/b.bpmn": bpmnWithProcess("Shared"),
                "/work/caller.bpmn": bpmnWithProcess("Caller"),
            },
            answers: { locatedFile: "/work/b.bpmn" },
        });

        await service.navigate("Shared", "process", "/work/caller.bpmn");

        expect(host.picker.prompts.map((prompt) => prompt.args[0])).toEqual([
            {
                searchingPlaceholder: 'Searching for process "Shared"…',
                pickPlaceholder: "Select the referenced model to open",
            },
        ]);
        expect(host.notifier.openedDocuments).toEqual(["/work/b.bpmn"]);
    });

    it("names the id no model declares, and asks for a folder when there is none", async () => {
        const inFolder = createService({
            folders: ["/work"],
            files: { "/work/a.bpmn": bpmnWithProcess("Other") },
        });
        const withoutFolder = createService();

        await inFolder.service.navigate("Missing", "process");
        await withoutFolder.service.navigate("Missing", "process");

        expect(inFolder.host.notifier.infos).toEqual([
            'No model declaring "Missing" was found in the workspace. ' +
                "(See Output → bpmn.modeler for what was searched.)",
        ]);
        expect(withoutFolder.host.notifier.infos).toEqual([
            'No model declaring "Missing" was found. Open a folder to enable cross-file navigation.',
        ]);
    });
});
