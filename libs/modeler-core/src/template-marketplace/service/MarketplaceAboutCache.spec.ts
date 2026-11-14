import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { RepositoryFacts } from "../../kernel/domain/repositoryFacts";
import { MarketplaceRegistration } from "../domain/marketplace";
import { MarketplaceAboutCache } from "./MarketplaceAboutCache";
import { WriteQueue } from "./WriteQueue";

const ACME: MarketplaceRegistration = {
    id: "acme__templates",
    url: "https://github.com/acme/templates",
    location: { kind: "github", owner: "acme", repo: "templates" },
};

const FACTS: RepositoryFacts = { host: "github", stars: 7, license: { kind: "none" } };

function cacheOver(files: Record<string, string> = {}) {
    const host = createTestHost({ files });
    const cache = new MarketplaceAboutCache(
        "/cache",
        host.workspace,
        host.notifier,
        new WriteQueue(),
    );
    return { cache, host };
}

describe("MarketplaceAboutCache", () => {
    it("lists nothing before anything is cached", async () => {
        expect(await cacheOver().cache.cachedAboutByRegistration()).toEqual(new Map());
    });

    it("stores what was found and reads it back by the marketplace's id", async () => {
        const { cache, host } = cacheOver();

        await cache.store(ACME, {
            readme: { kind: "found", value: "# Acme" },
            repository: { kind: "found", value: FACTS },
        });

        expect(host.workspace.files.get("/cache/acme__templates/readme/README.md")).toBe("# Acme");
        expect(await cache.cachedAboutByRegistration()).toEqual(
            new Map([
                [
                    "acme__templates",
                    { readmeFile: "/cache/acme__templates/readme/README.md", repository: FACTS },
                ],
            ]),
        );
    });

    it("removes what is gone, keeps what failed, and skips unreadable facts", async () => {
        const { cache, host } = cacheOver({
            "/cache/acme__templates/readme/README.md": "old",
            "/cache/acme__templates/repository/facts.json": "{not json",
            "/cache/acme__templates/0/slot.json": "{}",
        });

        await cache.store(ACME, {
            readme: { kind: "absent" },
            repository: { kind: "failed", reason: "offline" },
        });

        expect(host.workspace.files.has("/cache/acme__templates/readme/README.md")).toBe(false);
        expect(await cache.cachedAboutByRegistration()).toEqual(new Map());
        expect(host.notifier.logged("warning")).toEqual([
            'Kept the cached repository facts of "https://github.com/acme/templates": offline',
        ]);
    });
});
