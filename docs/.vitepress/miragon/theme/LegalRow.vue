<!--
  Miragon-Doku-Kit: die Rechtsleiste. Copyright, Impressum und Datenschutz auf jeder Seite:
  Startseite, Seiten mit und ohne Seitenleiste und 404, in jeder Breite. Impressum (§ 5 DDG) und
  Datenschutzerklärung (Art. 13 DSGVO) müssen von jeder Seite erreichbar sein. Der footer von
  VitePress fehlt auf Seiten mit Seitenleiste, darum hängt das Theme diese Leiste in den Slot
  layout-bottom. Texte und Links kommen aus legal.ts über themeConfig.miragon.legal (miragonDocs
  setzt sie), das Aussehen aus theme/miragon.css (Abschnitt RECHTSLEISTE).

  Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo unverändert unter
  docs/.vitepress/miragon/theme/LegalRow.vue.
-->
<script setup lang="ts">
import { computed } from "vue"
import { useData } from "vitepress"
import { useSidebar } from "vitepress/theme-without-fonts"
import type { MiragonLegalThemeConfig } from "../legal"

const { theme } = useData<MiragonLegalThemeConfig>()
const { hasSidebar } = useSidebar()
const legal = computed(() => theme.value.miragon?.legal)
</script>

<template>
  <footer v-if="legal" class="miragon-legal" :class="{ 'has-sidebar': hasSidebar }">
    <div class="miragon-legal-inner">
      <p class="miragon-legal-text">
        <span v-if="legal.message">{{ legal.message }}</span>
        <span>{{ legal.copyright }}</span>
      </p>
      <nav class="miragon-legal-links" :aria-label="legal.label">
        <a
          v-for="link in legal.links"
          :key="link.link"
          :href="link.link"
          target="_blank"
          rel="noopener noreferrer"
          >{{ link.text }}</a
        >
      </nav>
    </div>
  </footer>
</template>
