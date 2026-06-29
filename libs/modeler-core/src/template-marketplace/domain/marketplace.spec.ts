import { describe, expect, it } from "vitest";

import { InvalidMarketplaceError, parseGitHubRepoUrl, parseMarketplace } from "./marketplace";

describe("parseGitHubRepoUrl", () => {
    it("parses a plain repo URL without a ref", () => {
        const reg = parseGitHubRepoUrl("https://github.com/acme/templates");
        expect(reg).toMatchObject({ owner: "acme", repo: "templates", ref: undefined });
        expect(reg.id).toBe("acme__templates");
        expect(reg.url).toBe("https://github.com/acme/templates");
    });

    it("desugars a /tree/<ref> browse URL into a ref (D1)", () => {
        const reg = parseGitHubRepoUrl("https://github.com/acme/templates/tree/develop");
        expect(reg).toMatchObject({ owner: "acme", repo: "templates", ref: "develop" });
    });

    it("folds a pinned ref into the id so two refs of one repo cache separately", () => {
        const main = parseGitHubRepoUrl("https://github.com/acme/templates/tree/main");
        const dev = parseGitHubRepoUrl("https://github.com/acme/templates/tree/dev");
        expect(main.id).toBe("acme__templates__main");
        expect(dev.id).toBe("acme__templates__dev");
        expect(main.id).not.toBe(dev.id);
    });

    it("sanitizes a slash-bearing ref in the id", () => {
        expect(parseGitHubRepoUrl("https://github.com/acme/templates/tree/feature/x").id).toBe(
            "acme__templates__feature-x",
        );
    });

    it("keeps slash-bearing branch names whole", () => {
        const reg = parseGitHubRepoUrl("https://github.com/acme/templates/tree/feature/x");
        expect(reg.ref).toBe("feature/x");
    });

    it("strips a .git suffix and accepts the bare owner/repo shorthand", () => {
        expect(parseGitHubRepoUrl("https://github.com/acme/templates.git")).toMatchObject({
            owner: "acme",
            repo: "templates",
        });
        expect(parseGitHubRepoUrl("acme/templates")).toMatchObject({
            owner: "acme",
            repo: "templates",
        });
    });

    it("rejects input that is not a repo reference", () => {
        expect(() => parseGitHubRepoUrl("https://github.com/acme")).toThrow(
            InvalidMarketplaceError,
        );
    });
});

describe("parseMarketplace", () => {
    it("parses a relative source, normalizing the path", () => {
        const sources = parseMarketplace({ sources: [{ path: "./element-templates/" }] });
        expect(sources).toEqual([{ kind: "relative", path: "element-templates" }]);
    });

    it("parses a github source into owner/repo/ref/path", () => {
        const sources = parseMarketplace({
            sources: [
                {
                    provider: "github",
                    repo: "camunda/camunda-modeler",
                    ref: "develop",
                    path: "resources/element-templates",
                },
            ],
        });
        expect(sources).toEqual([
            {
                kind: "github",
                owner: "camunda",
                repo: "camunda-modeler",
                ref: "develop",
                path: "resources/element-templates",
            },
        ]);
    });

    it("allows a github source without a ref", () => {
        const [source] = parseMarketplace({
            sources: [{ provider: "github", repo: "a/b", path: "x" }],
        });
        expect(source).toMatchObject({ kind: "github", ref: undefined });
    });

    it("rejects a non-object root", () => {
        expect(() => parseMarketplace("nope")).toThrow(InvalidMarketplaceError);
    });

    it("rejects a missing sources array", () => {
        expect(() => parseMarketplace({})).toThrow(InvalidMarketplaceError);
    });

    it("rejects a source without a path", () => {
        expect(() => parseMarketplace({ sources: [{ provider: "github", repo: "a/b" }] })).toThrow(
            InvalidMarketplaceError,
        );
    });

    it("rejects an unsupported provider (later slices)", () => {
        expect(() =>
            parseMarketplace({ sources: [{ provider: "gitlab", repo: "a/b", path: "x" }] }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("rejects a github repo that is not owner/repo", () => {
        expect(() =>
            parseMarketplace({ sources: [{ provider: "github", repo: "bare", path: "x" }] }),
        ).toThrow(InvalidMarketplaceError);
    });
});
