import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../testing";
import { FetchReport, SourceFailure } from "./domain/fetchReport";
import { MarketplaceCommands, createTemplateMarketplaceService } from "./MarketplaceFeature";
import { TemplateMarketplaceService } from "./service/TemplateMarketplaceService";

const offlineSource: SourceFailure = {
    source: 'github github.com/acme/templates path "element-templates"',
    reason: "offline",
};

function fetched(usableSources: number, sourceFailures: SourceFailure[] = []): FetchReport {
    return FetchReport.of({
        usableSources,
        cached: usableSources - sourceFailures.length,
        sourceFailures,
        skippedTypes: [],
    });
}

function marketplaceDouble() {
    return {
        addMarketplace: vi.fn().mockResolvedValue(fetched(1)),
        updateAll: vi.fn().mockResolvedValue({ succeeded: 0, failures: [] }),
        pruneOrphanedCaches: vi.fn().mockResolvedValue(undefined),
    };
}

function createCommands(explainAddFailure?: (error: Error) => Promise<boolean>) {
    const host = createTestHost();
    const marketplaces = marketplaceDouble();
    const templates = { reloadMarketplaceTemplates: vi.fn().mockResolvedValue(undefined) };
    const commands = new MarketplaceCommands(
        marketplaces as unknown as TemplateMarketplaceService,
        templates,
        host.notifier,
        "/home/ada",
        explainAddFailure,
    );
    return { commands, marketplaces, templates, notifier: host.notifier };
}

describe("MarketplaceCommands.add", () => {
    it("fetches the expanded location, then persists it and refreshes open editors", async () => {
        const { commands, marketplaces, templates, notifier } = createCommands();
        const persisted: string[] = [];

        await commands.add("  ~/templates ", async (location) => void persisted.push(location));

        expect(marketplaces.addMarketplace).toHaveBeenCalledWith("/home/ada/templates");
        expect(persisted).toEqual(["/home/ada/templates"]);
        expect(templates.reloadMarketplaceTemplates).toHaveBeenCalledOnce();
        expect(notifier.progressTitles).toEqual(["Adding marketplace…"]);
        expect(notifier.infos).toEqual(["Marketplace added."]);
    });

    it("warns instead of reporting a plain success when no source of the added marketplace could be fetched", async () => {
        const { commands, marketplaces, templates, notifier } = createCommands();
        marketplaces.addMarketplace.mockResolvedValue(fetched(1, [offlineSource]));
        const persisted: string[] = [];

        await commands.add("https://github.com/acme/templates", async (location) => {
            persisted.push(location);
        });

        // The manifest is valid, so a later update may still reach the sources.
        expect(persisted).toEqual(["https://github.com/acme/templates"]);
        expect(templates.reloadMarketplaceTemplates).toHaveBeenCalledOnce();
        expect(notifier.infos).toEqual([]);
        expect(notifier.warnings).toEqual([
            "Marketplace added, but none of its sources could be fetched:\n" +
                'github github.com/acme/templates path "element-templates": offline',
        ]);
    });

    it("names the sources it could not fetch when the added marketplace was fetched in part", async () => {
        const { commands, marketplaces, notifier } = createCommands();
        marketplaces.addMarketplace.mockResolvedValue(fetched(2, [offlineSource]));

        await commands.add("https://github.com/acme/templates", async () => {});

        expect(notifier.infos).toEqual([]);
        expect(notifier.warnings).toEqual([
            "Marketplace added, but some of its sources could not be fetched:\n" +
                'github github.com/acme/templates path "element-templates": offline',
        ]);
    });

    it("never persists a location whose fetch failed, and prunes what the fetch cached", async () => {
        const { commands, marketplaces, notifier } = createCommands();
        marketplaces.addMarketplace.mockRejectedValue(new Error("marketplace.json not found"));
        const persist = vi.fn();

        await commands.add("https://github.com/acme/templates", persist);

        expect(persist).not.toHaveBeenCalled();
        expect(marketplaces.pruneOrphanedCaches).toHaveBeenCalledOnce();
        expect(notifier.errors).toEqual(["Failed to add marketplace.\nmarketplace.json not found"]);
    });

    it("fails the add and prunes the fetched cache when the persist fails", async () => {
        const { commands, marketplaces, templates, notifier } = createCommands();

        await commands.add("/templates", async () => {
            throw new Error("disk full");
        });

        expect(marketplaces.pruneOrphanedCaches).toHaveBeenCalledOnce();
        expect(templates.reloadMarketplaceTemplates).not.toHaveBeenCalled();
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual(["Failed to add marketplace.\ndisk full"]);
    });

    it("leaves the failure toast to the host when it explains the failure itself", async () => {
        const explained: string[] = [];
        const { commands, notifier } = createCommands(async (error) => {
            explained.push(error.message);
            return true;
        });

        await commands.add("/templates", async () => {
            throw new Error("not a registered configuration");
        });

        expect(explained).toEqual(["not a registered configuration"]);
        expect(notifier.errors).toEqual([]);
    });

    it("still reports the add failure when pruning fails too", async () => {
        const { commands, marketplaces, notifier } = createCommands();
        const offline = new Error("offline");
        const cacheLocked = new Error("cache locked");
        marketplaces.addMarketplace.mockRejectedValue(offline);
        marketplaces.pruneOrphanedCaches.mockRejectedValue(cacheLocked);

        await commands.add("/templates", vi.fn());

        expect(notifier.logged("error")).toEqual([
            cacheLocked.stack,
            `Failed to add marketplace. ${offline.stack}`,
        ]);
        expect(notifier.errors).toEqual(["Failed to add marketplace.\noffline"]);
    });
});

describe("MarketplaceCommands.update", () => {
    it("refreshes open editors and reports the updated count", async () => {
        const { commands, marketplaces, templates, notifier } = createCommands();
        marketplaces.updateAll.mockResolvedValue({ succeeded: 2, failures: [] });

        await commands.update();

        expect(templates.reloadMarketplaceTemplates).toHaveBeenCalledOnce();
        expect(notifier.infos).toEqual(["Updated 2 marketplace(s)."]);
    });

    it("notes when nothing is configured", async () => {
        const { commands, notifier } = createCommands();

        await commands.update();

        expect(notifier.infos).toEqual(["No marketplaces configured to update."]);
    });

    it("lists each failed marketplace and why", async () => {
        const { commands, marketplaces, notifier } = createCommands();
        marketplaces.updateAll.mockResolvedValue({
            succeeded: 1,
            failures: [{ label: "acme/templates", reason: "401" }],
        });

        await commands.update();

        expect(notifier.errors).toEqual([
            "Updated 1 of 2 marketplaces. Failed:\nacme/templates: 401",
        ]);
    });
});

describe("MarketplaceCommands.remove", () => {
    it("unregisters, prunes and reports the selected count", async () => {
        const { commands, marketplaces, templates, notifier } = createCommands();
        const steps: string[] = [];
        marketplaces.pruneOrphanedCaches.mockImplementation(async () => {
            steps.push("prune");
        });

        await commands.remove(2, async () => void steps.push("unregister"));

        expect(steps).toEqual(["unregister", "prune"]);
        expect(templates.reloadMarketplaceTemplates).toHaveBeenCalledOnce();
        expect(notifier.infos).toEqual(["Removed 2 marketplace(s)."]);
    });

    it("only prunes when the host has already unregistered the entries", async () => {
        const { commands, marketplaces, notifier } = createCommands();

        await commands.remove(1);

        expect(marketplaces.pruneOrphanedCaches).toHaveBeenCalledOnce();
        expect(notifier.infos).toEqual(["Removed 1 marketplace(s)."]);
    });

    it("reports a failed removal without a success toast", async () => {
        const { commands, notifier } = createCommands();

        await commands.remove(1, async () => {
            throw new Error("settings are read-only");
        });

        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([
            "Failed to remove marketplace(s).\nsettings are read-only",
        ]);
    });
});

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
