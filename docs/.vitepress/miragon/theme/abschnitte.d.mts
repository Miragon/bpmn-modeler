/**
 * Miragon-Doku-Kit: Typen zu abschnitte.mjs, damit TypeScript den Import in theme/index.ts auch
 * ohne allowJs kennt. Quelle: Miragon/corporate-identity, Skill docs-site.
 */

/** Die Abschnittsfarben von Mermaid (themeVariables) aus den Rollen eines Modus. */
export declare function abschnittsfarben(
  rolle: (name: string) => string | undefined,
  dunkel?: boolean,
): Record<string, string | Record<string, string | undefined> | undefined>

/** Setzt die Abschnittsfarben als Getter in die Mermaid-Konfiguration, sie lesen die Rollen beim Zeichnen. */
export declare function abschnittsfarbenEinsetzen(konfiguration: { themeVariables?: Record<string, unknown> }): void
