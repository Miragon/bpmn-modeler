<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { withBase } from "vitepress";
import AppleIcon from "../icons/AppleIcon.vue";
import WindowsIcon from "../icons/WindowsIcon.vue";
import LinuxIcon from "../icons/LinuxIcon.vue";
import VSCodeIcon from "../icons/VSCodeIcon.vue";
import {
    fetchLatestStandaloneRelease,
    type StandaloneRelease,
} from "../utils/release";
import "./DownloadPage.css";

const MARKETPLACE_URL =
    "https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler";
const RELEASES_URL = "https://github.com/Miragon/bpmn-modeler/releases";
const HOMEBREW_TAP_CMD = "brew tap miragon/tap";
const HOMEBREW_INSTALL_CMD = "brew install --cask miragon-bpmn-modeler";
const HOMEBREW_FULL_CMD = `${HOMEBREW_TAP_CMD}\n${HOMEBREW_INSTALL_CMD}`;

const release = ref<StandaloneRelease | null>(null);
const copyState = ref<"idle" | "copied">("idle");

// UA cannot reliably distinguish Apple Silicon from Intel (Intel-emulated Chrome
// on M-series still reports "Intel"). We always default the primary download to
// arm64 — it's the common case — and offer Intel as an alternative when the
// release also ships an x64 DMG.
const macPrimaryUrl = computed(() => release.value?.dmgArm64Url ?? RELEASES_URL);
const macAltUrl = computed(() => release.value?.dmgIntelUrl ?? null);
const macPrimaryLabel = "↓ Download for macOS";

onMounted(async () => {
    release.value = await fetchLatestStandaloneRelease();
});

async function copyHomebrew() {
    try {
        await navigator.clipboard.writeText(HOMEBREW_FULL_CMD);
        copyState.value = "copied";
        setTimeout(() => (copyState.value = "idle"), 1500);
    } catch {
        // Clipboard API blocked; ignore.
    }
}
</script>

<template>
    <main class="dl-page">
        <section class="dl-split">
            <div class="dl-hero">
                <h1 class="dl-h1">
                    BPMN Modeler,<br />
                    <span class="grad">made for you.</span>
                </h1>
                <p class="dl-sub">
                    Edit BPMN and DMN files in VS Code or as a standalone
                    desktop app. Free, open source, always the latest version.
                </p>
                <div class="dl-cta">
                    <a class="dl-btn dl-btn-primary dl-btn-lg" :href="macPrimaryUrl">
                        {{ macPrimaryLabel }}
                    </a>
                    <a
                        class="dl-btn dl-btn-secondary dl-btn-lg dl-btn-vscode"
                        :href="MARKETPLACE_URL"
                        target="_blank"
                        rel="noopener"
                    >
                        <VSCodeIcon />
                        Install VS Code extension
                    </a>
                </div>
                <div v-if="macAltUrl" class="dl-meta">
                    <a class="dl-alt-link" :href="macAltUrl">Need Intel?</a>
                </div>
            </div>
            <div class="dl-preview">
                <img
                    :src="withBase('/standalone-preview.png')"
                    alt=""
                    aria-hidden="true"
                    class="dl-preview-img"
                />
            </div>
        </section>

        <section class="dl-platforms">
            <h3>All platforms</h3>

            <table class="dl-table">
                <thead>
                    <tr>
                        <th>Platform</th>
                        <th>Format</th>
                        <th class="dl-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="dl-platform-cell">
                            <span class="dl-ico">
                                <span class="dl-icon-sq"><AppleIcon /></span>
                                macOS
                            </span>
                        </td>
                        <td>DMG</td>
                        <td class="dl-right">
                            <a class="dl-btn dl-btn-primary" :href="macPrimaryUrl">↓ Download</a>
                        </td>
                    </tr>
                    <tr>
                        <td class="dl-platform-cell">
                            <span class="dl-ico">
                                <span class="dl-icon-sq"><WindowsIcon /></span>
                                Windows
                            </span>
                        </td>
                        <td>MSI</td>
                        <td class="dl-right">
                            <button type="button" class="dl-btn dl-btn-secondary dl-btn-disabled" disabled aria-disabled="true">Coming Soon</button>
                        </td>
                    </tr>
                    <tr>
                        <td class="dl-platform-cell">
                            <span class="dl-ico">
                                <span class="dl-icon-sq"><LinuxIcon /></span>
                                Linux
                            </span>
                        </td>
                        <td>AppImage</td>
                        <td class="dl-right">
                            <button type="button" class="dl-btn dl-btn-secondary dl-btn-disabled" disabled aria-disabled="true">Coming Soon</button>
                        </td>
                    </tr>
                    <tr>
                        <td class="dl-platform-cell">
                            <span class="dl-ico">
                                <span class="dl-icon-sq"><VSCodeIcon /></span>
                                VS Code extension
                            </span>
                        </td>
                        <td>VS Code Marketplace</td>
                        <td class="dl-right">
                            <a
                                class="dl-btn dl-btn-primary"
                                :href="MARKETPLACE_URL"
                                target="_blank"
                                rel="noopener"
                            >↗ Install</a>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="dl-cards">
                <div class="dl-card-platform">
                    <div class="dl-card-row1">
                        <span class="dl-icon-sq"><AppleIcon /></span>
                        <div>
                            <div class="dl-card-name">macOS</div>
                            <div class="dl-card-format">DMG</div>
                        </div>
                    </div>
                    <a class="dl-btn dl-btn-primary dl-btn-block" :href="macPrimaryUrl">↓ Download</a>
                </div>
                <div class="dl-card-platform">
                    <div class="dl-card-row1">
                        <span class="dl-icon-sq"><WindowsIcon /></span>
                        <div>
                            <div class="dl-card-name">Windows</div>
                            <div class="dl-card-format">MSI</div>
                        </div>
                    </div>
                    <button type="button" class="dl-btn dl-btn-secondary dl-btn-disabled dl-btn-block" disabled aria-disabled="true">Coming Soon</button>
                </div>
                <div class="dl-card-platform">
                    <div class="dl-card-row1">
                        <span class="dl-icon-sq"><LinuxIcon /></span>
                        <div>
                            <div class="dl-card-name">Linux</div>
                            <div class="dl-card-format">AppImage</div>
                        </div>
                    </div>
                    <button type="button" class="dl-btn dl-btn-secondary dl-btn-disabled dl-btn-block" disabled aria-disabled="true">Coming Soon</button>
                </div>
                <div class="dl-card-platform">
                    <div class="dl-card-row1">
                        <span class="dl-icon-sq"><VSCodeIcon /></span>
                        <div>
                            <div class="dl-card-name">VS Code extension</div>
                            <div class="dl-card-format">VS Code Marketplace</div>
                        </div>
                    </div>
                    <a
                        class="dl-btn dl-btn-primary dl-btn-block"
                        :href="MARKETPLACE_URL"
                        target="_blank"
                        rel="noopener"
                    >↗ Install</a>
                </div>
            </div>

            <div class="dl-extras">
                <div class="dl-card">
                    <div class="dl-card-label">Homebrew tap</div>
                    <div class="dl-code">
                        <pre><span class="dl-prompt">$ </span>{{ HOMEBREW_TAP_CMD }}
<span class="dl-prompt">$ </span>{{ HOMEBREW_INSTALL_CMD }}</pre>
                        <button
                            type="button"
                            class="dl-copy"
                            @click="copyHomebrew"
                            :aria-label="copyState === 'copied' ? 'Copied to clipboard' : 'Copy command to clipboard'"
                        >
                            {{ copyState === "copied" ? "Copied" : "Copy" }}
                        </button>
                    </div>
                </div>
                <a
                    class="dl-card dl-card-link"
                    :href="RELEASES_URL"
                    target="_blank"
                    rel="noopener"
                >
                    <div class="dl-card-label">All assets &amp; older versions</div>
                    <span class="dl-link">View on GitHub Releases →</span>
                </a>
            </div>
        </section>
    </main>
</template>
