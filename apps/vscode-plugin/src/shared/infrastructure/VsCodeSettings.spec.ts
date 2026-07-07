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

import { VsCodeSettings } from "./VsCodeSettings";

/** Sets what inspect("marketplaces") reports for the User/Workspace scopes. */
function stubInspect(scopes: { globalValue?: unknown[]; workspaceValue?: unknown[] }) {
    inspectMock.mockReturnValue({ key: "marketplaces", ...scopes });
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
});

describe("VsCodeSettings.addMarketplace", () => {
    it("appends to the Workspace scope's own list when scoped to the workspace", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/user"],
            workspaceValue: ["https://github.com/acme/ws"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "workspace");

        // Only the workspace list is extended — the User entry must not be copied
        // into the repo's settings.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/ws", "https://github.com/acme/new"],
            ConfigurationTarget.Workspace,
        );
    });

    it("falls back to Global scope for a workspace add when no workspace is open", async () => {
        setWorkspaceOpen(false);
        stubInspect({ globalValue: ["https://github.com/acme/user"] });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "workspace");

        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/user", "https://github.com/acme/new"],
            ConfigurationTarget.Global,
        );
    });

    it("is a no-op for a workspace add when the URL already exists in the other scope", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/shared"],
            workspaceValue: [],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "workspace");

        expect(updateMock).not.toHaveBeenCalled();
    });

    it("appends to Global and targets Global for a user add even with a workspace open", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/user"],
            workspaceValue: ["https://github.com/acme/ws"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/new", "user");

        // A user add writes only the User list — the workspace entry must not leak
        // into user settings.
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/user", "https://github.com/acme/new"],
            ConfigurationTarget.Global,
        );
    });

    it("promotes a workspace-only entry to Global for a user add", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: [],
            workspaceValue: ["https://github.com/acme/shared"],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "user");

        // Present workspace-level, absent user-level → still written to the User
        // list (promotion is allowed).
        expect(updateMock).toHaveBeenCalledWith(
            "marketplaces",
            ["https://github.com/acme/shared"],
            ConfigurationTarget.Global,
        );
    });

    it("is a no-op for a user add when the URL already exists in the User list", async () => {
        setWorkspaceOpen(true);
        stubInspect({
            globalValue: ["https://github.com/acme/shared"],
            workspaceValue: [],
        });

        await new VsCodeSettings().addMarketplace("https://github.com/acme/shared", "user");

        expect(updateMock).not.toHaveBeenCalled();
    });
});
