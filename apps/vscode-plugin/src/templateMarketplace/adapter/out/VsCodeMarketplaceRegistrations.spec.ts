import { describe, expect, it } from "vitest";

import { MarketplaceScope, MarketplaceSettingsEntry } from "@miragon/bpmn-modeler-core";

import { MarketplaceSettings, VsCodeMarketplaceRegistrations } from "./VsCodeMarketplaceRegistrations";

/** The User and Workspace lists as `VsCodeSettings` reads and writes them. */
class SettingsLists implements MarketplaceSettings {
    readonly added: [string, MarketplaceScope][] = [];
    readonly removed: MarketplaceSettingsEntry[][] = [];

    constructor(private readonly workspaceOpen: boolean) {}

    getMarketplacesByScope() {
        return { project: [], allProjects: ["https://github.com/acme/shared"] };
    }

    canWriteWorkspaceSettings(): boolean {
        return this.workspaceOpen;
    }

    async addMarketplace(location: string, scope: MarketplaceScope): Promise<void> {
        this.added.push([location, scope]);
    }

    async removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        this.removed.push([...entries]);
    }
}

const IN_WORKSPACE_SETTINGS = {
    scope: "project",
    savedIn: { kind: "file", path: [".vscode", "settings.json"] },
} as const;
const IN_USER_SETTINGS = {
    scope: "allProjects",
    savedIn: { kind: "settingsPage", path: ["Settings", "User"] },
} as const;

describe("VsCodeMarketplaceRegistrations", () => {
    it.each([
        {
            behaviour: "both settings while a workspace is open",
            workspaceOpen: true,
            places: [IN_WORKSPACE_SETTINGS, IN_USER_SETTINGS],
        },
        {
            behaviour: "only the User settings without a workspace",
            workspaceOpen: false,
            places: [IN_USER_SETTINGS],
        },
    ])("reports $behaviour, where self-hosted entries go and what is registered", async ({ workspaceOpen, places }) => {
        const registrations = new VsCodeMarketplaceRegistrations(new SettingsLists(workspaceOpen));

        await expect(registrations.read()).resolves.toEqual({
            registered: { project: [], allProjects: ["https://github.com/acme/shared"] },
            writable: places,
            selfHostedIn: { kind: "file", path: ["settings.json"] },
        });
    });

    it("writes registrations to the settings of the chosen scope and removes them from every scope", async () => {
        const settings = new SettingsLists(true);
        const registrations = new VsCodeMarketplaceRegistrations(settings);

        await registrations.register("/work/templates", "project");
        await registrations.unregister(["https://github.com/acme/shared"]);

        expect(settings.added).toEqual([["/work/templates", "project"]]);
        expect(settings.removed).toEqual([["https://github.com/acme/shared"]]);
    });
});
