import { describe, expect, it } from "vitest";

import { createTestHost, TestHostOptions } from "../../testing";
import { ImplementationLocator } from "./ImplementationLocator";
import { ImplementationNavigationService } from "./ImplementationNavigationService";

function createService(options: TestHostOptions = {}) {
    const host = createTestHost(options);
    const locator = new ImplementationLocator(host.workspace, host.notifier);
    const service = new ImplementationNavigationService(locator, host.notifier, host.picker);
    return { service, host };
}

describe("ImplementationNavigationService.navigate", () => {
    it("searches for the class and asks which implementation to open", async () => {
        const { service, host } = createService({
            folders: ["/work"],
            files: {
                "/work/a/com/example/MyDelegate.java": "class MyDelegate {}",
                "/work/b/com/example/MyDelegate.kt": "class MyDelegate",
            },
            answers: { locatedFile: "/work/b/com/example/MyDelegate.kt" },
        });

        await service.navigate("com.example.MyDelegate", "javaClass", "/work/process.bpmn");

        expect(host.picker.prompts.map((prompt) => prompt.args[0])).toEqual([
            {
                searchingPlaceholder: 'Searching for class "com.example.MyDelegate"…',
                pickPlaceholder: "Select the referenced model to open",
            },
        ]);
        expect(host.notifier.openedDocuments).toEqual(["/work/b/com/example/MyDelegate.kt"]);
    });

    it("names the kind and reference nothing implements, and asks for a folder when there is none", async () => {
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
            'No implementation for "payment-topic" was found. Open a folder to enable code navigation.',
        ]);
    });
});
