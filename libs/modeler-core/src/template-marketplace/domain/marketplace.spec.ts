import { describe, expect, it } from "vitest";

import {
    InvalidMarketplaceError,
    marketplaceEntryLabel,
    parseMarketplace,
    parseMarketplaceEntry,
    parseMarketplaceUrl,
} from "./marketplace";

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

    it("routes gitlab.com to the GitLab parser but rejects other dotted hosts", () => {
        // gitlab.com is now first-class; an unknown self-hosted origin must be an
        // object entry (baseUrl), so a bare URL to it still throws.
        expect(parseMarketplaceUrl("https://gitlab.com/acme/templates").location).toMatchObject({
            kind: "gitlab",
            projectPath: "acme/templates",
        });
        expect(() => parseMarketplaceUrl("https://git.example.com/o/r")).toThrow(
            InvalidMarketplaceError,
        );
    });
});

describe("parseMarketplaceUrl (gitlab)", () => {
    it("parses a plain project URL", () => {
        const reg = parseMarketplaceUrl("https://gitlab.com/acme/templates");
        expect(reg.location).toEqual({
            kind: "gitlab",
            projectPath: "acme/templates",
            ref: undefined,
        });
        // gitlab is host-prefixed (never legacy), so it can't collide with a
        // github `owner__repo` slot.
        expect(reg.id).toBe("gitlab.com__acme__templates");
        expect(reg.url).toBe("https://gitlab.com/acme/templates");
    });

    it("keeps nested subgroups in the project path (no exactly-two rule)", () => {
        const reg = parseMarketplaceUrl("https://gitlab.com/group/sub/team/project");
        expect(reg.location).toMatchObject({
            kind: "gitlab",
            projectPath: "group/sub/team/project",
        });
        expect(reg.id).toBe("gitlab.com__group__sub__team__project");
    });

    it("desugars a /-/tree/<ref> browse URL, keeping a slashed ref whole", () => {
        const reg = parseMarketplaceUrl("https://gitlab.com/group/sub/project/-/tree/feature/x");
        expect(reg.location).toMatchObject({
            kind: "gitlab",
            projectPath: "group/sub/project",
            ref: "feature/x",
        });
        expect(reg.id).toBe("gitlab.com__group__sub__project__feature-x");
    });

    it("strips a .git suffix and a www. prefix", () => {
        expect(parseMarketplaceUrl("https://www.gitlab.com/acme/templates.git").location).toEqual({
            kind: "gitlab",
            projectPath: "acme/templates",
            ref: undefined,
        });
    });

    it("rejects a one-segment gitlab path", () => {
        expect(() => parseMarketplaceUrl("https://gitlab.com/acme")).toThrow(
            InvalidMarketplaceError,
        );
    });
});

describe("parseMarketplaceEntry (object entries)", () => {
    it("parses a self-hosted GitHub Enterprise object entry", () => {
        const reg = parseMarketplaceEntry({
            provider: "github",
            repo: "team/templates",
            baseUrl: "https://ghe.acme.com/",
            ref: "main",
        });
        expect(reg.location).toEqual({
            kind: "github",
            owner: "team",
            repo: "templates",
            ref: "main",
            baseUrl: "https://ghe.acme.com", // trailing slash stripped
        });
        // A baseUrl host-prefixes the id; the ghe host, not github.com.
        expect(reg.id).toBe("ghe.acme.com__team__templates__main");
        expect(reg.url).toBe("ghe.acme.com/team/templates@main");
    });

    it("parses a self-hosted GitLab object entry with nested subgroups", () => {
        const reg = parseMarketplaceEntry({
            provider: "gitlab",
            repo: "group/sub/project",
            baseUrl: "https://gitlab.acme.com",
        });
        expect(reg.location).toEqual({
            kind: "gitlab",
            projectPath: "group/sub/project",
            ref: undefined,
            baseUrl: "https://gitlab.acme.com",
        });
        expect(reg.id).toBe("gitlab.acme.com__group__sub__project");
    });

    it("keeps a baseUrl-less github object entry on the legacy cache slot", () => {
        // Same slug as the equivalent pasted URL, so they share one cache dir.
        const obj = parseMarketplaceEntry({ provider: "github", repo: "acme/templates" });
        const url = parseMarketplaceUrl("https://github.com/acme/templates");
        expect(obj.id).toBe("acme__templates");
        expect(obj.id).toBe(url.id);
    });

    it("delegates a string entry to the URL parser", () => {
        expect(parseMarketplaceEntry("https://github.com/acme/templates").location).toMatchObject({
            kind: "github",
            owner: "acme",
        });
    });

    it("rejects a bad provider, a mis-shaped repo, and a non-http baseUrl", () => {
        expect(() =>
            parseMarketplaceEntry({ provider: "bitbucket" as never, repo: "a/b" }),
        ).toThrow(InvalidMarketplaceError);
        // GitHub must be exactly owner/repo.
        expect(() => parseMarketplaceEntry({ provider: "github", repo: "a/b/c" })).toThrow(
            InvalidMarketplaceError,
        );
        // GitLab needs at least a group and a project.
        expect(() => parseMarketplaceEntry({ provider: "gitlab", repo: "bare" })).toThrow(
            InvalidMarketplaceError,
        );
        expect(() =>
            parseMarketplaceEntry({ provider: "github", repo: "a/b", baseUrl: "ftp://x" }),
        ).toThrow(InvalidMarketplaceError);
    });
});

describe("marketplaceEntryLabel", () => {
    it("returns a string entry verbatim", () => {
        expect(marketplaceEntryLabel("https://github.com/acme/templates")).toBe(
            "https://github.com/acme/templates",
        );
    });

    it("builds host/repo[@ref] for object entries", () => {
        expect(marketplaceEntryLabel({ provider: "gitlab", repo: "g/p" })).toBe("gitlab.com/g/p");
        expect(marketplaceEntryLabel({ provider: "github", repo: "a/b", ref: "main" })).toBe(
            "github.com/a/b@main",
        );
        expect(
            marketplaceEntryLabel({
                provider: "gitlab",
                repo: "g/p",
                baseUrl: "https://gl.acme.com",
            }),
        ).toBe("gl.acme.com/g/p");
    });

    it("never throws on a malformed object, falling back to a JSON dump", () => {
        // updateAll needs a label before validation runs, so a garbage entry
        // still yields *some* label rather than crashing the whole update.
        const garbage = { provider: "github" } as never;
        expect(() => marketplaceEntryLabel(garbage)).not.toThrow();
        expect(marketplaceEntryLabel(garbage)).toBe(JSON.stringify({ provider: "github" }));
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

    it("rejects an unexpanded ~ rather than mis-reading it as a github repo", () => {
        // The host layer expands `~`; a raw one reaching the domain must throw,
        // not parse as the repo `~/templates`.
        expect(() => parseMarketplaceUrl("~/templates")).toThrow(InvalidMarketplaceError);
        expect(() => parseMarketplaceUrl("~")).toThrow(InvalidMarketplaceError);
    });
});

describe("parseMarketplace", () => {
    it("parses a relative source, normalizing the path", () => {
        const sources = parseMarketplace({ sources: [{ path: "./element-templates/" }] });
        expect(sources).toEqual([{ kind: "relative", path: "element-templates" }]);
    });

    it("normalizes a bare '.' relative path to the repository root", () => {
        // `.` means the root; left as-is it builds a `"./"` prefix matching no
        // git-tree path, silently loading zero templates on GitHub.
        const sources = parseMarketplace({ sources: [{ path: "." }] });
        expect(sources).toEqual([{ kind: "relative", path: "" }]);
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

    it("parses a provider:local source, keeping a ~ path raw for fetch-time expansion", () => {
        expect(
            parseMarketplace({ sources: [{ provider: "local", path: "~/ext-templates" }] }),
        ).toEqual([{ kind: "local", path: "~/ext-templates" }]);
    });

    it("parses a provider:local source with an absolute path", () => {
        expect(
            parseMarketplace({ sources: [{ provider: "local", path: "/opt/templates" }] }),
        ).toEqual([{ kind: "local", path: "/opt/templates" }]);
    });

    it("rejects a provider:local source with a relative path", () => {
        // A relative path belongs in a provider-less (marketplace-relative) source.
        expect(() =>
            parseMarketplace({ sources: [{ provider: "local", path: "./templates" }] }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("rejects an unsupported provider", () => {
        expect(() =>
            parseMarketplace({ sources: [{ provider: "bitbucket", repo: "a/b", path: "x" }] }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("rejects a github repo that is not owner/repo", () => {
        expect(() =>
            parseMarketplace({ sources: [{ provider: "github", repo: "bare", path: "x" }] }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("parses and preserves a valid visibility on a github source", () => {
        const [source] = parseMarketplace({
            sources: [{ provider: "github", repo: "a/b", path: "x", visibility: "private" }],
        });
        expect(source).toMatchObject({ kind: "github", visibility: "private" });
    });

    it("rejects an unknown visibility on a github source (typos fail loudly)", () => {
        expect(() =>
            parseMarketplace({
                sources: [{ provider: "github", repo: "a/b", path: "x", visibility: "privte" }],
            }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("still tolerates a stray visibility on relative and local sources", () => {
        // visibility is only meaningful for github; on other kinds it is an
        // unknown field that must not break parsing.
        expect(() =>
            parseMarketplace({
                sources: [
                    { path: "templates", visibility: "whatever" },
                    { provider: "local", path: "/opt/x", visibility: "whatever" },
                ],
            }),
        ).not.toThrow();
    });

    it("parses a gitlab source, keeping the full nested project path", () => {
        const sources = parseMarketplace({
            sources: [
                {
                    provider: "gitlab",
                    repo: "group/sub/project",
                    ref: "main",
                    path: "resources/element-templates",
                    baseUrl: "https://gitlab.acme.com/",
                    visibility: "private",
                },
            ],
        });
        expect(sources).toEqual([
            {
                kind: "gitlab",
                projectPath: "group/sub/project",
                ref: "main",
                path: "resources/element-templates",
                baseUrl: "https://gitlab.acme.com", // normalized
                visibility: "private",
            },
        ]);
    });

    it("rejects a gitlab source whose repo has fewer than two segments", () => {
        expect(() =>
            parseMarketplace({ sources: [{ provider: "gitlab", repo: "bare", path: "x" }] }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("rejects an unknown visibility on a gitlab source (typos fail loudly)", () => {
        expect(() =>
            parseMarketplace({
                sources: [{ provider: "gitlab", repo: "g/p", path: "x", visibility: "privte" }],
            }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("rejects an invalid baseUrl on a source", () => {
        expect(() =>
            parseMarketplace({
                sources: [{ provider: "github", repo: "a/b", path: "x", baseUrl: "not a url" }],
            }),
        ).toThrow(InvalidMarketplaceError);
    });

    it("carries a baseUrl through a github source", () => {
        const [source] = parseMarketplace({
            sources: [
                { provider: "github", repo: "a/b", path: "x", baseUrl: "https://ghe.acme.com" },
            ],
        });
        expect(source).toMatchObject({ kind: "github", baseUrl: "https://ghe.acme.com" });
    });
});
