<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { computed } from "vue";
import { useData, withBase } from "vitepress";
import SiteFooter from "./components/SiteFooter.vue";
const { Layout } = DefaultTheme;
const { frontmatter, page } = useData();
const showSiteFooter = computed(() =>
    frontmatter.value.layout === "home" || page.value.relativePath === "download.md",
);
</script>

<template>
    <Layout>
        <template #nav-bar-content-after>
            <div class="nav-extras">
                <a
                    class="demo-btn"
                    href="https://miragon-bpmn-modeler-demo.netlify.app"
                    target="_blank"
                    rel="noopener"
                >
                    <svg class="play-ico" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    Live demo
                </a>
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
                built-in Git, professional modeling, zero context switching.
            </p>
            <div class="hero-actions">
                <a class="btn btn-primary" :href="withBase('/download')">
                    <span class="vscode-icon" aria-hidden="true">↓</span>
                    Download
                </a>
                <a
                    class="btn btn-demo"
                    href="https://miragon-bpmn-modeler-demo.netlify.app"
                    target="_blank"
                    rel="noopener"
                >
                    <svg class="play-ico" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    Live demo
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
