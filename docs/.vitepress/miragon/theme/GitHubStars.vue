<!--
  Miragon-Doku-Kit: GitHub mit Sternen im Header, als Pille mit Haarlinie: links das GitHub-Icon,
  rechts der grüne Stern und die Zahl. Repo und Zahl kommen aus themeConfig.miragon.github
  (miragonDocs setzt sie beim Build, githubStars: false lässt sie weg), die Zahl im Browser live
  aus der GitHub-API (useStars.ts). Ab 768px im Header, darunter
  bleibt das GitHub-Icon von VitePress im Menü. Aussehen in theme/miragon.css (Abschnitt GITHUB).

  Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo unverändert unter
  docs/.vitepress/miragon/theme/GitHubStars.vue.
-->
<script setup lang="ts">
import { computed } from "vue"
import { useStars } from "./useStars"

const { github, stars } = useStars()
const zahl = computed(() =>
  stars.value === undefined ? undefined : new Intl.NumberFormat("en", { notation: "compact" }).format(stars.value),
)
const label = computed(() => (zahl.value === undefined ? "GitHub" : `GitHub, ${stars.value} stars`))
</script>

<template>
  <a v-if="github" class="miragon-github" :href="github.link" target="_blank" rel="noopener noreferrer" :aria-label="label">
    <svg class="miragon-github-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
    <span v-if="zahl !== undefined" class="miragon-github-stars">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 .25a.75.75 0 01.67.42l1.88 3.81 4.2.61a.75.75 0 01.42 1.28l-3.04 2.96.72 4.19a.75.75 0 01-1.09.79L8 12.33l-3.76 1.98a.75.75 0 01-1.09-.79l.72-4.19L.83 6.37a.75.75 0 01.42-1.28l4.2-.61L7.33.67A.75.75 0 018 .25z"
        />
      </svg>
      {{ zahl }}
    </span>
  </a>
</template>
