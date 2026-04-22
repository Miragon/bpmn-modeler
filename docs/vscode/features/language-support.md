# Language Support

The BPMN Modeler extension supports multiple UI languages for the modeler interface. Translations cover the palette, context pad, properties panel, and other modeler UI elements for both BPMN and DMN diagrams.

## Supported Languages

| Locale | Language |
|---|---|
| `de` | Deutsch |
| `en` | English (default) |
| `fr` | Fran&ccedil;ais |
| `nl-nl` | Nederlands |
| `pt-br` | Portugu&ecirc;s (Brasil) |
| `ru` | Русский |
| `zh-Hans` | 简体中文 (Simplified Chinese) |
| `zh-Hant` | 繁体中文 (Traditional Chinese) |

## Usage

There are two ways to change the modeler language:

1. **VS Code Setting** — set `miragon.bpmnModeler.language` in your settings to one of the locale codes above.
2. **Command Palette** — run `BPMN Modeler: Change Modeler Language` (command ID `bpmn-modeler.changeLanguage`) to pick a language from a QuickPick menu. The command is available when at least one BPMN editor is open.

The language change takes effect immediately on all open modeler tabs.

---

For implementation details, see [Contributing → Language Support internals](/vscode/contributing/architecture/language-support).
