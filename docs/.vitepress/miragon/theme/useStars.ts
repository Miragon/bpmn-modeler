/**
 * Miragon-Doku-Kit: die Zahl der Sterne für GitHubStars.vue und StarPrompt.vue.
 *
 * Zuerst die Zahl aus dem Build (themeConfig.miragon.github.stars), dann live aus der GitHub-API.
 * Der Browser fragt einmal je Sitzung, sessionStorage hält die Antwort: GitHub erlaubt ohne
 * Anmeldung 60 Anfragen je Stunde und IP. Ohne Antwort bleibt die Zahl aus dem Build.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo unverändert unter
 * docs/.vitepress/miragon/theme/useStars.ts.
 */
import { computed, onMounted, ref } from "vue"
import { useData } from "vitepress"
import type { MiragonThemeConfig } from "../config"

const live = ref<number>()

async function frageGitHub(link: string): Promise<number | undefined> {
  const schluessel = `miragon-stars:${link}`
  const gemerkt = sessionStorage.getItem(schluessel)
  if (gemerkt !== null) return Number(gemerkt)
  try {
    const antwort = await fetch(link.replace("https://github.com/", "https://api.github.com/repos/"))
    if (!antwort.ok) return undefined
    const { stargazers_count } = (await antwort.json()) as { stargazers_count?: number }
    if (stargazers_count === undefined) return undefined
    sessionStorage.setItem(schluessel, String(stargazers_count))
    return stargazers_count
  } catch {
    return undefined
  }
}

export function useStars() {
  const { theme } = useData<MiragonThemeConfig>()
  const github = computed(() => theme.value.miragon?.github)
  const stars = computed(() => live.value ?? github.value?.stars)

  onMounted(async () => {
    if (!github.value || live.value !== undefined) return
    live.value = await frageGitHub(github.value.link)
  })

  return { github, stars }
}
