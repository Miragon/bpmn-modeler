/**
 * Miragon-Doku-Kit: das Theme einer Miragon-Doku.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo liegt die Datei unverändert unter
 * docs/.vitepress/miragon/theme/index.ts. docs/.vitepress/theme/index.ts reicht sie weiter:
 *
 *   export { default } from "../miragon/theme"
 *
 * Eigene Komponenten oder Slots kommen dort dazu, das Kit bleibt unverändert:
 *
 *   import MiragonTheme from "../miragon/theme"
 *   export default {
 *     extends: MiragonTheme,
 *     Layout: () => h(MiragonTheme.Layout, null, { "home-hero-image": () => h(Bild) }),
 *     enhanceApp({ app }) { app.component("Beispiel", Beispiel) },
 *   }
 */
import type { Theme } from "vitepress"
// Ohne Inter von VitePress: Die Schrift der CI ist Geist, selbst gehostet über @fontsource
// (kursiv für Hervorhebungen), die Seite lädt keine Schrift von einem CDN.
import DefaultTheme from "vitepress/theme-without-fonts"
import { h, type FunctionalComponent } from "vue"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist/wght-italic.css"
import "@fontsource-variable/geist-mono"
// Tokens und Rollen der CI (Doku-Variante, dunkel über html.dark), dann die Zuordnung.
import "./cd-tokens.generated.css"
import "./miragon.css"
import LegalRow from "./LegalRow.vue"

// Das Layout von VitePress mit der Rechtsleiste ganz unten. Slots von außen reicht es weiter,
// auch einen eigenen layout-bottom, der dann über der Rechtsleiste steht.
const Layout: FunctionalComponent = (_, { slots }) =>
  h(DefaultTheme.Layout, null, {
    ...slots,
    "layout-bottom": () => [slots["layout-bottom"]?.(), h(LegalRow)],
  })

const MiragonTheme: Theme = {
  extends: DefaultTheme,
  Layout,
}

export default MiragonTheme
