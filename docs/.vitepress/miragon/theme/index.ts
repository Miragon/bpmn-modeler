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
import GitHubStars from "./GitHubStars.vue"
import StarPrompt from "./StarPrompt.vue"

// Im Titel jeder Seite steht der Komet statt der Wortmarke, daneben der Produktname
// (theme/miragon.css, Abschnitt TITEL: KOMET UND PRODUKTNAME).
// Der Komet ist inline, so braucht er keinen Pfad mit base.
const KOMET =
  "M0,89.63l220.2-14.78c11.65-.78,23.38-2.66,33.31-5.14s22.92-8.94,29.16-19.41c3.65-6.12,5.09-13.73,5.38-18.91,.27-4.94-.99-10.2-2.54-13.33-2.76-5.55-6.11-8.42-8.55-10.26-2.45-1.84-7.55-5.77-18.08-7.35-10.53-1.58-29.62,1.2-44.31,5.84C199.87,10.92,0,89.63,0,89.63Z"
const Komet: FunctionalComponent = () =>
  h("svg", { class: "miragon-komet", viewBox: "0 0 288.08 89.63", role: "img", "aria-label": "Miragon" }, [
    h("path", { d: KOMET, fill: "#00E676" }),
  ])
// Das Layout von VitePress mit GitHub und Sternen im Header, der Bitte um einen Stern am
// Seitenende und der Rechtsleiste ganz unten. Slots von außen reicht es weiter,
// auch einen eigenen layout-bottom, der dann über der Rechtsleiste steht.
const Layout: FunctionalComponent = (_, { slots }) =>
  h(DefaultTheme.Layout, null, {
    ...slots,
    "nav-bar-title-before": () => [slots["nav-bar-title-before"]?.(), h(Komet)],
    "nav-bar-content-after": () => [slots["nav-bar-content-after"]?.(), h(GitHubStars)],
    "doc-footer-before": () => [slots["doc-footer-before"]?.(), h(StarPrompt)],
    "layout-bottom": () => [slots["layout-bottom"]?.(), h(LegalRow)],
  })

const MiragonTheme: Theme = {
  extends: DefaultTheme,
  Layout,
}

export default MiragonTheme
