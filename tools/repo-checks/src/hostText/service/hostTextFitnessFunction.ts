import { defineFitnessFunction, type FitnessFunction } from "../../fitness/domain/fitnessFunction";
import { hostTextFindings, isHostFile } from "../domain/hostText";
import type { HostTextSources } from "../port/HostTextSources";

export interface HostTextPorts {
    readonly sources: HostTextSources;
}

export function createHostTextFitnessFunction({ sources }: HostTextPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "host-text",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "User-visible text written in host code. Host code is every tracked .ts, .tsx, .mts and .cts file, without specs, tests, `__fixtures__` folders and declaration files, that imports `vscode`, or that sits outside libs/modeler-core and holds a class whose implements clause names an interface declared in libs/modeler-core, resolved through barrels and the tsconfig.base.json paths: the bridge's RPC adapters. A text is a string literal, a plain template literal or a template expression one of whose literal stretches holds whitespace between two non-space characters; a placeholder is no word, so a format such as `${a}: ${b}` is none. Not read: literals in a type or a module specifier, and the arguments of new Error(…), of a call to log or to a function whose name starts with log and a capital, and of any call on logger or console. One finding per literal, keyed by its path and its text, not its line.",
        reliesOn: {
            skill: "architecture",
            rule: "the core builds every user-visible text, and a host renders it; only host chrome, such as VS Code's Reload Window button, and messages about the host's own failure belong to the host",
        },
        misses: [
            "One-word texts, such as the `Continue` confirm label HostUiRouter.kt falls back to, and a placeholder beside one word, such as `${count} files`.",
            "Text assembled in another file and handed to host code: a constant or a builder that a host file imports from a file that is not host code.",
            "Kotlin: the IntelliJ routers and actions, such as the dialog of AddMarketplaceAction.kt, and the two error texts ProcessSupervisor.kt shows.",
            "Bridge code that neither imports `vscode` nor implements a core interface, such as its RPC handler tables in adapter/in/.",
            "A text a host shows through a function named log… or through a method of an object named logger or console.",
        ],
        reportsWrongly: [
            "Host chrome and messages about the host's own failure, which belong to the host: VS Code's `Reload Window` button, `Failed to open compare view: ${…}` when vscode.diff fails, the `write to` fragment of VsCodeEditorHandle's write error.",
            "Technical strings with spaces: the HTML shells and CSS class lists of WebviewHtml.ts and DeploymentWebviewHtml.ts, Markdown formats of completion items, and an error text a host matches, such as `not a registered configuration`.",
            "Log text that reaches a logger through a parameter or under another name, such as the ready messages composition/editorFeature.ts hands to the core's displayDocumentHandler.",
            "A text split by + is one finding per literal. A text moved to another file or renamed with its file shows as new, because the key names the file.",
        ],
        evidence: [
            {
                kind: "trial",
                commit: "3d1b19b3",
                outcome:
                    "PR 2047: ElementTemplateEditorController.ts sat in controller/, outside the infrastructure/VsCode*.ts name scope, which matched 27 files; the report lists its 7 texts, among them `${…} already exists in ${…}.`, the folder-pick placeholder `Workspace folder for the new element template` and `New Element Template`. 55 host files, 55 findings in 12 files",
            },
            {
                kind: "trial",
                commit: "8d75923b",
                outcome:
                    "65 host files: 48 import vscode and 17 only implement a core interface, 14 of them the bridge's RPC adapters, which hold no text; the name scope matches none since the role-folder move. 49 findings in 11 files: 30 texts the VS Code host builds (18 in TemplateMarketplaceController.ts, 5 in BpmnCompareController.ts, 3 completion labels, 2 each in ElementTemplateEditorController.ts and releaseNotes.ts), 3 correct host texts, 16 technical strings or log text; about 0.35 s per tree",
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
