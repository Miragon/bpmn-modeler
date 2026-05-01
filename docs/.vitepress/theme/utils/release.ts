// Resolves the latest standalone-app GitHub release for the download page.
//
// Why not /releases/latest? It returns whichever tag was published most recently
// across the whole repo (VS Code, standalone, create-append, …). After the next
// VS Code release it returns one with no DMG attached, breaking the page.
//
// We list /releases and pick the most recently *published* release whose tag
// starts with the standalone prefix AND actually has the arm64 DMG uploaded.
// The prefix tells us a release was *meant* to be a standalone build; the asset
// check confirms the upload step finished. We sort client-side by published_at
// desc — GitHub's default order is created_at desc, which can drift from
// published order if a release was drafted long before being published.

const REPO = "Miragon/bpmn-modeler";
const STANDALONE_TAG_PREFIX = "standalone-v";
const RELEASES_LIST_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`;
const RELEASES_PAGE_BASE = `https://github.com/${REPO}/releases/tag`;

// Anchored against the electron-builder naming convention:
//   Miragon.BPMN.Modeler-<version>-<arch>.dmg
// Anchoring on the leading hyphen avoids accidental matches against future
// debug-symbols or sidecar artefacts that happen to mention an arch.
const ARM64_DMG = /-arm64\.dmg$/i;
const INTEL_DMG = /-(x64|intel)\.dmg$/i;

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
    releasePageUrl: string;
}

function findAssetUrl(
    assets: GitHubReleaseAsset[] | undefined,
    pattern: RegExp,
): string | null {
    for (const a of assets ?? []) {
        if (a.name && pattern.test(a.name) && a.browser_download_url) {
            return a.browser_download_url;
        }
    }
    return null;
}

export function parseStandaloneRelease(r: GitHubRelease): StandaloneRelease | null {
    if (r.draft) return null;
    if (!r.tag_name?.startsWith(STANDALONE_TAG_PREFIX)) return null;

    const version = r.tag_name.slice(STANDALONE_TAG_PREFIX.length);
    if (!version) return null; // Reject the prefix-only edge case "standalone-v".

    const dmgArm64Url = findAssetUrl(r.assets, ARM64_DMG);
    if (!dmgArm64Url) return null;

    return {
        tagName: r.tag_name,
        version,
        publishedAt: r.published_at ?? "",
        dmgArm64Url,
        dmgIntelUrl: findAssetUrl(r.assets, INTEL_DMG),
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
