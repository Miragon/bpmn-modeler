import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositorySource, RepositorySourceConfig } from "../domain/ports";
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
        writeTemplate: vi.fn().mockResolvedValue(undefined),
        getCachedTemplatePaths: vi.fn().mockResolvedValue([]),
    };
    const settings = { getTemplateMarketplaces: vi.fn().mockReturnValue([]) };
    const notifier = { logWarning: vi.fn() };

    // Each distinct config gets its own scripted source; the root source serves
    // the manifest, others serve template files keyed by path.
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
        "/home/test",
    );
    return { service, cache, settings, notifier, sourceFactory };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("TemplateMarketplaceService.addMarketplace", () => {
    it("fetches the manifest and caches every source's templates", async () => {
        const { service, cache } = createService();

        await service.addMarketplace("https://github.com/acme/templates");

        // Relative source resolves against the marketplace repo (index 0);
        // the github source uses its own repo (index 1).
        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "acme__templates",
            0,
            "element-templates/t.json",
            expect.any(String),
        );
        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "acme__templates",
            1,
            "resources/t.json",
            expect.any(String),
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
        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "local--Users-me-templates",
            0,
            "element-templates/t.json",
            expect.any(String),
        );
    });

    it("resolves a provider:local source, expanding ~ via the injected home dir", async () => {
        // A github-registered marketplace whose manifest points at an external
        // local folder via `provider: "local"`. The root (manifest) read uses the
        // github config; the local source resolves to its own expanded directory.
        const cache = {
            writeTemplate: vi.fn().mockResolvedValue(undefined),
            getCachedTemplatePaths: vi.fn().mockResolvedValue([]),
        };
        const notifier = { logWarning: vi.fn() };
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
            { getTemplateMarketplaces: vi.fn() } as never,
            notifier as never,
            "/home/test",
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(factory).toHaveBeenCalledWith({
            kind: "local",
            rootDir: "/home/test/ext-templates",
            path: "",
        });
        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "acme__templates",
            0,
            "connector.json",
            "{}",
        );
    });

    it("throws when the manifest cannot be read, so no registration is persisted", async () => {
        const { service, cache } = createService({ manifest: new Error("404") });

        await expect(service.addMarketplace("https://github.com/acme/templates")).rejects.toThrow();
        expect(cache.writeTemplate).not.toHaveBeenCalled();
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
            { getTemplateMarketplaces: vi.fn() } as never,
            notifier as never,
            "/home/test",
        );

        await service.addMarketplace("https://github.com/acme/templates");

        expect(cache.writeTemplate).toHaveBeenCalledTimes(1); // only the relative source
        expect(notifier.logWarning).toHaveBeenCalledOnce();
    });
});

describe("TemplateMarketplaceService.updateAll", () => {
    it("re-fetches every registered marketplace", async () => {
        const { service, settings, cache } = createService();
        settings.getTemplateMarketplaces.mockReturnValue([
            "https://github.com/acme/one",
            "https://github.com/acme/two",
        ]);

        await service.updateAll();

        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "acme__one",
            0,
            expect.any(String),
            expect.any(String),
        );
        expect(cache.writeTemplate).toHaveBeenCalledWith(
            "acme__two",
            0,
            expect.any(String),
            expect.any(String),
        );
    });

    it("never throws when a marketplace fails — logs and continues (D8)", async () => {
        const { service, settings, notifier } = createService({ manifest: new Error("offline") });
        settings.getTemplateMarketplaces.mockReturnValue(["https://github.com/acme/one"]);

        await expect(service.updateAll()).resolves.toBeUndefined();
        expect(notifier.logWarning).toHaveBeenCalledOnce();
    });
});

describe("TemplateMarketplaceService.getCachedTemplatePaths", () => {
    it("delegates to the cache", async () => {
        const { service, cache } = createService();
        cache.getCachedTemplatePaths.mockResolvedValue(["/cache/a.json"]);
        expect(await service.getCachedTemplatePaths()).toEqual(["/cache/a.json"]);
    });
});
