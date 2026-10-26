/**
 * Miragon-Doku-Kit: die ganze VitePress-Konfiguration einer Miragon-Doku.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site (plugins/miragon-brand/skills/docs-site/assets/).
 * Im Repo liegt die Datei unverändert unter docs/.vitepress/miragon/config.ts. Nicht dort ändern,
 * sondern in der CI und dann neu vendoren. `node docs/.vitepress/miragon/check.mjs` meldet Drift.
 *
 * Aufruf in docs/.vitepress/config.ts:
 *
 *   import { miragonDocs } from "./miragon/config"
 *
 *   export default miragonDocs({
 *     repo: "Miragon/bpmn-cli",
 *     title: "Miragon bpmn-cli",
 *     description: "…",
 *     nav: [{ text: "Getting started", link: "/getting-started" }],
 *     sidebar: [{ text: "Start", items: [{ text: "Getting started", link: "/getting-started" }] }],
 *   })
 *
 * Fest im Kit: base aus DOCS_BASE, saubere URLs, Datum der letzten Änderung, Komet als Icon, zwei
 * theme-color, Geist vorgeladen, Shiki-Themes mit AA, Anker wie auf GitHub, Mermaid, Komet und
 * Produktname im Titel, Gliederung H2 und H3, lokale Suche, Bearbeiten-Link, GitHub mit Sternen im Header, Bitte um einen Stern am Seitenende, 404-Texte und die Rechtsleiste
 * (Copyright, Impressum, Datenschutz) auf jeder Seite. Die Farben kommen aus theme/miragon.css.
 */
import { mergeConfig, type DefaultTheme, type HeadConfig, type UserConfig } from "vitepress"
import { withMermaid } from "vitepress-plugin-mermaid"
import type { MermaidConfig } from "mermaid"
import { githubSlug } from "./slug.mjs"
import { miragonLegal, type MiragonLegal } from "./legal"

export { miragonLegal, type MiragonLegal } from "./legal"

/** Optionen von miragonDocs. Was hier nicht steht, legt das Kit fest. */
export interface MiragonDocsOptions {
  /** GitHub-Repo als "Miragon/<name>". Ergibt den Bearbeiten-Link und das GitHub-Icon. */
  repo: string
  /** Produktname, etwa "Miragon bpmn-cli". Steht im Titel jeder Seite. */
  title: string
  /** Name neben dem Komet. Standard: title ohne "Miragon ". false zeigt nur den Komet. */
  siteTitle?: string | false
  /** Ein Satz für die Beschreibung der Seite (meta description). */
  description: string
  /** Sprache der Seite und der festen Texte. Standard "en-US", "de-DE" stellt sie auf Deutsch. */
  lang?: "en-US" | "de-DE"
  /** Landingpage des Tools auf miragon.ai. Ergibt hinten in der Navigation den Link "miragon.ai". */
  productPage?: string
  /** Navigation oben. */
  nav?: DefaultTheme.NavItem[]
  /** Seitenleiste, als Liste oder je Pfad. */
  sidebar?: DefaultTheme.Sidebar
  /**
   * Sterne des Repos im Header neben dem GitHub-Icon und die Bitte um einen Stern am Ende jeder Seite.
   * Standard true, false zeigt nur das GitHub-Icon.
   */
  githubStars?: boolean
  /** Weitere Icons nach dem GitHub-Icon, etwa npm. */
  socialLinks?: DefaultTheme.SocialLink[]
  /** Zweig für den Bearbeiten-Link. Standard "main". */
  branch?: string
  /** Ordner der Doku im Repo, für den Bearbeiten-Link. Standard "docs". */
  docsDir?: string
  /** Ein Satz in der Rechtsleiste vor dem Copyright, etwa "Released under the MIT License." */
  footerMessage?: string

  // Durchgereicht und zusammengeführt wie bei `extends` in VitePress: Listen hängen sich an,
  // Objekte mischen sich, ein einzelner Wert ersetzt den des Kits.
  srcExclude?: UserConfig["srcExclude"]
  rewrites?: UserConfig["rewrites"]
  ignoreDeadLinks?: UserConfig["ignoreDeadLinks"]
  /** Weitere Einträge für den head, hinter denen des Kits. */
  head?: HeadConfig[]
  markdown?: UserConfig["markdown"]
  vite?: UserConfig["vite"]
  sitemap?: UserConfig["sitemap"]
  /** Weitere Mermaid-Einstellungen. Die Farben kommen aus theme/miragon.css, nicht von hier. */
  mermaid?: MermaidConfig
}

export interface MiragonThemeConfig extends DefaultTheme.Config {
  miragon: { legal: MiragonLegal; github?: MiragonGitHub }
}

/** Repo und Sterne für den Knopf im Header (theme/GitHubStars.vue). */
export interface MiragonGitHub {
  link: string
  stars?: number
  /** Bitte um einen Stern am Ende jeder Seite mit Seitenleiste (theme/StarPrompt.vue). */
  prompt: { title: string; text: string; button: string }
}

/**
 * Sterne beim Build: Die Zahl steht gleich im HTML. Im Browser holt theme/useStars.ts sie live
 * nach. Ohne Antwort in drei Sekunden steht der Knopf bis dahin ohne Zahl da.
 */
async function sterne(repo: string): Promise<number | undefined> {
  try {
    const antwort = await fetch(`https://api.github.com/repos/${repo}`, { signal: AbortSignal.timeout(3000) })
    if (!antwort.ok) return undefined
    const { stargazers_count } = (await antwort.json()) as { stargazers_count?: number }
    return stargazers_count
  } catch {
    return undefined
  }
}

const SPRACHEN = ["en-US", "de-DE"] as const

// Englisch sind die Texte von VitePress, dazu die aus Miragon/mcp-toolkit. Deutsch wie die Doku der CI.
const TEXTE = {
  "en-US": {
    editLink: "Edit this page on GitHub",
    starPrompt: (name: string) => ({
      title: "Did this page help?",
      text: `A star on GitHub helps other teams find ${name}.`,
      button: "Star",
    }),
    lastUpdated: "Last updated",
    // Was passiert ist und was zu tun ist, im Satzbau statt „PAGE NOT FOUND“ und Zitat.
    notFound: {
      title: "This page doesn't exist",
      quote: "The link may be outdated. Search the docs, or start at the docs home.",
      linkLabel: "Go to the docs home",
      linkText: "Go to the docs home",
    },
    themeConfig: {},
    search: {},
  },
  "de-DE": {
    editLink: "Diese Seite auf GitHub bearbeiten",
    starPrompt: (name: string) => ({
      title: "Hat dir die Seite geholfen?",
      text: `Ein Stern auf GitHub hilft anderen Teams, ${name} zu finden.`,
      button: "Stern",
    }),
    lastUpdated: "Zuletzt aktualisiert",
    notFound: {
      title: "Diese Seite gibt es nicht",
      quote: "Der Link ist vielleicht veraltet. Durchsuche die Doku oder fang auf der Startseite an.",
      linkLabel: "Zur Startseite der Doku",
      linkText: "Zur Startseite der Doku",
    },
    themeConfig: {
      docFooter: { prev: "Vorherige Seite", next: "Nächste Seite" },
      returnToTopLabel: "Nach oben",
      sidebarMenuLabel: "Menü",
      darkModeSwitchLabel: "Erscheinungsbild",
      lightModeSwitchTitle: "Zu hellem Design wechseln",
      darkModeSwitchTitle: "Zu dunklem Design wechseln",
      skipToContentLabel: "Zum Inhalt springen",
    },
    search: {
      translations: {
        button: { buttonText: "Suchen", buttonAriaLabel: "Suchen" },
        modal: {
          displayDetails: "Detaillierte Liste anzeigen",
          resetButtonTitle: "Suche zurücksetzen",
          backButtonTitle: "Suche schließen",
          noResultsText: "Keine Ergebnisse für",
          footer: {
            selectText: "auswählen",
            selectKeyAriaLabel: "Enter",
            navigateText: "navigieren",
            navigateUpKeyAriaLabel: "Pfeil nach oben",
            navigateDownKeyAriaLabel: "Pfeil nach unten",
            closeText: "schließen",
            closeKeyAriaLabel: "Escape",
          },
        },
      },
    },
  },
} satisfies Record<(typeof SPRACHEN)[number], unknown>

// Markenschrift für Mermaid. Mermaid misst Text mit dieser Schrift, darum steht sie hier und nicht
// nur im CSS: Sonst passen Kästen und Beschriftung nicht zusammen.
const SCHRIFT = '"Geist Variable", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

/** base für GitHub Pages: DOCS_BASE (etwa "/bpmn-cli/") aus dem Workflow, lokal "/". */
function basis(wert: string | undefined): string {
  const pfad = (wert ?? "").trim()
  return pfad ? `/${pfad}/`.replace(/\/{2,}/g, "/") : "/"
}

export async function miragonDocs(options: MiragonDocsOptions): Promise<UserConfig<MiragonThemeConfig>> {
  const lang = options.lang ?? "en-US"
  if (!SPRACHEN.includes(lang)) {
    throw new Error(`miragonDocs: lang ist "${lang}", erlaubt sind ${SPRACHEN.join(" und ")}.`)
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo ?? "")) {
    throw new Error(`miragonDocs: repo ist "${options.repo}", erwartet ist "Miragon/<name>".`)
  }
  const texte = TEXTE[lang]
  const base = basis(process.env.DOCS_BASE)
  const repoUrl = `https://github.com/${options.repo}`
  const siteTitle = options.siteTitle ?? options.title.replace(/^Miragon\s+/, "")
  const nav = [...(options.nav ?? [])]
  if (options.productPage) nav.push({ text: "miragon.ai", link: options.productPage })

  const kit: UserConfig<MiragonThemeConfig> = {
    base,
    lang,
    title: options.title,
    description: options.description,
    cleanUrls: true,
    // Aus der Git-Historie. Der Workflow holt sie ganz (fetch-depth: 0).
    lastUpdated: true,

    head: [
      // Das App-Icon von Miragon-Software: der grüne Komet auf der blauen Kachel, unverändert aus
      // der CI. Links im head bekommen die base nicht automatisch.
      ["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo/miragon-komet-blau.svg` }],
      // Browser-Leiste: hell das Blau der Marke, dunkel Schwarz, wie die Doku der CI. Sie folgt dem
      // System, der Umschalter von VitePress ändert die Meta-Tags nicht. Meta-Tags kennen keine
      // CSS-Variablen, darum die Werte von --cd-blau und --cd-ui-seite (dunkel).
      ["meta", { name: "theme-color", content: "#335DE5", media: "(prefers-color-scheme: light)" }],
      ["meta", { name: "theme-color", content: "#1D1D1D", media: "(prefers-color-scheme: dark)" }],
    ],

    // Geist vorladen. Der Dateiname hat einen Hash, ein fester Link im head findet ihn nicht.
    transformHead({ assets }) {
      const geist = assets.find((file) => /geist-latin-wght-normal\.[\w-]+\.woff2$/.test(file))
      if (!geist) return
      return [["link", { rel: "preload", href: geist, as: "font", type: "font/woff2", crossorigin: "" }]]
    },

    markdown: {
      // Codeblöcke liegen auf --cd-ui-abschnitt. Dort hält jede Token-Farbe dieser beiden Themes
      // 4,5:1, hell ab 4,72:1, dunkel ab 4,79:1 (Kommentare). github-light und github-dark nicht.
      theme: { light: "github-light-high-contrast", dark: "github-dark-default" },
      // Anker wie auf GitHub (slug.mjs), damit #anker-Links auf beiden Seiten treffen.
      anchor: { slugify: githubSlug },
    },

    // Mermaid für den Dev-Server vorbündeln: Es importiert CommonJS-Module, die
    // vitepress-plugin-mermaid nicht nennt, in 12 etwa elkjs und dayjs/plugin/duration. Ohne zeigt
    // `vitepress dev` etwa Gantt- und Use-Case-Diagramme nicht.
    vite: { optimizeDeps: { include: ["mermaid"] } },

    // Mermaid misst mit der Markenschrift. neutral ist das graue Theme von Mermaid, die Farben der
    // CI legt theme/miragon.css über die Rollen darüber, im Dunkeln wie im Hellen.
    // look und layout halten das Aussehen von Mermaid 11, wie die App von designIQ: Ohne zeichnet
    // Mermaid 12 im Look neo und legt die Graphen mit ELK neu aus, jedes Diagramm sähe anders aus.
    // dagre steht je Diagrammtyp, der es bisher hatte. Ein layout für alle nähme Mindmaps
    // cose-bilkent und Swimlanes ihre Bahnen.
    mermaid: {
      theme: "neutral",
      look: "classic",
      flowchart: { layout: "dagre" },
      class: { layout: "dagre" },
      state: { layout: "dagre" },
      er: { layout: "dagre" },
      requirement: { layout: "dagre" },
      fontFamily: SCHRIFT,
      themeVariables: { fontFamily: SCHRIFT },
      sequence: { actorFontFamily: SCHRIFT, messageFontFamily: SCHRIFT, noteFontFamily: SCHRIFT },
    },

    themeConfig: {
      siteTitle,
      nav,
      sidebar: options.sidebar ?? [],
      socialLinks: [{ icon: "github", link: repoUrl }, ...(options.socialLinks ?? [])],
      outline: { level: [2, 3], ...(lang === "de-DE" ? { label: "Auf dieser Seite" } : {}) },
      search: { provider: "local", options: texte.search },
      editLink: {
        pattern: `${repoUrl}/edit/${options.branch ?? "main"}/${options.docsDir ?? "docs"}/:path`,
        text: texte.editLink,
      },
      // Ein Datum in der Sprache der Seite („Oct 11, 2026“, „11.10.2026“), keine Uhrzeit.
      lastUpdated: { text: texte.lastUpdated, formatOptions: { dateStyle: "medium", forceLocale: true } },
      notFound: texte.notFound,
      ...texte.themeConfig,
      // Kein footer von VitePress: Er fehlt auf Seiten mit Seitenleiste. Die Rechtsleiste
      // (theme/LegalRow.vue) steht auf jeder Seite.
      // Texte und Links aus legal.ts.
      miragon: {
        legal: miragonLegal({ lang, message: options.footerMessage }),
        github:
          options.githubStars === false
            ? undefined
            : {
                link: repoUrl,
                stars: await sterne(options.repo),
                prompt: texte.starPrompt(options.title.replace(/^Miragon\s+/, "")),
              },
      },
    },
  }

  const durchgereicht = Object.fromEntries(
    Object.entries({
      srcExclude: options.srcExclude,
      rewrites: options.rewrites,
      ignoreDeadLinks: options.ignoreDeadLinks,
      head: options.head,
      markdown: options.markdown,
      vite: options.vite,
      sitemap: options.sitemap,
      mermaid: options.mermaid,
    }).filter(([, wert]) => wert !== undefined),
  )

  // withMermaid rendert ```mermaid-Blöcke als Diagramm.
  return withMermaid(mergeConfig(kit, durchgereicht) as UserConfig) as UserConfig<MiragonThemeConfig>
}
