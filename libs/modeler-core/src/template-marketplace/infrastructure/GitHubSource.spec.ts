import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse } from "../../deployment/domain/ports";
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

        const source = new GitHubSource(http as never, { owner: "a", repo: "b", path: "" });
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

    it("throws when the raw fetch 404s", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue({ status: 404, body: "Not Found" });
        const source = new GitHubSource(http as never, {
            owner: "a",
            repo: "b",
            ref: "main",
            path: "",
        });
        await expect(source.fetchFile("missing.json")).rejects.toThrow(/HTTP 404/);
    });
});
