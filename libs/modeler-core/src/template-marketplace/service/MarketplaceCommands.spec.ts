import { describe, expect, it, vi } from "vitest";

import { createTestHost, PromptAnswers } from "../../testing";
import { createTemplateMarketplaceService } from "../composition/MarketplaceFeature";
import { InvalidMarketplaceError } from "../domain/marketplace";
import { MarketplaceAddAnswer } from "../domain/marketplacePrompts";
import { registeredMarketplaces } from "../domain/marketplaceRegistrations";
import { MarketplaceCommands } from "./MarketplaceCommands";

function templateFile(id: string): string {
    return JSON.stringify({ id, name: id, appliesTo: ["bpmn:Task"], properties: [] });
}

function localMarketplaceFiles(
    root: string,
    templateId: string,
    sources: object[] = [{ path: "element-templates" }],
): Record<string, string> {
    return {
        [`${root}/marketplace.json`]: JSON.stringify({ sources }),
        [`${root}/element-templates/${templateId}.json`]: templateFile(templateId),
    };
}

function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { open, opened };
}

const letPendingWorkRun = () => new Promise((resolve) => setTimeout(resolve, 0));

const INVALID_LOCATION =
    "Enter a GitHub or GitLab repository URL, or a local folder path, holding a marketplace.json. " +
    "Self-hosted hosts go in settings.json.";

/**
 * The real flows and service over an in-memory host: `/work/a` and `/work/b`
 * hold a marketplace each, `/work/future` one whose only source serves a
 * content type this version skips, `/work/mixed` one with a source of each.
 */
function marketplaceHost({
    registered = ["/work/a"],
    answers = [],
    promptAnswers = {},
    explainAddFailure,
}: {
    registered?: string[];
    answers?: MarketplaceAddAnswer[];
    promptAnswers?: PromptAnswers;
    explainAddFailure?: (error: Error) => Promise<boolean>;
} = {}) {
    const host = createTestHost({
        folders: ["/work"],
        files: {
            ...localMarketplaceFiles("/work/a", "a"),
            ...localMarketplaceFiles("/work/b", "b"),
            ...localMarketplaceFiles("/work/future", "future", [
                { type: "palette-entries", path: "palette" },
            ]),
            ...localMarketplaceFiles("/work/mixed", "mixed", [
                { path: "element-templates" },
                { type: "palette-entries", path: "palette" },
            ]),
        },
        settings: { marketplaces: registered },
        marketplaceAnswers: answers,
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
    const templates = {
        reloads: 0,
        async reloadMarketplaceTemplates() {
            this.reloads++;
        },
    };
    const commands = new MarketplaceCommands({
        marketplaces: service,
        templates,
        registrations: host.marketplaceRegistrations,
        prompt: host.marketplacePrompt,
        picker: host.picker,
        notifier: host.notifier,
        homeDir: "/work",
        explainAddFailure,
    });
    const holdRead = (path: string) => {
        const held = gate();
        const readFile = host.workspace.readFile.bind(host.workspace);
        vi.spyOn(host.workspace, "readFile").mockImplementation(async (requested) => {
            if (requested === path) await held.opened;
            return readFile(requested);
        });
        return held;
    };
    const holdRegistration = () => {
        const held = gate();
        const register = host.marketplaceRegistrations.register.bind(host.marketplaceRegistrations);
        vi.spyOn(host.marketplaceRegistrations, "register").mockImplementation(async (...args) => {
            await held.opened;
            return register(...args);
        });
        return held;
    };
    const holdAddQuestion = () => {
        const held = gate();
        const ask = host.marketplacePrompt.promptForMarketplace.bind(host.marketplacePrompt);
        vi.spyOn(host.marketplacePrompt, "promptForMarketplace").mockImplementation(
            async (question) => {
                await held.opened;
                return ask(question);
            },
        );
        return held;
    };
    const holdRemoveChoice = () => {
        const held = gate();
        const chooseMany = host.picker.chooseMany.bind(host.picker);
        vi.spyOn(host.picker, "chooseMany").mockImplementation(async (prompt) => {
            await held.opened;
            return chooseMany(prompt);
        });
        return held;
    };
    const lockCachedMarketplaces = (error: Error) => {
        const deleteDirectory = host.workspace.deleteDirectory.bind(host.workspace);
        vi.spyOn(host.workspace, "deleteDirectory").mockImplementation(async (path) => {
            if (/^\/cache\/[^/]+$/.test(path)) throw error;
            return deleteDirectory(path);
        });
    };
    return {
        commands,
        registrations: host.marketplaceRegistrations,
        marketplaces: host.settings.values.marketplaces,
        prompt: host.marketplacePrompt,
        picker: host.picker,
        workspace: host.workspace,
        notifier: host.notifier,
        templates,
        holdRead,
        holdRegistration,
        holdAddQuestion,
        holdRemoveChoice,
        lockCachedMarketplaces,
        registered: async () =>
            registeredMarketplaces((await host.marketplaceRegistrations.read()).registered),
        cachedTemplateNames: async () =>
            (await service.getCachedTemplatePaths()).map((path) => path.split("/").pop()).sort(),
    };
}

describe("MarketplaceCommands.add", () => {
    it("asks the core's add question and registers the entry in the chosen scope once it is fetched", async () => {
        const { commands, prompt, registered, cachedTemplateNames, templates, notifier } =
            marketplaceHost({ answers: [{ location: "/work/b", scope: "project" }] });

        await commands.add();

        expect(prompt.prompts).toHaveLength(1);
        expect(prompt.prompts[0]).toMatchObject({
            title: "Add Template Marketplace",
            location: "",
            scope: "project",
        });
        expect(prompt.prompts[0].scopes.map(({ scope }) => scope)).toEqual([
            "project",
            "allProjects",
        ]);
        expect(await registered()).toEqual([
            { entry: "/work/a", scopes: ["allProjects"] },
            { entry: "/work/b", scopes: ["project"] },
        ]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
        expect(templates.reloads).toBe(1);
        expect(notifier.progressTitles).toEqual(["Adding marketplace…"]);
        expect(notifier.infos).toEqual(["Marketplace added."]);
    });

    it("expands a home folder before it fetches and registers the entry", async () => {
        const { commands, registered } = marketplaceHost({
            answers: [{ location: "  ~/b ", scope: "allProjects" }],
        });

        await commands.add();

        expect(await registered()).toEqual([
            { entry: "/work/a", scopes: ["allProjects"] },
            { entry: "/work/b", scopes: ["allProjects"] },
        ]);
    });

    it("asks again with the refused entry and its scope until it can register the location", async () => {
        const { commands, prompt, registered, notifier } = marketplaceHost({
            answers: [
                { location: "not-a-repo-or-path", scope: "allProjects" },
                { location: "/work/b", scope: "allProjects" },
            ],
        });

        await commands.add();

        expect(prompt.prompts).toHaveLength(2);
        expect(prompt.prompts[1]).toMatchObject({
            location: "not-a-repo-or-path",
            invalidLocation: INVALID_LOCATION,
            scope: "allProjects",
        });
        expect(await registered()).toContainEqual({ entry: "/work/b", scopes: ["allProjects"] });
        expect(notifier.errors).toEqual([]);
        expect(notifier.infos).toEqual(["Marketplace added."]);
    });

    it("registers and reports nothing when the add question is dismissed", async () => {
        const { commands, registered, notifier, templates } = marketplaceHost();

        await commands.add();

        expect(await registered()).toEqual([{ entry: "/work/a", scopes: ["allProjects"] }]);
        expect(templates.reloads).toBe(0);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([]);
        expect(notifier.logged("debug")).toContain("Add Marketplace cancelled");
    });

    it("asks no scope when the host can register in one scope only", async () => {
        const { commands, registrations, prompt, registered } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "allProjects" }],
        });
        registrations.writable = registrations.writable.filter(
            ({ scope }) => scope === "allProjects",
        );

        await commands.add();

        expect(prompt.prompts[0]).toMatchObject({ scopes: [], scope: "allProjects" });
        expect(await registered()).toContainEqual({ entry: "/work/b", scopes: ["allProjects"] });
    });

    it("registers a marketplace none of whose sources could be fetched, and warns why", async () => {
        const { commands, registered, notifier } = marketplaceHost({
            answers: [{ location: "/work/future", scope: "project" }],
        });

        await commands.add();

        expect(await registered()).toContainEqual({ entry: "/work/future", scopes: ["project"] });
        expect(notifier.infos).toEqual([]);
        expect(notifier.warnings).toEqual([
            "Marketplace added, but none of its sources could be fetched:\n" +
                'sources[0]: content type "palette-entries" is not supported by this version',
        ]);
    });

    it("names the sources it could not fetch when it fetched the added marketplace in part", async () => {
        const { commands, notifier } = marketplaceHost({
            answers: [{ location: "/work/mixed", scope: "project" }],
        });

        await commands.add();

        expect(notifier.infos).toEqual([]);
        expect(notifier.warnings).toEqual([
            "Marketplace added, but some of its sources could not be fetched:\n" +
                'sources[1]: content type "palette-entries" is not supported by this version',
        ]);
    });

    it("never registers a location without a marketplace.json", async () => {
        const { commands, registered, notifier } = marketplaceHost({
            answers: [{ location: "/work/missing", scope: "project" }],
        });

        await commands.add();

        expect(await registered()).toEqual([{ entry: "/work/a", scopes: ["allProjects"] }]);
        expect(notifier.errors).toEqual([
            "Failed to add marketplace.\n" +
                'Invalid marketplace: could not read marketplace.json from "/work/missing": ' +
                "File not found: /work/missing/marketplace.json",
        ]);
    });

    it("fails the add and drops the fetched cache when the host cannot save the registration", async () => {
        const { commands, registrations, cachedTemplateNames, templates, notifier } =
            marketplaceHost({ answers: [{ location: "/work/b", scope: "project" }] });
        vi.spyOn(registrations, "register").mockRejectedValue(new Error("disk full"));

        await commands.add();

        expect(await cachedTemplateNames()).toEqual([]);
        expect(templates.reloads).toBe(0);
        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual(["Failed to add marketplace.\ndisk full"]);
    });

    it("leaves the failure toast to the host when it explains the failure itself", async () => {
        const explained: string[] = [];
        const { commands, registrations, notifier } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "project" }],
            explainAddFailure: async (error) => {
                explained.push(error.message);
                return true;
            },
        });
        vi.spyOn(registrations, "register").mockRejectedValue(
            new Error("not a registered configuration"),
        );

        await commands.add();

        expect(explained).toEqual(["not a registered configuration"]);
        expect(notifier.errors).toEqual([]);
    });

    it("asks nothing and reports a failed add when the host cannot read its registrations", async () => {
        const { commands, registrations, prompt, notifier } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "project" }],
        });
        vi.spyOn(registrations, "read").mockRejectedValue(new Error("store locked"));

        await commands.add();

        expect(prompt.prompts).toEqual([]);
        expect(notifier.errors).toEqual(["Failed to add marketplace.\nstore locked"]);
    });
});

describe("MarketplaceCommands.update", () => {
    it("refreshes open editors and reports the updated count", async () => {
        const { commands, templates, notifier } = marketplaceHost({
            registered: ["/work/a", "/work/b"],
        });

        await commands.update();

        expect(templates.reloads).toBe(1);
        expect(notifier.infos).toEqual(["Updated 2 marketplace(s)."]);
    });

    it("notes when nothing is configured", async () => {
        const { commands, notifier } = marketplaceHost({ registered: [] });

        await commands.update();

        expect(notifier.infos).toEqual(["No marketplaces configured to update."]);
    });

    it("lists each failed marketplace and why", async () => {
        const { commands, notifier } = marketplaceHost({
            registered: ["/work/a", "/work/missing"],
        });

        await commands.update();

        expect(notifier.errors).toEqual([
            "Updated 1 of 2 marketplaces. Failed:\n" +
                '/work/missing: Invalid marketplace: could not read marketplace.json from "/work/missing": ' +
                "File not found: /work/missing/marketplace.json",
        ]);
    });
});

describe("MarketplaceCommands.remove", () => {
    it("says that nothing is registered and asks nothing", async () => {
        const { commands, picker, notifier } = marketplaceHost({ registered: [] });

        await commands.remove();

        expect(picker.prompts).toEqual([]);
        expect(notifier.infos).toEqual(["No marketplaces registered."]);
    });

    it("offers every registered marketplace with where it is registered", async () => {
        const { commands, registrations, picker } = marketplaceHost();
        await registrations.register("/work/b", "project");

        await commands.remove();

        expect(picker.prompts).toEqual([
            {
                method: "chooseMany",
                args: [
                    {
                        id: "marketplaceRemoval",
                        title: "Remove Template Marketplace",
                        placeholder: "Select marketplaces to remove",
                        items: [
                            { label: "/work/a", description: "All my projects", value: "/work/a" },
                            { label: "/work/b", description: "This project", value: "/work/b" },
                        ],
                    },
                ],
            },
        ]);
    });

    it("unregisters the chosen marketplaces from every scope, drops their cache and reports how many", async () => {
        const { commands, registrations, registered, cachedTemplateNames, templates, notifier } =
            marketplaceHost({
                registered: ["/work/a", "/work/b"],
                promptAnswers: { marketplaceRemoval: ["/work/a"] },
            });
        await registrations.register("/work/a", "project");
        await commands.update();

        await commands.remove();

        expect(await registered()).toEqual([{ entry: "/work/b", scopes: ["allProjects"] }]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
        expect(templates.reloads).toBe(2);
        expect(notifier.progressTitles).toEqual([
            "Updating marketplaces…",
            "Removing marketplace(s)…",
        ]);
        expect(notifier.infos).toEqual(["Updated 2 marketplace(s).", "Removed 1 marketplace(s)."]);
    });

    it("removes nothing when the choice is dismissed", async () => {
        const { commands, registered, templates, notifier } = marketplaceHost();

        await commands.remove();

        expect(await registered()).toEqual([{ entry: "/work/a", scopes: ["allProjects"] }]);
        expect(templates.reloads).toBe(0);
        expect(notifier.infos).toEqual([]);
        expect(notifier.logged("debug")).toContain("Remove Marketplace cancelled");
    });

    it("reports a failed removal without a success toast", async () => {
        const { commands, registrations, notifier } = marketplaceHost({
            promptAnswers: { marketplaceRemoval: ["/work/a"] },
        });
        vi.spyOn(registrations, "unregister").mockRejectedValue(
            new Error("settings are read-only"),
        );

        await commands.remove();

        expect(notifier.infos).toEqual([]);
        expect(notifier.errors).toEqual([
            "Failed to remove marketplace(s).\nsettings are read-only",
        ]);
    });
});

describe("MarketplaceCommands started while its question is open", () => {
    it("asks one add question at a time and asks again once it is answered", async () => {
        const { commands, prompt, registered, holdAddQuestion, notifier } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "project" }],
        });
        const question = holdAddQuestion();

        const first = commands.add();
        await letPendingWorkRun();
        const second = commands.add();
        question.open();
        await Promise.all([first, second]);
        await commands.add();

        expect(prompt.prompts).toHaveLength(2);
        expect(await registered()).toContainEqual({ entry: "/work/b", scopes: ["project"] });
        expect(notifier.infos).toEqual(["Marketplace added."]);
        expect(notifier.logged("debug")).toContain("Add Marketplace is already asking");
    });

    it("offers one remove choice at a time and offers it again once it is answered", async () => {
        const { commands, registrations, picker, holdRemoveChoice, notifier } = marketplaceHost({
            registered: ["/work/a", "/work/b"],
            promptAnswers: { marketplaceRemoval: ["/work/a"] },
        });
        const choice = holdRemoveChoice();

        const first = commands.remove();
        await letPendingWorkRun();
        const second = commands.remove();
        choice.open();
        await Promise.all([first, second]);
        await registrations.register("/work/a", "allProjects");
        await commands.remove();

        expect(picker.prompts).toHaveLength(2);
        expect(notifier.infos).toEqual(["Removed 1 marketplace(s).", "Removed 1 marketplace(s)."]);
        expect(notifier.logged("debug")).toContain("Remove Marketplace is already asking");
    });
});

describe("MarketplaceCommands started while another one runs", () => {
    it("keeps the cache of a marketplace added while an update runs", async () => {
        const { commands, marketplaces, holdRead, cachedTemplateNames } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "allProjects" }],
        });
        const updateFetchOfA = holdRead("/work/a/element-templates/a.json");

        const update = commands.update();
        await letPendingWorkRun();
        const add = commands.add();
        await letPendingWorkRun();
        updateFetchOfA.open();
        await Promise.all([update, add]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["a.json", "b.json"]);
    });

    it("keeps the cache of a marketplace being added while a removal prunes", async () => {
        const { commands, marketplaces, holdRegistration, cachedTemplateNames } = marketplaceHost({
            answers: [{ location: "/work/b", scope: "allProjects" }],
            promptAnswers: { marketplaceRemoval: ["/work/a"] },
        });
        const registrationOfB = holdRegistration();

        const add = commands.add();
        await letPendingWorkRun();
        const remove = commands.remove();
        await letPendingWorkRun();
        registrationOfB.open();
        await Promise.all([add, remove]);

        expect(marketplaces).toEqual(["/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("keeps the cache of a marketplace being added while another add fails", async () => {
        const { commands, marketplaces, holdRegistration, cachedTemplateNames } = marketplaceHost({
            answers: [
                { location: "/work/b", scope: "allProjects" },
                { location: "/work/missing", scope: "allProjects" },
            ],
        });
        const registrationOfB = holdRegistration();

        const add = commands.add();
        await letPendingWorkRun();
        const failedAdd = commands.add();
        await letPendingWorkRun();
        registrationOfB.open();
        await Promise.all([add, failedAdd]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("still runs a command started while a failing one runs", async () => {
        const { commands, marketplaces, holdRead, cachedTemplateNames } = marketplaceHost({
            answers: [
                { location: "/work/missing", scope: "allProjects" },
                { location: "/work/b", scope: "allProjects" },
            ],
        });
        const failingFetch = holdRead("/work/missing/marketplace.json");

        const failing = commands.add();
        await letPendingWorkRun();
        const later = commands.add();
        await letPendingWorkRun();
        failingFetch.open();
        await Promise.all([failing, later]);

        expect(marketplaces).toEqual(["/work/a", "/work/b"]);
        expect(await cachedTemplateNames()).toEqual(["b.json"]);
    });

    it("does not bring back the cache of a marketplace removed while an update fetches it", async () => {
        const { commands, marketplaces, holdRead, cachedTemplateNames } = marketplaceHost({
            promptAnswers: { marketplaceRemoval: ["/work/a"] },
        });
        const updateFetchOfA = holdRead("/work/a/element-templates/a.json");

        const update = commands.update();
        await letPendingWorkRun();
        const remove = commands.remove();
        await letPendingWorkRun();
        updateFetchOfA.open();
        await Promise.all([update, remove]);

        expect(marketplaces).toEqual([]);
        expect(await cachedTemplateNames()).toEqual([]);
    });

    it("shows the progress of a removal that waits for an update", async () => {
        const { commands, marketplaces, notifier, holdRead } = marketplaceHost({
            promptAnswers: { marketplaceRemoval: ["/work/a"] },
        });
        const updateFetchOfA = holdRead("/work/a/element-templates/a.json");

        const update = commands.update();
        await letPendingWorkRun();
        const remove = commands.remove();
        await letPendingWorkRun();

        expect(notifier.progressTitles).toEqual([
            "Updating marketplaces…",
            "Removing marketplace(s)…",
        ]);
        expect(marketplaces).toEqual(["/work/a"]);

        updateFetchOfA.open();
        await Promise.all([update, remove]);
    });
});

describe("MarketplaceCommands when a cached marketplace cannot be deleted", () => {
    const busy = new Error("EBUSY: resource busy or locked");

    it("still reloads the open editors and reports the update", async () => {
        const { commands, workspace, notifier, templates, lockCachedMarketplaces } =
            marketplaceHost();
        await workspace.writeFile("/cache/gone/0/element-templates/gone.json", "{}");
        lockCachedMarketplaces(busy);

        await expect(commands.update()).resolves.toBeUndefined();

        expect(templates.reloads).toBe(1);
        expect(notifier.infos).toEqual(["Updated 1 marketplace(s)."]);
        expect(notifier.errors).toEqual([]);
        expect(notifier.loggedErrors).toEqual([busy]);
    });

    it("still reports a failed add", async () => {
        const { commands, workspace, notifier, lockCachedMarketplaces } = marketplaceHost({
            answers: [{ location: "/work/missing", scope: "project" }],
        });
        await workspace.writeFile("/cache/gone/0/element-templates/gone.json", "{}");
        lockCachedMarketplaces(busy);

        await commands.add();

        expect(notifier.loggedErrors).toEqual([busy, expect.any(InvalidMarketplaceError)]);
        expect(notifier.errors).toEqual([
            "Failed to add marketplace.\n" +
                'Invalid marketplace: could not read marketplace.json from "/work/missing": ' +
                "File not found: /work/missing/marketplace.json",
        ]);
    });

    it("reports the removal and reloads the open editors once the entries are unregistered", async () => {
        const { commands, marketplaces, notifier, templates, lockCachedMarketplaces } =
            marketplaceHost({ promptAnswers: { marketplaceRemoval: ["/work/a"] } });
        await commands.update();
        lockCachedMarketplaces(busy);

        await commands.remove();

        expect(marketplaces).toEqual([]);
        expect(templates.reloads).toBe(2);
        expect(notifier.infos).toEqual(["Updated 1 marketplace(s).", "Removed 1 marketplace(s)."]);
        expect(notifier.errors).toEqual([]);
        expect(notifier.loggedErrors).toEqual([busy]);
    });
});
