import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const inspectMock = vi.fn();
const updateMock = vi.fn();
const getMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        // A fresh getConfiguration() each call returns the same stubbed reader,
        // matching how VS Code hands back a section-scoped configuration object.
        getConfiguration: () => ({
            inspect: (...args: unknown[]) => inspectMock(...args),
            update: (...args: unknown[]) => updateMock(...args),
            get: (...args: unknown[]) => getMock(...args),
        }),
        // Mutated per-test to model an open workspace vs. an empty window.
        workspaceFolders: undefined,
        workspaceFile: undefined,
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import { ConfigurationTarget, workspace } from "vscode";

import {
    DEFAULT_MODELER_SETTINGS,
    ModelerSettingsSnapshot,
    settingKeyOf,
} from "@miragon/bpmn-modeler-core";
import {
    readSettingsSnapshot,
    settingsNormalizationCases,
    TYPESCRIPT_ONLY_SETTINGS_CASES,
} from "@miragon/bpmn-modeler-core/testing";

import { MODELER_SETTINGS_SECTION } from "../../domain/modelerSettingsSection";
import { VsCodeSettings } from "./VsCodeSettings";

const SHARED_CASES = settingsNormalizationCases(
    readFileSync(
        resolve(
            __dirname,
            "../../../../../../libs/modeler-core/src/kernel/domain/settingsNormalization.cases.json",
        ),
        "utf8",
    ),
);

const MANIFEST_DEFAULTS = new Map(
    Object.entries(
        (
            JSON.parse(readFileSync(resolve(__dirname, "../../../../package.json"), "utf8")) as {
                contributes: {
                    configuration: { properties: Record<string, { default?: unknown }> };
                };
            }
        ).contributes.configuration.properties,
    ).map(([key, property]) => [key.slice(MODELER_SETTINGS_SECTION.length + 1), property.default]),
);

/** Sets what inspect("marketplaces") reports for the User/Workspace scopes. */
function stubInspect(scopes: { globalValue?: unknown; workspaceValue?: unknown }) {
    inspectMock.mockReturnValue({ key: "marketplaces", ...scopes });
}

/** Serves `userValues` as VS Code does: what the user set, otherwise the manifest default. */
function stubConfiguration(userValues: Record<string, unknown>) {
    getMock.mockImplementation((section: string) =>
        section in userValues ? userValues[section] : MANIFEST_DEFAULTS.get(section),
    );
}

/** Toggles whether VS Code considers a workspace open. */
function setWorkspaceOpen(open: boolean) {
    (workspace as { workspaceFolders: unknown }).workspaceFolders = open ? [{}] : undefined;
    (workspace as { workspaceFile: unknown }).workspaceFile = undefined;
}

beforeEach(() => {
    inspectMock.mockReset();
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
    getMock.mockReset();
    setWorkspaceOpen(false);
});

describe("VsCodeSettings reads", () => {
    it.each([...SHARED_CASES, ...TYPESCRIPT_ONLY_SETTINGS_CASES])(
        "$name",
        ({ raw, normalized }) => {
            stubConfiguration(
                Object.fromEntries(
                    Object.entries(raw).map(([key, value]) => [
                        settingKeyOf(key as keyof ModelerSettingsSnapshot),
                        value,
                    ]),
                ),
            );
            stubInspect({ globalValue: raw.marketplaces });

            expect(readSettingsSnapshot(new VsCodeSettings())).toEqual({
                ...DEFAULT_MODELER_SETTINGS,
                ...normalized,
            });
        },
    );

    it.each([
        {
            case: "the linting flag the user turned off",
            userValues: { "linting.enabled": false },
            enabled: false,
        },
        {
            case: "the default linting flag",
            userValues: {},
            enabled: DEFAULT_MODELER_SETTINGS.lintingEnabled,
        },
        {
            case: "a linting flag that is no boolean as the default",
            userValues: { "linting.enabled": 0 },
            enabled: DEFAULT_MODELER_SETTINGS.lintingEnabled,
        },
    ])("$case", ({ userValues, enabled }) => {
        stubConfiguration(userValues);

        expect(new VsCodeSettings().getLintingEnabled()).toBe(enabled);
    });
});

describe("VsCodeSettings.getMarketplaces", () => {
    it("unions the User and Workspace lists, User first", () => {
        stubInspect({
            globalValue: ["https://github.com/acme/user"],
            workspaceValue: ["https://github.com/acme/ws"],
        });

        expect(new VsCodeSettings().getMarketplaces()).toEqual([
            "https://github.com/acme/user",
            "https://github.com/acme/ws",
        ]);
    });

    it("dedupes an entry present in both scopes (structural, incl. objects)", () => {
        stubInspect({
            globalValue: [
                "https://github.com/acme/one",
                { provider: "gitlab", repo: "group/proj", baseUrl: "https://gl.acme.com" },
            ],
            workspaceValue: [
                "https://github.com/acme/one",
                { provider: "gitlab", repo: "group/proj", baseUrl: "https://gl.acme.com" },
                "https://github.com/acme/two",
            ],
        });

        expect(new VsCodeSettings().getMarketplaces()).toEqual([
            "https://github.com/acme/one",
            { provider: "gitlab", repo: "group/proj", baseUrl: "https://gl.acme.com" },
            "https://github.com/acme/two",
        ]);
    });

    it("returns an empty list when neither scope has entries", () => {
        stubInspect({});
        expect(new VsCodeSettings().getMarketplaces()).toEqual([]);
    });

    it.each([
        {
            scope: "User",
            scopes: {
                globalValue: "https://github.com/acme/user",
                workspaceValue: ["https://github.com/acme/ws"],
            },
            entries: ["https://github.com/acme/ws"],
        },
        {
            scope: "Workspace",
            scopes: {
                globalValue: ["https://github.com/acme/user"],
                workspaceValue: { repo: "acme/ws" },
            },
            entries: ["https://github.com/acme/user"],
        },
    ])("reads a $scope value that is no list as no entries", ({ scopes, entries }) => {
        stubInspect(scopes);

        expect(new VsCodeSettings().getMarketplaces()).toEqual(entries);
    });
});

describe("VsCodeSettings.getMarketplacesByScope", () => {
    it("reads the User list as all my projects and the Workspace list as this project", () => {
        stubInspect({
            globalValue: ["https://github.com/acme/user", "https://github.com/acme/shared"],
            workspaceValue: ["https://github.com/acme/shared", "https://github.com/acme/ws"],
        });

        expect(new VsCodeSettings().getMarketplacesByScope()).toEqual({
            allProjects: ["https://github.com/acme/user", "https://github.com/acme/shared"],
            project: ["https://github.com/acme/shared", "https://github.com/acme/ws"],
        });
    });
});

describe("VsCodeSettings.removeMarketplaces", () => {
    it("removes an entry from every scope it appears in", async () => {
        stubInspect({
            globalValue: ["https://github.com/acme/shared", "https://github.com/acme/keep"],
            workspaceValue: ["https://github.com/acme/shared"],
        });

        await new VsCodeSettings().removeMarketplaces(["https://github.com/acme/shared"]);

        // The shared entry lived in both scopes, so both settings.json are rewritten.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/keep"],
            ConfigurationTarget.Global,
        );
        // Removing the workspace scope's only entry drops the key entirely.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            undefined,
            ConfigurationTarget.Workspace,
        );
        expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it("matches an object entry structurally", async () => {
        const obj = {
            provider: "gitlab" as const,
            repo: "group/proj",
            baseUrl: "https://gl.acme.com",
        };
        stubInspect({ globalValue: [obj, "https://github.com/acme/keep"] });

        // A fresh object with the same shape must still match and be removed.
        await new VsCodeSettings().removeMarketplaces([{ ...obj }]);

        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/keep"],
            ConfigurationTarget.Global,
        );
        expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it("does not touch a scope that never held any of the removed entries", async () => {
        stubInspect({
            globalValue: ["https://github.com/acme/gone"],
            workspaceValue: ["https://github.com/acme/other"],
        });

        await new VsCodeSettings().removeMarketplaces(["https://github.com/acme/gone"]);

        // Only the Global list changed; the Workspace list is left untouched.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            undefined,
            ConfigurationTarget.Global,
        );
        expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it("writes undefined when the removed entry was the scope's last one", async () => {
        stubInspect({ globalValue: ["https://github.com/acme/only"] });

        await new VsCodeSettings().removeMarketplaces(["https://github.com/acme/only"]);

        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            undefined,
            ConfigurationTarget.Global,
        );
    });

    it("leaves a scope whose value is no list untouched", async () => {
        stubInspect({
            globalValue: "https://github.com/acme/gone",
            workspaceValue: ["https://github.com/acme/gone"],
        });

        await new VsCodeSettings().removeMarketplaces(["https://github.com/acme/gone"]);

        expect(updateMock).toHaveBeenCalledOnce();
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            undefined,
            ConfigurationTarget.Workspace,
        );
    });

    it("touches only Global and never throws when no workspace is open", async () => {
        setWorkspaceOpen(false);
        // No workspace open → inspect reports no workspaceValue at all.
        stubInspect({ globalValue: ["https://github.com/acme/gone"] });

        await new VsCodeSettings().removeMarketplaces(["https://github.com/acme/gone"]);

        expect(updateMock).toHaveBeenCalledOnce();
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            undefined,
            ConfigurationTarget.Global,
        );
    });
});

describe("VsCodeSettings.canWriteWorkspaceSettings", () => {
    it.each([
        { behaviour: "while a workspace is open", open: true },
        { behaviour: "not without a workspace", open: false },
    ])("writes Workspace settings $behaviour", ({ open }) => {
        setWorkspaceOpen(open);

        expect(new VsCodeSettings().canWriteWorkspaceSettings()).toBe(open);
    });
});

describe("VsCodeSettings.addMarketplace", () => {
    it("appends to the Workspace scope's own list for this project", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/user"],
            workspaceValue: ["https://github.com/acme/ws"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "project");

        // Only the workspace list is extended — the User entry must not be copied
        // into the repo's settings.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/ws", "https://github.com/acme/new"],
            ConfigurationTarget.Workspace,
        );
    });

    it("falls back to Global scope for a project add when no workspace is open", async () => {
        setWorkspaceOpen(false);
        stubInspect({ globalValue: ["https://github.com/acme/user"] });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "project");

        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/user", "https://github.com/acme/new"],
            ConfigurationTarget.Global,
        );
    });

    it("is a no-op for a project add when the Workspace list already holds the URL", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: [],
            workspaceValue: ["https://github.com/acme/shared"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "project");

        expect(updateMock).not.toHaveBeenCalled();
    });

    it("writes a project add of a URL the User list holds, as the core decides whether to add", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/shared"],
            workspaceValue: [],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "project");

        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/shared"],
            ConfigurationTarget.Workspace,
        );
    });

    it("appends to Global and targets Global for an all-projects add even with a workspace open", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/user"],
            workspaceValue: ["https://github.com/acme/ws"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "allProjects");

        // An all-projects add writes only the User list — the workspace entry must not leak
        // into user settings.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/user", "https://github.com/acme/new"],
            ConfigurationTarget.Global,
        );
    });

    it("promotes a workspace-only entry to Global for an all-projects add", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: [],
            workspaceValue: ["https://github.com/acme/shared"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "allProjects");

        // Present workspace-level, absent user-level → still written to the User
        // list (promotion is allowed).
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/shared"],
            ConfigurationTarget.Global,
        );
    });

    it.each([
        {
            scope: "allProjects" as const,
            target: ConfigurationTarget.Global,
            value: { globalValue: "https://github.com/acme" },
        },
        {
            scope: "project" as const,
            target: ConfigurationTarget.Workspace,
            value: { workspaceValue: "https://github.com/acme" },
        },
    ])(
        "replaces a $scope value that is no list with the new entry",
        async ({ scope, target, value }) => {
            setWorkspaceOpen(true);
            stubInspect(value);

            await new VsCodeSettings().addMarketplace("https://github.com/acme/new", scope);

            expect(updateMock).toHaveBeenCalledWith(
                "marketplaces",
                ["https://github.com/acme/new"],
                target,
            );
        },
    );

    it("is a no-op for an all-projects add when the URL already exists in the User list", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/shared"],
            workspaceValue: [],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "allProjects");

        expect(updateMock).not.toHaveBeenCalled();
    });
});
