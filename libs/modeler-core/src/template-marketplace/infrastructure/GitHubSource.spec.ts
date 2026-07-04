import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse } from "../../deployment/domain/ports";
import { RepositoryAccessError } from "../domain/ports";
import { GitHubSource } from "./GitHubSource";

/** Minimal `HttpClient` double exposing only the GET methods GitHubSource uses. */
function createHttp() {
    return {
        getJson: vi.fn<(url: string, headers?: Record<string, string>) => Promise<HttpResponse>>(),
        getText: vi.fn<(url: string, headers?: Record<string, string>) => Promise<HttpResponse>>(),
    };
}

function ok(body: string): HttpResponse {
    return { status: 200, body };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("GitHubSource.listTemplateFiles", () => {
    it("keeps only .json blobs nested under the source path", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(
            ok(
                JSON.stringify({
                    tree: [
                        { path: "templates/a.json", type: "blob" },
                        { path: "templates/nested/b.json", type: "blob" },
                        { path: "templates/readme.md", type: "blob" },
                        { path: "templates", type: "tree" },
                        { path: "other/c.json", type: "blob" },
                    ],
                }),
            ),
        );

        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "main",
            path: "templates",
        });

        expect(await source.listTemplateFiles()).toEqual([
            "templates/a.json",
            "templates/nested/b.json",
        ]);
        expect(http.getJson).toHaveBeenCalledWith(
            "https://api.github.com/repos/acme/repo/git/trees/main?recursive=1",
            expect.objectContaining({ "User-Agent": expect.any(String) }),
        );
    });

    it("resolves the default branch when no ref is configured", async () => {
        const http = createHttp();
        http.getJson
            .mockResolvedValueOnce(ok(JSON.stringify({ default_branch: "develop" })))
            .mockResolvedValueOnce(ok(JSON.stringify({ tree: [] })));

        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            path: "",
        });
        await source.listTemplateFiles();

        expect(http.getJson).toHaveBeenNthCalledWith(
            1,
            "https://api.github.com/repos/acme/repo",
            expect.anything(),
        );
        expect(http.getJson).toHaveBeenNthCalledWith(
            2,
            "https://api.github.com/repos/acme/repo/git/trees/develop?recursive=1",
            expect.anything(),
        );
    });

    it("resolves the default branch only once across calls", async () => {
        const http = createHttp();
        http.getJson
            .mockResolvedValueOnce(ok(JSON.stringify({ default_branch: "develop" })))
            .mockResolvedValue(ok(JSON.stringify({ tree: [] })));

        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "a",
            repo: "b",
            path: "",
        });
        await source.listTemplateFiles();
        await source.listTemplateFiles();

        // One repo-metadata call, two tree calls — the ref is memoized.
        const repoMetaCalls = http.getJson.mock.calls.filter(
            ([url]) => url === "https://api.github.com/repos/a/b",
        );
        expect(repoMetaCalls).toHaveLength(1);
    });

    it("throws when the tree is truncated rather than listing a partial set", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(
            ok(JSON.stringify({ truncated: true, tree: [{ path: "a.json", type: "blob" }] })),
        );
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "a",
            repo: "b",
            ref: "main",
            path: "",
        });
        await expect(source.listTemplateFiles()).rejects.toThrow(/truncated/);
    });

    it("throws when the tree request fails", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 403, body: "rate limited" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "a",
            repo: "b",
            ref: "main",
            path: "",
        });
        await expect(source.listTemplateFiles()).rejects.toThrow(/HTTP 403/);
    });
});

describe("GitHubSource.fetchFile", () => {
    it("reads from the raw host at the resolved ref", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));

        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "v1.0.0",
            path: "templates",
        });

        expect(await source.fetchFile("templates/a.json")).toBe("{ }");
        expect(http.getText).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/acme/repo/v1.0.0/templates/a.json",
            expect.objectContaining({ "User-Agent": expect.any(String) }),
        );
    });

    it("percent-encodes the raw-host path so `#`/`%` don't truncate the URL", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "main",
            path: "",
        });

        await source.fetchFile("templates/a#b%c.json");

        expect(http.getText).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/acme/repo/main/templates/a%23b%25c.json",
            expect.objectContaining({ "User-Agent": expect.any(String) }),
        );
    });

    it("throws when the raw fetch 404s", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue({ status: 404, body: "Not Found" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "a",
            repo: "b",
            ref: "main",
            path: "",
        });
        await expect(source.fetchFile("missing.json")).rejects.toThrow(/HTTP 404/);
    });

    it("never sends the auth header to the raw host (D9)", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "a",
            repo: "b",
            ref: "main",
            path: "",
            token: "secret",
        });

        // With a token set, fetching goes through the Contents API, not the raw
        // host — so the raw host is never even called with the token attached.
        await source.fetchFile("a.json");
        // Compare the parsed host exactly (not a startsWith on the URL string,
        // which js/incomplete-url-substring-sanitization rightly flags).
        const rawCall = http.getText.mock.calls.find(
            ([url]) => new URL(url).host === "raw.githubusercontent.com",
        );
        expect(rawCall).toBeUndefined();
    });
});

describe("GitHubSource authenticated requests", () => {
    it("adds a Bearer header to the tree and default-branch calls", async () => {
        const http = createHttp();
        http.getJson
            .mockResolvedValueOnce(ok(JSON.stringify({ default_branch: "main" })))
            .mockResolvedValueOnce(ok(JSON.stringify({ tree: [] })));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            path: "",
            token: "tok",
        });

        await source.listTemplateFiles();

        for (const [, headers] of http.getJson.mock.calls) {
            expect(headers).toMatchObject({ Authorization: "Bearer tok" });
        }
    });

    it("fetches via the Contents API with raw Accept and encoded path/ref", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "feature/x",
            path: "templates",
            token: "tok",
        });

        expect(await source.fetchFile("templates/my file.json")).toBe("{ }");
        expect(http.getText).toHaveBeenCalledWith(
            "https://api.github.com/repos/acme/repo/contents/templates/my%20file.json?ref=feature%2Fx",
            expect.objectContaining({
                Accept: "application/vnd.github.raw+json",
                Authorization: "Bearer tok",
            }),
        );
    });

    it.each([401, 403, 404])(
        "maps a %s on the tree call to a RepositoryAccessError",
        async (status) => {
            const http = createHttp();
            http.getJson.mockResolvedValue({ status, body: "" });
            const source = new GitHubSource(http as never, {
                kind: "github",
                owner: "acme",
                repo: "repo",
                ref: "main",
                path: "",
            });

            await expect(source.listTemplateFiles()).rejects.toMatchObject({
                name: "RepositoryAccessError",
                host: "github.com",
                status,
                resource: "acme/repo",
                rateLimited: false,
            });
        },
    );

    it("maps an auth failure on the default-branch call to a RepositoryAccessError", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 404, body: "" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            path: "",
        });

        await expect(source.listTemplateFiles()).rejects.toBeInstanceOf(RepositoryAccessError);
    });

    it("maps an auth failure on the Contents API fetch to a RepositoryAccessError", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue({ status: 401, body: "" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "main",
            path: "",
            token: "tok",
        });

        await expect(source.fetchFile("a.json")).rejects.toBeInstanceOf(RepositoryAccessError);
    });

    it("flags a 403 whose body reads like a rate-limit rejection", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 403, body: "API rate limit exceeded for ..." });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "main",
            path: "",
        });

        await expect(source.listTemplateFiles()).rejects.toMatchObject({ rateLimited: true });
    });

    it("leaves a non-auth status (500) as a plain Error", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 500, body: "boom" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "acme",
            repo: "repo",
            ref: "main",
            path: "",
        });

        const error = await source.listTemplateFiles().catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(RepositoryAccessError);
        expect(error.message).toMatch(/HTTP 500/);
    });
});

describe("GitHubSource on GitHub Enterprise (baseUrl)", () => {
    it("roots the tree call at <baseUrl>/api/v3", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(ok(JSON.stringify({ tree: [] })));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "team",
            repo: "repo",
            ref: "main",
            path: "",
            baseUrl: "https://ghe.acme.com",
        });

        await source.listTemplateFiles();

        expect(http.getJson).toHaveBeenCalledWith(
            "https://ghe.acme.com/api/v3/repos/team/repo/git/trees/main?recursive=1",
            expect.anything(),
        );
    });

    it("fetches tokenless GHE blobs via the Contents API with no Authorization header", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "team",
            repo: "repo",
            ref: "main",
            path: "",
            baseUrl: "https://ghe.acme.com",
            // No token: enterprise still has no raw host, so it must use Contents.
        });

        await source.fetchFile("a.json");

        const [url, headers] = http.getText.mock.calls[0];
        expect(url).toBe("https://ghe.acme.com/api/v3/repos/team/repo/contents/a.json?ref=main");
        expect(headers).not.toHaveProperty("Authorization");
        // The raw host is never used on GHE (exact host compare, not a URL
        // startsWith that js/incomplete-url-substring-sanitization flags).
        expect(
            http.getText.mock.calls.some(([u]) => new URL(u).host === "raw.githubusercontent.com"),
        ).toBe(false);
    });

    it("attributes an access error to the GHE host, not github.com", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 404, body: "" });
        const source = new GitHubSource(http as never, {
            kind: "github",
            owner: "team",
            repo: "repo",
            ref: "main",
            path: "",
            baseUrl: "https://ghe.acme.com",
        });

        await expect(source.listTemplateFiles()).rejects.toMatchObject({
            name: "RepositoryAccessError",
            host: "ghe.acme.com",
        });
    });
});
