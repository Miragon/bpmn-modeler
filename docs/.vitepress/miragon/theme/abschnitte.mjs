// @ts-check
/**
 * Miragon-Doku-Kit: die Abschnittsfarben von Mermaid aus den Rollen der CI.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo liegt die Datei unverändert unter
 * docs/.vitepress/miragon/theme/abschnitte.mjs.
 *
 * Mermaid färbt Mindmaps, Zeitleisten, Git-Graphen, Torten, Venn-Mengen, Treemaps, Radar- und
 * xy-Diagramme je Abschnitt und leitet die Farben sonst aus seinem Theme ab: hell Grautöne, die auf
 * Weiß kaum zu sehen sind, dunkel Weinrot und Petrol. Die Palette von designIQ
 * (Miragon/design-iq#329) setzt sie selbst, aus zwei Grautönen der CI im Wechsel, jeder mit der
 * Schrift, die auf ihm 4,5:1 hält: ungerade Nummern kontur mit Schwarz, gerade text-leise mit der
 * Seitenfarbe (hell Weiß, dunkel Schwarz). Mermaid zählt den ersten Ast einer Mindmap, das erste
 * Tortenstück, den ersten Zweig nach main und die erste Venn-Menge als 1. Wurzel und main sind die
 * Textfarbe mit der Seitenfarbe als Schrift, der Rahmen eines hervorgehobenen Commits die
 * Textfarbe. Mermaid braucht Farbwerte, keine var(): Die Rollen liest abschnittsfarben() deshalb
 * bei jedem Zeichnen aus der Seite, so passen sie zum Modus.
 */

/** Wie viele nummerierte Farben Mermaid je Palette kennt. */
const ABSCHNITTE = 12
const ZWEIGE = 8
const STUECKE = 12
const MENGEN = 8
const BEREICHE = 8

/**
 * Die Variablen für themeVariables. rolle(name) liefert den Wert einer CSS-Variable der CI im
 * aktuellen Modus, etwa rolle("--cd-ui-kontur") → "#8F8A8A". dunkel sagt, ob die Seite dunkel ist.
 * @param {(name: string) => string | undefined} rolle
 * @param {boolean} [dunkel]
 */
export function abschnittsfarben(rolle, dunkel = false) {
  /** @param {number} n */
  const grau = (n) =>
    n % 2
      ? { flaeche: rolle("--cd-ui-kontur"), schrift: rolle("--cd-schwarz") }
      : { flaeche: rolle("--cd-ui-text-leise"), schrift: rolle("--cd-ui-seite") }
  /**
   * @param {string} name
   * @param {number} von
   * @param {number} bis
   * @param {(n: number) => string | undefined} wert
   */
  const nummern = (name, von, bis, wert) =>
    Object.fromEntries(Array.from({ length: bis - von + 1 }, (_, i) => [`${name}${von + i}`, wert(von + i)]))
  return {
    ...nummern("cScale", 0, ABSCHNITTE - 1, (n) => grau(n).flaeche),
    ...nummern("cScaleLabel", 0, ABSCHNITTE - 1, (n) => grau(n).schrift),
    ...nummern("cScalePeer", 0, ABSCHNITTE - 1, (n) => grau(n).flaeche),
    ...nummern("cScaleInv", 0, ABSCHNITTE - 1, (n) => grau(n).flaeche),
    git0: rolle("--cd-ui-text"),
    gitBranchLabel0: rolle("--cd-ui-seite"),
    ...nummern("git", 1, ZWEIGE - 1, (n) => grau(n).flaeche),
    ...nummern("gitBranchLabel", 1, ZWEIGE - 1, (n) => grau(n).schrift),
    ...nummern("gitInv", 0, ZWEIGE - 1, () => rolle("--cd-ui-text")),
    ...nummern("pie", 1, STUECKE, (n) => grau(n).flaeche),
    ...nummern("venn", 1, MENGEN, (n) => grau(n).flaeche),
    ...nummern("fillType", 0, BEREICHE - 1, (n) => (n % 2 ? rolle("--cd-ui-abschnitt") : rolle("--cd-ui-seite"))),
    // Hell blasst Mermaid die Tortenstücke auf 70 % ab, Schwarz hält darauf mindestens 5,5:1. Dunkel
    // stünde ein abgeblasstes Grau zu nah am Schwarz der Seite, die Stücke sind dort deckend.
    pieOpacity: dunkel ? "1" : "0.7",
    pieSectionTextColor: rolle("--cd-schwarz"),
    // Mermaid hellt das erste Viertel ohne Betrag auf und schreibt hsl(0, 0%, NaN%).
    quadrantPointFill: rolle("--cd-ui-text"),
    radar: { graticuleColor: rolle("--cd-ui-linie") },
    xyChart: { plotColorPalette: [1, 2].map((n) => grau(n).flaeche).join(",") },
  }
}

/**
 * Setzt die Abschnittsfarben in die Mermaid-Konfiguration von vitepress-plugin-mermaid ein, als
 * Getter: Das Plugin zeichnet bei jedem Wechsel des Modus neu und liest themeVariables dann
 * wieder, die Getter lesen die Rollen in diesem Moment aus der Seite. Ohne Seite (beim Bauen)
 * bleiben sie leer, Mermaid nimmt dann seine eigenen Werte.
 */
export function abschnittsfarbenEinsetzen(/** @type {{ themeVariables?: Record<string, any> }} */ konfiguration) {
  /** @type {Map<boolean, ReturnType<typeof abschnittsfarben>>} */
  const jeModus = new Map()
  const lesen = () => {
    if (typeof document === "undefined") return undefined
    const dunkel = document.documentElement.classList.contains("dark")
    if (!jeModus.has(dunkel)) {
      const stil = getComputedStyle(document.documentElement)
      const farben = abschnittsfarben((name) => stil.getPropertyValue(name).trim() || undefined, dunkel)
      // Ohne die Token-CSS gibt es keine Rollen, dann nichts merken und Mermaid seine Werte lassen.
      if (!farben.cScale0) return undefined
      jeModus.set(dunkel, farben)
    }
    return jeModus.get(dunkel)
  }
  const variablen = (konfiguration.themeVariables ??= {})
  /** @type {Record<string, string>} */
  const verschachtelt = { radar: "graticuleColor", xyChart: "plotColorPalette" }
  for (const name of Object.keys(abschnittsfarben(() => ""))) {
    const schluessel = verschachtelt[name]
    if (schluessel) {
      Object.defineProperty((variablen[name] ??= {}), schluessel, {
        get: () => /** @type {any} */ (lesen())?.[name][schluessel],
        enumerable: true,
        configurable: true,
      })
      continue
    }
    Object.defineProperty(variablen, name, {
      get: () => /** @type {any} */ (lesen())?.[name],
      enumerable: true,
      configurable: true,
    })
  }
}
