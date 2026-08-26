---
name: i18n-translate
description: >
  Add or complete translations for the BPMN/DMN modeler UI in the miranum-ide project. Use this skill
  whenever the user wants to add a new language, translate missing keys for an existing locale, fill an
  untranslated modeler UI string, add or maintain the local translation overlay in `libs/bpmn-i18n-extras/`,
  or register a new locale in the i18n system. Also trigger when the user mentions locale codes, language
  names, the language QuickPick, `i18n.extend`, `supportedModelerLanguages`, script-lock badge strings
  ("Read-only", "Being edited in"), or talks about translating modeler UI strings in this repository —
  even if they assume the translations live locally.
---

# i18n Translation Skill

Translate BPMN/DMN modeler UI strings for the miranum-ide extension. **The first job of this skill is
routing**, because the translations no longer all live in this repo.

## The two-layer model (read this before touching any file)

The modeler's UI strings come from two sources, merged at webview startup:

1. **The shared library `@miragon/bpmn-modeler-i18n`** (external npm package, source repo
   [Miragon/camunda-modeler-i18n-plugin](https://github.com/Miragon/camunda-modeler-i18n-plugin/tree/develop/packages/translations)).
   This is authoritative and carries the overwhelming majority of strings: the palette, context pad,
   properties panel, and Camunda-7 (Platform) strings — roughly 1000 keys across 12 locales. **You cannot
   edit these from this repo** — they are in `node_modules/@miragon/bpmn-modeler-i18n/`. Fixing or adding
   them is an *upstream* contribution to that separate repository.

2. **The local overlay `libs/bpmn-i18n-extras/`** (this repo). A deliberately tiny dictionary that fills
   *only* the modeler-internal strings the shared library does not ship in any spelling — today just the
   script-lock badge labels the webview emits (e.g. `Read-only`, `Being edited in`, `Element actions`).
   The webviews merge it on with a consumer-wins `i18n.extend(extras)`, so the shared translation always
   wins for keys it covers and the overlay only fills the residual gap.

Because of this split, "the modeler UI isn't translated in language X" is almost always an *upstream*
problem in the shared library — not something you fix here. Only reach into `libs/bpmn-i18n-extras/` when
the missing string is one of the modeler-internal overlay keys.

## Step 1: Route the request

Identify **which string** is untranslated, then decide the layer. Look it up in the shared library first:

```bash
# Is the English source string already a key the shared library ships?
grep -rn "Boundary Event" node_modules/@miragon/bpmn-modeler-i18n/dist
```

- **Covered by the shared library** (palette/context-pad/properties-panel/Camunda-7 term, or any key the
  grep finds): this is an **upstream** task. It cannot be fixed by editing this repo. Tell the user the
  string lives in `@miragon/bpmn-modeler-i18n` and must be changed in the
  `Miragon/camunda-modeler-i18n-plugin` repository, then re-published and bumped here. Do not create a
  local override to "patch" it — the overlay guards (Step 4) will reject any key the shared library
  already ships, on purpose (a local copy would shadow the authoritative translation and rot silently).

- **A modeler-internal string the shared library lacks** (a label the webview itself emits, like the
  script-lock badges): this belongs in the local overlay. Continue below.

If you are unsure whether a string is genuinely missing everywhere, run the coverage guard — it computes
the exact gap against runtime truth and names any uncovered keys:

```bash
corepack yarn vitest run --project bpmn-i18n-extras
```

## Step 2: Understand the overlay before editing it

The overlay lives entirely in `libs/bpmn-i18n-extras/src/languages/`:

- `<locale>.ts` — one flat dictionary per locale (`de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `nl-nl`,
  `pt-br`, `ru`, `zh-Hans`, `zh-Hant`). English (`en`) is the reference: its keys are the English source
  strings, and every other locale must define **exactly the same key set**.
- `index.ts` — a **generated** barrel mapping each locale to its dictionary (`extras`).

**The key set is not hand-authored.** It is generated from a runtime harvest of every string the running
modeler actually asks to `translate()`, then pruned against the shared library (`tools/build-overlay.mjs`,
see [references/overlay-maintenance.md](references/overlay-maintenance.md)). This is why the files carry a
`GENERATED` header. The *values* (the localized translations) are the human-authored part; the *keys* are
governed by tooling and guards.

There are two distinct tasks, and they touch different things:

- **Translate an existing overlay key into a locale** (fill/fix a value) — a pure translation edit. Safe
  to do by hand. Go to Step 3.
- **Add or remove an overlay key** (a new modeler-internal string appears untranslated) — a key-set
  change. Do *not* just add a key by hand and hope; regenerate through the harvest tooling so the guards
  stay green. See [references/overlay-maintenance.md](references/overlay-maintenance.md).

## Step 3: Translate overlay values

For each key that needs a translation in the target locale, translate the **English key** (the value in
`en.ts`) into the target language. The current key set is small — usually only the handful of script-lock
strings — so this is a quick, high-precision task, not a bulk job.

Translation rules:

- **Never modify the keys.** The object keys (left of the `:`) are English strings used as runtime lookup
  identifiers. Only the values (right side) are translated. Every locale must carry the identical key set —
  the parity guard fails otherwise, and a key present in one locale but missing in another renders as
  untranslated English there, silently.
- Preserve every `{parameter}` placeholder exactly (`{element}`, `{count}`, …). The parity guard fails on
  placeholder drift.
- Never leave a value empty — an empty value fails the parity guard and would render as blank UI.
- Match the tone and casing of the shared library's translations for the same locale, so the overlay
  strings read as part of the same UI. When a locale already has a value, don't overwrite it unless the
  user asked you to.
- Keep industry-standard technical terms untranslated where the language conventionally keeps them (BPMN,
  DMN, FEEL, Camunda, ID, XML, …).

The overlay file format is intentionally trivial — one flat dictionary, `GENERATED` header, no license
header, no per-locale barrel:

```typescript
/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "<translated>",
    "Element actions": "<translated>",
    "Read-only": "<translated>",
};

export default dictionary;
```

Keep the keys in the same order across all locales, double-quoted strings, 4-space indent, trailing comma
on every entry, and end with `export default dictionary;`.

## Step 4: Verify against the guards

The overlay is protected by vitest guards that encode its invariants. Run them after any edit:

```bash
corepack yarn vitest run --project bpmn-i18n-extras
corepack yarn format --loglevel warn
```

What each guard enforces (so a failure message tells you what to fix):

- **`parity.spec.ts`** — every locale defines exactly the reference (`en`) key set, no empty values, every
  `{param}` preserved, and every locale offered in the language QuickPick has an overlay dictionary.
- **`overlayScope.spec.ts`** — the overlay defines no key the shared library already ships (exact or
  normalized casing). A failure names keys to *delete* — the shared library caught up.
- **`overlayNeeded.spec.ts`** — the overlay defines no key the runtime harvest never requested (except the
  `SOURCE_ONLY` allowlist for strings the harvest driver structurally can't reach, like script-lock).
- **`coverage.spec.ts`** — no harvested string is left uncovered by both the shared library and the
  overlay (the no-gaps guard).

## Adding a new language (locale)

A locale can only be offered if the **shared library** ships it — the QuickPick is driven by
`supportedModelerLanguages` (the shared `supportedLanguages` catalogue re-exported from
`libs/bpmn-i18n-extras/src/index.ts`), and the parity guard requires every offered locale to carry an
overlay dictionary. So adding a language is two moves:

1. **Upstream**: the locale must exist in `@miragon/bpmn-modeler-i18n`. If it doesn't, that is a
   contribution to the external repo first — you cannot add a whole language from here.
2. **In this repo**: add `libs/bpmn-i18n-extras/src/languages/<locale>.ts` translating the current overlay
   key set, and register it in the generated `languages/index.ts` barrel (import + entry in `extras`).
   The QuickPick then picks it up automatically via `supportedModelerLanguages`.

Optionally mirror the locale into the settings-dropdown enum in `apps/vscode-plugin/package.json` under
`miragon.bpmnModeler.language` (`enum` + `enumItemLabels`, kept in the same order). This drives the static
Settings-UI dropdown only; the in-modeler QuickPick already comes from `supportedModelerLanguages`.

## Step 5: Summary

After finishing, report:

- The routing decision (shared library / upstream vs. local overlay) and why.
- For overlay edits: the locales and keys translated, and confirmation the `bpmn-i18n-extras` vitest
  project passes.
- Reminder to run `corepack yarn build:libs` and verify in the modeler.
