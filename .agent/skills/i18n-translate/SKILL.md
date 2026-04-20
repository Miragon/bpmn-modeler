---
name: i18n-translate
description: >
  Add or complete translations for the BPMN/DMN modeler UI in the miranum-ide project. Use this skill
  whenever the user wants to add a new language, translate missing keys for an existing locale, update
  translations, or register a new locale in the i18n system. Also trigger when the user mentions locale
  codes, language names, or talks about translating modeler UI strings in this repository.
---

# i18n Translation Skill

Translate BPMN/DMN modeler UI strings into a target language for the miranum-ide VS Code extension.
The translation library lives in `libs/bpmn-i18n/` and uses TypeScript with `Record<string, string>`
dictionaries. The English translation files serve as the reference for all dictionary keys — keys are
English source strings and values are translations.

## When to use

- Adding a brand-new language to the modeler
- Filling gaps in an existing language (keys present in English but missing in the target)
- Updating or replacing translations for an existing locale

## Inputs

The user provides:
- **Target language** — a language name (e.g. "Spanish", "Japanese") or locale code (e.g. "es", "ja")

## Workflow

### Step 1: Determine locale code and label

Map the user's input to:
- A **locale code** for directory naming (e.g. `es`, `ja`, `ko`). Use lowercase, hyphens for regional
  variants (e.g. `pt-br`, `zh-Hans`) — match the conventions of existing locales.
- A **TypeScript import name** — camelCase, safe for use in import statements (e.g. `ptBr`, `zhHans`).
- A **display label** in the target language's native script (e.g. "Español", "日本語").

Confirm the locale code, import name, and display label with the user before proceeding.

### Step 2: Read the English base files

Read all four English translation source files to get the complete set of keys:

```
libs/bpmn-i18n/src/languages/en/bpmn-js.ts
libs/bpmn-i18n/src/languages/en/dmn-js.ts
libs/bpmn-i18n/src/languages/en/properties-panel.ts
libs/bpmn-i18n/src/languages/en/other.ts
```

Each file exports a `Record<string, string>` where keys and values are English strings (identity mapping).
These keys are the lookup identifiers used by the bpmn-js translate service at runtime.

Also read the German (`de`) files as a secondary reference — they are the most complete translations and
can help clarify meaning for ambiguous English keys.

### Step 3: Determine which keys need translation

- **New language**: All keys from all four English files need translation.
- **Existing language**: Read the target language's files, diff against the English files, and identify
  missing keys. Only translate the missing ones — do not overwrite existing translations.

### Step 4: Translate

For each key that needs translation, translate the **English key** (which is also the English value)
into the target language.

Translation rules:
- The **object keys** (left side of the `:`) are English strings used as runtime lookup identifiers.
  **Never modify the keys.** Only translate the values (right side).
- Preserve `{parameter}` placeholders exactly as they appear (e.g. `{element}`, `{count}`, `{semantic}`).
- Keep technical terms that are industry-standard and not typically translated:
  BPMN, DMN, FEEL, CMMN, PMML, Gateway, Pool, Lane, Token, ID, XML, JSON, ISO 8601, EL, JUEL, Groovy,
  JRuby, Python, Java, JavaScript, Zeebe, Camunda, UTC, QName.
- For BPMN/DMN domain terms (e.g. "Boundary Event", "Intermediate Catch Event", "Decision Table",
  "Hit Policy"), use the established translations for that language if they exist in the BPMN/DMN
  community. If unsure, keep the English term and add the translation in parentheses.
- Preserve trailing/leading spaces if the English value has them — they are intentional for UI concatenation.
- Match the casing style of the existing translations (e.g. if German capitalizes the first word only,
  apply the same pattern in the target language, respecting that language's conventions).
- Strings like `"-"`, `"BPMN"`, `"DMN"`, `"ID"`, `"FEEL"` that are identical across languages should
  remain identical in the target language too.

Translate in batches per file. After each file, briefly summarize the count of translated keys.

### Step 5: Write the translation files

Create the four translation files under `libs/bpmn-i18n/src/languages/<locale>/`.
See [references/file-template.md](references/file-template.md) for the exact file format.

Key points:
- Include the Apache 2.0 license header (Copyright 2025 Miragon GmbH)
- Use the TypeScript `const translations: Record<string, string> = { ... };` pattern
- Keep keys in the same order as the English source files
- One key-value pair per line, double-quoted strings, trailing comma on each entry
- End with `export default translations;`

For **existing languages** where you are filling gaps: insert the new keys at the position matching
their order in the English file, so the file stays consistently ordered.

### Step 6: Write the barrel file

Create the barrel file at `libs/bpmn-i18n/src/languages/<locale>/index.ts`:

```typescript
import bpmnJs from "./bpmn-js";
import dmnJs from "./dmn-js";
import propertiesPanel from "./properties-panel";
import other from "./other";

/** Merged translation dictionary for this locale. */
const dictionary: Record<string, string> = {
    ...bpmnJs,
    ...dmnJs,
    ...propertiesPanel,
    ...other,
};

export default dictionary;
```

Match the exact style of any existing locale's `index.ts` (e.g. `de/index.ts`).

### Step 7: Register the language (new languages only)

Skip this step if the language already exists in the registry.

1. **`libs/bpmn-i18n/src/languages/index.ts`** — Three changes:
   - Add an import for the new locale (alphabetical placement among existing imports)
   - Add the locale to the `SupportedLocale` union type
   - Add an entry to the `supportedLanguages` array with the native display label
   - Add the locale to the `dictionaries` map

2. **`apps/modeler-plugin/package.json`** — Under `miragon.bpmnModeler.language`:
   - Add the locale code to the `enum` array
   - Add the native display label to the `enumItemLabels` array
   - Both arrays must stay in the same order

### Step 8: Summary

After all files are written, output a summary:
- Language added/updated: name and locale code
- Files created or modified (with paths)
- Total keys translated per file
- Reminder to run `corepack yarn build:libs` and test in the modeler
