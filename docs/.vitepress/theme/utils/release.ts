// Resolves the latest standalone-app GitHub release for the download page.
//
// Tag-scheme independent by design. Releases are split per host
// (`vscode-v<version>`, `intellij-v<version>`), so the tag prefix is not a
// reliable signal — and hard-coding one rots the next time it changes. The
// **arm64 DMG asset is the discriminator**: a release without one (e.g. an
// IntelliJ-only publish) shipped no standalone build and is skipped. The
// version is read from the DMG filename, not the tag, so this keeps working
// regardless of how releases are tagged.
//
// Why not /releases/latest? It returns whichever release was published most
// recently across the whole repo — frequently an IntelliJ release with no DMG —
// so it would break the page. We list /releases and pick the most recently
// *published* release that actually has the arm64 DMG, sorting client-side by
// published_at desc (GitHub's default created_at desc can drift from publish
// order if a release was drafted long before publishing).

const REPO = "Miragon/bpmn-modeler";
const RELEASES_LIST_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const RELEASES_PAGE_BASE = `https://github.com/${REPO}/releases/tag`;

// Anchored against the electron-builder naming convention:
//   Miragon.BPMN.Modeler-<version>-<arch>.dmg
// Anchoring on the leading hyphen avoids accidental matches against future
// debug-symbols or sidecar artefacts that happen to mention an arch.
const ARM64_DMG = /-arm64\.dmg$/i;
const INTEL_DMG = /-(x64|intel)\.dmg$/i;
const WIN_EXE = /-x64\.exe$/i;
const FLATPAK_X86_64 = /-x86_64\.flatpak$/i;
// The version is the segment between the product name and the arch suffix.
// Greedy so prerelease versions with their own hyphen (1.3.1-beta.1) survive;
// the product name has no hyphens, so the leftmost match starts after it.
const DMG_VERSION = /-(.+)-arm64\.dmg$/i;

export interface GitHubReleaseAsset {
    name?: string;
    browser_download_url?: string;
}

export interface GitHubRelease {
    tag_name?: string;
    draft?: boolean;
    published_at?: string;
    html_url?: string;
    assets?: GitHubReleaseAsset[];
}

export interface StandaloneRelease {
    tagName: string;
    version: string;
    publishedAt: string;
    dmgArm64Url: string;
    dmgIntelUrl: string | null;
    exeX64Url: string | null;
    flatpakX86_64Url: string | null;
    releasePageUrl: string;
}

function findAsset(
    assets: GitHubReleaseAsset[] | undefined,
    pattern: RegExp,
): GitHubReleaseAsset | null {
    for (const a of assets ?? []) {
        if (a.name && pattern.test(a.name) && a.browser_download_url) {
            return a;
        }
    }
    return null;
}

function findAssetUrl(
    assets: GitHubReleaseAsset[] | undefined,
    pattern: RegExp,
): string | null {
    return findAsset(assets, pattern)?.browser_download_url ?? null;
}

export function parseStandaloneRelease(r: GitHubRelease): StandaloneRelease | null {
    if (r.draft) return null;

    // The arm64 DMG is the discriminator — no DMG means no standalone build at
    // this release (e.g. an IntelliJ-only publish), regardless of the tag.
    const arm64 = findAsset(r.assets, ARM64_DMG);
    if (!arm64?.browser_download_url) return null;

    // Read the version from the DMG filename, never the tag.
    const version = DMG_VERSION.exec(arm64.name ?? "")?.[1] ?? "";
    if (!version) return null;

    return {
        tagName: r.tag_name ?? "",
        version,
        publishedAt: r.published_at ?? "",
        dmgArm64Url: arm64.browser_download_url,
        dmgIntelUrl: findAssetUrl(r.assets, INTEL_DMG),
        exeX64Url: findAssetUrl(r.assets, WIN_EXE),
        flatpakX86_64Url: findAssetUrl(r.assets, FLATPAK_X86_64),
        releasePageUrl: r.html_url ?? `${RELEASES_PAGE_BASE}/${r.tag_name}`,
    };
}

export function pickLatestStandaloneRelease(
    releases: GitHubRelease[],
): StandaloneRelease | null {
    // Sort by published_at desc — GitHub's default is created_at desc, which
    // can disagree with publish order if a release was drafted long beforehand.
    const sorted = [...releases].sort((a, b) =>
        (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    );
    for (const r of sorted) {
        const parsed = parseStandaloneRelease(r);
        if (parsed) return parsed;
    }
    return null;
}

// Module-level promise cache. Both Layout.vue and DownloadPage.vue resolve
// the latest release on mount; without this they'd each fire an API request
// per page-view, which on the GitHub anonymous limit (60/hr/IP) adds up fast.
// We dedupe within a single browser session — if the call fails, the cached
// null is reused too (callers already handle null with a graceful fallback).
let cachedReleasePromise: Promise<StandaloneRelease | null> | null = null;

export async function fetchLatestStandaloneRelease(
    fetchImpl: typeof fetch = fetch,
): Promise<StandaloneRelease | null> {
    if (cachedReleasePromise) return cachedReleasePromise;
    cachedReleasePromise = (async () => {
        try {
            const res = await fetchImpl(RELEASES_LIST_URL);
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data)) return null;
            return pickLatestStandaloneRelease(data as GitHubRelease[]);
        } catch {
            return null;
        }
    })();
    return cachedReleasePromise;
}

/** Test-only: clear the in-memory cache between cases. */
export function _resetReleaseCache(): void {
    cachedReleasePromise = null;
}

export const RELEASES_API_URL = RELEASES_LIST_URL;
