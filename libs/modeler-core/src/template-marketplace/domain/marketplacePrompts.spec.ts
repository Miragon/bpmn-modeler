import { describe, expect, it } from "vitest";

import { FetchReport } from "./fetchReport";
import {
    MarketplaceAddAnswer,
    MarketplaceAddNotice,
    marketplaceAddNotice,
    marketplaceAddPrompt,
    marketplaceRemoval,
} from "./marketplacePrompts";
import {
    MarketplaceAddOutcome,
    MarketplaceRegistrations,
    RegisteredMarketplace,
} from "./marketplaceRegistrations";

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

describe("marketplaceAddNotice", () => {
    const unreachable = 'github github.com/acme/two path "b": offline';
    const skippedType =
        'sources[2]: content type "palette-entries" is not supported by this version';
    const futureType =
        'sources[0]: content type "palette-entries" is not supported by this version';
    const fetched = FetchReport.of({
        usableSources: 1,
        cached: 2,
        sourceFailures: [],
        skippedTypes: [],
    });
    const fetchedInPart = FetchReport.of({
        usableSources: 2,
        cached: 2,
        sourceFailures: [{ source: 'github github.com/acme/two path "b"', reason: "offline" }],
        skippedTypes: [skippedType],
    });
    const fetchedNothing = FetchReport.of({
        usableSources: 0,
        cached: 0,
        sourceFailures: [],
        skippedTypes: [futureType],
    });

    it.each<{
        behaviour: string;
        outcome: MarketplaceAddOutcome;
        report: FetchReport;
        notice: MarketplaceAddNotice;
    }>([
        {
            behaviour: "confirms an added marketplace whose sources were all fetched",
            outcome: { kind: "registered" },
            report: fetched,
            notice: { severity: "info", message: "Marketplace added." },
        },
        {
            behaviour: "warns with the sources an added marketplace could not fetch",
            outcome: { kind: "registered" },
            report: fetchedInPart,
            notice: {
                severity: "warning",
                message: `Marketplace added, but some of its sources could not be fetched:\n${unreachable}\n${skippedType}`,
            },
        },
        {
            behaviour: "warns why an added marketplace fetched nothing",
            outcome: { kind: "registered" },
            report: fetchedNothing,
            notice: {
                severity: "warning",
                message: `Marketplace added, but none of its sources could be fetched:\n${futureType}`,
            },
        },
        {
            behaviour: "says a marketplace is already registered for all my projects",
            outcome: { kind: "alreadyRegistered", registeredIn: ["allProjects"] },
            report: fetched,
            notice: {
                severity: "info",
                message: "Marketplace already registered for all my projects.",
            },
        },
        {
            behaviour: "says a marketplace is already registered for this project",
            outcome: { kind: "alreadyRegistered", registeredIn: ["project"] },
            report: fetched,
            notice: {
                severity: "info",
                message: "Marketplace already registered for this project.",
            },
        },
        {
            behaviour: "names both scopes, all my projects first, when both hold the marketplace",
            outcome: { kind: "alreadyRegistered", registeredIn: ["project", "allProjects"] },
            report: fetched,
            notice: {
                severity: "info",
                message: "Marketplace already registered for all my projects and this project.",
            },
        },
        {
            behaviour: "warns with the sources a registered marketplace could not fetch again",
            outcome: { kind: "alreadyRegistered", registeredIn: ["allProjects"] },
            report: fetchedInPart,
            notice: {
                severity: "warning",
                message:
                    "Marketplace already registered for all my projects, " +
                    `but some of its sources could not be fetched:\n${unreachable}\n${skippedType}`,
            },
        },
        {
            behaviour: "warns why a registered marketplace fetched nothing",
            outcome: { kind: "alreadyRegistered", registeredIn: ["project"] },
            report: fetchedNothing,
            notice: {
                severity: "warning",
                message:
                    "Marketplace already registered for this project, " +
                    `but none of its sources could be fetched:\n${futureType}`,
            },
        },
    ])("$behaviour", ({ outcome, report, notice }) => {
        expect(marketplaceAddNotice(outcome, report)).toStrictEqual(notice);
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
