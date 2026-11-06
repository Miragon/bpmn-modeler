import { describe, expect, it, vi } from "vitest";

/** VS Code's window and its User and Workspace values of `marketplaces`, as `inspect` reports them. */
const vscodeHost = vi.hoisted(() => ({
    workspaceFolders: undefined as readonly unknown[] | undefined,
    workspaceFile: undefined as { scheme: string; path: string } | undefined,
    marketplaces: { globalValue: undefined as unknown, workspaceValue: undefined as unknown },
    refusal: undefined as string | undefined,
}));

vi.mock("vscode", () => {
    const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
    return {
        ConfigurationTarget,
        workspace: {
            get workspaceFolders() {
                return vscodeHost.workspaceFolders;
            },
            get workspaceFile() {
                return vscodeHost.workspaceFile;
            },
            getConfiguration: () => ({
                get: () => undefined,
                inspect: (key: string) =>
                    key === "marketplaces" ? structuredClone(vscodeHost.marketplaces) : undefined,
                update: async (key: string, value: unknown, target: number) => {
                    if (vscodeHost.refusal) throw new Error(vscodeHost.refusal);
                    if (key !== "marketplaces") return;
                    const scope = target === ConfigurationTarget.Global ? "globalValue" : "workspaceValue";
                    vscodeHost.marketplaces[scope] = structuredClone(value);
                },
            }),
        },
    };
});

import { MarketplaceSettingsEntry, RegistrationsByScope } from "@miragon/bpmn-modeler-core";
import { describeMarketplaceRegistrationsContract } from "@miragon/bpmn-modeler-core/testing";

import { VsCodeSettings } from "../../../shared/adapter/out/VsCodeSettings";
import { VsCodeMarketplaceRegistrations } from "./VsCodeMarketplaceRegistrations";

type Window = "folder" | "workspaceFile" | "empty";

const WINDOWS: Record<Window, Pick<typeof vscodeHost, "workspaceFolders" | "workspaceFile">> = {
    folder: { workspaceFolders: [{}], workspaceFile: undefined },
    workspaceFile: {
        workspaceFolders: [{}],
        workspaceFile: { scheme: "file", path: "/work/acme.code-workspace" },
    },
    empty: { workspaceFolders: undefined, workspaceFile: undefined },
};

// A list nobody wrote is unset in VS Code's settings, not empty.
const settingValue = (list: readonly MarketplaceSettingsEntry[]) =>
    list.length > 0 ? structuredClone(list) : undefined;

function storeMarketplaces(stored: RegistrationsByScope): void {
    vscodeHost.marketplaces = {
        globalValue: settingValue(stored.allProjects),
        workspaceValue: settingValue(stored.project),
    };
}

function openWindow(window: Window, stored: RegistrationsByScope): VsCodeSettings {
    Object.assign(vscodeHost, WINDOWS[window], { refusal: undefined });
    storeMarketplaces(stored);
    return new VsCodeSettings();
}

describeMarketplaceRegistrationsContract(
    "VsCodeMarketplaceRegistrations over the User and Workspace settings",
    async (stored) => {
        const settings = openWindow("folder", stored);
        return {
            registrations: new VsCodeMarketplaceRegistrations(settings),
            settingsRead: () => settings.getMarketplaces(),
            refuseWrites: (reason) => {
                vscodeHost.refusal = reason;
            },
            storeElsewhere: storeMarketplaces,
        };
    },
);

const IN_USER_SETTINGS = {
    scope: "allProjects",
    savedIn: { kind: "settingsPage", path: ["Settings", "User"] },
} as const;

describe("VsCodeMarketplaceRegistrations", () => {
    it.each<{ behaviour: string; window: Window; places: unknown[] }>([
        {
            behaviour: "both settings while a folder is open",
            window: "folder",
            places: [
                { scope: "project", savedIn: { kind: "file", path: [".vscode", "settings.json"] } },
                IN_USER_SETTINGS,
            ],
        },
        {
            behaviour: "the workspace file and the User settings while a workspace file is open",
            window: "workspaceFile",
            places: [
                { scope: "project", savedIn: { kind: "file", path: ["acme.code-workspace"] } },
                IN_USER_SETTINGS,
            ],
        },
        {
            behaviour: "only the User settings without a workspace",
            window: "empty",
            places: [IN_USER_SETTINGS],
        },
    ])(
        "reports $behaviour, where self-hosted entries go and what is registered",
        async ({ window, places }) => {
            const settings = openWindow(window, {
                project: [],
                allProjects: ["https://github.com/acme/shared"],
            });

            await expect(new VsCodeMarketplaceRegistrations(settings).read()).resolves.toEqual({
                registered: { project: [], allProjects: ["https://github.com/acme/shared"] },
                writable: places,
                selfHostedIn: { kind: "file", path: ["settings.json"] },
            });
        },
    );
});
