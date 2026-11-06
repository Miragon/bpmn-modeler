import { describe, expect, it } from "vitest";

import {
    MarketplaceAddAnswer,
    marketplaceAddPrompt,
    marketplaceRemoval,
    registrableLocation,
} from "./marketplacePrompts";
import { MarketplaceRegistrations, RegisteredMarketplace } from "./marketplaceRegistrations";

type HostScopes = Pick<MarketplaceRegistrations, "writable" | "selfHostedIn">;

const vsCodeWithFolder: HostScopes = {
    writable: [
        { scope: "allProjects", savedIn: { kind: "settingsPage", path: ["Settings", "User"] } },
        { scope: "project", savedIn: { kind: "file", path: [".vscode", "settings.json"] } },
    ],
    selfHostedIn: { kind: "file", path: ["settings.json"] },
};

const vsCodeWithoutFolder: HostScopes = {
    writable: [
        { scope: "allProjects", savedIn: { kind: "settingsPage", path: ["Settings", "User"] } },
    ],
    selfHostedIn: { kind: "file", path: ["settings.json"] },
};

const intellij: HostScopes = {
    writable: [
        { scope: "project", savedIn: { kind: "file", path: [".idea", "workspace.xml"] } },
        {
            scope: "allProjects",
            savedIn: {
                kind: "settingsPage",
                path: ["Settings", "Tools", "Miragon BPMN Modeler", "Template Marketplaces"],
            },
        },
    ],
};

const ADD_TEXT = {
    title: "Add Template Marketplace",
    prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
    placeholder: "https://github.com/owner/repo  or  ~/path/to/folder",
};

const INVALID_LOCATION =
    "Enter a GitHub or GitLab repository URL, or a local folder path, holding a marketplace.json.";

describe("marketplaceAddPrompt", () => {
    it.each<{
        behaviour: string;
        host: HostScopes;
        refused?: MarketplaceAddAnswer;
        prompt: object;
    }>([
        {
            behaviour: "asks for this project first and says where each scope is saved",
            host: vsCodeWithFolder,
            prompt: {
                ...ADD_TEXT,
                location: "",
                scopes: [
                    {
                        scope: "project",
                        label: "Register for this project",
                        description: "Saved in .vscode/settings.json",
                    },
                    {
                        scope: "allProjects",
                        label: "Register for all my projects",
                        description: "Saved in Settings ▸ User",
                    },
                ],
                scope: "project",
            },
        },
        {
            behaviour: "names the settings page a host saves a scope on, step by step",
            host: intellij,
            prompt: {
                ...ADD_TEXT,
                location: "",
                scopes: [
                    {
                        scope: "project",
                        label: "Register for this project",
                        description: "Saved in .idea/workspace.xml",
                    },
                    {
                        scope: "allProjects",
                        label: "Register for all my projects",
                        description:
                            "Saved in Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces",
                    },
                ],
                scope: "project",
            },
        },
        {
            behaviour: "offers no scope choice when the host can register in one scope only",
            host: vsCodeWithoutFolder,
            prompt: { ...ADD_TEXT, location: "", scopes: [], scope: "allProjects" },
        },
        {
            behaviour: "registers for this project when the host reports no scope",
            host: { writable: [] },
            prompt: { ...ADD_TEXT, location: "", scopes: [], scope: "project" },
        },
        {
            behaviour:
                "asks again with the refused entry and its scope, and says where self-hosted hosts go",
            host: vsCodeWithFolder,
            refused: { location: "https://git.acme.com/group/project", scope: "allProjects" },
            prompt: {
                ...ADD_TEXT,
                location: "https://git.acme.com/group/project",
                invalidLocation: `${INVALID_LOCATION} Self-hosted hosts go in settings.json.`,
                scopes: [
                    {
                        scope: "project",
                        label: "Register for this project",
                        description: "Saved in .vscode/settings.json",
                    },
                    {
                        scope: "allProjects",
                        label: "Register for all my projects",
                        description: "Saved in Settings ▸ User",
                    },
                ],
                scope: "allProjects",
            },
        },
        {
            behaviour:
                "asks again without naming a place for self-hosted hosts on a host that has none",
            host: { writable: [] },
            refused: { location: "", scope: "project" },
            prompt: {
                ...ADD_TEXT,
                location: "",
                invalidLocation: INVALID_LOCATION,
                scopes: [],
                scope: "project",
            },
        },
    ])("$behaviour", ({ host, refused, prompt }) => {
        const { problemWith: _check, ...view } = marketplaceAddPrompt(host, "/home/ada", refused);

        expect(view).toStrictEqual(prompt);
    });

    it.each<{ behaviour: string; host: HostScopes; input: string; problem: string | undefined }>([
        {
            behaviour: "accepts a home folder",
            host: vsCodeWithFolder,
            input: "~/templates",
            problem: undefined,
        },
        {
            behaviour: "accepts a GitHub URL",
            host: vsCodeWithFolder,
            input: "https://github.com/acme/templates",
            problem: undefined,
        },
        {
            behaviour: "accepts a gitlab.com URL",
            host: vsCodeWithFolder,
            input: "https://gitlab.com/group/project",
            problem: undefined,
        },
        {
            behaviour: "accepts an absolute folder",
            host: intellij,
            input: "  /work/templates ",
            problem: undefined,
        },
        {
            behaviour: "refuses an empty entry",
            host: vsCodeWithFolder,
            input: "",
            problem: `${INVALID_LOCATION} Self-hosted hosts go in settings.json.`,
        },
        {
            behaviour: "refuses a blank entry",
            host: intellij,
            input: "   ",
            problem: INVALID_LOCATION,
        },
        {
            behaviour: "refuses text that names no repository or folder",
            host: vsCodeWithFolder,
            input: "not-a-repo-or-path",
            problem: `${INVALID_LOCATION} Self-hosted hosts go in settings.json.`,
        },
        {
            behaviour: "refuses a self-hosted host, which a URL cannot register",
            host: intellij,
            input: "https://git.acme.com/group/project",
            problem: INVALID_LOCATION,
        },
    ])("$behaviour as the user types", ({ host, input, problem }) => {
        expect(marketplaceAddPrompt(host, "/home/ada").problemWith(input)).toBe(problem);
    });
});

describe("registrableLocation", () => {
    const windowsJoin = (base: string, rest: string) => `${base}\\${rest}`;

    it.each<{
        behaviour: string;
        input: string;
        homeDir: string;
        joinPath?: (base: string, rest: string) => string;
        location: string | undefined;
    }>([
        {
            behaviour: "trims the entry and expands a home folder",
            input: "  ~/templates ",
            homeDir: "/home/ada",
            location: "/home/ada/templates",
        },
        {
            behaviour: "expands the bare home folder",
            input: "~",
            homeDir: "/home/ada",
            location: "/home/ada",
        },
        {
            behaviour: "joins a home folder the host's way",
            input: "~/templates",
            homeDir: "C:\\Users\\ada",
            joinPath: windowsJoin,
            location: "C:\\Users\\ada\\templates",
        },
        {
            behaviour: "keeps a repository URL as entered",
            input: "https://github.com/acme/templates",
            homeDir: "/home/ada",
            location: "https://github.com/acme/templates",
        },
        {
            behaviour: "refuses an empty entry",
            input: "",
            homeDir: "/home/ada",
            location: undefined,
        },
        {
            behaviour: "refuses a self-hosted host",
            input: "https://git.acme.com/group/project",
            homeDir: "/home/ada",
            location: undefined,
        },
    ])("$behaviour", ({ input, homeDir, joinPath, location }) => {
        expect(registrableLocation(input, homeDir, joinPath)).toBe(location);
    });
});

describe("marketplaceRemoval", () => {
    it("says that nothing is registered instead of offering an empty choice", () => {
        expect(marketplaceRemoval([])).toStrictEqual({
            kind: "nothingRegistered",
            message: "No marketplaces registered.",
        });
    });

    it.each<{
        behaviour: string;
        registered: RegisteredMarketplace;
        label: string;
        description: string;
    }>([
        {
            behaviour: "an entry of all my projects",
            registered: { entry: "https://github.com/acme/shared", scopes: ["allProjects"] },
            label: "https://github.com/acme/shared",
            description: "All my projects",
        },
        {
            behaviour: "an entry of this project",
            registered: { entry: "/work/templates", scopes: ["project"] },
            label: "/work/templates",
            description: "This project",
        },
        {
            behaviour: "a self-hosted entry registered in both scopes",
            registered: {
                entry: { provider: "gitlab", repo: "group/proj", baseUrl: "https://gl.acme.com" },
                scopes: ["project", "allProjects"],
            },
            label: "gl.acme.com/group/proj",
            description: "All my projects and this project",
        },
    ])(
        "offers $behaviour by its label and where it is registered",
        ({ registered, label, description }) => {
            expect(marketplaceRemoval([registered])).toStrictEqual({
                kind: "choose",
                prompt: {
                    id: "marketplaceRemoval",
                    title: "Remove Template Marketplace",
                    placeholder: "Select marketplaces to remove",
                    items: [{ label, description, value: registered.entry }],
                },
            });
        },
    );

    it("keeps the order the host lists its entries in", () => {
        const removal = marketplaceRemoval([
            { entry: "https://github.com/acme/b", scopes: ["allProjects"] },
            { entry: "https://github.com/acme/a", scopes: ["project"] },
        ]);

        expect(removal.kind === "choose" && removal.prompt.items.map((item) => item.value)).toEqual(
            ["https://github.com/acme/b", "https://github.com/acme/a"],
        );
    });
});
