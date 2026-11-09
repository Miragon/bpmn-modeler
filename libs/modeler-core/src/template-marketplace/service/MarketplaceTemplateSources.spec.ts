import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { createTemplateMarketplaceService } from "../composition/MarketplaceFeature";
import { MarketplaceTemplateSources } from "./MarketplaceTemplateSources";

const SHARED = "/work/shared";
const LOCAL = "/work/local";

function marketplaceFiles(root: string, templateId: string): Record<string, string> {
    return {
        [`${root}/marketplace.json`]: JSON.stringify({ sources: [{ path: "element-templates" }] }),
        [`${root}/element-templates/${templateId}.json`]: JSON.stringify({ id: templateId }),
    };
}

async function setUp() {
    const host = createTestHost({
        folders: ["/work"],
        files: { ...marketplaceFiles(SHARED, "mail"), ...marketplaceFiles(LOCAL, "crm") },
        settings: { marketplaces: [SHARED] },
    });
    await host.marketplaceRegistrations.register(LOCAL, "project");
    const service = createTemplateMarketplaceService({
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        tokens: host.tokens,
        tokenPrompt: host.tokenPrompt,
        cacheRoot: "/cache",
        homeDir: "/work",
    });
    await service.updateAll();
    return { host, service };
}

const fileNames = (paths: readonly string[]) => paths.map((path) => path.split("/").pop());

describe("MarketplaceTemplateSources", () => {
    it("serves each registered marketplace's cached templates with where its switches live", async () => {
        const { host, service } = await setUp();
        const sources = new MarketplaceTemplateSources(
            service,
            host.notifier,
            host.marketplaceRegistrations,
        );

        const served = await sources.getCachedTemplateSources();

        expect(served.map(({ source, paths }) => ({ source, files: fileNames(paths) }))).toEqual([
            {
                source: { key: `marketplace:local:${SHARED}`, scope: "allProjects" },
                files: ["mail.json"],
            },
            {
                source: { key: `marketplace:local:${LOCAL}`, scope: "project" },
                files: ["crm.json"],
            },
        ]);
    });

    it("serves every cached template untagged on a host that keeps no switches", async () => {
        const { host, service } = await setUp();
        const sources = new MarketplaceTemplateSources(service, host.notifier);

        const served = await sources.getCachedTemplateSources();

        expect(served.map(({ source, paths }) => ({ source, files: fileNames(paths) }))).toEqual([
            { source: undefined, files: ["mail.json", "crm.json"] },
        ]);
    });

    it("logs and serves every cached template untagged when the registrations cannot be read", async () => {
        const { host, service } = await setUp();
        const sources = new MarketplaceTemplateSources(service, host.notifier, {
            read: () => Promise.reject(new Error("store locked")),
        });

        const served = await sources.getCachedTemplateSources();

        expect(served.map(({ source, paths }) => ({ source, files: fileNames(paths) }))).toEqual([
            { source: undefined, files: ["mail.json", "crm.json"] },
        ]);
        expect(host.notifier.logged("error")).toEqual([expect.stringContaining("store locked")]);
    });
});
