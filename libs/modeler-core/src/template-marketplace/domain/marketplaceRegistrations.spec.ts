import { describe, expect, it } from "vitest";

import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import {
    RegisteredMarketplace,
    registeredMarketplaces,
    RegistrationsByScope,
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
