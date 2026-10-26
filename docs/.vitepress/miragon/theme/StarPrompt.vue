<!--
  Miragon-Doku-Kit: die Bitte um einen Stern am Ende jeder Seite mit Seitenleiste, über „Edit this
  page on GitHub“. Eine graue Fläche mit Frage und Satz, rechts eine Pille wie GitHub im Header:
  Haarlinie, grüner Stern, die Zahl der Sterne. Texte, Link und Zahl kommen aus
  themeConfig.miragon.github (miragonDocs setzt sie, githubStars: false lässt sie weg), die Zahl
  im Browser live aus der GitHub-API (useStars.ts). Aussehen in
  theme/miragon.css (Abschnitt GITHUB).

  Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo unverändert unter
  docs/.vitepress/miragon/theme/StarPrompt.vue.
-->
<script setup lang="ts">
import { computed } from "vue"
import { useStars } from "./useStars"

const { github, stars } = useStars()
const knopf = computed(() =>
  stars.value === undefined ? github.value?.prompt.button : `${github.value?.prompt.button} · ${stars.value}`,
)
</script>

<template>
  <aside v-if="github" class="miragon-star-prompt">
    <div>
      <p class="miragon-star-prompt-title">{{ github.prompt.title }}</p>
      <p>{{ github.prompt.text }}</p>
    </div>
    <a :href="github.link" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 .25a.75.75 0 01.67.42l1.88 3.81 4.2.61a.75.75 0 01.42 1.28l-3.04 2.96.72 4.19a.75.75 0 01-1.09.79L8 12.33l-3.76 1.98a.75.75 0 01-1.09-.79l.72-4.19L.83 6.37a.75.75 0 01.42-1.28l4.2-.61L7.33.67A.75.75 0 018 .25z"
        />
      </svg>
      {{ knopf }}
    </a>
  </aside>
</template>
