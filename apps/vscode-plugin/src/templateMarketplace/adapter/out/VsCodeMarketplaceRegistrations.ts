import {
    MarketplaceRegistrations,
    MarketplaceRegistrationsPort,
    MarketplaceScope,
    MarketplaceSettingsEntry,
    RegistrationsByScope,
    SettingsPlace,
    WritableScope,
} from "@miragon/bpmn-modeler-core";

/** The User and Workspace settings lists, as `VsCodeSettings` reads and writes them. */
export interface MarketplaceSettings {
    getMarketplacesByScope(): RegistrationsByScope;
    canWriteWorkspaceSettings(): boolean;
    addMarketplace(location: string, scope: MarketplaceScope): Promise<void>;
    removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void>;
}

const IN_WORKSPACE_SETTINGS: WritableScope = {
    scope: "project",
    savedIn: { kind: "file", path: [".vscode", "settings.json"] },
};

const IN_USER_SETTINGS: WritableScope = {
    scope: "allProjects",
    savedIn: { kind: "settingsPage", path: ["Settings", "User"] },
};

/** A self-hosted marketplace is an object entry, which only settings.json can hold. */
const SELF_HOSTED_IN: SettingsPlace = { kind: "file", path: ["settings.json"] };

export class VsCodeMarketplaceRegistrations implements MarketplaceRegistrationsPort {
    constructor(private readonly settings: MarketplaceSettings) {}

    async read(): Promise<MarketplaceRegistrations> {
        return {
            registered: this.settings.getMarketplacesByScope(),
            writable: this.settings.canWriteWorkspaceSettings()
                ? [IN_WORKSPACE_SETTINGS, IN_USER_SETTINGS]
                : [IN_USER_SETTINGS],
            selfHostedIn: SELF_HOSTED_IN,
        };
    }

    register(location: string, scope: MarketplaceScope): Promise<void> {
        return this.settings.addMarketplace(location, scope);
    }

    unregister(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        return this.settings.removeMarketplaces(entries);
    }
}
