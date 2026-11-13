import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { hostTextFindings, isHostFile } from "../domain/hostText";
import type { HostTextSources } from "../port/HostTextSources";

export interface HostTextPorts {
    readonly sources: HostTextSources;
}

export function createHostTextFitnessFunction({ sources }: HostTextPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "host-text",
        version: 4,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "User-visible text written in host code. Host code is every tracked .ts, .tsx, .mts and .cts file, without specs, tests, `__fixtures__` folders and declaration files, that imports `vscode`, or that sits outside libs/modeler-core and holds a class whose implements clause names an interface declared in libs/modeler-core, resolved through barrels and the tsconfig.base.json paths: the bridge's RPC adapters. It is also every tracked .kt file in a src/main/kotlin folder, Gradle's main source set, that imports a com.intellij package, the IntelliJ Platform API. A text is a string literal, a template literal or template expression, or a Kotlin string, raw string or string template, one of whose literal stretches holds two words: two whitespace-separated tokens that each hold a letter or a digit. A placeholder is no word, so a format such as `${a}: ${b}` is none, and neither is punctuation such as `:root {`. Markup is no word either: a tag, from a < before a letter, ! or / to the next > or the end of the literal, placeholders inside it included, and the content of a title, style or script element, which a page does not show; so an HTML shell of structure, title, style and script holds no text, and a text in its body or after a tag, such as `<code>marketplace.json</code>, one per line`, does. Not read: literals in a type or a module specifier, and the arguments of new Error(…), of a call a Kotlin throw raises, of a TypeScript call to log or to a function whose name starts with log and a capital, the members of the core's LoggerPort, of a TypeScript call on console, the global Console, and of a Kotlin call on an IntelliJ logger: a value the file declares from Logger.getInstance(…), as a property, a top-level value or a constructor property's default, and thisLogger(), each imported from com.intellij.openapi.diagnostic or called fully qualified; in Kotlin a call on a call's result is a call on that call's callee, so thisLogger().warn(…) is not read, and neither is the lambda after the parentheses of require(…), check(…), requireNotNull(…) or checkNotNull(…), which throw its message. log… is the one product name the rule reads; a spec fails when it no longer matches a text in host code. The calls around a literal end at the nearest function or lambda: code a callee runs is no argument it is handed, so a text inside a callback of logAndRethrow(…) is read. One finding per literal, keyed by its path and its text, not its line.",
        reliesOn: {
            skill: "architecture",
            rule: "the core builds every user-visible text, and a host renders it; only host chrome, such as VS Code's Reload Window button, and messages about the host's own failure belong to the host",
        },
        misses: [
            "One-word texts, such as the `Continue` confirm label HostUiRouter.kt falls back to, a placeholder beside one word, such as `${count} files`, and one word among symbols, such as `→ Next`.",
            "Text assembled in another file and handed to host code: a constant or a builder that a host file imports from a file that is not host code.",
            "Kotlin that imports no com.intellij package, such as the locale names of ModelerLocales.kt (17 of 89 files in src/main/kotlin at cd48f2cd, holding 2 user texts and 25 technical ones), Kotlin outside src/main/kotlin, and Kotlin scripts (.kts).",
            "Bridge code that neither imports `vscode` nor implements a core interface, such as its RPC handler tables in adapter/in/.",
            "A text a host shows through a TypeScript function named log… or through console, through a Kotlin IntelliJ logger, inside a call a Kotlin throw raises, or in the message lambda of require(…), check(…), requireNotNull(…) or checkNotNull(…).",
            "Text in markup a user sees without it being element text: an attribute such as title, alt, placeholder or aria-label, and a text in angle brackets that reads as a tag, such as `<none selected>`. At fe75e584 no dropped row is one.",
        ],
        reportsWrongly: [
            "Host chrome and messages about the host's own failure, which belong to the host: VS Code's `Reload Window` button, `Failed to open compare view: ${…}` when vscode.diff fails, IntelliJ's action, editor, file type and status widget names, the JCEF-unavailable labels and ProcessSupervisor.kt's crash balloons. The 33 texts of the IntelliJ settings page, ModelerSettingsConfigurable.kt, describe the settings VS Code's package.json describes; whether the two are pinned to each other is a separate decision.",
            "Technical strings with spaces: CSS class lists and attributes written outside a tag, such as `panel-resizer collapsed` in WebviewHtml.ts, CSS values such as a font-family list, MIME types, the JavaScript the JCEF editors run, the DMN template of NewDmnModelAction.kt (an XML declaration is no tag, and the template names its decision `Decision 1`), credential service names, and an error text a host matches, such as `not a registered configuration`.",
            "Log text that reaches a logger the rule does not know, such as the ready messages composition/editorFeature.ts hands to the core's displayDocumentHandler and the RPC error texts RpcChannel.kt replies with. In TypeScript only the log… functions and console count: no variable name makes a logger, so a text handed to a VS Code LogOutputChannel or to an object named logger is read; at c001a82f none is. In Kotlin a logger handed in as a parameter without a Logger.getInstance(…) default, or held by delegation such as by lazy, is read; at c001a82f none is. A Kotlin log message built in a lambda or in a braced if, when or try block, such as log.debug { … } or log.warn(if (a) { … } else { … }), is read too: the calls around a literal end at any brace, and the tree holds no such message at cd48f2cd.",
            "Text a helper receives as a parameter and only interpolates into new Error(…), such as the verb `write to` that VsCodeEditorHandle.ts hands its assertWritableFileSystem: only a literal written inside new Error(…) is left unread. The message of new TypeError(…) or of a subclass of Error is read, as the callee Error is matched by name; telling a subclass by type would take a type program over the host workspaces, and host code constructs none with a text at c001a82f.",
            "The text of Kotlin's error(…), which throws: the UI DSL's validation error(…) shows its text, and a callee name cannot tell the two apart, so both are read, such as the developer error of BridgeBinaryResolver.kt. A precondition's message written inside its parentheses, require(ok, { … }), is read too.",
            "The message of an exception Kotlin constructs without throwing it, such as completeExceptionally(IllegalStateException(…)) or Result.failure(IOException(…)): without new a constructor cannot be told from a call, and the tree constructs none at cd48f2cd.",
            "A text split by + is one finding per literal. A text moved to another file shows as new, because the key names the file.",
        ],
        evidence: [
            {
                kind: "trial",
                commit: "3d1b19b3",
                outcome:
                    "PR 2047: ElementTemplateEditorController.ts sat in controller/, outside the infrastructure/VsCode*.ts name scope, which matched 27 files; the report lists its 7 texts, among them `${…} already exists in ${…}.`, the folder-pick placeholder `Workspace folder for the new element template` and `New Element Template`. 127 host files, 55 TypeScript and 72 Kotlin; 205 findings in 45 files",
            },
            {
                kind: "trial",
                commit: "cd48f2cd",
                outcome:
                    "956 files read, 89 of them Kotlin. 137 host files: 48 import vscode, 17 only implement a core interface, 72 Kotlin files import com.intellij. 197 findings in 43 files. TypeScript: 52 in 12 files, 35 texts the VS Code host builds (18 in TemplateMarketplaceController.ts; 5 in CommandController.ts that version 1 skipped inside logAndRethrow(…), among them `Select the modeler language`, which IntelliJ words `Select the modeler UI language`). Kotlin: 145 in 31 files: 25 texts the IntelliJ host builds (8 in AddMarketplaceAction.kt, 7 in RemoveMarketplaceAction.kt, among them `No marketplaces registered.`, which TemplateMarketplaceController.ts words as well), 33 on the settings page, 13 host chrome, 24 messages about the host's own failure and 50 technical strings. Not read: 35 two-word Kotlin texts in log calls, 1 in a thrown constructor. Requiring a letter or digit on both sides of the whitespace drops 9 findings, all punctuation such as `:root {`. 0.46 to 0.70 s per tree, version 1 0.40 to 0.68 s in the same runs",
            },
            {
                kind: "trial",
                commit: "fe75e584",
                outcome:
                    "Version 3 against version 2, the same counts at 862b8a02: 156 to 112 findings, 44 dropped, none added. Markup, 41: 33 in WebviewServer.kt (its three page shells written line by line: doctype, html, meta, link, body, div and script tags, two document titles, one style element), 7 in WebviewHtml.ts, DeploymentWebviewHtml.ts and AddOnsViewHtml.ts (6 page shells of structure, a title and a script each, and WebviewHtml.ts's DMN properties panel markup, a fragment of tags) and RpcChannel.kt's log redaction marker `<redacted: credential-bearing frame>`. Kotlin preconditions, 3: the require(…) invariants of TemplatePreferences.kt (2) and PluginApprovalStore.kt (1). No dropped row is a text a user sees; the 6 literals that start with a tag and hold text stay: the JCEF-unavailable labels of BpmnDiffViewer.kt and ModelerToolWindowFactory.kt, the out-of-process notice of ModelerBrowsers.kt (2) and comments on the settings page (2). Rejected: a literal that starts with `<!DOCTYPE` drops 9 and leaves 30 lines of the Kotlin shells; a literal that starts with a tag drops 47, those 6 user texts among them; tags without the title, style and script content drop 33 and leave 5 TypeScript shells, whose titles hold two words. The trial of issue 2238 at each PR's final head against its merge base: 18 new rows (the trial's 17 and PR 2359's moved `Failed to open compare view: ${…}`) become 7. Gone: the 6 shell rows (PRs 2309, 2325 twice, 2326, 2359 twice), the 3 require(…) rows (PRs 2279, 2307 twice) and 2 of PR 2310's 8, moved shell lines. 0.48 to 0.49 s per tree, version 2 0.48 to 0.57 s in the same runs",
            },
            {
                kind: "trial",
                commit: "c001a82f",
                outcome:
                    "Version 4 against version 3: 112 findings both, the same keys. Kotlin loggers come from their declarations instead of the names log, LOG, logger, thisLogger and console: 17 host files declare one from Logger.getInstance(…), all named log, and 41 two-word texts in 16 of them stay unread; no host file calls thisLogger(). TypeScript keeps log… for the core's LoggerPort (7 texts in 5 files), console (none) and new Error (9 texts); dropping log, LOG and logger adds no finding, as the one text on this.logger goes to logWarning(…). Rejected: deciding log calls and Error subclasses by type. A type program over apps/vscode-plugin and apps/modeler-bridge, resolving the 257 calls that hold a literal, took 1.5 to 2.1 s on a working tree with node_modules (two runs) and would change no finding. 0.20 to 0.41 s per tree warm, version 3 0.17 to 0.19 s in the same runs",
            },
        ],
        findFindings: ({ repoRoot }) =>
            hostTextFindings(
                sources
                    .readDependencies(repoRoot)
                    .filter(isHostFile)
                    .map(({ path, importedSpecifiers }) => ({
                        path,
                        importedSpecifiers,
                        ...sources.readSource(repoRoot, path),
                    })),
            ),
    });
}
