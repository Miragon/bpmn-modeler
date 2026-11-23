import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { hostTextFindings, isHostFile } from "../domain/hostText";
import type { HostTextSources } from "../port/HostTextSources";
import { HOST_TEXT_EVIDENCE } from "./hostTextEvidence";

export interface HostTextPorts {
    readonly sources: HostTextSources;
}

export function createHostTextFitnessFunction({ sources }: HostTextPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "host-text",
        version: 5,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "User-visible text written in host code. Host code is every tracked .ts, .tsx, .mts and .cts file, without specs (a name ending in .spec or .test and a .js or .ts extension, so `a.spec.data.ts` is read), declaration files and files in a `__fixtures__`, `__tests__`, `test` or `tests` folder, that imports `vscode`, or that sits outside libs/modeler-core and holds a class whose implements clause names an interface declared in libs/modeler-core, resolved through barrels and the tsconfig.base.json paths: the bridge's RPC adapters. It is also every tracked .kt file in a src/main/kotlin folder, Gradle's main source set, that imports a com.intellij package, the IntelliJ Platform API. A text is a string literal, a template literal or template expression, or a Kotlin string, raw string or string template, one of whose literal stretches holds two words: two whitespace-separated tokens that each hold a letter or a digit. A placeholder is no word, so a format such as `${a}: ${b}` is none, and neither is punctuation such as `:root {`. Markup is no word either: a tag, from a < before a letter, ! or / to the next > or the end of the literal, placeholders inside it included, and the content of a title, style or script element, which a page does not show; so an HTML shell of structure, title, style and script holds no text, and a text in its body or after a tag, such as `<code>marketplace.json</code>, one per line`, does. Not read: literals in a type or a module specifier, and the arguments of new Error(…), of a call a Kotlin throw raises, of a TypeScript call to log or to a function whose name starts with log and a capital, the members of the core's LoggerPort, and of a Kotlin call on an IntelliJ logger: a value the file declares from Logger.getInstance(…), logger<T>() or fileLogger(), as a property, a top-level value or a constructor property's default, each imported from com.intellij.openapi.diagnostic or called fully qualified, and thisLogger(), imported from there; in Kotlin a call on a call's result is a call on that call's callee, so thisLogger().warn(…) is not read, and neither is the lambda after the parentheses of require(…), check(…), requireNotNull(…) or checkNotNull(…), which throw its message. Two names stay, log… and the global Error; a spec fails when either no longer takes a text in host code. The calls around a literal end at the nearest function or lambda: code a callee runs is no argument it is handed, so a text inside a callback of logAndRethrow(…) is read. One finding per literal, keyed by its path and its text, not its line.",
        reliesOn: {
            skill: "architecture",
            rule: "the core builds every user-visible text, and a host renders it; only host chrome, such as VS Code's Reload Window button, and messages about the host's own failure belong to the host",
        },
        misses: [
            "One-word texts, such as the `Continue` confirm label HostUiRouter.kt falls back to, a placeholder beside one word, such as `${count} files`, and one word among symbols, such as `→ Next`.",
            "Text assembled in another file and handed to host code: a constant or a builder that a host file imports from a file that is not host code.",
            "Kotlin that imports no com.intellij package, such as the locale names of ModelerLocales.kt (17 of 89 files in src/main/kotlin at cd48f2cd, holding 2 user texts and 25 technical ones), Kotlin outside src/main/kotlin, and Kotlin scripts (.kts).",
            "Bridge code that neither imports `vscode` nor implements a core interface, such as its RPC handler tables in adapter/in/.",
            "A text a host shows through a TypeScript function named log…, such as a private logError helper, through a Kotlin IntelliJ logger, inside a call a Kotlin throw raises, or in the message lambda of require(…), check(…), requireNotNull(…) or checkNotNull(…).",
            "Text in markup a user sees without it being element text: an attribute such as title, alt, placeholder or aria-label, and a text in angle brackets that reads as a tag, such as `<none selected>`. At fe75e584 no dropped row is one.",
        ],
        reportsWrongly: [
            "Host chrome and messages about the host's own failure, which belong to the host: VS Code's `Reload Window` button, `Failed to open compare view: ${…}` when vscode.diff fails, IntelliJ's action, editor, file type, status widget and tool window names, the JCEF-unavailable labels and ProcessSupervisor.kt's crash balloons. The 33 texts of the IntelliJ settings page, ModelerSettingsConfigurable.kt, describe the settings VS Code's package.json describes; whether the two are pinned to each other is a separate decision.",
            "Technical strings with spaces: CSS class lists and attributes written outside a tag, CSS values such as a font-family list, MIME types such as `text/plain; charset=utf-8` in WebviewServer.kt, the JavaScript the JCEF editors run, the DMN template of NewDmnModelAction.kt (an XML declaration is no tag, and the template names its decision `Decision 1`), credential service names, and an error text a host matches, such as `not a registered configuration`.",
            "Log text that reaches a logger the rule does not know, such as the ready messages composition/editorFeature.ts hands to the core's displayDocumentHandler and the RPC error texts RpcChannel.kt replies with. In TypeScript only the log… functions count: no variable name makes a logger, so a text handed to console, to a VS Code LogOutputChannel or to an object named logger is read; at c001a82f none is. In Kotlin a logger handed in as a parameter without a logger factory as its default, held by delegation such as by lazy, or taken from a fully qualified thisLogger() is read, as a call site names only its receiver's callee; at c001a82f none is. A Kotlin log message built in a lambda or in a braced if, when or try block, such as log.debug { … } or log.warn(if (a) { … } else { … }), is read too: the calls around a literal end at any brace, and the tree holds no such message at cd48f2cd.",
            "Text a helper receives as a parameter and only interpolates into new Error(…), such as the verb `write to` that VsCodeEditorHandle.ts hands its assertWritableFileSystem: only a literal written inside new Error(…) is left unread. The message of new TypeError(…) or of a subclass of Error is read, as the callee Error is matched by name; telling a subclass by type would take a type program over the host workspaces, and host code constructs none with a text at c001a82f.",
            "The text of Kotlin's error(…), which throws: the UI DSL's validation error(…) shows its text, and a callee name cannot tell the two apart, so both are read, such as the developer error of BridgeBinaryResolver.kt. A precondition's message written inside its parentheses, require(ok, { … }), is read too.",
            "The message of an exception Kotlin constructs without throwing it, such as completeExceptionally(IllegalStateException(…)) or Result.failure(IOException(…)): without new a constructor cannot be told from a call, and the tree constructs none at cd48f2cd.",
            "A text split by + is one finding per literal. A text moved to another file shows as new, because the key names the file.",
        ],
        evidence: HOST_TEXT_EVIDENCE,
        // In two trials no new row on a pull request led to a change; the review reads them all.
        changesView: "full-report-only",
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
