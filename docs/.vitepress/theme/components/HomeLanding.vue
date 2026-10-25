<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import LandingDemo from "./LandingDemo.vue";
import { fetchLatestStandaloneRelease, type StandaloneRelease } from "../utils/release";

type Os = "macos" | "windows" | "linux";
type InstallTab = "vscode" | "intellij" | "desktop";

const RELEASES_URL = "https://github.com/Miragon/bpmn-modeler/releases";
const VSCODE_INSTALL = "code --install-extension miragon-gmbh.vs-code-bpmn-modeler";
const JETBRAINS_MARKETPLACE = "https://plugins.jetbrains.com/plugin/32634-miragon-bpmn-modeler";
const HOMEBREW_INSTALL = "brew install --cask miragon/tap/miragon-bpmn-modeler";

const tabs: { id: InstallTab; label: string }[] = [
    { id: "vscode", label: "VS Code" },
    { id: "intellij", label: "IntelliJ" },
    { id: "desktop", label: "Desktop" },
];

const selectedTab = ref<InstallTab>("vscode");
const os = ref<Os>("macos");
const release = ref<StandaloneRelease | null>(null);
const copied = ref(false);
const copyStatus = ref("");

const desktopDownload = computed(() => {
    const r = release.value;
    const downloads = {
        macos: { label: "Download for macOS (Apple silicon)", url: r?.dmgArm64Url },
        windows: { label: "Download for Windows (.exe)", url: r?.exeX64Url },
        linux: { label: "Download Flatpak (x86_64)", url: r?.flatpakX86_64Url },
    };
    const download = downloads[os.value];
    return { label: download.label, url: download.url ?? RELEASES_URL };
});

function detectOs(): Os {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = (nav.userAgentData?.platform || nav.userAgent).toLowerCase();
    if (platform.includes("win")) return "windows";
    if (/linux|x11|cros/.test(platform) && !platform.includes("android")) return "linux";
    return "macos";
}

function selectBy(offset: number) {
    const index = tabs.findIndex((tab) => tab.id === selectedTab.value);
    selectedTab.value = tabs[(index + offset + tabs.length) % tabs.length].id;
}

async function copyInstallCommand() {
    try {
        await navigator.clipboard.writeText(VSCODE_INSTALL);
    } catch {
        return;
    }
    copied.value = true;
    copyStatus.value = "Copied";
    setTimeout(() => {
        copied.value = false;
        copyStatus.value = "";
    }, 1600);
}

onMounted(async () => {
    os.value = detectOs();
    if (location.hash === "#desktop") selectedTab.value = "desktop";
    release.value = await fetchLatestStandaloneRelease();
});
</script>

<template>
    <div class="landing">
        <div class="hero">
            <section class="pitch" aria-labelledby="landing-title">
                <div>
                    <h1 id="landing-title">Model processes where their <span class="accent">code</span> lives.</h1>
                    <p class="lede">
                        Models, element templates and lint rules live in your repository, so a
                        process change ships in one pull request with the code behind it.
                    </p>
                </div>

                <dl class="facts">
                    <div>
                        <dt>Files</dt>
                        <dd>
                            BPMN <span class="sep">·</span> DMN <span class="sep">·</span> Camunda
                            Forms
                        </dd>
                    </div>
                    <div>
                        <dt>Engines</dt>
                        <dd>
                            Camunda&nbsp;7 <span class="sep">·</span> Camunda&nbsp;8
                            <span class="sep">·</span> Operaton <span class="sep">·</span>
                            CIB&nbsp;seven
                        </dd>
                    </div>
                    <div>
                        <dt>License</dt>
                        <dd>Open source, Apache&nbsp;2.0</dd>
                    </div>
                </dl>

                <div class="install">
                    <div
                        class="tabs"
                        role="tablist"
                        aria-label="Install"
                        @keydown.right.prevent="selectBy(1)"
                        @keydown.left.prevent="selectBy(-1)"
                    >
                        <button
                            v-for="tab in tabs"
                            :id="`install-tab-${tab.id}`"
                            :key="tab.id"
                            class="tab"
                            type="button"
                            role="tab"
                            :aria-controls="`install-panel-${tab.id}`"
                            :aria-selected="tab.id === selectedTab"
                            :tabindex="tab.id === selectedTab ? 0 : -1"
                            @click="selectedTab = tab.id"
                        >
                            {{ tab.label }}
                        </button>
                    </div>

                    <div class="tab-panels">
                        <div
                            id="install-panel-vscode"
                            :class="{ 'is-inactive': selectedTab !== 'vscode' }"
                            class="tab-panel"
                            role="tabpanel"
                            aria-labelledby="install-tab-vscode"
                        >
                            <div class="row">
                                <code
                                    >code --install-extension
                                    <span class="nowrap"
                                        >miragon-gmbh.vs-code-bpmn-modeler</span
                                    ></code
                                >
                                <button
                                    class="copy-btn"
                                    :class="{ 'is-copied': copied }"
                                    type="button"
                                    aria-label="Copy command"
                                    @click="copyInstallCommand"
                                >
                                    <svg class="icon-copy" viewBox="0 0 24 24" aria-hidden="true">
                                        <rect width="14" height="14" x="8" y="8" rx="2" />
                                        <path
                                            d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
                                        />
                                    </svg>
                                    <svg class="icon-check" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div
                            id="install-panel-intellij"
                            :class="{ 'is-inactive': selectedTab !== 'intellij' }"
                            class="tab-panel"
                            role="tabpanel"
                            aria-labelledby="install-tab-intellij"
                        >
                            <div class="row">
                                <span class="row-text"
                                    >Settings → Plugins → Marketplace → Miragon BPMN Modeler</span
                                >
                            </div>
                            <p class="tab-note">
                                Preview. From the
                                <a :href="JETBRAINS_MARKETPLACE">JetBrains Marketplace</a>.
                            </p>
                        </div>

                        <div
                            id="install-panel-desktop"
                            :class="{ 'is-inactive': selectedTab !== 'desktop' }"
                            class="tab-panel"
                            role="tabpanel"
                            aria-labelledby="install-tab-desktop"
                        >
                            <div class="row">
                                <a class="row-link" :href="desktopDownload.url">
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M12 15V3" />
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <path d="m7 10 5 5 5-5" />
                                    </svg>
                                    {{ desktopDownload.label }}
                                </a>
                            </div>
                            <p v-if="os === 'macos'" class="tab-note">
                                Preview. Homebrew: <code class="nowrap">{{ HOMEBREW_INSTALL }}</code>
                            </p>
                            <p v-else class="tab-note">
                                Preview. Other platforms on
                                <a :href="RELEASES_URL">GitHub Releases</a>.
                            </p>
                        </div>
                    </div>
                    <span class="sr-only" aria-live="polite">{{ copyStatus }}</span>
                </div>
            </section>

            <LandingDemo />
        </div>
    </div>
</template>

<style scoped>
.landing {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    padding: 24px 0;
    overflow: clip;
    font-size: 16px;
    line-height: 1.6;
    color: var(--cd-ui-text);
}
/* One faint grid behind the whole hero, edge to edge: it fades in from the right and is gone
   shortly left of the window. */
.landing::before {
    --fade: var(--cd-schwarz);
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0.42;
    background-image:
        linear-gradient(var(--cd-ui-linie) 1px, transparent 1px),
        linear-gradient(90deg, var(--cd-ui-linie) 1px, transparent 1px);
    background-size: 24px 24px;
    background-position: center;
    mask-image:
        linear-gradient(to left, var(--fade), var(--fade) 45%, transparent 85%),
        linear-gradient(
            to bottom,
            transparent,
            var(--fade) 48px,
            var(--fade) calc(100% - 48px),
            transparent
        );
    mask-composite: intersect;
}
:global(.dark .landing::before) {
    opacity: 0.36;
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    border: 0;
}
a {
    color: var(--cd-ui-link);
    text-decoration: underline;
    text-underline-offset: 2px;
}
code {
    font-family: var(--vp-font-family-mono);
}

/* The window and its loop rail sit in the right column; the pitch is centred against both. */
.hero {
    display: grid;
    grid-template-columns: minmax(0, 38fr) minmax(0, 62fr);
    grid-template-rows: minmax(0, 1fr) auto;
    column-gap: 64px;
    row-gap: 16px;
    width: 100%;
    max-width: var(--vp-layout-max-width);
    margin: 0 auto;
    padding: 0 32px;
}
.pitch {
    grid-area: 1 / 1 / 3 / 2;
    align-self: center;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 32px;
}

.accent {
    color: var(--cd-ui-link);
}

h1 {
    margin: -6px 0 0;
    padding: 0;
    border: 0;
    font-size: 44px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-wrap: balance;
}
.lede {
    margin: 20px 0 0;
    font-size: 18px;
    line-height: 1.6;
    text-wrap: pretty;
}

.facts {
    margin: 0;
    border-bottom: 1px solid var(--cd-ui-linie);
}
.facts div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    column-gap: 16px;
    align-items: baseline;
    padding: 10px 0;
    border-top: 1px solid var(--cd-ui-linie);
}
.facts dt {
    font-size: 14px;
    color: var(--cd-ui-text-leise);
}
.facts dd {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    white-space: nowrap;
}
.facts .sep {
    padding: 0 2px;
    color: var(--cd-ui-text-leise);
}

.tabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--cd-ui-linie);
}
.tab {
    position: relative;
    padding: 6px 12px 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--cd-ui-text-leise);
    cursor: pointer;
}
.tab:first-child {
    padding-left: 0;
}
.tab:hover {
    color: var(--cd-ui-text);
}
.tab[aria-selected="true"] {
    color: var(--cd-ui-text);
    font-weight: 600;
}
.tab[aria-selected="true"]::after {
    content: "";
    position: absolute;
    right: 8px;
    bottom: -1px;
    left: 8px;
    height: 2px;
    background: var(--cd-ui-interaktion);
}
.tab:first-child[aria-selected="true"]::after {
    left: 0;
}
/* All panels share one cell, so switching tabs never changes the pitch height. */
.tab-panels {
    display: grid;
}
.tab-panel {
    grid-area: 1 / 1;
    padding-top: 16px;
}
.tab-panel.is-inactive {
    visibility: hidden;
}
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 4px 4px 4px 14px;
    border: 1px solid var(--cd-ui-linie);
    border-radius: var(--cd-radius-sm);
    background: var(--cd-ui-abschnitt);
}
.row code {
    flex: 1;
    min-width: 0;
    padding: 5px 0;
    font-size: 12px;
    line-height: 1.5;
}
.nowrap {
    white-space: nowrap;
}
.row-text {
    flex: 1;
    padding: 5px 0;
    font-size: 14px;
    line-height: 1.45;
}
.row-link {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
}
.row-link:hover {
    text-decoration: underline;
}
.row-link svg,
.copy-btn svg {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.copy-btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--cd-radius-sm);
    color: var(--cd-ui-text-leise);
    cursor: pointer;
}
.copy-btn:hover {
    background: var(--cd-ui-hover);
    color: var(--cd-ui-text);
}
.copy-btn .icon-check,
.copy-btn.is-copied .icon-copy {
    display: none;
}
.copy-btn.is-copied .icon-check {
    display: block;
}
.tab-note {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--cd-ui-text-leise);
}
.tab-note code {
    font-size: 12px;
    color: var(--cd-ui-text);
}

/* One screen: the hero absorbs the leftover height until the window reaches 5:4 above its rail. */
@media (min-width: 960px) and (min-height: 700px) {
    .landing {
        min-height: calc(100dvh - var(--vp-nav-height) - 53px);
        justify-content: center;
    }
    .hero {
        flex: 1 1 auto;
        max-height: calc(
            (min(100vw, var(--vp-layout-max-width)) - 128px) * 0.62 * 0.8 + 136px
        );
    }
}

@media (min-width: 960px) and (max-height: 860px) {
    .landing {
        padding: 20px 0;
    }
    h1 {
        margin-top: -5px;
        font-size: 40px;
    }
    .lede {
        margin-top: 14px;
        font-size: 16px;
        line-height: 1.55;
    }
    .facts div {
        padding: 6px 0;
    }
    .tab-panel {
        padding-top: 12px;
    }
    .row {
        min-height: 40px;
        padding: 2px 2px 2px 12px;
    }
}

@media (max-width: 959px) {
    .landing {
        padding: 32px 0 40px;
    }
    .hero {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: none;
        row-gap: 32px;
    }
    .pitch {
        grid-area: 1 / 1;
        gap: 24px;
    }
    h1 {
        margin-top: 0;
        font-size: 36px;
    }
    .lede {
        font-size: 16px;
    }
    .facts dd,
    .tab-note .nowrap {
        white-space: normal;
    }
}

@media (max-width: 767px) {
    .hero {
        padding: 0 24px;
    }
}
</style>
