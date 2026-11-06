import { describe, expect, it } from "vitest";

import { MarketplaceScope, MarketplaceSettingsEntry, SettingsPlace } from "@miragon/bpmn-modeler-core";

import { MarketplaceSettings, VsCodeMarketplaceRegistrations } from "./VsCodeMarketplaceRegistrations";

/** The User and Workspace lists as `VsCodeSettings` reads and writes them. */
class SettingsLists implements MarketplaceSettings {
    readonly added: [string, MarketplaceScope][] = [];
    readonly removed: MarketplaceSettingsEntry[][] = [];

    constructor(private readonly workspaceSettings: SettingsPlace | undefined) {}

    getMarketplacesByScope() {
        return { project: [], allProjects: ["https://github.com/acme/shared"] };
    }

    workspaceSettingsPlace(): SettingsPlace | undefined {
        return this.workspaceSettings;
    }

    async addMarketplace(location: string, scope: MarketplaceScope): Promise<void> {
        this.added.push([location, scope]);
    }

    async removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        this.removed.push([...entries]);
    }
}

const FOLDER_SETTINGS: SettingsPlace = { kind: "file", path: [".vscode", "settings.json"] };
const WORKSPACE_FILE: SettingsPlace = { kind: "file", path: ["acme.code-workspace"] };
const IN_USER_SETTINGS = {
    scope: "allProjects",
    savedIn: { kind: "settingsPage", path: ["Settings", "User"] },
} as const;

describe("VsCodeMarketplaceRegistrations", () => {
    it.each([
        {
            behaviour: "both settings while a folder is open",
            workspaceSettings: FOLDER_SETTINGS,
            places: [{ scope: "project", savedIn: FOLDER_SETTINGS }, IN_USER_SETTINGS],
        },
        {
            behaviour: "the workspace file and the User settings while a workspace file is open",
            workspaceSettings: WORKSPACE_FILE,
            places: [{ scope: "project", savedIn: WORKSPACE_FILE }, IN_USER_SETTINGS],
        },
        {
            behaviour: "only the User settings without a workspace",
            workspaceSettings: undefined,
            places: [IN_USER_SETTINGS],
        },
    ])("reports $behaviour, where self-hosted entries go and what is registered", async ({ workspaceSettings, places }) => {
        const registrations = new VsCodeMarketplaceRegistrations(new SettingsLists(workspaceSettings));

        await expect(registrations.read()).resolves.toEqual({
            registered: { project: [], allProjects: ["https://github.com/acme/shared"] },
            writable: places,
            selfHostedIn: { kind: "file", path: ["settings.json"] },
        });
    });

    it("writes registrations to the settings of the chosen scope and removes them from every scope", async () => {
        const settings = new SettingsLists(FOLDER_SETTINGS);
        const registrations = new VsCodeMarketplaceRegistrations(settings);

        await registrations.register("/work/templates", "project");
        await registrations.unregister(["https://github.com/acme/shared"]);

        expect(settings.added).toEqual([["/work/templates", "project"]]);
        expect(settings.removed).toEqual([["https://github.com/acme/shared"]]);
    });
});
