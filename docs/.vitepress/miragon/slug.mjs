// @ts-check
/**
 * Miragon-Doku-Kit: Anker der Überschriften wie auf GitHub.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo liegt die Datei unverändert unter
 * docs/.vitepress/miragon/slug.mjs. Nicht dort ändern, sondern in der CI.
 *
 * Die Doku wird auch auf GitHub gelesen. Ein Link wie `usage.md#changes-from-06` muss dort und auf
 * der Seite dieselbe Überschrift treffen, also nimmt VitePress die Regel von GitHub (wie
 * github-slugger): klein schreiben, alles streichen außer Buchstaben, Zeichen mit Akzent, Ziffern,
 * Verbindern wie `_`, Bindestrich und Leerzeichen, dann jedes Leerzeichen zu `-`. Bindestriche
 * werden nicht zusammengefasst und nicht abgeschnitten, Umlaute bleiben. Aus „Changes from 0.6“
 * wird `changes-from-06` (VitePress allein machte `changes-from-0-6`), aus „Über uns“ `über-uns`.
 * Doppelte Überschriften zählt markdown-it-anchor wie GitHub hoch: `setup`, `setup-1`, `setup-2`.
 */

const NICHT_IM_ANKER = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control} -]/gu

/**
 * Anker einer Überschrift wie auf GitHub.
 * @param {string} text Text der Überschrift ohne Markdown, wie markdown-it-anchor ihn übergibt
 * @returns {string}
 */
export function githubSlug(text) {
  return text.toLowerCase().replace(NICHT_IM_ANKER, '').replace(/ /g, '-')
}
