/**
 * Miragon-Doku-Kit: Typen zu slug.mjs, damit TypeScript den Import in config.ts auch ohne
 * allowJs kennt. Quelle: Miragon/corporate-identity, Skill docs-site.
 */

/** Anker einer Überschrift wie auf GitHub, aus „Changes from 0.6“ wird `changes-from-06`. */
export declare function githubSlug(text: string): string
