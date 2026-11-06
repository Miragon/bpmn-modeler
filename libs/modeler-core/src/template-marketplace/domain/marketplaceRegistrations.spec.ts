import { describe, expect, it } from "vitest";

import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import {
    isAlreadyRegistered,
    MarketplaceScope,
    RegisteredMarketplace,
    registeredMarketplaces,
    registrableLocation,
    RegistrationsByScope,
    scopesHolding,
    withoutMarketplaceEntries,
} from "./marketplaceRegistrations";

const selfHosted = (): MarketplaceSettingsEntry => ({
    provider: "gitlab",
    repo: "group/proj",
    baseUrl: "https://gl.acme.com",
});

describe("registeredMarketplaces", () => {
    it.each<{
        behaviour: string;
        registered: RegistrationsByScope;
        listed: RegisteredMarketplace[];
    }>([
        {
            behaviour: "nothing when both lists are empty",
            registered: { project: [], allProjects: [] },
            listed: [],
        },
        {
            behaviour: "an entry of all my projects with that scope",
            registered: { project: [], allProjects: ["https://github.com/acme/shared"] },
            listed: [{ entry: "https://github.com/acme/shared", scopes: ["allProjects"] }],
        },
        {
            behaviour: "an entry of this project with that scope",
            registered: { project: ["/work/templates"], allProjects: [] },
            listed: [{ entry: "/work/templates", scopes: ["project"] }],
        },
        {
            behaviour: "an entry in both lists once, with both scopes",
            registered: { project: ["/work/both"], allProjects: ["/work/both"] },
            listed: [{ entry: "/work/both", scopes: ["allProjects", "project"] }],
        },
        {
            behaviour: "the entries of all my projects first, as the settings union fetches them",
            registered: {
                project: ["/work/p1", "/work/p2"],
                allProjects: ["/work/a1", "/work/a2"],
            },
            listed: [
                { entry: "/work/a1", scopes: ["allProjects"] },
                { entry: "/work/a2", scopes: ["allProjects"] },
                { entry: "/work/p1", scopes: ["project"] },
                { entry: "/work/p2", scopes: ["project"] },
            ],
        },
        {
            behaviour: "a self-hosted entry in both lists once, matched by its fields",
            registered: { project: [selfHosted()], allProjects: [selfHosted()] },
            listed: [{ entry: selfHosted(), scopes: ["allProjects", "project"] }],
        },
        {
            behaviour: "an entry written twice into one list once, with that scope once",
            registered: { project: [], allProjects: ["/work/twice", "/work/twice"] },
            listed: [{ entry: "/work/twice", scopes: ["allProjects"] }],
        },
    ])("lists $behaviour", ({ registered, listed }) => {
        expect(registeredMarketplaces(registered)).toStrictEqual(listed);
    });
});

describe("isAlreadyRegistered", () => {
    it.each<{
        behaviour: string;
        registered: RegistrationsByScope;
        entry: MarketplaceSettingsEntry;
        scope: MarketplaceScope;
        already: boolean;
    }>([
        {
            behaviour: "registers an entry neither list holds for this project",
            registered: { project: [], allProjects: ["/work/other"] },
            entry: "/work/new",
            scope: "project",
            already: false,
        },
        {
            behaviour: "registers an entry neither list holds for all projects",
            registered: { project: ["/work/other"], allProjects: [] },
            entry: "/work/new",
            scope: "allProjects",
            already: false,
        },
        {
            behaviour: "registers nothing for this project when this project holds the entry",
            registered: { project: ["/work/a"], allProjects: [] },
            entry: "/work/a",
            scope: "project",
            already: true,
        },
        {
            behaviour:
                "registers nothing for this project when all my projects hold the entry, as this project reaches them",
            registered: { project: [], allProjects: ["/work/a"] },
            entry: "/work/a",
            scope: "project",
            already: true,
        },
        {
            behaviour: "shares an entry of this project with all my projects",
            registered: { project: ["/work/a"], allProjects: [] },
            entry: "/work/a",
            scope: "allProjects",
            already: false,
        },
        {
            behaviour: "registers nothing for all projects when all my projects hold the entry",
            registered: { project: [], allProjects: ["/work/a"] },
            entry: "/work/a",
            scope: "allProjects",
            already: true,
        },
        {
            behaviour: "matches a self-hosted entry by its fields, not by its identity",
            registered: { project: [], allProjects: [selfHosted()] },
            entry: selfHosted(),
            scope: "project",
            already: true,
        },
    ])("$behaviour", ({ registered, entry, scope, already }) => {
        expect(isAlreadyRegistered(registered, entry, scope)).toBe(already);
    });
});

describe("scopesHolding", () => {
    it.each<{
        behaviour: string;
        registered: RegistrationsByScope;
        entry: MarketplaceSettingsEntry;
        scopes: MarketplaceScope[];
    }>([
        {
            behaviour: "no scope when neither list holds the entry",
            registered: { project: ["/work/other"], allProjects: ["/work/other"] },
            entry: "/work/a",
            scopes: [],
        },
        {
            behaviour: "all my projects when only their list holds the entry",
            registered: { project: ["/work/other"], allProjects: ["/work/a"] },
            entry: "/work/a",
            scopes: ["allProjects"],
        },
        {
            behaviour: "this project when only its list holds the entry",
            registered: { project: ["/work/a"], allProjects: ["/work/other"] },
            entry: "/work/a",
            scopes: ["project"],
        },
        {
            behaviour: "both scopes, all my projects first, when both lists hold the entry",
            registered: { project: ["/work/a"], allProjects: ["/work/a"] },
            entry: "/work/a",
            scopes: ["allProjects", "project"],
        },
        {
            behaviour: "a scope once when its list holds the entry twice",
            registered: { project: ["/work/a", "/work/a"], allProjects: [] },
            entry: "/work/a",
            scopes: ["project"],
        },
        {
            behaviour: "the scopes of a self-hosted entry, matched by its fields",
            registered: { project: [selfHosted()], allProjects: [] },
            entry: selfHosted(),
            scopes: ["project"],
        },
    ])("names $behaviour", ({ registered, entry, scopes }) => {
        expect(scopesHolding(registered, entry)).toStrictEqual(scopes);
    });
});

describe("withoutMarketplaceEntries", () => {
    it.each<{
        behaviour: string;
        list: MarketplaceSettingsEntry[];
        removed: MarketplaceSettingsEntry[];
        kept: MarketplaceSettingsEntry[];
    }>([
        {
            behaviour: "drops every copy of a removed URL and keeps the order of the rest",
            list: ["/work/a", "/work/drop", "/work/b", "/work/drop"],
            removed: ["/work/drop"],
            kept: ["/work/a", "/work/b"],
        },
        {
            behaviour: "matches a self-hosted entry by its fields, not by its identity",
            list: [selfHosted(), "/work/a"],
            removed: [selfHosted()],
            kept: ["/work/a"],
        },
        {
            behaviour: "keeps a list that holds none of the removed entries",
            list: ["/work/a"],
            removed: ["/work/other"],
            kept: ["/work/a"],
        },
    ])("$behaviour", ({ list, removed, kept }) => {
        expect(withoutMarketplaceEntries(list, removed)).toStrictEqual(kept);
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
