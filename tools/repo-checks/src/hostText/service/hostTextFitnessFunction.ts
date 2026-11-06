import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { hostTextFindings, isHostFile } from "../domain/hostText";
import type { HostTextSources } from "../port/HostTextSources";

export interface HostTextPorts {
    readonly sources: HostTextSources;
}

export function createHostTextFitnessFunction({ sources }: HostTextPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "host-text",
        version: 2,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "User-visible text written in host code. Host code is every tracked .ts, .tsx, .mts and .cts file, without specs, tests, `__fixtures__` folders and declaration files, that imports `vscode`, or that sits outside libs/modeler-core and holds a class whose implements clause names an interface declared in libs/modeler-core, resolved through barrels and the tsconfig.base.json paths: the bridge's RPC adapters. It is also every tracked .kt file in a src/main/kotlin folder, Gradle's main source set, that imports a com.intellij package, the IntelliJ Platform API. A text is a string literal, a template literal or template expression, or a Kotlin string, raw string or string template, one of whose literal stretches holds two words: two whitespace-separated tokens that each hold a letter or a digit. A placeholder is no word, so a format such as `${a}: ${b}` is none, and neither is punctuation such as `:root {`. Not read: literals in a type or a module specifier, and the arguments of new Error(…), of a call a Kotlin throw raises, of a call to log or to a function whose name starts with log and a capital, and of any call on log, LOG, logger or console. The calls around a literal end at the nearest function or lambda: code a callee runs is no argument it is handed, so a text inside a callback of logAndRethrow(…) is read. One finding per literal, keyed by its path and its text, not its line.",
        reliesOn: {
            skill: "architecture",
            rule: "the core builds every user-visible text, and a host renders it; only host chrome, such as VS Code's Reload Window button, and messages about the host's own failure belong to the host",
        },
        misses: [
            "One-word texts, such as the `Continue` confirm label HostUiRouter.kt falls back to, a placeholder beside one word, such as `${count} files`, and one word among symbols, such as `→ Next`.",
            "Text assembled in another file and handed to host code: a constant or a builder that a host file imports from a file that is not host code.",
            "Kotlin that imports no com.intellij package, such as the locale names of ModelerLocales.kt (17 of 89 files in src/main/kotlin at cd48f2cd, holding 2 user texts and 25 technical ones), Kotlin outside src/main/kotlin, and Kotlin scripts (.kts).",
            "Bridge code that neither imports `vscode` nor implements a core interface, such as its RPC handler tables in adapter/in/.",
            "A text a host shows through a function named log…, through a method of an object named log, LOG, logger or console, or inside a call a Kotlin throw raises.",
        ],
        reportsWrongly: [
            "Host chrome and messages about the host's own failure, which belong to the host: VS Code's `Reload Window` button, `Failed to open compare view: ${…}` when vscode.diff fails, IntelliJ's action, editor, file type and status widget names, the JCEF-unavailable labels and ProcessSupervisor.kt's crash balloons. The 33 texts of the IntelliJ settings page, ModelerSettingsConfigurable.kt, describe the settings VS Code's package.json describes; whether the two are pinned to each other is a separate decision.",
            "Technical strings with spaces: the HTML shells and CSS class lists of WebviewHtml.ts, DeploymentWebviewHtml.ts and WebviewServer.kt (39 findings), the JavaScript the JCEF editors run, the DMN template of NewDmnModelAction.kt, credential service names, and an error text a host matches, such as `not a registered configuration`.",
            "Log text that reaches a logger through a parameter or under another name, such as the ready messages composition/editorFeature.ts hands to the core's displayDocumentHandler, the RPC error texts RpcChannel.kt replies with, a Kotlin log call on a call's result, such as thisLogger().warn(…), and a log message built in a lambda, such as Kotlin's lazy log.debug { … }.",
            "The text of Kotlin's error(…), require(…) and check(…), which throw: the UI DSL's validation error(…) shows its text, and a callee name cannot tell the two apart, so both are read, such as the developer error of BridgeBinaryResolver.kt.",
            "A text split by + is one finding per literal. A text moved to another file or renamed with its file shows as new, because the key names the file.",
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
        ],
        findFindings: ({ repoRoot }) =>
            hostTextFindings(
                sources
                    .readDependencies(repoRoot)
                    .filter(isHostFile)
                    .map(({ path }) => ({ path, texts: sources.readTexts(repoRoot, path) })),
            ),
    });
}
