<script setup lang="ts">
import { withBase } from "vitepress";
import GithubIcon from "../icons/GithubIcon.vue";
import LinkedInIcon from "../icons/LinkedInIcon.vue";

const GITHUB_URL = "https://github.com/Miragon/bpmn-modeler";
const LINKEDIN_URL = "https://www.linkedin.com/company/miragon-io";
</script>

<template>
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
                    <GithubIcon />
                </a>
                <a
                    class="site-footer-social"
                    :href="LINKEDIN_URL"
                    target="_blank"
                    rel="noopener"
                    aria-label="LinkedIn"
                >
                    <LinkedInIcon />
                </a>
            </div>
        </div>
    </footer>
</template>
