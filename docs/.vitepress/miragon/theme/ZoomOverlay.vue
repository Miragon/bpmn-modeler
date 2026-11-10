<!--
  Miragon-Doku-Kit: Bilder und Diagramme im Vollbild. Ein Klick auf ein Bild, ein Mermaid-Diagramm
  oder ein Element mit data-zoom in einer Seite öffnet eine Kopie davon in einem Overlay über der
  ganzen Seite. Esc, ein Klick daneben oder × schließt es. data-zoom="off" nimmt ein Element aus,
  Bilder in Links bleiben Links. Aussehen in theme/miragon.css (Abschnitt ZOOM).

  Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo unverändert unter
  docs/.vitepress/miragon/theme/ZoomOverlay.vue.
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"

const ZOOMBAR = ".vp-doc img, .vp-doc .mermaid, .vp-doc [data-zoom]"

const offen = ref(false)
const buehne = ref<HTMLElement>()
const schliessen = ref<HTMLButtonElement>()
let vorher: HTMLElement | null = null

function zoombar(ziel: EventTarget | null): HTMLElement | undefined {
  if (!(ziel instanceof Element)) return undefined
  const element = ziel.closest<HTMLElement>(ZOOMBAR)
  if (!element || element.closest('[data-zoom="off"]') || element.closest("a")) return undefined
  if (element.matches(".mermaid") && !element.querySelector("svg")) return undefined
  return element.closest<HTMLElement>(".vp-doc [data-zoom]") ?? element
}

async function oeffne(element: HTMLElement) {
  vorher = document.activeElement as HTMLElement | null
  offen.value = true
  await nextTick()
  const kopie = element.cloneNode(true) as HTMLElement
  kopie.removeAttribute("id")
  kopie.classList.add("miragon-zoom-kopie")
  buehne.value?.replaceChildren(kopie)
  document.body.classList.add("miragon-zoom-offen")
  schliessen.value?.focus()
}

function zu() {
  offen.value = false
  buehne.value?.replaceChildren()
  document.body.classList.remove("miragon-zoom-offen")
  vorher?.focus()
}

function beiKlick(event: MouseEvent) {
  if (offen.value || event.defaultPrevented || event.button !== 0) return
  const element = zoombar(event.target)
  if (!element) return
  event.preventDefault()
  void oeffne(element)
}

function beiTaste(event: KeyboardEvent) {
  if (offen.value && event.key === "Escape") zu()
}

onMounted(() => {
  document.addEventListener("click", beiKlick)
  document.addEventListener("keydown", beiTaste)
})
onBeforeUnmount(() => {
  document.removeEventListener("click", beiKlick)
  document.removeEventListener("keydown", beiTaste)
  if (offen.value) zu()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="offen" class="miragon-zoom" role="dialog" aria-modal="true" @click.self="zu">
      <div ref="buehne" class="miragon-zoom-buehne" @click.self="zu" />
      <button ref="schliessen" class="miragon-zoom-zu" type="button" aria-label="Close" @click="zu">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </Teleport>
</template>
