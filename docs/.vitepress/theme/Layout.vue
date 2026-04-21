<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { withBase } from "vitepress";
const { Layout } = DefaultTheme;

const VERSION = "0.9.0";
const MARKETPLACE_URL =
    "https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.vs-code-bpmn-modeler";
const GITHUB_URL = "https://github.com/Miragon/bpmn-vscode-modeler";
</script>

<template>
    <Layout>
        <template #nav-bar-content-after>
            <div class="nav-extras">
                <span class="version-chip">
                    <span class="v-dot"></span>v{{ VERSION }}
                </span>
                <a
                    class="install-btn"
                    :href="MARKETPLACE_URL"
                    target="_blank"
                    rel="noopener"
                >
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
                Design, diff, and deploy BPMN and DMN workflows without leaving
                VS Code. Full Camunda 7 and 8 support, professional modeling,
                zero context switching.
            </p>
            <div class="hero-actions">
                <a
                    class="btn btn-primary"
                    :href="MARKETPLACE_URL"
                    target="_blank"
                    rel="noopener"
                >
                    <svg
                        class="vscode-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M17.24 2.016 12.6 6.24l-5.4-4.08a1.08 1.08 0 0 0-1.32 0L2.04 5.04a1.08 1.08 0 0 0 0 1.56l4.56 4.08-4.56 4.08a1.08 1.08 0 0 0 0 1.56l3.84 2.88a1.08 1.08 0 0 0 1.32 0l5.4-4.08 4.64 4.224a1.08 1.08 0 0 0 1.52-.024l2.88-2.88c.39-.39.39-1.026 0-1.416L18.24 12l3.4-3.264c.39-.39.39-1.026 0-1.416L18.76 4.44a1.08 1.08 0 0 0-1.52-.024ZM12.6 15.96 8.76 12l3.84-3.96V15.96Z"
                            fill="currentColor"
                        />
                    </svg>
                    Install for VS Code
                </a>
                <a
                    class="btn btn-secondary"
                    :href="withBase('/vscode/getting-started')"
                >Learn more</a>
            </div>
        </template>

        <template #layout-bottom>
            <footer class="site-footer">
                <div class="site-footer-inner">
                    <div class="site-footer-brand">
                        <img
                            :src="withBase('/miragon-favicon.png')"
                            alt="Miragon"
                        />
                        <span>© 2026 Miragon GmbH · Apache 2.0</span>
                    </div>
                    <div class="site-footer-links">
                        <a
                            href="https://www.miragon.io/impressum"
                            target="_blank"
                            rel="noopener"
                        >Legal Notice</a>
                        <span class="sep">·</span>
                        <a
                            href="https://www.miragon.io/datenschutz"
                            target="_blank"
                            rel="noopener"
                        >Privacy Policy</a>
                        <span class="sep">·</span>
                        <a
                            href="https://www.miragon.io"
                            target="_blank"
                            rel="noopener"
                        >miragon.io</a>
                        <a
                            class="site-footer-social"
                            :href="GITHUB_URL"
                            target="_blank"
                            rel="noopener"
                            aria-label="GitHub"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0C18.14 4.18 19 4.45 19 4.45c.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.16.58.67.48C19.14 20.16 22 16.42 22 12c0-5.52-4.48-10-10-10z"
                                />
                            </svg>
                        </a>
                        <a
                            class="site-footer-social"
                            href="https://www.linkedin.com/company/miragon-io"
                            target="_blank"
                            rel="noopener"
                            aria-label="LinkedIn"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                                />
                            </svg>
                        </a>
                    </div>
                </div>
            </footer>
        </template>
    </Layout>
</template>
