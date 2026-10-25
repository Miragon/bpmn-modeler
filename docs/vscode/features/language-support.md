# Language support

Run the modeler UI (palette, context pad, properties panel) in your own language, for BPMN and DMN.

## Languages

| Locale | Language |
|---|---|
| `de` | Deutsch |
| `en` | English (default) |
| `es` | Español |
| `fr` | Français |
| `it` | Italiano |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `nl-nl` | Nederlands |
| `pt-br` | Português (Brasil) |
| `ru` | Русский |
| `zh-Hans` | 简体中文 (Simplified Chinese) |
| `zh-Hant` | 繁体中文 (Traditional Chinese) |

## Change the language

- **Command:** run **Miragon BPMN Modeler: Change Modeler Language** and pick a language. The command is available while a modeler tab is open and saves your choice in your User settings.
- **Setting:** set `miragon.bpmnModeler.language` to one of the locale codes above. The Settings editor dropdown does not list `it`, `ja` and `ko` yet; pick those with the command or enter them in `settings.json`.

The change applies at once to every open modeler tab.

## Next steps

- [Configuration](/vscode/configuration): every other setting.
- [Editor modes](/vscode/features/modes): View, Design and Implement.
