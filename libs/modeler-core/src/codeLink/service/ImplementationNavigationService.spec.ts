import { describe, expect, it } from "vitest";

import { LocateResult } from "../../kernel/domain/locateResult";
import { SearchPrompt } from "../../kernel/domain/prompts";
import { createTestHost, TestHostOptions } from "../../testing";
import { ImplementationLocator } from "./ImplementationLocator";
import { ImplementationNavigationService } from "./ImplementationNavigationService";

function createService(options: TestHostOptions = {}) {
    const host = createTestHost(options);
    const locator = new ImplementationLocator(host.workspace, host.notifier);
    const service = new ImplementationNavigationService(
        locator,
        host.notifier,
        host.picker,
        host.workspace,
    );
    return { service, host };
}

describe("ImplementationNavigationService.navigate", () => {
    it("searches next to a loose source document and asks which implementation to open", async () => {
        const { service, host } = createService({
            files: {
                "/work/b/com/example/MyDelegate.kt": "class MyDelegate",
                "/work/a/com/example/MyDelegate.java": "class MyDelegate {}",
            },
            promptAnswers: { locatedFile: "/work/b/com/example/MyDelegate.kt" },
        });

        await service.navigate("com.example.MyDelegate", "javaClass", "/work/process.bpmn");

        expect(host.picker.prompts.map((prompt) => prompt.method)).toEqual(["searchAndChoose"]);
        const [search] = host.picker.prompts[0].args as [SearchPrompt<LocateResult>];
        expect(search.searchingPlaceholder).toBe('Searching for class "com.example.MyDelegate"…');
        expect(search.choices(await search.search())).toEqual({
            id: "locatedFile",
            placeholder: "Select the implementation to open",
            items: [
                {
                    label: "MyDelegate.java",
                    path: "/work/a/com/example/MyDelegate.java",
                    value: "/work/a/com/example/MyDelegate.java",
                },
                {
                    label: "MyDelegate.kt",
                    path: "/work/b/com/example/MyDelegate.kt",
                    value: "/work/b/com/example/MyDelegate.kt",
                },
            ],
        });
        expect(host.notifier.openedDocuments).toEqual(["/work/b/com/example/MyDelegate.kt"]);
    });

    it("names the kind and reference nothing implements, also when it asks for a folder", async () => {
        const inFolder = createService({
            folders: ["/work"],
            files: { "/work/src/Other.java": 'class Other { String topic = "other"; }' },
        });
        const withoutFolder = createService();

        await inFolder.service.navigate("payment-topic", "externalTopic");
        await withoutFolder.service.navigate("payment-topic", "externalTopic");

        expect(inFolder.host.notifier.infos).toEqual([
            'No implementation for external task topic "payment-topic" was found in the workspace. ' +
                "(See Output → bpmn.modeler for what was searched.)",
        ]);
        expect(withoutFolder.host.notifier.infos).toEqual([
            'No implementation for external task topic "payment-topic" was found. ' +
                "Open a folder to enable code navigation.",
        ]);
    });
});
