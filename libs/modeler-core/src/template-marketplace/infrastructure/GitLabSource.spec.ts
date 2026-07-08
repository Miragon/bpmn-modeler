import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse } from "../../deployment/domain/ports";
import { GitLabSourceConfig, RepositoryAccessError } from "../domain/ports";
import { GitLabSource } from "./GitLabSource";

/** Minimal `HttpClient` double exposing only the GET methods GitLabSource uses. */
function createHttp() {
    return {
        getJson: vi.fn<(url: string, headers?: Record<string, string>) => Promise<HttpResponse>>(),
        getText: vi.fn<(url: string, headers?: Record<string, string>) => Promise<HttpResponse>>(),
    };
}

function ok(body: string): HttpResponse {
    return { status: 200, body };
}

/** A tree page of `count` `.json` blobs, so `count === 100` reads as a full page. */
function jsonBlobs(count: number, prefix = "t"): string {
    return JSON.stringify(
        Array.from({ length: count }, (_, i) => ({ type: "blob", path: `${prefix}${i}.json` })),
    );
}

function source(config: Partial<GitLabSourceConfig>, http: ReturnType<typeof createHttp>) {
    return new GitLabSource(http as never, {
        kind: "gitlab",
        projectPath: "group/sub/project",
        path: "",
        ...config,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("GitLabSource.listTemplateFiles", () => {
    it("builds a recursive tree URL with the URL-encoded project path and source path", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(
            ok(
                JSON.stringify([
                    { type: "blob", path: "resources/a.json" },
                    { type: "blob", path: "resources/readme.md" },
                    { type: "tree", path: "resources/nested" },
                    { type: "blob", path: "resources/nested/b.json" },
                ]),
            ),
        );

        const files = await source({ ref: "main", path: "resources" }, http).listTemplateFiles();

        expect(files).toEqual(["resources/a.json", "resources/nested/b.json"]);
        expect(http.getJson).toHaveBeenCalledWith(
            "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/repository/tree" +
                "?recursive=true&per_page=100&page=1&ref=main&path=resources",
            expect.objectContaining({ "User-Agent": expect.any(String) }),
        );
    });

    it("omits ref and path from the URL when not set", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(ok("[]"));

        await source({}, http).listTemplateFiles();

        expect(http.getJson).toHaveBeenCalledWith(
            "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/repository/tree" +
                "?recursive=true&per_page=100&page=1",
            expect.anything(),
        );
    });

    it("targets <baseUrl>/api/v4 for a self-hosted instance", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(ok("[]"));

        await source({ baseUrl: "https://gitlab.acme.com" }, http).listTemplateFiles();

        expect(http.getJson.mock.calls[0][0]).toMatch(
            /^https:\/\/gitlab\.acme\.com\/api\/v4\/projects\//,
        );
    });

    it("pages until a short page and concatenates the results", async () => {
        const http = createHttp();
        // 100 (full) then 3 (short) → exactly two requests, 103 blobs.
        http.getJson
            .mockResolvedValueOnce(ok(jsonBlobs(100, "a")))
            .mockResolvedValueOnce(ok(jsonBlobs(3, "b")));

        const files = await source({}, http).listTemplateFiles();

        expect(files).toHaveLength(103);
        expect(http.getJson).toHaveBeenCalledTimes(2);
        expect(http.getJson.mock.calls[1][0]).toContain("page=2");
    });

    it("makes a single request when the first page is short", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValueOnce(ok(jsonBlobs(5)));

        await source({}, http).listTemplateFiles();

        expect(http.getJson).toHaveBeenCalledTimes(1);
    });

    it("fails loudly when every page is full up to the cap (never a partial catalogue)", async () => {
        const http = createHttp();
        // Always a full page → the loop exhausts the 100-page cap and must throw.
        http.getJson.mockResolvedValue(ok(jsonBlobs(100)));

        await expect(source({}, http).listTemplateFiles()).rejects.toThrow(
            /too large to list completely/,
        );
        expect(http.getJson).toHaveBeenCalledTimes(100);
    });
});

describe("GitLabSource.fetchFile", () => {
    it("reads a raw blob with both segments one-shot encoded and a ref query", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{ }"));

        const result = await source({ ref: "feature/x" }, http).fetchFile("resources/my file.json");

        expect(result).toBe("{ }");
        expect(http.getText).toHaveBeenCalledWith(
            "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/repository/files/" +
                "resources%2Fmy%20file.json/raw?ref=feature%2Fx",
            expect.objectContaining({ "User-Agent": expect.any(String) }),
        );
    });

    it("omits the ref query when no ref is configured", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue(ok("{}"));

        await source({}, http).fetchFile("a.json");

        expect(http.getText.mock.calls[0][0]).toBe(
            "https://gitlab.com/api/v4/projects/group%2Fsub%2Fproject/repository/files/a.json/raw",
        );
    });
});

describe("GitLabSource authentication (D9)", () => {
    it("sends PRIVATE-TOKEN only when a token is present", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue(ok("[]"));

        await source({}, http).listTemplateFiles();
        expect(http.getJson.mock.calls[0][1]).not.toHaveProperty("PRIVATE-TOKEN");

        await source({ token: "glpat-xxx" }, http).listTemplateFiles();
        expect(http.getJson.mock.calls[1][1]).toMatchObject({ "PRIVATE-TOKEN": "glpat-xxx" });
    });
});

describe("GitLabSource error mapping", () => {
    it.each([401, 403, 404])(
        "maps a %s to a RepositoryAccessError attributed to the resolved host",
        async (status) => {
            const http = createHttp();
            http.getJson.mockResolvedValue({ status, body: "" });

            await expect(
                source({ baseUrl: "https://gitlab.acme.com" }, http).listTemplateFiles(),
            ).rejects.toMatchObject({
                name: "RepositoryAccessError",
                host: "gitlab.acme.com",
                status,
                resource: "group/sub/project",
                rateLimited: false,
            });
        },
    );

    it("flags a 429 as rate-limited", async () => {
        const http = createHttp();
        http.getJson.mockResolvedValue({ status: 429, body: "Retry later" });

        await expect(source({}, http).listTemplateFiles()).rejects.toMatchObject({
            name: "RepositoryAccessError",
            host: "gitlab.com",
            status: 429,
            rateLimited: true,
        });
    });

    it("leaves a non-auth status (500) as a plain Error", async () => {
        const http = createHttp();
        http.getText.mockResolvedValue({ status: 500, body: "boom" });

        const error = await source({}, http)
            .fetchFile("a.json")
            .catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(RepositoryAccessError);
        expect(error.message).toMatch(/HTTP 500/);
    });
});
