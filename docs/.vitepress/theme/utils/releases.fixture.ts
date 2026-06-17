import type { GitHubRelease } from "./release";

// Under the unified release model every host shares one `v<version>` tag and
// GitHub Release. The standalone DMG attaches to that shared release, so the
// arm64 DMG asset — not the tag prefix — is what marks a release as a usable
// standalone build.

const ARM64_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/v0.9.2/Miragon.BPMN.Modeler-0.9.2-arm64.dmg";
const INTEL_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/v0.9.2/Miragon.BPMN.Modeler-0.9.2-x64.dmg";
const WIN_EXE_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/v0.9.2/Miragon.BPMN.Modeler-0.9.2-x64.exe";
const LATEST_MAC_YML_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/v0.9.2/latest-mac.yml";

export const standaloneFull: GitHubRelease = {
    tag_name: "v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-x64.dmg", browser_download_url: INTEL_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-x64.exe", browser_download_url: WIN_EXE_URL },
    ],
};

export const standaloneArm64Only: GitHubRelease = {
    tag_name: "v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export const standaloneHalfFailed: GitHubRelease = {
    tag_name: "v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    assets: [
        // Only the manifest got uploaded; the DMG step failed.
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
    ],
};

export const standalonePrevious: GitHubRelease = {
    tag_name: "v0.9.1",
    published_at: "2026-04-12T08:00:00Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/v0.9.1",
    assets: [
        { name: "latest-mac.yml" },
        { name: "Miragon.BPMN.Modeler-0.9.1-arm64.dmg",
          browser_download_url: ARM64_URL.replace("0.9.2", "0.9.1") },
    ],
};

// A `v*` release cut for a VS Code-only publish: no DMG attached, so the
// standalone wasn't shipped at this version and must be skipped.
export const vscodeRelease: GitHubRelease = {
    tag_name: "v0.9.3",
    published_at: "2026-05-03T08:00:00Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/v0.9.3",
    assets: [
        {
            name: "vs-code-bpmn-modeler-0.9.3.vsix",
            browser_download_url:
                "https://github.com/Miragon/bpmn-modeler/releases/download/v0.9.3/vs-code-bpmn-modeler-0.9.3.vsix",
        },
    ],
};

export const draftStandalone: GitHubRelease = {
    tag_name: "v0.9.99",
    draft: true,
    published_at: "2026-05-04T08:00:00Z",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.99-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export { ARM64_URL, INTEL_URL, WIN_EXE_URL };
