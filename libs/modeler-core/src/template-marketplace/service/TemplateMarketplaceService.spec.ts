import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { FetchReport } from "../domain/fetchReport";
import { InvalidMarketplaceError } from "../domain/marketplace";
import {
    RepositoryAccessError,
    RepositorySource,
    RepositorySourceConfig,
    RepositorySourceFactory,
} from "../domain/ports";
import { MarketplaceCache } from "./MarketplaceCache";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

const MANIFEST = JSON.stringify({
    sources: [
        { path: "./element-templates" },
        { provider: "github", repo: "camunda/camunda-modeler", ref: "develop", path: "resources" },
    ],
});

/**
 * Builds a service over `factory` and the in-memory host, caching into a real
 * {@link MarketplaceCache} under `/cache`. `tokenAnswers` scripts the prompt per
 * host (an unanswered host declines); `storedTokens` seeds the token store;
 * `cachedFiles` seeds the cache.
 */
function serviceOver(
    factory: RepositorySourceFactory,
    {
        tokenAnswers,
        storedTokens = {},
        cachedFiles,
    }: {
        tokenAnswers?: Record<string, string>;
        storedTokens?: Record<string, string>;
        cachedFiles?: Record<string, string>;
    } = {},
) {
    const host = createTestHost({ tokenAnswers, files: cachedFiles });
    for (const [tokenHost, token] of Object.entries(storedTokens)) {
        host.tokens.tokens.set(tokenHost, token);
    }
    const service = new TemplateMarketplaceService(
        factory,
        new MarketplaceCache("/cache", host.workspace),
        host.settings,
        host.notifier,
        host.tokens,
        host.tokenPrompt,
        "/home/test",
    );
    return {
        service,
        cachedPaths: () => [...host.workspace.files.keys()],
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        tokens: host.tokens,
        tokenPrompt: host.tokenPrompt,
    };
}

/**
 * Wires the service to a factory whose marketplace-root source (path `""`)
 * serves `marketplace.json` and whose every other source serves one file.
 */
function createService(
    opts: { manifest?: string | Error; cachedFiles?: Record<string, string> } = {},
) {
    const sourceFactory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
        if (config.path === "") {
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    if (opts.manifest instanceof Error) {
                        throw opts.manifest;
                    }
                    return opts.manifest ?? MANIFEST;
                }),
            };
        }
        return {
            listTemplateFiles: vi.fn().mockResolvedValue([`${config.path}/t.json`]),
            fetchFile: vi.fn().mockResolvedValue(`{"from":"${config.path}"}`),
        };
    });
    return { ...serviceOver(sourceFactory, { cachedFiles: opts.cachedFiles }), sourceFactory };
}

/**
 * A factory whose *manifest* source is gated on `config.token`: without the
 * expected token it throws {@link RepositoryAccessError} (mimicking GitHub's
 * 404 on a private repo), with it, it serves `manifest`. Every other source
 * serves one template file so a post-auth run still caches something.
 */
function tokenGatedFactory({
    manifest,
    expectedToken,
}: {
    manifest: string;
    expectedToken?: string;
}) {
    return vi.fn((config: RepositorySourceConfig): RepositorySource => {
        if (config.path === "") {
            const token = config.kind === "github" ? config.token : undefined;
            const denied = expectedToken === undefined || token !== expectedToken;
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    if (denied) {
                        throw new RepositoryAccessError("github.com", 404, "acme/templates", false);
                    }
                    return manifest;
                }),
            };
        }
        return {
            listTemplateFiles: vi.fn().mockResolvedValue([`${config.path}/t.json`]),
            fetchFile: vi.fn().mockResolvedValue("{}"),
        };
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("TemplateMarketplaceService.addMarketplace", () => {
    it("fetches the manifest and caches every source's templates", async () => {
        const { service, cachedPaths, notifier } = createService();

        await service.addMarketplace("https://github.com/acme/templates");

        // Relative source resolves against the marketplace repo (index 0);
        // the github source uses its own repo (index 1).
        expect(cachedPaths()).toEqual([
            "/cache/acme__templates/0/element-templates/element-templates/t.json",
            "/cache/acme__templates/1/element-templates/resources/t.json",
        ]);
        expect(notifier.logged("info")).toContain(
            "Marketplace added: https://github.com/acme/templates (2 template file(s) cached)",
        );
    });

    it("resolves a relative source against the marketplace owner/repo/ref", async () => {
        const { service, sourceFactory } = createService();

        await service.addMarketplace("https://github.com/acme/templates/tree/main");

        expect(sourceFactory).toHaveBeenCalledWith({
            kind: "github",
            owner: "acme",
            repo: "templates",
            ref: "main",
            path: "element-templates",
        });
    });

    it("resolves a local folder registration to a local source config", async () => {
        const { service, sourceFactory, cachedPaths } = createService();

        await service.addMarketplace("/Users/me/templates");

        // The relative source resolves against the registered folder, not a repo.
        expect(sourceFactory).toHaveBeenCalledWith({
            kind: "local",
            rootDir: "/Users/me/templates",
            path: "element-templates",
        });
        expect(cachedPaths()).toContain(
            "/cache/local--Users-me-templates-f7bdb1db/0/element-templates/element-templates/t.json",
        );
    });

    it("resolves a provider:local source, expanding ~ via the injected home dir", async () => {
        // A github-registered marketplace whose manifest points at an external
        // local folder via `provider: "local"`. The root (manifest) read uses the
        // github config; the local source resolves to its own expanded directory.
        const manifest = JSON.stringify({
            sources: [{ provider: "local", path: "~/ext-templates" }],
        });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource =>
            config.kind === "github" && config.path === ""
                ? {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn().mockResolvedValue(manifest),
                  }
                : {
                      listTemplateFiles: vi.fn().mockResolvedValue(["connector.json"]),
                      fetchFile: vi.fn().mockResolvedValue("{}"),
                  },
        );
        const { service, workspace } = serviceOver(factory);

        await service.addMarketplace("https://github.com/acme/templates");

        expect(factory).toHaveBeenCalledWith({
            kind: "local",
            rootDir: "/home/test/ext-templates",
            path: "",
        });
        expect(workspace.files).toEqual(
            new Map([["/cache/acme__templates/0/element-templates/connector.json", "{}"]]),
        );
    });

    it("throws when the manifest cannot be read, so no registration is persisted", async () => {
        const { service, cachedPaths } = createService({ manifest: new Error("404") });

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();
        expect(cachedPaths()).toEqual([]);
    });

    it("keeps the manifest fetch failure as the cause of the invalid-marketplace error", async () => {
        const offline = new Error("offline");
        const { service } = createService({ manifest: offline });

        const failure = await service
            .addMarketplace("https://github.com/acme/templates")
            .catch((error: Error) => error);

        expect(failure).toBeInstanceOf(InvalidMarketplaceError);
        expect((failure as Error).cause).toBe(offline);
    });

    it("throws when the manifest is malformed", async () => {
        const { service } = createService({ manifest: "{ not json" });
        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();
    });

    it("skips a failing source, warns, and keeps caching the rest (D8)", async () => {
        // A factory where the github source (index 1) fails to list.
        const failingFactory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockResolvedValue(MANIFEST),
                };
            }
            if (config.path === "resources") {
                return {
                    listTemplateFiles: vi.fn().mockRejectedValue(new Error("rate limited")),
                    fetchFile: vi.fn(),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue(["element-templates/t.json"]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service, cachedPaths, notifier } = serviceOver(failingFactory);

        await service.addMarketplace("https://github.com/acme/templates");

        expect(cachedPaths()).toEqual([
            "/cache/acme__templates/0/element-templates/element-templates/t.json",
        ]);
        expect(notifier.logged("warning")).toHaveLength(1);
    });

    it("reports each source it could not fetch, with the reason", async () => {
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockResolvedValue(MANIFEST),
                };
            }
            return {
                listTemplateFiles:
                    config.path === "resources"
                        ? vi.fn().mockRejectedValue(new Error("rate limited"))
                        : vi.fn().mockResolvedValue(["element-templates/t.json"]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service } = serviceOver(factory);

        const report = await service.addMarketplace("https://github.com/acme/templates");

        expect(report).toEqual(
            FetchReport.of({
                usableSources: 2,
                cached: 1,
                sourceFailures: [
                    {
                        source: 'github github.com/camunda/camunda-modeler@develop path "resources"',
                        reason: "rate limited",
                    },
                ],
                skippedTypes: [],
            }),
        );
    });

    it("caches a supported source but warns and skips an unknown content type", async () => {
        // A newer marketplace mixing this version's element-templates with a
        // future content type: the known source still caches, the unknown one
        // is warned about rather than sinking the whole marketplace.
        const manifest = JSON.stringify({
            sources: [
                { path: "element-templates" },
                { type: "palette-entries", provider: "github", repo: "acme/palette", path: "p" },
            ],
        });
        const { service, cachedPaths, notifier } = createService({ manifest });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(cachedPaths()).toEqual([
            "/cache/acme__templates/0/element-templates/element-templates/t.json",
        ]);
        expect(notifier.logged("warning")).toContainEqual(
            expect.stringContaining('content type "palette-entries" is not supported'),
        );
    });

    it("reports an unknown content type among what it could not fetch", async () => {
        const manifest = JSON.stringify({
            sources: [
                { path: "element-templates" },
                { type: "palette-entries", provider: "github", repo: "acme/palette", path: "p" },
            ],
        });
        const { service } = createService({ manifest });

        const report = await service.addMarketplace("https://github.com/acme/templates");

        expect(report.verdict()).toBe("partial");
        expect(report.reasons()).toEqual([
            'sources[1]: content type "palette-entries" is not supported by this version',
        ]);
    });

    it("warns naming the resolved local folder when a source lists no template files", async () => {
        // A typo'd local folder returns [] and used to look identical to an empty
        // one; the warning must name the resolved folder so the mistake is visible.
        const manifest = JSON.stringify({ sources: [{ path: "element-templates" }] });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource =>
            config.path === ""
                ? {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn().mockResolvedValue(manifest),
                  }
                : {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn(),
                  },
        );
        const { service, notifier } = serviceOver(factory);

        await service.addMarketplace("/Users/me/templates");

        expect(notifier.logged("warning")).toContainEqual(
            expect.stringContaining(
                'has no template files (local folder /Users/me/templates path "element-templates")',
            ),
        );
    });

    it("tells two failing relative sources of a local marketplace apart in the report", async () => {
        const manifest = JSON.stringify({ sources: [{ path: "one" }, { path: "two" }] });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource =>
            config.path === ""
                ? {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn().mockResolvedValue(manifest),
                  }
                : {
                      listTemplateFiles: vi.fn().mockRejectedValue(new Error("unreadable")),
                      fetchFile: vi.fn(),
                  },
        );
        const { service } = serviceOver(factory);

        const report = await service.addMarketplace("/Users/me/templates");

        expect(report.reasons()).toEqual([
            'local folder /Users/me/templates path "one": unreadable',
            'local folder /Users/me/templates path "two": unreadable',
        ]);
    });
});

describe("TemplateMarketplaceService.updateAll", () => {
    it("re-fetches every registered marketplace", async () => {
        const { service, settings, cachedPaths, notifier } = createService();
        settings.values.marketplaces = [
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ];

        const outcome = await service.updateAll();

        expect(outcome).toEqual({ succeeded: 2, failures: [] });
        expect(notifier.logged("info")).toContain("Updating 2 marketplace(s)");
        expect(notifier.logged("info")).toContain("Marketplace update finished: 2 of 2 succeeded");
        expect(cachedPaths()).toEqual([
            "/cache/acme__one/0/element-templates/element-templates/t.json",
            "/cache/acme__one/1/element-templates/resources/t.json",
            "/cache/acme__two/0/element-templates/element-templates/t.json",
            "/cache/acme__two/1/element-templates/resources/t.json",
        ]);
    });

    it("never throws when a marketplace fails — logs and continues (D8)", async () => {
        const { service, settings, notifier } = createService({ manifest: new Error("offline") });
        settings.values.marketplaces = ["https://github.com/acme/one"];

        const outcome = await service.updateAll();
        expect(outcome).toEqual({
            succeeded: 0,
            failures: [
                {
                    label: "https://github.com/acme/one",
                    reason: expect.stringContaining("could not read marketplace.json"),
                },
            ],
        });
        expect(notifier.logged("warning")).toHaveLength(1);
    });

    it("reports a marketplace whose every source failed", async () => {
        const manifest = JSON.stringify({ sources: [{ path: "element-templates" }] });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockResolvedValue(manifest),
                };
            }
            const unreachable = config.kind === "github" && config.repo === "one";
            return {
                listTemplateFiles: unreachable
                    ? vi.fn().mockRejectedValue(new Error("offline"))
                    : vi.fn().mockResolvedValue(["element-templates/t.json"]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service, settings } = serviceOver(factory);
        settings.values.marketplaces = [
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ];

        const outcome = await service.updateAll();

        expect(outcome).toEqual({
            succeeded: 1,
            failures: [
                {
                    label: "https://github.com/acme/one",
                    reason:
                        "none of its sources could be fetched " +
                        '(github github.com/acme/one path "element-templates": offline)',
                },
            ],
        });
    });

    it("reports a manifest-level failure in the outcome while the healthy one succeeds", async () => {
        // First marketplace's manifest read blows up; the second serves fine.
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.kind === "github" && config.owner === "acme" && config.repo === "one") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockRejectedValue(new Error("offline")),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue(["t.json"]),
                fetchFile: vi
                    .fn()
                    .mockResolvedValue(
                        JSON.stringify({ sources: [{ path: "element-templates" }] }),
                    ),
            };
        });
        const { service, settings } = serviceOver(factory);
        settings.values.marketplaces = [
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ];

        const outcome = await service.updateAll();

        expect(outcome.succeeded).toBe(1);
        expect(outcome.failures).toEqual([
            {
                label: "https://github.com/acme/one",
                reason: expect.stringContaining("could not read marketplace.json"),
            },
        ]);
    });

    it("prunes after a fetch failure, keeping the still-registered marketplace's slot", async () => {
        const { service, settings, cachedPaths } = createService({
            manifest: new Error("offline"),
            cachedFiles: {
                "/cache/acme__one/0/element-templates/t.json": "{}",
                "/cache/acme__gone/0/element-templates/t.json": "{}",
            },
        });
        settings.values.marketplaces = ["https://github.com/acme/one"];

        await service.updateAll();

        // The fetch failed, but the id was registered before the fetch, so the
        // prune keeps its last-good slot (its id is still in the registered set).
        expect(cachedPaths()).toEqual(["/cache/acme__one/0/element-templates/t.json"]);
    });

    it("suppresses pruning entirely when a settings entry cannot be parsed", async () => {
        const { service, settings, cachedPaths, notifier } = createService({
            cachedFiles: { "/cache/acme__one/0/element-templates/t.json": "{}" },
        });
        // An object entry with no valid provider fails parseMarketplaceEntry, so
        // its id is unknown — pruning would risk deleting a valid slot.
        settings.values.marketplaces = [{ provider: "bogus" } as never];

        const outcome = await service.updateAll();

        expect(outcome.failures).toHaveLength(1);
        expect(cachedPaths()).toEqual(["/cache/acme__one/0/element-templates/t.json"]);
        expect(notifier.logged("debug")).toContain(
            'Skipped marketplace cache prune: an unparseable entry left its id unknown ({"provider":"bogus"})',
        );
    });
});

describe("TemplateMarketplaceService.pruneOrphanedCaches", () => {
    it("prunes using the ids parsed from current settings and logs the pruned ids", async () => {
        const { service, settings, cachedPaths, notifier } = createService({
            cachedFiles: {
                "/cache/acme__one/0/element-templates/t.json": "{}",
                "/cache/acme__gone/0/element-templates/t.json": "{}",
            },
        });
        settings.values.marketplaces = ["https://github.com/acme/one"];

        await service.pruneOrphanedCaches();

        expect(cachedPaths()).toEqual(["/cache/acme__one/0/element-templates/t.json"]);
        expect(notifier.logged("info")).toEqual([
            "Pruned 1 orphaned marketplace cache(s): acme__gone",
        ]);
    });

    it("removing the last marketplace prunes with an empty set (sweeps every slot)", async () => {
        const { service, settings, cachedPaths, notifier } = createService({
            cachedFiles: {
                "/cache/acme__one/0/element-templates/t.json": "{}",
                "/cache/acme__two/0/element-templates/t.json": "{}",
            },
        });
        settings.values.marketplaces = [];

        await service.pruneOrphanedCaches();

        expect(cachedPaths()).toEqual([]);
        expect(notifier.logged("info")).toEqual([
            "Pruned 2 orphaned marketplace cache(s): acme__one, acme__two",
        ]);
    });

    it("reports no prune when no slot is orphaned", async () => {
        const { service, settings, notifier } = createService({
            cachedFiles: { "/cache/acme__one/0/element-templates/t.json": "{}" },
        });
        settings.values.marketplaces = ["https://github.com/acme/one"];

        await service.pruneOrphanedCaches();

        expect(notifier.logged("info")).toEqual([]);
    });

    it("suppresses pruning and names every entry that cannot be parsed", async () => {
        const { service, settings, cachedPaths, notifier } = createService({
            cachedFiles: { "/cache/acme__one/0/element-templates/t.json": "{}" },
        });
        settings.values.marketplaces = [
            { provider: "bogus" } as never,
            "https://github.com/acme/one",
            "~/templates",
        ];

        await service.pruneOrphanedCaches();

        expect(cachedPaths()).toEqual(["/cache/acme__one/0/element-templates/t.json"]);
        expect(notifier.logged("debug")).toContain(
            'Skipped marketplace cache prune: an unparseable entry left its id unknown ({"provider":"bogus"}; ~/templates)',
        );
    });
});

describe("TemplateMarketplaceService include filtering", () => {
    /** A factory serving `manifest` at the root and a fixed `listing` elsewhere. */
    function servingListing(manifest: string, listing: string[]) {
        return vi.fn((config: RepositorySourceConfig): RepositorySource =>
            config.path === ""
                ? {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn().mockResolvedValue(manifest),
                  }
                : {
                      listTemplateFiles: vi.fn().mockResolvedValue(listing),
                      fetchFile: vi.fn().mockResolvedValue("{}"),
                  },
        );
    }

    it("caches only a github source's include matches, keeping the full repo paths", async () => {
        const manifest = JSON.stringify({
            sources: [
                {
                    provider: "github",
                    repo: "acme/mono",
                    path: "connectors",
                    include: ["**/element-templates/*.json"],
                },
            ],
        });
        // A monorepo mix: two real templates, a test fixture, and a versioned
        // history file the single-`*` final segment must not reach.
        const listing = [
            "connectors/http/element-templates/rest.json",
            "connectors/http/src/test/fixture.json",
            "connectors/http/element-templates/versioned/old.json",
            "connectors/aws/lambda/element-templates/lambda.json",
        ];
        const { service, cachedPaths } = serviceOver(servingListing(manifest, listing));

        await service.addMarketplace("https://github.com/acme/mp");

        // The cache key is the untrimmed listed path (only stripped for matching).
        expect(cachedPaths()).toEqual([
            "/cache/acme__mp/0/element-templates/connectors/http/element-templates/rest.json",
            "/cache/acme__mp/0/element-templates/connectors/aws/lambda/element-templates/lambda.json",
        ]);
    });

    it("excludes a nested file for a relative source with a single-depth include", async () => {
        const manifest = JSON.stringify({
            sources: [{ path: "element-templates", include: ["*.json"] }],
        });
        const listing = ["element-templates/a.json", "element-templates/nested/b.json"];
        const { service, cachedPaths } = serviceOver(servingListing(manifest, listing));

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cachedPaths()).toEqual([
            "/cache/acme__mp/0/element-templates/element-templates/a.json",
        ]);
    });

    it("strips the config.path prefix for a provider:local source (config.path === '')", async () => {
        // A local source resolves to config.path === "" while its adapter lists
        // subtree-relative paths, so the empty prefix must leave them untouched.
        const manifest = JSON.stringify({
            sources: [{ provider: "local", path: "/opt/ext", include: ["*.json"] }],
        });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.kind === "github" && config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockResolvedValue(manifest),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue(["a.json", "sub/b.json"]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service, cachedPaths } = serviceOver(factory);

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cachedPaths()).toEqual(["/cache/acme__mp/0/element-templates/a.json"]);
    });

    it("warns and caches nothing when include matches none of the listed files", async () => {
        const manifest = JSON.stringify({
            sources: [
                {
                    provider: "github",
                    repo: "acme/mono",
                    path: "connectors",
                    include: ["**/nope/*.json"],
                },
            ],
        });
        const { service, cachedPaths, notifier } = serviceOver(
            servingListing(manifest, ["connectors/http/element-templates/rest.json"]),
        );

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cachedPaths()).toEqual([]);
        expect(notifier.logged("warning")).toContainEqual(
            expect.stringContaining('"include" patterns matched none'),
        );
    });
});

describe("TemplateMarketplaceService.getCachedTemplatePaths", () => {
    it("lists the cached element templates", async () => {
        const { service } = createService({
            cachedFiles: { "/cache/acme/0/element-templates/a.json": "{}" },
        });
        expect(await service.getCachedTemplatePaths()).toEqual([
            "/cache/acme/0/element-templates/a.json",
        ]);
    });
});

// The ladder's rules are pinned in HostTokenSession.spec.ts; these pin that every
// fetch of a command goes through one session.
describe("TemplateMarketplaceService private-repo auth", () => {
    it("prompts on a private-repo 404, stores the token, retries once, and succeeds", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "element-templates" }] }),
            expectedToken: "granted",
        });
        const { service, cachedPaths, tokenPrompt, tokens, notifier } = serviceOver(factory, {
            tokenAnswers: { "github.com": "granted" },
        });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.prompts).toEqual([
            expect.objectContaining({
                host: "github.com",
                prompt: expect.stringMatching(/may be private/),
            }),
        ]);
        expect(tokens.tokens.get("github.com")).toBe("granted");
        expect(cachedPaths()).toEqual([
            "/cache/acme__templates/0/element-templates/element-templates/t.json",
        ]);
        // One session spans the manifest and its sources, so the relative source's
        // first fetch carries the prompted token instead of re-reading the keychain.
        expect(factory).toHaveBeenCalledWith(
            expect.objectContaining({ path: "element-templates", token: "granted" }),
        );

        // Secret hygiene: the granted token value must never reach any log line.
        expect(notifier.logs.some((entry) => entry.message.includes("granted"))).toBe(false);
    });

    it("batch-prompts once for two private sources when the store is empty", async () => {
        const manifest = JSON.stringify({
            sources: [
                { provider: "github", repo: "acme/one", path: "t", visibility: "private" },
                { provider: "github", repo: "acme/two", path: "t", visibility: "private" },
                { provider: "github", repo: "acme/pub", path: "t", visibility: "public" },
            ],
        });
        // A plain factory: the public manifest reads without a token, and every
        // source serves a file — the batch prompt is what we assert on.
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource =>
            config.path === ""
                ? {
                      listTemplateFiles: vi.fn().mockResolvedValue([]),
                      fetchFile: vi.fn().mockResolvedValue(manifest),
                  }
                : {
                      listTemplateFiles: vi.fn().mockResolvedValue([`${config.path}/t.json`]),
                      fetchFile: vi.fn().mockResolvedValue("{}"),
                  },
        );
        const { service, tokenPrompt } = serviceOver(factory, {
            tokenAnswers: { "github.com": "granted" },
        });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("prompts at most once per host across a whole updateAll, warning+skipping each", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            // Both marketplaces are private and the user declines.
        });
        const { service, notifier, tokenPrompt, tokens, settings } = serviceOver(factory);
        settings.values.marketplaces = [
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ];

        const outcome = await service.updateAll();

        expect(outcome.succeeded).toBe(0);
        expect(outcome.failures).toHaveLength(2);
        expect(tokenPrompt.prompts).toHaveLength(1); // one session spans both
        // The second marketplace reuses the session cache, so the store is read once.
        expect(tokens.reads).toEqual(["github.com"]);
        expect(notifier.logged("warning")).toHaveLength(2);
    });

    // A public marketplace must not raise the macOS keychain popup, which happens
    // when a fetch eagerly reads the PasswordSafe-backed token store.
    it("never consults the token store or prompt for a public marketplace", async () => {
        // The default service serves a public manifest (relative + github source)
        // with no gating, so every fetch succeeds anonymously.
        const { service, sourceFactory, tokens, tokenPrompt } = createService();

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokens.reads).toEqual([]);
        expect(tokenPrompt.prompts).toEqual([]);
        // No config ever carried a token value (anonymous throughout).
        const carriedToken = sourceFactory.mock.calls.some(
            ([config]) =>
                (config.kind === "github" || config.kind === "gitlab") &&
                config.token !== undefined,
        );
        expect(carriedToken).toBe(false);
    });
});

describe("TemplateMarketplaceService slice 3 (gitlab / self-hosted)", () => {
    it("resolves a mixed string+object settings array to the right configs", async () => {
        const { service, settings, sourceFactory } = createService();
        settings.values.marketplaces = [
            "https://github.com/acme/one",
            { provider: "gitlab", repo: "group/two", baseUrl: "https://gitlab.acme.com" },
        ];

        await service.updateAll();

        expect(sourceFactory).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "github", owner: "acme", repo: "one", path: "" }),
        );
        expect(sourceFactory).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "gitlab",
                projectPath: "group/two",
                baseUrl: "https://gitlab.acme.com",
                path: "",
            }),
        );
    });

    it("names a failing object entry by its host/repo label", async () => {
        const factory = vi.fn((): RepositorySource => ({
            listTemplateFiles: vi.fn().mockResolvedValue([]),
            fetchFile: vi.fn(async () => {
                throw new Error("offline");
            }),
        }));
        const { service, notifier, settings } = serviceOver(factory);
        settings.values.marketplaces = [
            { provider: "gitlab", repo: "group/proj", baseUrl: "https://gitlab.acme.com" },
        ];

        await service.updateAll();

        expect(notifier.logged("warning")).toContainEqual(
            expect.stringContaining("gitlab.acme.com/group/proj"),
        );
    });
});

describe("TemplateMarketplaceService cache retention", () => {
    const MARKETPLACE_URL = "https://github.com/acme/templates";
    const SLOT = "/cache/acme__templates";

    /**
     * A marketplace whose manifest, listings and reachability can change between
     * runs. Every listed file's content names its path.
     */
    function changingMarketplace(sources: object[], listings: Record<string, string[]>) {
        const upstream = { sources, listings, unreachablePaths: new Set<string>() };
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => JSON.stringify({ sources: upstream.sources })),
                };
            }
            return {
                listTemplateFiles: vi.fn(async () => {
                    if (upstream.unreachablePaths.has(config.path)) {
                        throw new Error("offline");
                    }
                    return upstream.listings[config.path] ?? [];
                }),
                fetchFile: vi.fn(async (repoPath: string) => `{"from":"${repoPath}"}`),
            };
        });
        const harness = serviceOver(factory);
        harness.settings.values.marketplaces = [MARKETPLACE_URL];
        // A real file system lists a directory in no promised order.
        const cachedTemplatePaths = async () =>
            (await harness.service.getCachedTemplatePaths()).sort();
        return { ...harness, upstream, cachedTemplatePaths };
    }

    it("drops a template deleted upstream on update", async () => {
        const { service, upstream, cachedTemplatePaths } = changingMarketplace(
            [{ path: "element-templates" }],
            {
                "element-templates": ["element-templates/a.json", "element-templates/b.json"],
            },
        );
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.listings["element-templates"] = ["element-templates/a.json"];
        await service.updateAll();

        expect(await cachedTemplatePaths()).toEqual([
            `${SLOT}/0/element-templates/element-templates/a.json`,
        ]);
    });

    it("drops the slot of a source removed from the manifest", async () => {
        const { service, upstream, cachedTemplatePaths } = changingMarketplace(
            [{ path: "one" }, { path: "two" }],
            {
                one: ["one/a.json"],
                two: ["two/b.json"],
            },
        );
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.sources = [{ path: "one" }];
        await service.updateAll();

        expect(await cachedTemplatePaths()).toEqual([`${SLOT}/0/element-templates/one/a.json`]);
    });

    it("drops templates a narrowed include no longer matches", async () => {
        const { service, upstream, cachedTemplatePaths } = changingMarketplace(
            [{ path: "element-templates" }],
            {
                "element-templates": [
                    "element-templates/a.json",
                    "element-templates/legacy/old.json",
                ],
            },
        );
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.sources = [{ path: "element-templates", include: ["*.json"] }];
        await service.updateAll();

        expect(await cachedTemplatePaths()).toEqual([
            `${SLOT}/0/element-templates/element-templates/a.json`,
        ]);
    });

    it("shows each template once after the sources are reordered", async () => {
        const { service, upstream, cachedTemplatePaths } = changingMarketplace(
            [{ path: "one" }, { path: "two" }],
            {
                one: ["one/a.json"],
                two: ["two/b.json"],
            },
        );
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.sources = [{ path: "two" }, { path: "one" }];
        await service.updateAll();

        expect(await cachedTemplatePaths()).toEqual([
            `${SLOT}/0/element-templates/two/b.json`,
            `${SLOT}/1/element-templates/one/a.json`,
        ]);
    });

    it("keeps a source's last good templates when its fetch fails", async () => {
        const { service, upstream, notifier, cachedTemplatePaths } = changingMarketplace(
            [{ path: "one" }, { path: "two" }],
            { one: ["one/a.json"], two: ["two/b.json"] },
        );
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.unreachablePaths.add("two");
        await service.updateAll();

        expect(await cachedTemplatePaths()).toEqual([
            `${SLOT}/0/element-templates/one/a.json`,
            `${SLOT}/1/element-templates/two/b.json`,
        ]);
        expect(notifier.logged("warning")).toContainEqual(expect.stringContaining("offline"));
    });

    it("keeps a source's last good templates when it lists an unsafe path", async () => {
        const { service, upstream, workspace, notifier } = changingMarketplace([{ path: "one" }], {
            one: ["one/a.json"],
        });
        await service.addMarketplace(MARKETPLACE_URL);

        upstream.listings.one = ["one/new.json", "../../escape.json"];
        const outcome = await service.updateAll();

        expect(outcome).toEqual({
            succeeded: 0,
            failures: [
                {
                    label: MARKETPLACE_URL,
                    reason:
                        "none of its sources could be fetched " +
                        '(github github.com/acme/templates path "one": ' +
                        'Rejected unsafe template path "../../escape.json")',
                },
            ],
        });
        expect(workspace.files).toEqual(
            new Map([[`${SLOT}/0/element-templates/one/a.json`, '{"from":"one/a.json"}']]),
        );
        expect(notifier.logged("warning")).toContainEqual(
            expect.stringContaining("unsafe template path"),
        );
    });
});
