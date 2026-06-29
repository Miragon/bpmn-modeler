import { describe, expect, it } from "vitest";

import { InvalidMarketplaceError, parseMarketplace, parseMarketplaceUrl } from "./marketplace";

describe("parseMarketplaceUrl (github)", () => {
    it("parses a plain repo URL without a ref", () => {
        const reg = parseMarketplaceUrl("https://github.com/acme/templates");
        expect(reg.location).toEqual({
            kind: "github",
            owner: "acme",
            repo: "templates",
            ref: undefined,
        });
        expect(reg.id).toBe("acme__templates");
        expect(reg.url).toBe("https://github.com/acme/templates");
    });

    it("desugars a /tree/<ref> browse URL into a ref (D1)", () => {
        const reg = parseMarketplaceUrl("https://github.com/acme/templates/tree/develop");
        expect(reg.location).toMatchObject({ owner: "acme", repo: "templates", ref: "develop" });
    });

    it("folds a pinned ref into the id so two refs of one repo cache separately", () => {
        const main = parseMarketplaceUrl("https://github.com/acme/templates/tree/main");
        const dev = parseMarketplaceUrl("https://github.com/acme/templates/tree/dev");
        expect(main.id).toBe("acme__templates__main");
        expect(dev.id).toBe("acme__templates__dev");
        expect(main.id).not.toBe(dev.id);
    });

    it("sanitizes a slash-bearing ref in the id", () => {
        expect(parseMarketplaceUrl("https://github.com/acme/templates/tree/feature/x").id).toBe(
            "acme__templates__feature-x",
        );
    });

    it("keeps slash-bearing branch names whole", () => {
        const reg = parseMarketplaceUrl("https://github.com/acme/templates/tree/feature/x");
        expect(reg.location).toMatchObject({ kind: "github", ref: "feature/x" });
    });

    it("strips a .git suffix and accepts the bare owner/repo shorthand", () => {
        expect(parseMarketplaceUrl("https://github.com/acme/templates.git").location).toMatchObject(
            { owner: "acme", repo: "templates" },
        );
        expect(parseMarketplaceUrl("acme/templates").location).toMatchObject({
            owner: "acme",
            repo: "templates",
        });
    });

    it("rejects input that is not a repo reference", () => {
        expect(() => parseMarketplaceUrl("https://github.com/acme")).toThrow(
            InvalidMarketplaceError,
        );
    });
});

describe("parseMarketplaceUrl (local)", () => {
    it("registers an absolute POSIX path as a local folder", () => {
        const reg = parseMarketplaceUrl("/Users/me/templates");
        expect(reg.location).toEqual({ kind: "local", rootDir: "/Users/me/templates" });
        // The id is prefixed + sanitized so it never collides with a github slot.
        expect(reg.id).toBe("local--Users-me-templates");
        expect(reg.url).toBe("/Users/me/templates");
    });

    it("accepts a path pointing straight at marketplace.json as its folder", () => {
        const reg = parseMarketplaceUrl("/Users/me/templates/marketplace.json");
        expect(reg.location).toEqual({ kind: "local", rootDir: "/Users/me/templates" });
    });

    it("strips a trailing slash from the folder", () => {
        const reg = parseMarketplaceUrl("/Users/me/templates/");
        expect(reg.location).toEqual({ kind: "local", rootDir: "/Users/me/templates" });
    });

    it("decodes a file:// URL into a filesystem path", () => {
        const reg = parseMarketplaceUrl("file:///Users/me/my%20templates");
        expect(reg.location).toEqual({ kind: "local", rootDir: "/Users/me/my templates" });
    });

    it("handles a file:///C:/ Windows drive URL", () => {
        const reg = parseMarketplaceUrl("file:///C:/templates");
        expect(reg.location).toEqual({ kind: "local", rootDir: "C:/templates" });
    });

    it("registers a Windows drive path as local", () => {
        const reg = parseMarketplaceUrl("C:\\templates\\marketplace.json");
        expect(reg.location).toEqual({ kind: "local", rootDir: "C:\\templates" });
    });

    it("does not mistake the bare owner/repo shorthand for a local path", () => {
        expect(parseMarketplaceUrl("acme/templates").location).toMatchObject({ kind: "github" });
    });
});

describe("parseMarketplace", () => {
    it("parses a relative source, normalizing the path", () => {
        const sources = parseMarketplace({ sources: [{ path: "./element-templates/" }] });
        expect(sources).toEqual([{ kind: "relative", path: "element-templates" }]);
    });

    it("strips repeated trailing slashes from a relative path", () => {
        const sources = parseMarketplace({ sources: [{ path: "./templates///" }] });
        expect(sources).toEqual([{ kind: "relative", path: "templates" }]);
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
