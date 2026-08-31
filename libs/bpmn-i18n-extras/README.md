# `@miragon/bpmn-modeler-i18n-extras`

The modeler's local translation **overlay** on top of the shared
[`@miragon/bpmn-modeler-i18n`](https://github.com/Miragon/camunda-modeler-i18n-plugin/tree/develop/packages/translations)
library.

The shared library ships this modeler's Camunda-7 (Platform) palette /
context-pad / properties-panel strings (`en` ≈ 1016 keys, 12 locales), so this
overlay covers **only the handful of modeler-internal strings the shared library
lacks** — today just the script-lock badge labels the webview emits (`Read-only`,
`Being edited in`). The webviews merge them onto the shared dictionaries at
startup:

```ts
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

i18n.extend(extras); // consumer-wins merge; persists across setLanguage()
```

The shared translations stay authoritative for every key they cover; the overlay
only fills the residual gap.

## Exports

- **`extras`** — `Partial<Record<SupportedLocale, Record<string, string>>>`, the
  overlay keys per locale (English source string → localized value), for the
  nine locales the modeler fully covers (`de`, `en`, `es`, `fr`, `nl-nl`,
  `pt-br`, `ru`, `zh-Hans`, `zh-Hant`).
- **`supportedModelerLanguages`** — the shared `supportedLanguages` catalogue
  narrowed to those nine locales. The shared library additionally bundles `it`,
  `ja`, and `ko` — fully covered for the main UI, including C7 — but the overlay
  has no `it`/`ja`/`ko` translation for the script-lock badge strings yet, so
  they are withheld from the extension host's language QuickPick to keep coverage
  uniform. Add those overlay values and the locales surface here automatically.

## How the key set is chosen (runtime harvest)

The key set is chosen against **runtime truth**, not a static dictionary diff. A
browser driver records every template the running modeler passes to `translate()`
(`tools/harvest-drain.js`). `tools/build-overlay.mjs` then keeps an overlay key
only when the shared library has no entry for it (exact or normalized) **and**
the harvest recorded the modeler asking for it — plus a small `SOURCE_ONLY`
allowlist for strings the webview emits from a feature the harvest driver does
not exercise (script-lock). Everything else is dropped: keys the shared library
now covers (the upstreamed C7 strings and legacy casing twins), unwired dmn-js
labels, bpmn-js import diagnostics, and diagram/test junk. Two guards keep it
honest — `overlayScope.spec.ts` forbids any key the shared library covers, and
`overlayNeeded.spec.ts` forbids any key the harvest never requests.

## Maintaining the overlay (shrinking it)

The overlay is temporary debt: as the shared library grows, the residual keys
here become redundant. `overlayScope.spec.ts` enforces the cleanup — it fails the
moment the shared library ships a key the overlay still defines, naming the keys
to delete from `src/languages/*`. `parity.spec.ts` keeps every locale at the same
key set with intact `{param}` placeholders. See `tools/README.md` to refresh the
harvest and re-prune.
