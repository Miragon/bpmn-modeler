# `@miragon/bpmn-modeler-i18n-extras`

The modeler's own translation overlay on top of the shared
[`@miragon/bpmn-modeler-i18n`](https://github.com/Miragon/camunda-modeler-i18n-plugin/tree/develop/packages/translations)
library. It holds only the strings the shared library lacks, such as the script-lock badge labels and the
popup-menu texts `@miragon/bpmn-modeler` adds. Both npm packages inline it; the webviews, the VS Code
extension and the Orca plugin import it too.

Internal workspace, not published on its own.

## Usage

```ts
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

i18n.extend(extras);
```

The shared translations win for every key they cover; the overlay fills the gap and survives
`setLanguage()`.

`supportedModelerLanguages` is the one list of languages the modeler offers. Copies that cannot import
it are pinned to it: `apps/vscode-plugin/src/manifest.contract.spec.ts` checks the
`miragon.bpmnModeler.language` setting and the table in `docs/vscode/features/language-support.md`, and
IntelliJ's `ModelerLocalesTest` checks `ModelerLocales.kt`.

## Rules

The overlay is temporary debt and should shrink to empty. Three tests keep it honest:

- `overlayScope.spec.ts` fails when the shared library ships a key the overlay still defines, and names
  the keys to delete from `src/languages/*`.
- `overlayNeeded.spec.ts` fails for a key the running modeler never asks for.
- `parity.spec.ts` keeps every offered locale at the same key set with intact `{param}` placeholders.

Which keys the modeler asks for is recorded from the running webviews, not diffed from dictionaries. How
to refresh that record and prune the overlay is in [`tools/README.md`](tools/README.md).
