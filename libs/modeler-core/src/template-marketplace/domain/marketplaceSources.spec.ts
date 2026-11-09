import { describe, expect, it } from "vitest";

import { parseMarketplaceUrl } from "./marketplace";
import { RegistrationsByScope } from "./marketplaceRegistrations";
import { marketplaceSourcesOf, registeredTemplateFiles } from "./marketplaceSources";

const SHARED = "https://github.com/acme/shared";
const LOCAL = "/work/templates";
const BROKEN = { provider: "github", repo: "" } as const;
const SHARED_ID = parseMarketplaceUrl(SHARED).id;
const LOCAL_ID = parseMarketplaceUrl(LOCAL).id;
const keyOf = (entry: unknown) => JSON.stringify(entry);

const registered: RegistrationsByScope = { project: [LOCAL], allProjects: [SHARED] };

describe("marketplaceSourcesOf", () => {
    it("lists each registration once, all my projects first, with its label, scope and cached templates", () => {
        const sources = marketplaceSourcesOf(registered, {
            kind: "read",
            byRegistration: new Map([
                [SHARED_ID, ["/cache/shared/0/1/element-templates/mail.json"]],
                [LOCAL_ID, []],
            ]),
        });

        expect(sources).toStrictEqual([
            {
                id: keyOf(SHARED),
                entry: SHARED,
                label: SHARED,
                scopeText: "All my projects",
                templateFiles: ["/cache/shared/0/1/element-templates/mail.json"],
            },
            {
                id: keyOf(LOCAL),
                entry: LOCAL,
                label: LOCAL,
                scopeText: "This project",
                templateFiles: [],
            },
        ]);
    });

    it.each<{
        behaviour: string;
        cached: Parameters<typeof marketplaceSourcesOf>[1];
        problem: string;
    }>([
        {
            behaviour: "a registration nothing was fetched for yet",
            cached: { kind: "read", byRegistration: new Map() },
            problem: "No templates fetched yet. Update the marketplaces to fetch them.",
        },
        {
            behaviour: "a cache that could not be read",
            cached: { kind: "failed" },
            problem: "Its cached templates could not be read. The log says why.",
        },
    ])("says why it lists no templates for $behaviour", ({ cached, problem }) => {
        const [source] = marketplaceSourcesOf({ project: [], allProjects: [SHARED] }, cached);

        expect(source).toStrictEqual({
            id: keyOf(SHARED),
            entry: SHARED,
            label: SHARED,
            scopeText: "All my projects",
            templateFiles: [],
            problem,
        });
    });

    it("lists an entry it cannot parse by its label, with why", () => {
        const [source] = marketplaceSourcesOf(
            { project: [BROKEN], allProjects: [] },
            { kind: "read", byRegistration: new Map() },
        );

        expect(source).toStrictEqual({
            id: keyOf(BROKEN),
            entry: BROKEN,
            label: "github.com/",
            scopeText: "This project",
            templateFiles: [],
            problem: 'Invalid marketplace: marketplace entry requires a non-empty "repo".',
        });
    });

    it("tells apart two entries that share one cache slot, each with that slot's templates", () => {
        const byUrl = "https://github.com/acme/templates";
        const byObject = { provider: "github", repo: "acme/templates" } as const;
        const slot = parseMarketplaceUrl(byUrl).id;

        const sources = marketplaceSourcesOf(
            { project: [byUrl], allProjects: [byObject] },
            { kind: "read", byRegistration: new Map([[slot, ["/cache/acme/mail.json"]]]) },
        );

        expect(new Set(sources.map(({ id }) => id)).size).toBe(2);
        expect(sources.map(({ entry, templateFiles }) => ({ entry, templateFiles }))).toEqual([
            { entry: byObject, templateFiles: ["/cache/acme/mail.json"] },
            { entry: byUrl, templateFiles: ["/cache/acme/mail.json"] },
        ]);
    });
});

describe("registeredTemplateFiles", () => {
    const sharedFile = "/cache/shared/0/1/element-templates/mail.json";
    const localFile = "/cache/local/0/1/element-templates/rest.json";
    const removedFile = "/cache/removed/0/1/element-templates/old.json";
    const byRegistration = new Map([
        [SHARED_ID, [sharedFile]],
        [LOCAL_ID, [localFile]],
        ["acme__removed", [removedFile]],
    ]);

    it.each<{ behaviour: string; entries: unknown[]; served: string[] }>([
        {
            behaviour: "the templates of each registered entry",
            entries: [SHARED, LOCAL],
            served: [sharedFile, localFile],
        },
        {
            behaviour: "nothing of a cached slot no entry names any more",
            entries: [SHARED],
            served: [sharedFile],
        },
        {
            behaviour: "a slot two entries share once",
            entries: [SHARED, { provider: "github", repo: "acme/shared" }],
            served: [sharedFile],
        },
        {
            behaviour: "nothing for an entry it cannot parse",
            entries: [BROKEN],
            served: [],
        },
        {
            behaviour: "nothing for an entry nothing was fetched for yet",
            entries: ["https://github.com/acme/fresh"],
            served: [],
        },
    ])("serves $behaviour", ({ entries, served }) => {
        expect(
            registeredTemplateFiles(
                entries as Parameters<typeof registeredTemplateFiles>[0],
                byRegistration,
            ),
        ).toEqual(served);
    });
});
