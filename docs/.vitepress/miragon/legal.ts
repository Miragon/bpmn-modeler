/**
 * Miragon-Doku-Kit: Texte und Links der Rechtsleiste (theme/LegalRow.vue).
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo liegt die Datei unverändert unter
 * docs/.vitepress/miragon/legal.ts. miragonDocs() setzt damit themeConfig.miragon.legal. Eine
 * VitePress-Seite ohne miragonDocs (etwa die Doku der CI) ruft miragonLegal() selbst auf.
 *
 * Impressum (§ 5 DDG) und Datenschutzerklärung (Art. 13 DSGVO) müssen von jeder Seite erreichbar
 * sein. Die Seiten dahinter sind deutsch, darum heißen die Links in jeder Sprache so.
 */

export interface MiragonLegal {
  /** Name der Navigation für Screenreader. */
  label: string
  copyright: string
  /** Ein Satz vor dem Copyright, etwa die Lizenz. */
  message?: string
  links: { text: string; link: string }[]
}

/** Was die Rechtsleiste aus themeConfig liest. */
export interface MiragonLegalThemeConfig {
  miragon?: { legal?: MiragonLegal }
}

export const IMPRESSUM = "https://www.miragon.io/impressum/"
export const DATENSCHUTZ = "https://www.miragon.io/datenschutz/"

const LABEL = { "en-US": "Legal", "de-DE": "Rechtliches" } as const

/** Texte und Links der Rechtsleiste für themeConfig.miragon.legal. */
export function miragonLegal(options: { lang?: "en-US" | "de-DE"; message?: string } = {}): MiragonLegal {
  return {
    label: LABEL[options.lang ?? "en-US"],
    copyright: `© ${new Date().getFullYear()} Miragon GmbH`,
    ...(options.message ? { message: options.message } : {}),
    links: [
      { text: "Impressum", link: IMPRESSUM },
      { text: "Datenschutz", link: DATENSCHUTZ },
    ],
  }
}
