import { describe, expect, it } from "vitest";

import { LocateResult } from "../../kernel/domain/locateResult";
import { SearchPrompt } from "../../kernel/domain/prompts";
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
    const service = new ModelNavigationService(locator, host.notifier, host.picker, host.workspace);
    return { service, host };
}

describe("ModelNavigationService.navigate", () => {
    it("searches next to a loose source document and asks which referenced model to open", async () => {
        const { service, host } = createService({
            files: {
                "/work/b.bpmn": bpmnWithProcess("Shared"),
                "/work/a.bpmn": bpmnWithProcess("Shared"),
                "/work/caller.bpmn": bpmnWithProcess("Caller"),
            },
            promptAnswers: { locatedFile: "/work/b.bpmn" },
        });

        await service.navigate("Shared", "process", "/work/caller.bpmn");

        expect(host.picker.prompts.map((prompt) => prompt.method)).toEqual(["searchAndChoose"]);
        const [search] = host.picker.prompts[0].args as [SearchPrompt<LocateResult>];
        expect(search.searchingPlaceholder).toBe('Searching for process "Shared"…');
        expect(search.choices(await search.search())).toEqual({
            id: "locatedFile",
            placeholder: "Select the referenced model to open",
            items: [
                { label: "a.bpmn", path: "/work/a.bpmn", value: "/work/a.bpmn" },
                { label: "b.bpmn", path: "/work/b.bpmn", value: "/work/b.bpmn" },
            ],
        });
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
