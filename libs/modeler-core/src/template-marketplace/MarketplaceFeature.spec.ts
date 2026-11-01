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

function localMarketplaceFiles(root: string, templateId: string): Record<string, string> {
    return {
        [`${root}/marketplace.json`]: JSON.stringify({ sources: [{ path: "element-templates" }] }),
        [`${root}/element-templates/${templateId}.json`]: JSON.stringify({
            id: templateId,
            name: templateId,
            appliesTo: ["bpmn:Task"],
            properties: [],
        }),
    };
}

function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { open, opened };
}

/** Real flows over an in-memory host: marketplace `/work/a` is registered, `/work/b` is not. */
function commandsOverRealService() {
    const host = createTestHost({
        folders: ["/work"],
        files: {
            ...localMarketplaceFiles("/work/a", "a"),
            ...localMarketplaceFiles("/work/b", "b"),
        },
        settings: { marketplaces: ["/work/a"] },
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
    const commands = new MarketplaceCommands(
        service,
        { reloadMarketplaceTemplates: async () => {} },
        host.notifier,
        "/home/ada",
    );
    const holdRead = (path: string) => {
        const held = gate();
        const readFile = host.workspace.readFile.bind(host.workspace);
        vi.spyOn(host.workspace, "readFile").mockImplementation(async (requested) => {
            if (requested === path) await held.opened;
            return readFile(requested);
        });
        return held;
    };
    const cachedTemplateNames = async () =>
        (await service.getCachedTemplatePaths()).map((path) => path.split("/").pop()).sort();
    return {
        commands,
        marketplaces: host.settings.values.marketplaces,
        holdRead,
        cachedTemplateNames,
    };
}

const letPendingWorkRun = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MarketplaceCommands started while another one runs", () => {
    it("keeps the cache of a marketplace added while an update runs", async () => {
        const { commands, marketplaces, holdRead, cachedTemplateNames } = commandsOverRealService();
        const updateFetchOfA = holdRead("/work/a/element-templates/a.json");

        const update = commands.update();
        await letPendingWorkRun();
        const add = commands.add("/work/b", async (location) => {
            marketplaces.push(location);
        });
        await letPendingWorkRun();
        updateFetchOfA.open();
        await Promise.all([update, add]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["a.json", "b.json"]);
    });

    it("keeps the cache of a marketplace being added while a removal prunes", async () => {
        const { commands, marketplaces, cachedTemplateNames } = commandsOverRealService();
        const persistOfB = gate();

        const add = commands.add("/work/b", async (location) => {
            await persistOfB.opened;
            marketplaces.push(location);
        });
        await letPendingWorkRun();
        const remove = commands.remove(1, async () => {
            marketplaces.splice(marketplaces.indexOf("/work/a"), 1);
        });
        await letPendingWorkRun();
        persistOfB.open();
        await Promise.all([add, remove]);

        expect(marketplaces).toEqual(["/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("keeps the cache of a marketplace being added while another add fails", async () => {
        const { commands, marketplaces, cachedTemplateNames } = commandsOverRealService();
        const persistOfB = gate();

        const add = commands.add("/work/b", async (location) => {
            await persistOfB.opened;
            marketplaces.push(location);
        });
        await letPendingWorkRun();
        const failedAdd = commands.add("/work/missing", async () => {});
        await letPendingWorkRun();
        persistOfB.open();
        await Promise.all([add, failedAdd]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("still runs a command started while a failing one runs", async () => {
        const { commands, marketplaces, cachedTemplateNames } = commandsOverRealService();

        await Promise.all([
            commands.add("/work/missing", async () => {}),
            commands.add("/work/b", async (location) => {
                marketplaces.push(location);
            }),
        ]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("does not bring back the cache of a marketplace removed while an update fetches it", async () => {
        const { commands, marketplaces, holdRead, cachedTemplateNames } = commandsOverRealService();
        const updateFetchOfA = holdRead("/work/a/element-templates/a.json");

        const update = commands.update();
        await letPendingWorkRun();
        const remove = commands.remove(1, async () => {
            marketplaces.splice(marketplaces.indexOf("/work/a"), 1);
        });
        await letPendingWorkRun();
        updateFetchOfA.open();
        await Promise.all([update, remove]);

        expect(marketplaces).toEqual([]);
        expect(await cachedTemplateNames()).toEqual([]);
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
