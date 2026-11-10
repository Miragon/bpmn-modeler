import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { createMarketplaceCommands, createTemplateMarketplaceService } from "./MarketplaceFeature";

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

describe("createMarketplaceCommands", () => {
    it("lists the marketplaces over the flows of the commands it returns", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: {
                "/work/templates/marketplace.json": JSON.stringify({ sources: [] }),
            },
            marketplaceAnswers: [{ location: "/work/templates", scope: "project" }],
        });
        const { commands, inventory } = createMarketplaceCommands({
            marketplaces: createTemplateMarketplaceService({
                workspace: host.workspace,
                settings: host.settings,
                notifier: host.notifier,
                tokens: host.tokens,
                tokenPrompt: host.tokenPrompt,
                cacheRoot: "/cache",
                homeDir: "/work",
            }),
            templates: { reloadMarketplaceTemplates: () => Promise.resolve() },
            registrations: host.marketplaceRegistrations,
            prompt: host.marketplacePrompt,
            picker: host.picker,
            notifier: host.notifier,
            homeDir: "/work",
        });
        let inventoryChanges = 0;
        inventory.onDidChange(() => inventoryChanges++);

        await commands.add();

        expect(inventoryChanges).toBe(1);
        expect(await inventory.listMarketplaces()).toMatchObject({
            kind: "listed",
            sources: [{ entry: "/work/templates" }],
        });
    });
});
