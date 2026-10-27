import { describe, expect, it } from "vitest";

import { MarketplaceSettingsEntry } from "../../kernel/domain/hostPorts";
import { CachePrune, MarketplaceEntryFailure, MarketplaceRegistry } from "./marketplaceRegistry";

const GITHUB_ONE = "https://github.com/acme/one";
const GITHUB_TWO = "https://github.com/acme/two";
const SELF_HOSTED_GITLAB: MarketplaceSettingsEntry = {
    provider: "gitlab",
    repo: "group/project",
    baseUrl: "https://gitlab.acme.com",
};
const UNEXPANDED_HOME = "~/templates";
const UNKNOWN_PROVIDER = { provider: "bogus", repo: "a/b" } as unknown as MarketplaceSettingsEntry;
const MISSING_REPO = { provider: "github" } as unknown as MarketplaceSettingsEntry;

const UNEXPANDED_HOME_FAILURE: MarketplaceEntryFailure = {
    label: UNEXPANDED_HOME,
    reason: 'Invalid marketplace: "~" home paths must be expanded to an absolute path before registration: "~/templates"',
};
const UNKNOWN_PROVIDER_FAILURE: MarketplaceEntryFailure = {
    label: "github.com/a/b",
    reason: 'Invalid marketplace: marketplace entry "provider" must be "github" or "gitlab"',
};
const MISSING_REPO_FAILURE: MarketplaceEntryFailure = {
    label: '{"provider":"github"}',
    reason: 'Invalid marketplace: marketplace entry requires a non-empty "repo"',
};

describe("MarketplaceRegistry", () => {
    it.each<{
        behaviour: string;
        settings: MarketplaceSettingsEntry[];
        registeredIds: string[];
        failures: MarketplaceEntryFailure[];
        cachePrune: CachePrune;
    }>([
        {
            behaviour: "prunes every slot when no marketplace is registered",
            settings: [],
            registeredIds: [],
            failures: [],
            cachePrune: { kind: "keepOnly", ids: new Set() },
        },
        {
            behaviour: "keeps only the slot of the one registered marketplace",
            settings: [GITHUB_ONE],
            registeredIds: ["acme__one"],
            failures: [],
            cachePrune: { kind: "keepOnly", ids: new Set(["acme__one"]) },
        },
        {
            behaviour: "keeps the slots of string and object entries alike",
            settings: [GITHUB_ONE, SELF_HOSTED_GITLAB, GITHUB_TWO],
            registeredIds: ["acme__one", "gitlab.acme.com__group__project", "acme__two"],
            failures: [],
            cachePrune: {
                kind: "keepOnly",
                ids: new Set(["acme__one", "gitlab.acme.com__group__project", "acme__two"]),
            },
        },
        {
            behaviour: "keeps one slot for a marketplace registered twice",
            settings: [GITHUB_ONE, GITHUB_ONE],
            registeredIds: ["acme__one", "acme__one"],
            failures: [],
            cachePrune: { kind: "keepOnly", ids: new Set(["acme__one"]) },
        },
        {
            behaviour: "suppresses the prune when the only entry cannot be parsed",
            settings: [UNKNOWN_PROVIDER],
            registeredIds: [],
            failures: [UNKNOWN_PROVIDER_FAILURE],
            cachePrune: { kind: "suppressed", unparseable: ["github.com/a/b"] },
        },
        {
            behaviour: "still registers the parseable entries when one entry cannot be parsed",
            settings: [GITHUB_ONE, UNEXPANDED_HOME, GITHUB_TWO],
            registeredIds: ["acme__one", "acme__two"],
            failures: [UNEXPANDED_HOME_FAILURE],
            cachePrune: { kind: "suppressed", unparseable: [UNEXPANDED_HOME] },
        },
        {
            behaviour: "names every unparseable entry in settings order",
            settings: [MISSING_REPO, GITHUB_ONE, UNKNOWN_PROVIDER],
            registeredIds: ["acme__one"],
            failures: [MISSING_REPO_FAILURE, UNKNOWN_PROVIDER_FAILURE],
            cachePrune: {
                kind: "suppressed",
                unparseable: ['{"provider":"github"}', "github.com/a/b"],
            },
        },
    ])("$behaviour", ({ settings, registeredIds, failures, cachePrune }) => {
        const registry = MarketplaceRegistry.fromEntries(settings);

        expect(registry.registrations.map((registration) => registration.id)).toEqual(
            registeredIds,
        );
        expect(registry.failures).toEqual(failures);
        expect(registry.cachePrune()).toEqual(cachePrune);
    });

    it("keeps settings order across registered and unparseable entries, each with its label", () => {
        const registry = MarketplaceRegistry.fromEntries([
            ` ${GITHUB_ONE} `,
            UNKNOWN_PROVIDER,
            SELF_HOSTED_GITLAB,
        ]);

        expect(
            registry.entries.map((entry) =>
                entry.kind === "registered"
                    ? { kind: entry.kind, label: entry.label, id: entry.registration.id }
                    : { kind: entry.kind, label: entry.label, reason: entry.reason },
            ),
        ).toEqual([
            { kind: "registered", label: ` ${GITHUB_ONE} `, id: "acme__one" },
            { kind: "unparseable", ...UNKNOWN_PROVIDER_FAILURE },
            {
                kind: "registered",
                label: "gitlab.acme.com/group/project",
                id: "gitlab.acme.com__group__project",
            },
        ]);
    });

    it("suppresses the prune instead of throwing for a null entry", () => {
        const registry = MarketplaceRegistry.fromEntries([
            GITHUB_ONE,
            null as unknown as MarketplaceSettingsEntry,
        ]);

        expect(registry.registrations.map((registration) => registration.id)).toEqual([
            "acme__one",
        ]);
        expect(registry.cachePrune()).toEqual({ kind: "suppressed", unparseable: ["null"] });
    });
});
