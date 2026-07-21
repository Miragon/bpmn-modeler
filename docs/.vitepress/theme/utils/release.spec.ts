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
    WIN_EXE_URL,
    FLATPAK_X86_64_URL,
    standaloneFull,
    standaloneArm64Only,
    standaloneHalfFailed,
    standalonePrevious,
    intellijRelease,
    draftStandalone,
} from "./releases.fixture";

describe("parseStandaloneRelease", () => {
    it("qualifies a full standalone release", () => {
        const out = parseStandaloneRelease(standaloneFull);
        expect(out).toEqual({
            tagName: "vscode-v0.9.2",
            version: "0.9.2",
            publishedAt: "2026-04-30T09:18:25Z",
            dmgArm64Url: ARM64_URL,
            dmgIntelUrl: INTEL_URL,
            exeX64Url: WIN_EXE_URL,
            flatpakX86_64Url: FLATPAK_X86_64_URL,
            releasePageUrl:
                "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v0.9.2",
        });
    });

    it("disqualifies a release with no DMG (e.g. an IntelliJ-only publish)", () => {
        expect(parseStandaloneRelease(intellijRelease)).toBeNull();
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

    it("exposes the Windows exe when present, null otherwise", () => {
        expect(parseStandaloneRelease(standaloneFull)!.exeX64Url).toBe(WIN_EXE_URL);
        expect(parseStandaloneRelease(standaloneArm64Only)!.exeX64Url).toBeNull();
    });

    it("exposes the x86_64 Flatpak when present, null otherwise", () => {
        expect(parseStandaloneRelease(standaloneFull)!.flatpakX86_64Url).toBe(
            FLATPAK_X86_64_URL,
        );
        expect(parseStandaloneRelease(standaloneArm64Only)!.flatpakX86_64Url).toBeNull();
    });

    it("derives the version from the DMG filename, independent of the tag", () => {
        // Tag is `vscode-v0.9.2`; the version must come from the DMG name, not
        // a prefix-strip of the tag (which would yield "scode-v0.9.2").
        expect(parseStandaloneRelease(standaloneFull)!.version).toBe("0.9.2");
    });

    it("rejects a DMG whose filename carries no version", () => {
        expect(
            parseStandaloneRelease({
                tag_name: "vscode-v",
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
            tag_name: "vscode-v0.9.2",
            published_at: "2026-04-30T00:00:00Z",
            assets: [
                {
                    name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg",
                    browser_download_url: "https://example.com/x.dmg",
                },
            ],
        });
        expect(out?.releasePageUrl).toBe(
            "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v0.9.2",
        );
    });
});

describe("pickLatestStandaloneRelease", () => {
    it("skips a no-DMG release (IntelliJ-only), picks the standalone one", () => {
        const out = pickLatestStandaloneRelease([
            intellijRelease,
            standaloneFull,
            standalonePrevious,
        ]);
        expect(out?.tagName).toBe("vscode-v0.9.2");
    });

    it("skips a half-failed standalone release in favour of the next full one", () => {
        const out = pickLatestStandaloneRelease([
            standaloneHalfFailed,
            standalonePrevious,
        ]);
        expect(out?.tagName).toBe("vscode-v0.9.1");
    });

    it("returns null when no qualifying release exists", () => {
        expect(
            pickLatestStandaloneRelease([
                intellijRelease,
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
        expect(out?.tagName).toBe("vscode-v0.9.2");
    });
});

describe("fetchLatestStandaloneRelease", () => {
    beforeEach(() => {
        _resetReleaseCache();
    });

    it("hits the list endpoint and parses the result", async () => {
        const stub = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [intellijRelease, standaloneFull, standalonePrevious],
        } as Response);

        const out = await fetchLatestStandaloneRelease(stub as unknown as typeof fetch);

        expect(stub).toHaveBeenCalledWith(RELEASES_API_URL);
        expect(out?.tagName).toBe("vscode-v0.9.2");
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
        expect(a?.tagName).toBe("vscode-v0.9.2");
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
