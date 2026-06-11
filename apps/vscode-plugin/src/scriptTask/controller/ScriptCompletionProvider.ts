import {
    CompletionContext,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    DocumentFilter,
    ExtensionContext,
    languages,
    MarkdownString,
    Position,
    SnippetString,
    TextDocument,
} from "vscode";

import { BeanDef, beansFor, MethodDef, methodsForBean } from "@miragon/bpmn-modeler-core";
import {
    matchMemberAccess,
    matchVariableStringArg,
    parseEditorHashFromUri,
    parseKindFromUri,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-shared";

/**
 * VS Code language-feature provider that powers IntelliSense for inline
 * Camunda 7 scripts across all supported languages (JavaScript, Groovy,
 * Python, Ruby).
 *
 * VS Code's `tsserver` does not enumerate sibling files of a custom URI
 * scheme through `FileSystemProvider`s, so a `camunda.d.ts` written next
 * to a virtual `.js` file in the `bpmn-script://` filesystem is invisible
 * to the inferred TypeScript project. We therefore drive JavaScript
 * IntelliSense through the same `CompletionItemProvider` path as the other
 * JSR-223 languages, keeping behaviour and method signatures consistent.
 *
 * The provider derives the script's *kind* (script task / execution
 * listener / task listener) from the URI path slug — written by
 * {@link ScriptTaskService} when it opens the document — and uses
 * {@link beansFor} to determine which globals are in scope. This keeps
 * suggestions accurate per surface (e.g. `task` only appears in task
 * listeners; `eventName` only in listener kinds).
 *
 * Three modes, in order:
 *
 * 1. **Variable-name completion**: triggered inside the string argument of a
 *    `getVariable`/`setVariable`/… call. Returns the editor's process
 *    variables (from {@link ScriptVariableStore}).
 * 2. **Member completion**: triggered after a `.` following a known bean.
 *    Returns the bean's methods rendered as snippets so the cursor lands
 *    inside the parentheses with parameter placeholders.
 * 3. **Root completion**: returns the bean names plus the process variables
 *    whenever a word is being typed at root scope.
 *
 * The provider depends on a {@link ScriptVariableStore} (populated by the
 * webview's live variable extraction) so suggestions reflect the current model
 * without reopening the script.
 */
export class ScriptCompletionProvider implements CompletionItemProvider {
    // Languages this provider participates in.
    private static readonly LANGUAGES = ["javascript", "groovy", "python", "ruby"] as const;

    constructor(private readonly store: ScriptVariableStore) {}

    /**
     * Registers the completion provider for every supported language scoped
     * to the `bpmn-script` scheme. Quote characters trigger variable-name
     * completion inside `getVariable("…`; `.` triggers member completion.
     */
    register(context: ExtensionContext): void {
        for (const language of ScriptCompletionProvider.LANGUAGES) {
            const filter: DocumentFilter = {
                scheme: "bpmn-script",
                language,
            };
            context.subscriptions.push(
                languages.registerCompletionItemProvider(filter, this, ".", '"', "'"),
            );
        }
    }

    provideCompletionItems(
        document: TextDocument,
        position: Position,
        _token: unknown,
        context: CompletionContext,
    ): CompletionItem[] {
        const kind = parseKindFromUri(document.uri.path);
        if (!kind) {
            return [];
        }
        const beans = beansFor(kind);
        const linePrefix = document.lineAt(position).text.slice(0, position.character);

        // Mode 1: cursor inside a `getVariable("…` style string argument.
        if (matchVariableStringArg(linePrefix)) {
            return this.variableItems(document);
        }

        // A quote trigger that is *not* inside a variable-string argument must
        // not dump bean/root completions into an arbitrary string literal.
        if (context.triggerCharacter === '"' || context.triggerCharacter === "'") {
            return [];
        }

        // Mode 2: member access on a known bean. An unknown qualifier (e.g. a
        // user's own variable `myVar.`) stays empty — no type info until later
        // phases; never fall back to root items here.
        const memberAccess = matchMemberAccess(linePrefix);
        if (memberAccess) {
            const bean = beans.find((b) => b.name === memberAccess);
            return bean ? methodsForBean(bean).map(methodToCompletion) : [];
        }

        // Mode 3: root — beans first, then process variables, beans winning any
        // name clash (a variable named `execution` would be shadowed anyway).
        const beanNames = new Set(beans.map((b) => b.name));
        const variableItems = this.variableItems(document).filter(
            (item) => !beanNames.has(item.label as string),
        );
        return [...beans.map(beanToCompletion), ...variableItems];
    }

    /** Process-variable completions for the editor the script URI belongs to. */
    private variableItems(document: TextDocument): CompletionItem[] {
        const editorHash = parseEditorHashFromUri(document.uri.path) ?? "";
        return this.store.getByEditorHash(editorHash).map(variableToCompletion);
    }
}

function variableToCompletion(variable: VariableDef): CompletionItem {
    const item = new CompletionItem(variable.name, CompletionItemKind.Variable);
    item.detail = variable.typeHint ?? "process variable";
    item.documentation = new MarkdownString(variable.origin);
    return item;
}

function beanToCompletion(bean: BeanDef): CompletionItem {
    const item = new CompletionItem(bean.name, CompletionItemKind.Variable);
    item.detail = `${bean.name}: ${bean.type}`;
    item.documentation = new MarkdownString(bean.description);
    return item;
}

function methodToCompletion(method: MethodDef): CompletionItem {
    const item = new CompletionItem(method.name, CompletionItemKind.Method);
    item.detail = `${method.name}(${method.params
        .map((p) => `${p.name}: ${p.type}`)
        .join(", ")}): ${method.returnType}`;

    // Snippet places the cursor on the first parameter so the user can
    // type-tab through. For zero-arg methods we close the parens immediately.
    const placeholders = method.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
    item.insertText = new SnippetString(`${method.name}(${placeholders})`);

    const paramLines = method.params.map((p) => `- \`${p.name}\` — \`${p.type}\``);
    const docs = [method.description, "", ...paramLines].join("\n");
    item.documentation = new MarkdownString(docs);
    return item;
}
