import type { GitHubRelease } from "./release";

const ARM64_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/standalone-v0.9.2/Miragon.BPMN.Modeler-0.9.2-arm64.dmg";
const INTEL_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/standalone-v0.9.2/Miragon.BPMN.Modeler-0.9.2-x64.dmg";
const LATEST_MAC_YML_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/standalone-v0.9.2/latest-mac.yml";

export const standaloneFull: GitHubRelease = {
    tag_name: "standalone-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/standalone-v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-x64.dmg", browser_download_url: INTEL_URL },
    ],
};

export const standaloneArm64Only: GitHubRelease = {
    tag_name: "standalone-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/standalone-v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export const standaloneHalfFailed: GitHubRelease = {
    tag_name: "standalone-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    assets: [
        // Only the manifest got uploaded; the DMG step failed.
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
    ],
};

export const standalonePrevious: GitHubRelease = {
    tag_name: "standalone-v0.9.1",
    published_at: "2026-04-12T08:00:00Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/standalone-v0.9.1",
    assets: [
        { name: "latest-mac.yml" },
        { name: "Miragon.BPMN.Modeler-0.9.1-arm64.dmg",
          browser_download_url: ARM64_URL.replace("0.9.2", "0.9.1") },
    ],
};

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
    tag_name: "standalone-v0.9.99",
    draft: true,
    published_at: "2026-05-04T08:00:00Z",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.99-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export const createAppendRelease: GitHubRelease = {
    tag_name: "create-append-c7-element-templates/v1.0.0",
    published_at: "2026-04-15T08:00:00Z",
    assets: [],
};

export { ARM64_URL, INTEL_URL };
