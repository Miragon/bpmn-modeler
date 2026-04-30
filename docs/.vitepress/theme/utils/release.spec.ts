import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    parseStandaloneRelease,
    pickLatestStandaloneRelease,
    fetchLatestStandaloneRelease,
    _resetReleaseCache,
    RELEASES_API_URL,
} from "./release";
import {
    ARM64_URL,
    INTEL_URL,
    standaloneFull,
    standaloneArm64Only,
    standaloneHalfFailed,
    standalonePrevious,
    vscodeRelease,
    draftStandalone,
    createAppendRelease,
} from "./releases.fixture";

describe("parseStandaloneRelease", () => {
    it("qualifies a full standalone release", () => {
        const out = parseStandaloneRelease(standaloneFull);
        expect(out).toEqual({
            tagName: "standalone-v0.9.2",
            version: "0.9.2",
            publishedAt: "2026-04-30T09:18:25Z",
            dmgArm64Url: ARM64_URL,
            dmgIntelUrl: INTEL_URL,
            releasePageUrl:
                "https://github.com/Miragon/bpmn-modeler/releases/tag/standalone-v0.9.2",
        });
    });

    it("disqualifies a VS Code release (wrong tag prefix)", () => {
        expect(parseStandaloneRelease(vscodeRelease)).toBeNull();
    });

    it("disqualifies a create-append release (wrong tag prefix)", () => {
        expect(parseStandaloneRelease(createAppendRelease)).toBeNull();
    });

    it("disqualifies a draft release", () => {
        expect(parseStandaloneRelease(draftStandalone)).toBeNull();
    });

    it("disqualifies a half-failed upload (no arm64 DMG)", () => {
        expect(parseStandaloneRelease(standaloneHalfFailed)).toBeNull();
    });

    it("qualifies an arm64-only release with dmgIntelUrl null", () => {
        const out = parseStandaloneRelease(standaloneArm64Only);
        expect(out).not.toBeNull();
        expect(out!.dmgArm64Url).toBe(ARM64_URL);
        expect(out!.dmgIntelUrl).toBeNull();
    });

    it("strips the standalone-v prefix to derive version", () => {
        expect(parseStandaloneRelease(standaloneFull)!.version).toBe("0.9.2");
    });

    it("rejects an empty version (tag is just the prefix)", () => {
        expect(
            parseStandaloneRelease({
                tag_name: "standalone-v",
                published_at: "2026-04-30T00:00:00Z",
                assets: [
                    {
                        name: "Miragon.BPMN.Modeler-arm64.dmg",
                        browser_download_url: "https://example.com/x.dmg",
                    },
                ],
            }),
        ).toBeNull();
    });

    it("falls back to a constructed releasePageUrl when html_url is missing", () => {
        const out = parseStandaloneRelease({
            tag_name: "standalone-v0.9.2",
            published_at: "2026-04-30T00:00:00Z",
            assets: [
                {
                    name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg",
                    browser_download_url: "https://example.com/x.dmg",
                },
            ],
        });
        expect(out?.releasePageUrl).toBe(
            "https://github.com/Miragon/bpmn-modeler/releases/tag/standalone-v0.9.2",
        );
    });
});

describe("pickLatestStandaloneRelease", () => {
    it("preserves API order: skips VS Code, picks first standalone", () => {
        const out = pickLatestStandaloneRelease([
            vscodeRelease,
            standaloneFull,
            standalonePrevious,
        ]);
        expect(out?.tagName).toBe("standalone-v0.9.2");
    });

    it("skips a half-failed standalone release in favour of the next full one", () => {
        const out = pickLatestStandaloneRelease([
            standaloneHalfFailed,
            standalonePrevious,
        ]);
        expect(out?.tagName).toBe("standalone-v0.9.1");
    });

    it("returns null when no qualifying release exists", () => {
        expect(
            pickLatestStandaloneRelease([
                vscodeRelease,
                createAppendRelease,
                draftStandalone,
            ]),
        ).toBeNull();
    });

    it("returns null on an empty input list", () => {
        expect(pickLatestStandaloneRelease([])).toBeNull();
    });

    it("sorts by published_at desc when input order disagrees", () => {
        // Older first, then newer — wrong order. The util must still pick the newer one.
        const out = pickLatestStandaloneRelease([
            standalonePrevious, // 2026-04-12
            standaloneFull,     // 2026-04-30
        ]);
        expect(out?.tagName).toBe("standalone-v0.9.2");
    });
});

describe("fetchLatestStandaloneRelease", () => {
    beforeEach(() => {
        _resetReleaseCache();
    });

    it("hits the list endpoint and parses the result", async () => {
        const stub = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [vscodeRelease, standaloneFull, standalonePrevious],
        } as Response);

        const out = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);

        expect(stub).toHaveBeenCalledWith(RELEASES_API_URL);
        expect(out?.tagName).toBe("standalone-v0.9.2");
        expect(out?.dmgArm64Url).toBe(ARM64_URL);
    });

    it("returns null on network error", async () => {
        const stub = vi.fn().mockRejectedValue(new Error("network down"));
        const out = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);
        expect(out).toBeNull();
    });

    it("returns null on non-2xx response (e.g. rate limited)", async () => {
        const stub = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
        const out = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);
        expect(out).toBeNull();
    });

    it("returns null when the response body isn't an array", async () => {
        const stub = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ message: "Not Found" }),
        } as Response);
        const out = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);
        expect(out).toBeNull();
    });

    it("dedupes concurrent / repeat callers via the module cache", async () => {
        const stub = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [standaloneFull],
        } as Response);
        const [a, b] = await Promise.all([
            fetchLatestStandaloneRelease(stub as unknown as typeof fetch),
            fetchLatestStandaloneRelease(stub as unknown as typeof fetch),
        ]);
        const c = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);
        expect(stub).toHaveBeenCalledTimes(1);
        expect(a?.tagName).toBe("standalone-v0.9.2");
        expect(b).toBe(a);
        expect(c).toBe(a);
    });
});

describe("asset iteration order", () => {
    it("picks the arm64 DMG even when latest-mac.yml comes first in assets", () => {
        // Real release shape — the manifest is uploaded before the DMG.
        // Regression test against accidentally short-circuiting on the first
        // asset that mentions a Mac-y filename.
        const out = parseStandaloneRelease(standaloneFull);
        expect(out?.dmgArm64Url).toMatch(/-arm64\.dmg$/);
    });
});
