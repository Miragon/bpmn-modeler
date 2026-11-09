import { describe, expect, it, vi } from "vitest";

import { createTestHost, PromptAnswers } from "../../testing";
import { createTemplateMarketplaceService } from "../composition/MarketplaceFeature";
import { parseMarketplaceUrl } from "../domain/marketplace";
import { MarketplaceCommands } from "./MarketplaceCommands";
import { MarketplaceInventory } from "./MarketplaceInventory";

const SHARED = "/work/shared";
const LOCAL = "/work/local";

function marketplaceFiles(root: string, templateId: string): Record<string, string> {
    return {
        [`${root}/marketplace.json`]: JSON.stringify({ sources: [{ path: "element-templates" }] }),
        [`${root}/element-templates/${templateId}.json`]: JSON.stringify({ id: templateId }),
    };
}

function setUp(promptAnswers: PromptAnswers = {}) {
    const host = createTestHost({
        folders: ["/work"],
        files: { ...marketplaceFiles(SHARED, "mail"), ...marketplaceFiles(LOCAL, "crm") },
        settings: { marketplaces: [SHARED] },
        promptAnswers,
    });
    const service = createTemplateMarketplaceService({
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        tokens: host.tokens,
        tokenPrompt: host.tokenPrompt,
        cacheRoot: "/cache",
        homeDir: "/work",
    });
    const commands = new MarketplaceCommands({
        marketplaces: service,
        templates: { reloadMarketplaceTemplates: () => Promise.resolve() },
        registrations: host.marketplaceRegistrations,
        prompt: host.marketplacePrompt,
        picker: host.picker,
        notifier: host.notifier,
        homeDir: "/work",
    });
    const inventory = new MarketplaceInventory(
        host.marketplaceRegistrations,
        service,
        commands,
        host.notifier,
    );
    return { host, service, inventory };
}

describe("MarketplaceInventory", () => {
    it("lists each registered marketplace with where it is registered and the templates an update cached", async () => {
        const { host, inventory } = setUp();
        await host.marketplaceRegistrations.register(LOCAL, "project");
        await inventory.update();

        const listed = await inventory.listMarketplaces();

        expect(
            listed.map(({ id, label, scopeText, templateFiles, problem }) => ({
                id,
                label,
                scopeText,
                templates: templateFiles.map((path) => path.split("/").pop()),
                problem,
            })),
        ).toEqual([
            {
                id: parseMarketplaceUrl(SHARED).id,
                label: SHARED,
                scopeText: "All my projects",
                templates: ["mail.json"],
                problem: undefined,
            },
            {
                id: parseMarketplaceUrl(LOCAL).id,
                label: LOCAL,
                scopeText: "This project",
                templates: ["crm.json"],
                problem: undefined,
            },
        ]);
    });

    it("says a marketplace no update fetched has no templates yet", async () => {
        const { inventory } = setUp();

        const [listed] = await inventory.listMarketplaces();

        expect(listed.problem).toBe(
            "No templates fetched yet. Update the marketplaces to fetch them.",
        );
    });

    it("logs why the cache could not be read and says so on each marketplace", async () => {
        const { host, service, inventory } = setUp();
        vi.spyOn(service, "cachedTemplatePathsByRegistration").mockRejectedValue(
            new Error("cache locked"),
        );

        const [listed] = await inventory.listMarketplaces();

        expect(listed.problem).toBe("Its cached templates could not be read. The log says why.");
        expect(host.notifier.loggedErrors.map(({ message }) => message)).toEqual(["cache locked"]);
    });

    it("removes a named marketplace after its confirm and says that it changed", async () => {
        const { host, inventory } = setUp({ marketplaceRemovalConfirm: true });
        let changes = 0;
        inventory.onDidChange(() => changes++);

        await inventory.remove(SHARED);

        expect(await inventory.listMarketplaces()).toEqual([]);
        expect(host.picker.prompts.map(({ method }) => method)).toEqual(["confirm"]);
        expect(changes).toBe(1);
    });

    it("adds a marketplace through the add question", async () => {
        const { host, inventory } = setUp();
        host.marketplacePrompt.answers.push({ location: LOCAL, scope: "project" });

        await inventory.add();

        expect((await inventory.listMarketplaces()).map(({ label }) => label)).toEqual([
            SHARED,
            LOCAL,
        ]);
    });
});
