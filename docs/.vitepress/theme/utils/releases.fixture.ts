import type { GitHubRelease } from "./release";

// Releases are split per host: the standalone DMG ships on the VS Code-family
// line (`vscode-v<version>`), while IntelliJ publishes on its own
// (`intellij-v<version>`) with no DMG. The arm64 DMG asset — not the tag — is
// what marks a release as a usable standalone build, and the version is read
// from the DMG filename, so these fixtures deliberately mix tag schemes.

const ARM64_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/vscode-v0.9.2/Miragon.BPMN.Modeler-0.9.2-arm64.dmg";
const INTEL_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/vscode-v0.9.2/Miragon.BPMN.Modeler-0.9.2-x64.dmg";
const WIN_EXE_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/vscode-v0.9.2/Miragon.BPMN.Modeler-0.9.2-x64.exe";
const FLATPAK_X86_64_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/vscode-v0.9.2/Miragon.BPMN.Modeler-0.9.2-x86_64.flatpak";
const LATEST_MAC_YML_URL =
    "https://github.com/Miragon/bpmn-modeler/releases/download/vscode-v0.9.2/latest-mac.yml";

export const standaloneFull: GitHubRelease = {
    tag_name: "vscode-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-x64.dmg", browser_download_url: INTEL_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-x64.exe", browser_download_url: WIN_EXE_URL },
        {
            name: "Miragon.BPMN.Modeler-0.9.2-x86_64.flatpak",
            browser_download_url: FLATPAK_X86_64_URL,
        },
    ],
};

export const standaloneArm64Only: GitHubRelease = {
    tag_name: "vscode-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v0.9.2",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.2-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export const standaloneHalfFailed: GitHubRelease = {
    tag_name: "vscode-v0.9.2",
    published_at: "2026-04-30T09:18:25Z",
    assets: [
        // Only the manifest got uploaded; the DMG step failed.
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
    ],
};

export const standalonePrevious: GitHubRelease = {
    tag_name: "vscode-v0.9.1",
    published_at: "2026-04-12T08:00:00Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v0.9.1",
    assets: [
        { name: "latest-mac.yml" },
        { name: "Miragon.BPMN.Modeler-0.9.1-arm64.dmg",
          browser_download_url: ARM64_URL.replace(/0\.9\.2/g, "0.9.1") },
    ],
};

// An IntelliJ-only publish: its own tag line, a plugin ZIP, no DMG — so the
// standalone wasn't shipped at this version and must be skipped. Proves the
// discriminator is the DMG asset, not the tag prefix.
export const intellijRelease: GitHubRelease = {
    tag_name: "intellij-v0.9.3",
    published_at: "2026-05-03T08:00:00Z",
    html_url: "https://github.com/Miragon/bpmn-modeler/releases/tag/intellij-v0.9.3",
    assets: [
        {
            name: "bpmn-modeler-intellij-0.9.3.zip",
            browser_download_url:
                "https://github.com/Miragon/bpmn-modeler/releases/download/intellij-v0.9.3/bpmn-modeler-intellij-0.9.3.zip",
        },
    ],
};

export const draftStandalone: GitHubRelease = {
    tag_name: "vscode-v0.9.99",
    draft: true,
    published_at: "2026-05-04T08:00:00Z",
    assets: [
        { name: "latest-mac.yml", browser_download_url: LATEST_MAC_YML_URL },
        { name: "Miragon.BPMN.Modeler-0.9.99-arm64.dmg", browser_download_url: ARM64_URL },
    ],
};

export { ARM64_URL, INTEL_URL, WIN_EXE_URL, FLATPAK_X86_64_URL };
