import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryAccessError, RepositorySource, RepositorySourceConfig } from "../domain/ports";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

const MANIFEST = JSON.stringify({
    sources: [
        { path: "./element-templates" },
        { provider: "github", repo: "camunda/camunda-modeler", ref: "develop", path: "resources" },
    ],
});

/**
 * Wires the service to fakes. `sources` maps a serialized config key to a
 * scripted {@link RepositorySource}, so each fetched repo/subtree can return its
 * own files (or throw) independently. The marketplace-root source (path `""`)
 * serves `marketplace.json`.
 */
function createService(opts: { manifest?: string | Error } = {}) {
    const cache = {
        write: vi.fn().mockResolvedValue(undefined),
        getCachedTemplatePaths: vi.fn().mockResolvedValue([]),
        prune: vi.fn().mockResolvedValue([]),
    };
    const settings = { getMarketplaces: vi.fn().mockReturnValue([]) };
    const notifier = {
        logWarning: vi.fn(),
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logError: vi.fn(),
    };

    // Map-backed token store so a granted prompt is observable on the next
    // `getToken`; the prompt stub declines by default (tests override it).
    const stored = new Map<string, string>();
    const tokens = {
        getToken: vi.fn(async (host: string) => stored.get(host)),
        setToken: vi.fn(async (host: string, token: string) => void stored.set(host, token)),
    };
    const tokenPrompt = {
        promptForToken: vi.fn<() => Promise<string | undefined>>(async () => undefined),
    };

    const sourceFor = (config: RepositorySourceConfig): RepositorySource => {
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
    };
    const sourceFactory = vi.fn(sourceFor);

    const service = new TemplateMarketplaceService(
        sourceFactory as never,
        cache as never,
        settings as never,
        notifier as never,
        tokens as never,
        tokenPrompt as never,
        "/home/test",
    );
    return { service, cache, settings, notifier, sourceFactory, tokens, tokenPrompt, stored };
}

/** Inert token store + prompt for tests that never exercise the auth path. */
function noAuth() {
    return {
        tokens: { getToken: vi.fn(async () => undefined), setToken: vi.fn() },
        tokenPrompt: { promptForToken: vi.fn(async () => undefined) },
    };
}

/**
 * A factory whose *manifest* source is gated on `config.token`: without the
 * expected token it throws {@link RepositoryAccessError} (mimicking GitHub's
 * 401/403/404 on a private repo), with it, it serves `manifest`. Every other
 * source serves one template file so a post-auth run still caches something.
 *
 * `denyOnlyWithToken` inverts the gate to model a public repo behind a
 * fine-grained PAT: a request *carrying* a token is rejected (the repo is
 * outside the token's grant), an anonymous request serves the manifest. It is
 * how the unauthenticated fallback is exercised.
 */
function tokenGatedFactory(opts: {
    manifest: string;
    expectedToken?: string;
    status?: number;
    rateLimited?: boolean;
    denyOnlyWithToken?: boolean;
}) {
    const {
        manifest,
        expectedToken,
        status = 404,
        rateLimited = false,
        denyOnlyWithToken = false,
    } = opts;
    return vi.fn((config: RepositorySourceConfig): RepositorySource => {
        if (config.path === "") {
            const token = config.kind === "github" ? config.token : undefined;
            const denied = denyOnlyWithToken
                ? token !== undefined
                : expectedToken === undefined || token !== expectedToken;
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    if (denied) {
                        throw new RepositoryAccessError(
                            "github.com",
                            status,
                            "acme/templates",
                            rateLimited,
                        );
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

/** Builds a service over `factory` with a Map-backed token store + prompt stub. */
function serviceOver(
    factory: ReturnType<typeof vi.fn>,
    prompt: () => Promise<string | undefined>,
    seededTokens: Record<string, string> = {},
) {
    const cache = {
        write: vi.fn().mockResolvedValue(undefined),
        getCachedTemplatePaths: vi.fn().mockResolvedValue([]),
        prune: vi.fn().mockResolvedValue([]),
    };
    const notifier = {
        logWarning: vi.fn(),
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logError: vi.fn(),
    };
    const stored = new Map<string, string>(Object.entries(seededTokens));
    const tokens = {
        getToken: vi.fn(async (host: string) => stored.get(host)),
        setToken: vi.fn(async (host: string, token: string) => void stored.set(host, token)),
    };
    const tokenPrompt = { promptForToken: vi.fn(prompt) };
    const settings = { getMarketplaces: vi.fn().mockReturnValue([]) };
    const service = new TemplateMarketplaceService(
        factory as never,
        cache as never,
        settings as never,
        notifier as never,
        tokens as never,
        tokenPrompt as never,
        "/home/test",
    );
    return { service, cache, notifier, tokens, tokenPrompt, stored, settings };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("TemplateMarketplaceService.addMarketplace", () => {
    it("fetches the manifest and caches every source's templates", async () => {
        const { service, cache, notifier } = createService();

        await service.addMarketplace("https://github.com/acme/templates");

        // Relative source resolves against the marketplace repo (index 0);
        // the github source uses its own repo (index 1).
        expect(cache.write).toHaveBeenCalledWith(
            "acme__templates",
            0,
            "element-templates",
            "element-templates/t.json",
            expect.any(String),
        );
        expect(cache.write).toHaveBeenCalledWith(
            "acme__templates",
            1,
            "element-templates",
            "resources/t.json",
            expect.any(String),
        );
        expect(notifier.logInfo).toHaveBeenCalledWith(
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
        const { service, sourceFactory, cache } = createService();

        await service.addMarketplace("/Users/me/templates");

        // The relative source resolves against the registered folder, not a repo.
        expect(sourceFactory).toHaveBeenCalledWith({
            kind: "local",
            rootDir: "/Users/me/templates",
            path: "element-templates",
        });
        expect(cache.write).toHaveBeenCalledWith(
            "local--Users-me-templates-f7bdb1db",
            0,
            "element-templates",
            "element-templates/t.json",
            expect.any(String),
        );
    });

    it("resolves a provider:local source, expanding ~ via the injected home dir", async () => {
        // A github-registered marketplace whose manifest points at an external
        // local folder via `provider: "local"`. The root (manifest) read uses the
        // github config; the local source resolves to its own expanded directory.
        const cache = {
            write: vi.fn().mockResolvedValue(undefined),
            getCachedTemplatePaths: vi.fn().mockResolvedValue([]),
        };
        const notifier = {
            logWarning: vi.fn(),
            logDebug: vi.fn(),
            logInfo: vi.fn(),
            logError: vi.fn(),
        };
        const manifest = JSON.stringify({
            sources: [{ provider: "local", path: "~/ext-templates" }],
        });
        const factory = vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
        const service = new TemplateMarketplaceService(
            factory as never,
            cache as never,
            { getMarketplaces: vi.fn() } as never,
            notifier as never,
            noAuth().tokens as never,
            noAuth().tokenPrompt as never,
            "/home/test",
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(factory).toHaveBeenCalledWith({
            kind: "local",
            rootDir: "/home/test/ext-templates",
            path: "",
        });
        expect(cache.write).toHaveBeenCalledWith(
            "acme__templates",
            0,
            "element-templates",
            "connector.json",
            "{}",
        );
    });

    it("throws when the manifest cannot be read, so no registration is persisted", async () => {
        const { service, cache } = createService({ manifest: new Error("404") });

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();
        expect(cache.write).not.toHaveBeenCalled();
    });

    it("throws when the manifest is malformed", async () => {
        const { service } = createService({ manifest: "{ not json" });
        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();
    });

    it("skips a failing source, warns, and keeps caching the rest (D8)", async () => {
        const { cache, notifier } = createService();
        // Re-wire a factory where the github source (index 1) fails to list.
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
        const service = new TemplateMarketplaceService(
            failingFactory as never,
            cache as never,
            { getMarketplaces: vi.fn() } as never,
            notifier as never,
            noAuth().tokens as never,
            noAuth().tokenPrompt as never,
            "/home/test",
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(cache.write).toHaveBeenCalledTimes(1); // only the relative source
        expect(notifier.logWarning).toHaveBeenCalledOnce();
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
        const { service, cache, notifier } = createService({ manifest });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(cache.write).toHaveBeenCalledTimes(1);
        expect(cache.write).toHaveBeenCalledWith(
            "acme__templates",
            0,
            "element-templates",
            "element-templates/t.json",
            expect.any(String),
        );
        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining('content type "palette-entries" is not supported'),
        );
    });

    it("warns naming the resolved local folder when a source lists no template files", async () => {
        // A typo'd local folder returns [] and used to look identical to an empty
        // one; the warning must name the resolved folder so the mistake is visible.
        const manifest = JSON.stringify({ sources: [{ path: "element-templates" }] });
        const factory = vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
        const { service, notifier } = serviceOver(factory, async () => undefined);

        await service.addMarketplace("/Users/me/templates");

        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("has no template files (local folder /Users/me/templates)"),
        );
    });
});

describe("TemplateMarketplaceService.updateAll", () => {
    it("re-fetches every registered marketplace", async () => {
        const { service, settings, cache, notifier } = createService();
        settings.getMarketplaces.mockReturnValue([
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ]);

        const outcome = await service.updateAll();

        expect(outcome).toEqual({ succeeded: 2, failures: [] });
        expect(notifier.logInfo).toHaveBeenCalledWith("Updating 2 marketplace(s)");
        expect(notifier.logInfo).toHaveBeenCalledWith(
            "Marketplace update finished: 2 of 2 succeeded",
        );
        expect(cache.write).toHaveBeenCalledWith(
            "acme__one",
            0,
            "element-templates",
            expect.any(String),
            expect.any(String),
        );
        expect(cache.write).toHaveBeenCalledWith(
            "acme__two",
            0,
            "element-templates",
            expect.any(String),
            expect.any(String),
        );
    });

    it("never throws when a marketplace fails — logs and continues (D8)", async () => {
        const { service, settings, notifier } = createService({ manifest: new Error("offline") });
        settings.getMarketplaces.mockReturnValue(["https://github.com/acme/one"]);

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
        expect(notifier.logWarning).toHaveBeenCalledOnce();
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
        const { service, settings } = serviceOver(factory, async () => undefined);
        settings.getMarketplaces.mockReturnValue([
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ]);

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
        const { service, settings, cache } = createService({ manifest: new Error("offline") });
        settings.getMarketplaces.mockReturnValue(["https://github.com/acme/one"]);

        await service.updateAll();

        // The fetch failed, but the id was registered before the fetch, so the
        // prune keeps its last-good slot (its id is still in the registered set).
        expect(cache.prune).toHaveBeenCalledOnce();
        const registeredIds = cache.prune.mock.calls[0][0] as ReadonlySet<string>;
        expect([...registeredIds]).toContain("acme__one");
    });

    it("suppresses pruning entirely when a settings entry cannot be parsed", async () => {
        const { service, settings, cache, notifier } = createService();
        // An object entry with no valid provider fails parseMarketplaceEntry, so
        // its id is unknown — pruning would risk deleting a valid slot.
        settings.getMarketplaces.mockReturnValue([{ provider: "bogus" } as never]);

        const outcome = await service.updateAll();

        expect(outcome.failures).toHaveLength(1);
        expect(cache.prune).not.toHaveBeenCalled();
        expect(notifier.logDebug).toHaveBeenCalledWith(
            expect.stringContaining("Skipped marketplace cache prune"),
        );
    });
});

describe("TemplateMarketplaceService.pruneOrphanedCaches", () => {
    it("prunes using the ids parsed from current settings and returns the pruned ids", async () => {
        const { service, settings, cache } = createService();
        settings.getMarketplaces.mockReturnValue(["https://github.com/acme/one"]);
        cache.prune.mockResolvedValue(["acme__gone"]);

        const pruned = await service.pruneOrphanedCaches();

        expect(pruned).toEqual(["acme__gone"]);
        expect(cache.prune).toHaveBeenCalledOnce();
        const registeredIds = cache.prune.mock.calls[0][0] as ReadonlySet<string>;
        expect([...registeredIds]).toEqual(["acme__one"]);
    });

    it("removing the last marketplace prunes with an empty set (sweeps every slot)", async () => {
        const { service, settings, cache } = createService();
        settings.getMarketplaces.mockReturnValue([]);
        cache.prune.mockResolvedValue(["acme__one", "acme__two"]);

        const pruned = await service.pruneOrphanedCaches();

        expect(pruned).toEqual(["acme__one", "acme__two"]);
        const registeredIds = cache.prune.mock.calls[0][0] as ReadonlySet<string>;
        expect([...registeredIds]).toEqual([]);
    });

    it("suppresses pruning and returns [] when a settings entry cannot be parsed", async () => {
        const { service, settings, cache, notifier } = createService();
        settings.getMarketplaces.mockReturnValue([{ provider: "bogus" } as never]);

        const pruned = await service.pruneOrphanedCaches();

        expect(pruned).toEqual([]);
        expect(cache.prune).not.toHaveBeenCalled();
        expect(notifier.logDebug).toHaveBeenCalledWith(
            expect.stringContaining("Skipped marketplace cache prune"),
        );
    });
});

describe("TemplateMarketplaceService include filtering", () => {
    /** A factory serving `manifest` at the root and a fixed `listing` elsewhere. */
    function servingListing(manifest: string, listing: string[]) {
        return vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
        const { service, cache } = serviceOver(
            servingListing(manifest, listing),
            async () => undefined,
        );

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cache.write).toHaveBeenCalledTimes(2);
        // The cache key is the untrimmed listed path (only stripped for matching).
        expect(cache.write).toHaveBeenCalledWith(
            "acme__mp",
            0,
            "element-templates",
            "connectors/http/element-templates/rest.json",
            expect.any(String),
        );
        expect(cache.write).toHaveBeenCalledWith(
            "acme__mp",
            0,
            "element-templates",
            "connectors/aws/lambda/element-templates/lambda.json",
            expect.any(String),
        );
    });

    it("excludes a nested file for a relative source with a single-depth include", async () => {
        const manifest = JSON.stringify({
            sources: [{ path: "element-templates", include: ["*.json"] }],
        });
        const listing = ["element-templates/a.json", "element-templates/nested/b.json"];
        const { service, cache } = serviceOver(
            servingListing(manifest, listing),
            async () => undefined,
        );

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cache.write).toHaveBeenCalledOnce();
        expect(cache.write).toHaveBeenCalledWith(
            "acme__mp",
            0,
            "element-templates",
            "element-templates/a.json",
            expect.any(String),
        );
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
        const { service, cache } = serviceOver(factory, async () => undefined);

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cache.write).toHaveBeenCalledOnce();
        expect(cache.write).toHaveBeenCalledWith(
            "acme__mp",
            0,
            "element-templates",
            "a.json",
            expect.any(String),
        );
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
        const { service, cache, notifier } = serviceOver(
            servingListing(manifest, ["connectors/http/element-templates/rest.json"]),
            async () => undefined,
        );

        await service.addMarketplace("https://github.com/acme/mp");

        expect(cache.write).not.toHaveBeenCalled();
        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining('"include" patterns matched none'),
        );
    });
});

describe("TemplateMarketplaceService.getCachedTemplatePaths", () => {
    it("delegates to the cache", async () => {
        const { service, cache } = createService();
        cache.getCachedTemplatePaths.mockResolvedValue(["/cache/a.json"]);
        expect(await service.getCachedTemplatePaths()).toEqual(["/cache/a.json"]);
    });
});

describe("TemplateMarketplaceService private-repo auth", () => {
    it("reads the stored token only after an auth failure and never places it on a local config", async () => {
        // A github marketplace whose root is private (needs the stored token)
        // pointing at an external provider:local folder.
        const manifest = JSON.stringify({
            sources: [{ path: "element-templates" }, { provider: "local", path: "/opt/ext" }],
        });
        // A local `provider:"local"` source also resolves to `path: ""`, so the
        // gate must be kind-aware or it would deny the local read too.
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.kind === "github" && config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => {
                        if (config.token !== "stored-tok") {
                            throw new RepositoryAccessError(
                                "github.com",
                                404,
                                "acme/templates",
                                false,
                            );
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
        const { service, tokens, tokenPrompt } = serviceOver(factory, async () => "unused", {
            "github.com": "stored-tok",
        });

        await service.addMarketplace("https://github.com/acme/templates");

        // The github root + relative source carry the token; the local one does not.
        expect(factory).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "github", path: "", token: "stored-tok" }),
        );
        expect(factory).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "local", rootDir: "/opt/ext" }),
        );
        expect(factory).not.toHaveBeenCalledWith(
            expect.objectContaining({ kind: "local", token: expect.anything() }),
        );
        // The store is read once (lazily, after the anonymous 404), never prompted.
        expect(tokens.getToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).not.toHaveBeenCalled();
    });

    it("prompts on a private-repo 404, stores the token, retries once, and succeeds", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "element-templates" }] }),
            expectedToken: "granted",
        });
        const { service, cache, tokenPrompt, tokens, notifier } = serviceOver(
            factory,
            async () => "granted",
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledWith(
            "github.com",
            expect.stringMatching(/may be private/),
        );
        expect(tokens.setToken).toHaveBeenCalledWith("github.com", "granted");
        expect(cache.write).toHaveBeenCalled();

        // Secret hygiene: the granted token value must never reach any log line.
        const loggedArgs = [
            ...notifier.logInfo.mock.calls,
            ...notifier.logDebug.mock.calls,
            ...notifier.logWarning.mock.calls,
            ...notifier.logError.mock.calls,
        ].flat();
        expect(loggedArgs.some((arg) => String(arg).includes("granted"))).toBe(false);
    });

    it("declining during add rejects, caches nothing, and prompts once", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            // No expectedToken → every read is denied, whatever the token.
        });
        const { service, cache, tokenPrompt, notifier } = serviceOver(
            factory,
            async () => undefined,
        );

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow(
            /requires a personal access token/,
        );
        expect(cache.write).not.toHaveBeenCalled();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
        expect(notifier.logDebug).toHaveBeenCalledWith("Token prompt for github.com declined");
    });

    it("reports 'can't access' when the freshly entered token is also denied", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            // Every token is rejected, so the retry fails too.
        });
        const { service, tokenPrompt } = serviceOver(factory, async () => "still-wrong");

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow(
            /can't access/,
        );
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
    });

    it("re-prompts with 'was rejected' wording for a stale stored token and overwrites it", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            expectedToken: "new",
        });
        const { service, tokenPrompt, tokens, stored } = serviceOver(factory, async () => "new", {
            "github.com": "old",
        });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).toHaveBeenCalledWith(
            "github.com",
            expect.stringMatching(/was rejected/),
        );
        expect(tokens.setToken).toHaveBeenCalledWith("github.com", "new");
        expect(stored.get("github.com")).toBe("new");
    });

    it("retries a run-cached token's public source anonymously, never prompting", async () => {
        // The fine-grained-PAT case, now surfaced through the run cache: the
        // private manifest forces a lazy store read (anonymous 404 → stored token
        // succeeds → token run-cached), then a github *source* outside that
        // token's grant returns 403 with the token but serves anonymously. The
        // anonymous retry (branch a) wins with no prompt and the token preserved.
        const manifest = JSON.stringify({
            sources: [{ provider: "github", repo: "acme/pub", path: "resources" }],
        });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            const token = config.kind === "github" ? config.token : undefined;
            if (config.kind === "github" && config.path === "") {
                // Private manifest root: only the stored token reads it.
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => {
                        if (token !== "stored-tok") {
                            throw new RepositoryAccessError(
                                "github.com",
                                404,
                                "acme/templates",
                                false,
                            );
                        }
                        return manifest;
                    }),
                };
            }
            // A public source a fine-grained token can't reach: 403 with a token,
            // served anonymously.
            const denied = token !== undefined;
            const denyAccess = () => {
                throw new RepositoryAccessError("github.com", 403, "acme/pub", false);
            };
            return {
                listTemplateFiles: vi.fn(async () =>
                    denied ? denyAccess() : [`${config.path}/t.json`],
                ),
                fetchFile: vi.fn(async () => (denied ? denyAccess() : "{}")),
            };
        });
        const { service, cache, tokenPrompt, tokens, stored } = serviceOver(
            factory,
            async () => "should-not-be-used",
            { "github.com": "stored-tok" },
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).not.toHaveBeenCalled();
        expect(tokens.setToken).not.toHaveBeenCalled();
        expect(stored.get("github.com")).toBe("stored-tok");
        expect(cache.write).toHaveBeenCalled();
    });

    it("attempts the manifest in order anonymous → stored → new when a stale token guards a private repo", async () => {
        // A private repo whose stored token is stale: the anonymous first attempt
        // fails, the lazily-read stored token also fails (proving it's stale), so
        // the prompt runs and the fresh token is tried last. The root-path token
        // sequence must be exactly undefined → old → new.
        const attempted: (string | undefined)[] = [];
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                const token = config.kind === "github" ? config.token : undefined;
                attempted.push(token);
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => {
                        if (token !== "new") {
                            throw new RepositoryAccessError(
                                "github.com",
                                404,
                                "acme/templates",
                                false,
                            );
                        }
                        return JSON.stringify({ sources: [{ path: "x" }] });
                    }),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([`${config.path}/t.json`]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service, tokenPrompt } = serviceOver(factory, async () => "new", {
            "github.com": "old",
        });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(attempted).toEqual([undefined, "old", "new"]);
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
    });

    it("a rate-limited anonymous 403 retries with the stored token before prompting", async () => {
        // A rate-limited anonymous 403 escalates to the stored token (its limit
        // is higher); the branch-(a) anonymous *fallback* is skipped because it
        // would only fail harder. Both attempts rate-limit, so the prompt runs.
        const attempted: (string | undefined)[] = [];
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            const token = config.kind === "github" ? config.token : undefined;
            attempted.push(token);
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    throw new RepositoryAccessError("github.com", 403, "acme/templates", true);
                }),
            };
        });
        const { service, tokenPrompt } = serviceOver(factory, async () => undefined, {
            "github.com": "have-it",
        });

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow(
            /rate limit/i,
        );
        // Anonymous first, then the lazily-read stored token — no branch-(a) retry.
        expect(attempted).toEqual([undefined, "have-it"]);
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
    });

    it("makes exactly one pre-prompt attempt when no token is stored (unchanged)", async () => {
        // Without a stored token there is nothing to fall back from, so the very
        // first (anonymous) attempt is the one that prompts on failure.
        const attempted: (string | undefined)[] = [];
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.path === "") {
                const token = config.kind === "github" ? config.token : undefined;
                attempted.push(token);
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => {
                        throw new RepositoryAccessError("github.com", 404, "acme/templates", false);
                    }),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(),
            };
        });
        const { service, tokenPrompt, tokens } = serviceOver(factory, async () => undefined);

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();

        expect(attempted).toEqual([undefined]);
        // The store is read once, lazily, after the anonymous 404 — and finds nothing.
        expect(tokens.getToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
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
        const factory = vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
        const { service, tokenPrompt } = serviceOver(factory, async () => "granted");

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
    });

    it("does not batch-prompt when a token for the host is already stored", async () => {
        const manifest = JSON.stringify({
            sources: [{ provider: "github", repo: "acme/one", path: "t", visibility: "private" }],
        });
        const factory = vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
        const { service, tokenPrompt } = serviceOver(factory, async () => "granted", {
            "github.com": "have-it",
        });

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).not.toHaveBeenCalled();
    });

    it("prompts at most once per host across a whole updateAll, warning+skipping each", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            // Both marketplaces are private and the user declines.
        });
        const { service, notifier, tokenPrompt, tokens, settings } = serviceOver(
            factory,
            async () => undefined,
        );
        settings.getMarketplaces.mockReturnValue([
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ]);

        const outcome = await service.updateAll();

        expect(outcome.succeeded).toBe(0);
        expect(outcome.failures).toHaveLength(2);
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce(); // one run spans both
        // The second marketplace reuses the run cache, so the store is read once.
        expect(tokens.getToken).toHaveBeenCalledOnce();
        expect(notifier.logWarning).toHaveBeenCalledTimes(2);
    });

    it("mentions the rate limit (not a rejection) when a 403 rate-limit persists with a token", async () => {
        const factory = tokenGatedFactory({
            manifest: JSON.stringify({ sources: [{ path: "x" }] }),
            status: 403,
            rateLimited: true,
            // No expectedToken → the stored token still hits the limit.
        });
        const { service } = serviceOver(factory, async () => undefined, {
            "github.com": "have-it",
        });

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow(
            /rate limit/i,
        );
        await expect(
            service.addMarketplace("https://github.com/acme/templates"),
        ).rejects.not.toThrow(/can't access/);
    });

    // A public marketplace must not raise the macOS keychain popup, which happens
    // when a fetch eagerly reads the PasswordSafe-backed token store.
    it("never consults the token store or prompt for a public marketplace", async () => {
        // The default service serves a public manifest (relative + github source)
        // with no gating, so every fetch succeeds anonymously.
        const { service, sourceFactory, tokens, tokenPrompt } = createService();

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokens.getToken).not.toHaveBeenCalled();
        expect(tokenPrompt.promptForToken).not.toHaveBeenCalled();
        // No config ever carried a token value (anonymous throughout).
        const carriedToken = sourceFactory.mock.calls.some(
            ([config]) =>
                (config.kind === "github" || config.kind === "gitlab") &&
                config.token !== undefined,
        );
        expect(carriedToken).toBe(false);
    });

    it("reads the store at most once per host per run after repeated auth failures", async () => {
        // A public manifest with two github sources that 404 anonymously and with
        // any token; the prompt declines. The store must be read exactly once.
        const manifest = JSON.stringify({
            sources: [
                { provider: "github", repo: "acme/one", path: "a" },
                { provider: "github", repo: "acme/two", path: "b" },
            ],
        });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            if (config.kind === "github" && config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn().mockResolvedValue(manifest),
                };
            }
            const deny = () => {
                throw new RepositoryAccessError("github.com", 404, "acme/src", false);
            };
            return {
                listTemplateFiles: vi.fn(deny),
                fetchFile: vi.fn(deny),
            };
        });
        const { service, tokens, tokenPrompt } = serviceOver(factory, async () => undefined);

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokens.getToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
    });

    it("run-caches a prompted token and reuses it for later sources without re-reading the store", async () => {
        // A private manifest plus two private github sources, all gated on the
        // prompted token, store empty. The prompt (one read of nothing + one
        // prompt) resolves the token, then every source carries it first-try.
        const manifest = JSON.stringify({
            sources: [
                { provider: "github", repo: "acme/one", path: "a" },
                { provider: "github", repo: "acme/two", path: "b" },
            ],
        });
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            const token = config.kind === "github" ? config.token : undefined;
            const denied = token !== "granted";
            const deny = () => {
                throw new RepositoryAccessError("github.com", 404, "acme/repo", false);
            };
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => (denied ? deny() : manifest)),
                };
            }
            return {
                listTemplateFiles: vi.fn(async () => (denied ? deny() : [`${config.path}/t.json`])),
                fetchFile: vi.fn(async () => (denied ? deny() : "{}")),
            };
        });
        const { service, tokens, tokenPrompt } = serviceOver(factory, async () => "granted");

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokens.getToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
        // Both sources carried the run-cached token on their first attempt.
        expect(factory).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "github", path: "a", token: "granted" }),
        );
        expect(factory).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "github", path: "b", token: "granted" }),
        );
    });
});

describe("TemplateMarketplaceService slice 3 (gitlab / self-hosted)", () => {
    /** A factory serving `manifest` at the root and one file per other source. */
    function serving(manifest: string) {
        return vi.fn(
            (config: RepositorySourceConfig): RepositorySource =>
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
    }

    it("resolves a mixed string+object settings array to the right configs", async () => {
        const { service, settings, sourceFactory } = createService();
        settings.getMarketplaces.mockReturnValue([
            "https://github.com/acme/one",
            { provider: "gitlab", repo: "group/two", baseUrl: "https://gitlab.acme.com" },
        ]);

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

    it("never sends one host's token to a different host in the same run (cross-host D9)", async () => {
        const seen: RepositorySourceConfig[] = [];
        // The gitlab manifest is gated on "gl-tok"; github.com is public.
        const factory = vi.fn((config: RepositorySourceConfig): RepositorySource => {
            seen.push(config);
            if (config.path === "") {
                return {
                    listTemplateFiles: vi.fn().mockResolvedValue([]),
                    fetchFile: vi.fn(async () => {
                        if (config.kind === "gitlab") {
                            if (config.token !== "gl-tok") {
                                throw new RepositoryAccessError(
                                    "gitlab.acme.com",
                                    404,
                                    "group/proj",
                                    false,
                                );
                            }
                            return JSON.stringify({ sources: [{ path: "t" }] });
                        }
                        return JSON.stringify({ sources: [{ path: "t" }] });
                    }),
                };
            }
            return {
                listTemplateFiles: vi.fn().mockResolvedValue([`${config.path}/t.json`]),
                fetchFile: vi.fn().mockResolvedValue("{}"),
            };
        });
        const { service, settings } = serviceOver(factory, async () => "gl-tok");
        settings.getMarketplaces.mockReturnValue([
            { provider: "gitlab", repo: "group/proj", baseUrl: "https://gitlab.acme.com" },
            "https://github.com/acme/repo",
        ]);

        await service.updateAll();

        // The gitlab token is keyed by host, so no github.com config ever carries it.
        expect(seen.filter((c) => c.kind === "github" && c.token === "gl-tok")).toHaveLength(0);
    });

    it("batch-prompts for a declared-private gitlab source keyed by its baseUrl host", async () => {
        const manifest = JSON.stringify({
            sources: [
                {
                    provider: "gitlab",
                    repo: "group/proj",
                    path: "t",
                    baseUrl: "https://gitlab.acme.com",
                    visibility: "private",
                },
            ],
        });
        const { service, tokenPrompt } = serviceOver(serving(manifest), async () => "granted");

        await service.addMarketplace("https://github.com/acme/templates");

        expect(tokenPrompt.promptForToken).toHaveBeenCalledOnce();
        expect(tokenPrompt.promptForToken).toHaveBeenCalledWith(
            "gitlab.acme.com",
            expect.any(String),
        );
    });

    it("derives the rate-limit warning wording from the failing host (gitlab 429)", async () => {
        const factory = vi.fn(
            (): RepositorySource => ({
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    throw new RepositoryAccessError("gitlab.com", 429, "group/proj", true);
                }),
            }),
        );
        const { service } = serviceOver(factory, async () => undefined, {
            "gitlab.com": "have-it",
        });

        await expect(service.addMarketplace("https://gitlab.com/group/proj")).rejects.toThrow(
            /gitlab\.com rate limit exceeded/,
        );
    });

    it("names a failing object entry by its host/repo label", async () => {
        const factory = vi.fn(
            (): RepositorySource => ({
                listTemplateFiles: vi.fn().mockResolvedValue([]),
                fetchFile: vi.fn(async () => {
                    throw new Error("offline");
                }),
            }),
        );
        const { service, notifier, settings } = serviceOver(factory, async () => undefined);
        settings.getMarketplaces.mockReturnValue([
            { provider: "gitlab", repo: "group/proj", baseUrl: "https://gitlab.acme.com" },
        ]);

        await service.updateAll();

        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("gitlab.acme.com/group/proj"),
        );
    });
});
