# `@miragon/bpmn-modeler-i18n`

Runtime language switching for the modeler UI. Translates bpmn-js and dmn-js
labels, `@bpmn-io/properties-panel` field captions/descriptions, and the app's
own strings (diff legend, resizer toggle, …). Ships German, English (default),
Spanish, French, Dutch, Brazilian Portuguese, Russian, and Simplified /
Traditional Chinese — each locale assembled from four flat dictionaries
(`bpmn-js`, `dmn-js`, `properties-panel`, `other`). Keys are the English source
strings; `{param}` placeholders are substituted at lookup time, and a missing
key falls back to the English source.

## Translations are machine-assisted — native speakers welcome

`en` is the canonical key set; every other locale is held to _exact_ key parity
with it by the `keyParity.spec.ts` guardrail (no missing keys, no extras). To
reach that parity a large share of the non-English values were **generated with
LLM assistance** (seeded with the German/Spanish references and the project
glossary) rather than written by native speakers. They preserve `{param}`
placeholders and keep industry-standard terms (BPMN, DMN, FEEL, …) untranslated,
but the phrasing has not been reviewed by native speakers for every locale.

**Contributions from native speakers are very welcome.** To improve a locale,
edit the values in `src/languages/<locale>/{bpmn-js,dmn-js,properties-panel,other}.ts`
— never touch the keys (they are the English lookup identifiers). `corepack yarn
test` enforces that your changes keep the locale at full key parity with `en`.

## How it works

A single `CustomTranslator` instance is exported as the shared singleton
`i18n`. `TranslateModule` is a didi module that binds that same instance as the
`customTranslator` service and as the `translate(template, replacements)`
factory bpmn-js calls during rendering. `i18n.setLanguage(locale)` atomically
swaps the active dictionary and fires `onChange` listeners so UI that lives
_outside_ the bpmn-js DI container can re-render.

## Why this lives in its own library

- **One translator, two scopes.** bpmn-js internals reach the translator only
  through their private DI container (via the `translate` factory), while
  webview UI that sits outside that container — the diff legend, the resizer
  toggle — can't inject DI services and must import `i18n` directly. Exporting
  the _same_ instance both as a didi module and as a singleton is what keeps the
  two scopes in sync on a language change; that dual shape is the reason it is
  its own package rather than folded into the webview or `shared`.
- **The extension host needs the catalogue too.** `supportedLanguages` (label +
  locale per language) feeds the host's language QuickPick, so the metadata has
  to be importable from both the webview and the Node-side plugin.

## Usage

```ts
import { TranslateModule, i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";

// In bpmn-js: register the didi module.
new BpmnModeler({ additionalModules: [TranslateModule] });

// Anywhere (DI or not): switch language; bpmn-js picks it up, onChange listeners re-render.
i18n.setLanguage("de");

// Outside the DI container: translate directly and react to changes.
const label = i18n.translate("Added");
const off = i18n.onChange(() => updateLabels());
```

```ts
// Extension host: drive a QuickPick from the catalogue.
import { supportedLanguages } from "@miragon/bpmn-modeler-i18n";

const items = supportedLanguages.map((l) => ({ label: l.label, description: l.locale }));
```
