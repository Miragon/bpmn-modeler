import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { createTemplateMarketplaceService } from "./MarketplaceFeature";

describe("createTemplateMarketplaceService", () => {
    it("caches a local marketplace's templates under the host's cache root", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: {
                "/work/templates/marketplace.json": JSON.stringify({
                    sources: [{ path: "element-templates" }],
                }),
                "/work/templates/element-templates/task.json": JSON.stringify({
                    id: "task",
                    name: "Task",
                    appliesTo: ["bpmn:Task"],
                    properties: [],
                }),
            },
        });
        const service = createTemplateMarketplaceService({
            workspace: host.workspace,
            settings: host.settings,
            notifier: host.notifier,
            tokens: host.tokens,
            tokenPrompt: host.tokenPrompt,
            cacheRoot: "/cache",
            homeDir: "/home/ada",
        });

        await service.addMarketplace("/work/templates");

        expect([...host.workspace.files.keys()].some((path) => path.startsWith("/cache/"))).toBe(
            true,
        );
    });
});
