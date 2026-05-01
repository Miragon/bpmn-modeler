<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { ref, computed, onMounted } from "vue";
import { useData, withBase } from "vitepress";
import SiteFooter from "./components/SiteFooter.vue";
import { fetchLatestStandaloneRelease } from "./utils/release";
const { Layout } = DefaultTheme;
const { frontmatter, page } = useData();
const showSiteFooter = computed(() =>
    frontmatter.value.layout === "home" || page.value.relativePath === "download.md",
);

// Display the literal release tag (e.g. "standalone-v0.9.2") in the top-nav
// version chip — no prefix munging.
const releaseTag = ref<string | null>(null);
onMounted(async () => {
    const release = await fetchLatestStandaloneRelease();
    releaseTag.value = release?.tagName ?? null;
});
</script>

<template>
    <Layout>
        <template #nav-bar-content-after>
            <div class="nav-extras">
                <span v-if="releaseTag" class="version-chip">
                    <span class="v-dot"></span>{{ releaseTag }}
                </span>
                <a class="install-btn" :href="withBase('/download')">
                    <span class="ico">↓</span> Install
                </a>
            </div>
        </template>

        <template #home-hero-info>
            <h1 class="hero-h1">
                Process modeling,
                <span class="grad">reimagined</span>
                inside your IDE.
            </h1>
            <p class="hero-tagline">
                Design, diff, and deploy BPMN and DMN workflows without
                leaving your editor. Full Camunda 7 and 8 support,
                professional modeling, zero context switching.
            </p>
            <div class="hero-actions">
                <a class="btn btn-primary" :href="withBase('/download')">
                    <span class="vscode-icon" aria-hidden="true">↓</span>
                    Download
                </a>
                <a
                    class="btn btn-tertiary"
                    :href="withBase('/vscode/getting-started')"
                >Learn more</a>
            </div>
        </template>

        <template #layout-bottom>
            <SiteFooter v-if="showSiteFooter" />
        </template>
    </Layout>
</template>
