import { describe, expect, it, vi } from "vitest";

import { RepositoryAccessError } from "../domain/repositoryAccessError";
import { RepositorySource } from "../port/marketplacePorts";
import { fetchMarketplaceAbout } from "./fetchMarketplaceAbout";

function repositoryWith(rootFiles: string[] | Error, files: Record<string, string> = {}) {
    const repository: RepositorySource = {
        listTemplateFiles: vi.fn(),
        listRootFiles: vi.fn(async () => {
            if (rootFiles instanceof Error) throw rootFiles;
            return rootFiles;
        }),
        fetchFile: vi.fn(async (path: string) => files[path] ?? Promise.reject(new Error(path))),
    };
    return repository;
}

describe("fetchMarketplaceAbout", () => {
    it("fetches the README by the name a folder's README is found by, in any case", async () => {
        const repository = repositoryWith(["marketplace.json", "readme.md", "README"], {
            "readme.md": "# Acme",
        });

        expect(await fetchMarketplaceAbout(repository)).toEqual({
            readme: { kind: "found", value: "# Acme" },
            repository: { kind: "absent" },
        });
        expect(repository.fetchFile).toHaveBeenCalledWith("readme.md");
    });

    it("finds none in a root without a README, and in one it may not list", async () => {
        const denied = new RepositoryAccessError("github.com", 404, "acme/templates", false);

        expect((await fetchMarketplaceAbout(repositoryWith(["marketplace.json"]))).readme).toEqual({
            kind: "absent",
        });
        expect((await fetchMarketplaceAbout(repositoryWith(denied))).readme).toEqual({
            kind: "absent",
        });
    });

    it("reports a README it could not fetch, with the reason", async () => {
        const repository = repositoryWith(["README.md"]);

        expect((await fetchMarketplaceAbout(repository)).readme).toEqual({
            kind: "failed",
            reason: "README.md",
        });
    });

    it("asks the host for the stars and license when it can tell them", async () => {
        const repository: RepositorySource = {
            ...repositoryWith([]),
            repositoryFacts: vi
                .fn()
                .mockResolvedValueOnce({ host: "gitlab", stars: 3 })
                .mockRejectedValueOnce(new Error("socket hang up")),
        };

        expect((await fetchMarketplaceAbout(repository)).repository).toEqual({
            kind: "found",
            value: { host: "gitlab", stars: 3 },
        });
        expect((await fetchMarketplaceAbout(repository)).repository).toEqual({
            kind: "failed",
            reason: "socket hang up",
        });
    });
});
