#!/usr/bin/env node
// @ts-check
/**
 * Miragon-Doku-Kit: prüft die vendorte Kopie im Repo.
 *
 * Quelle: Miragon/corporate-identity, Skill docs-site. Im Repo liegt die Datei unverändert unter
 * docs/.vitepress/miragon/check.mjs, das Manifest daneben. Ohne Abhängigkeiten, Node 20 oder neuer.
 *
 *   node docs/.vitepress/miragon/check.mjs
 *       Jede Datei aus manifest.json (Kit unter docs/.vitepress/miragon/, Logos unter
 *       docs/public/logo/) ist da und byte-gleich, im Ordner des Kits liegt nichts anderes.
 *       So läuft es in der CI des Repos.
 *   node docs/.vitepress/miragon/check.mjs --ci <Pfad zu Miragon/corporate-identity>
 *       Zusätzlich gegen einen Klon der CI: Jede Datei ist byte-gleich mit ihrer Quelle dort.
 *       So siehst du, ob das Kit veraltet ist, bevor du es neu vendorst.
 *   --root <Pfad>  Wurzel des Repos, Standard: drei Ordner über dieser Datei.
 *
 * Exit 0, wenn alles stimmt, 1 bei Drift, 2 bei falschem Aufruf.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const QUELLE_IN_CI = join('plugins', 'miragon-brand', 'skills', 'docs-site', 'assets')

/** @typedef {{ pfad: string, quelle: string, sha256: string }} Datei */
/** @typedef {{ version: string, dateien: Datei[] }} Manifest */

/** @param {string} name @returns {string | undefined} */
function wert(name) {
  const i = process.argv.indexOf(name)
  if (i === -1) return undefined
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) abbruch(`${name} braucht einen Pfad.`)
  return v
}
/** @param {string} text @returns {never} */
function abbruch(text) {
  console.error(`Kit: ${text}`)
  console.error('Aufruf: node docs/.vitepress/miragon/check.mjs [--ci <Pfad zu Miragon/corporate-identity>] [--root <Pfad>]')
  process.exit(2)
}
const sha256 = (/** @type {string} */ datei) => createHash('sha256').update(readFileSync(datei)).digest('hex')
/** @param {string} ordner @returns {string[]} */
function dateienIn(ordner) {
  return readdirSync(ordner).filter((name) => name !== '.DS_Store').flatMap((name) => {
    const pfad = join(ordner, name)
    return statSync(pfad).isDirectory() ? dateienIn(pfad) : [pfad]
  })
}
/** @param {string} pfad @returns {Manifest} */
function lies(pfad) {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'))
  } catch (fehler) {
    return abbruch(`${pfad} fehlt oder ist kein JSON (${fehler instanceof Error ? fehler.message : fehler}).`)
  }
}

const root = resolve(wert('--root') ?? join(HIER, '..', '..', '..'))
const ci = wert('--ci')
const manifest = lies(join(HIER, 'manifest.json'))
/** @type {string[]} */
const befunde = []
let hinweis = ''

// 1. Die Kopie gegen ihr Manifest.
for (const { pfad, sha256: soll } of manifest.dateien) {
  const datei = join(root, pfad)
  if (!existsSync(datei)) befunde.push(`${pfad} fehlt.`)
  else if (sha256(datei) !== soll) befunde.push(`${pfad} weicht vom Kit ab (im Repo geändert?).`)
}
const bekannt = new Set(manifest.dateien.map((d) => resolve(root, d.pfad)))
for (const datei of dateienIn(HIER)) {
  if (datei === join(HIER, 'manifest.json') || bekannt.has(datei)) continue
  befunde.push(`${relative(root, datei).split(sep).join('/')} gehört nicht zum Kit.`)
}

// 2. Optional gegen die Quelle in einem Klon der CI.
if (ci) {
  const assets = resolve(ci, QUELLE_IN_CI)
  const quellManifest = join(assets, 'miragon', 'manifest.json')
  if (!existsSync(quellManifest)) abbruch(`${quellManifest} fehlt. Zeigt --ci auf Miragon/corporate-identity?`)
  const neu = lies(quellManifest)
  const hier = new Set(manifest.dateien.map((d) => d.pfad))
  for (const { pfad, quelle } of neu.dateien) {
    const datei = join(root, pfad)
    if (!hier.has(pfad)) befunde.push(`${pfad} ist neu im Kit der CI.`)
    else if (existsSync(datei) && sha256(datei) !== sha256(join(assets, quelle))) {
      befunde.push(`${pfad} ist veraltet, die CI hat eine neuere Fassung.`)
    }
  }
  const dort = new Set(neu.dateien.map((d) => d.pfad))
  for (const { pfad } of manifest.dateien) if (!dort.has(pfad)) befunde.push(`${pfad} gibt es im Kit der CI nicht mehr.`)
  // Nur die Version anders, die Dateien gleich: Das Kit hat sich seitdem nicht geändert.
  if (manifest.version !== neu.version) hinweis = ` (CI ${neu.version}, das Kit ist seit ${manifest.version} gleich)`
}

if (befunde.length) {
  for (const befund of befunde) console.error(`Kit: ${befund}`)
  console.error(
    `\n${befunde.length} Befund(e). Das Kit kommt unverändert aus Miragon/corporate-identity (Skill docs-site).` +
      ' Nicht im Repo ändern, sondern neu vendoren, siehe die Skill.'
  )
  process.exit(1)
}
console.log(`Kit ${manifest.version}: ${manifest.dateien.length} Dateien unverändert${ci ? ` und gleich mit der CI${hinweis}` : ''}.`)
