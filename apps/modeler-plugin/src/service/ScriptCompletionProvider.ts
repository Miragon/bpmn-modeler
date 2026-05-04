import {
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

import {
    BeanDef,
    beansFor,
    MethodDef,
    methodsForBean,
} from "../domain/scriptApi";
import {
    matchMemberAccess,
    parseKindFromUri,
} from "./scriptCompletionHelpers";

/**
 * VS Code language-feature provider that powers IntelliSense for inline
 * Camunda 7 scripts authored in Groovy, Python, or Ruby.
 *
 * JavaScript scripts get IntelliSense for free via the TypeScript language
 * service (which discovers the sibling `camunda.d.ts` we write into the
 * virtual filesystem). The other JSR-223 languages have no equivalent
 * declaration mechanism, so we register a `CompletionItemProvider` and a
 * `HoverProvider` keyed to the `bpmn-script://` scheme that supplies the
 * same API surface.
 *
 * The provider derives the script's *kind* (script task / execution
 * listener / task listener) from the URI path slug — written by
 * {@link ScriptTaskService} when it opens the document — and uses
 * {@link beansFor} to determine which globals are in scope. This keeps
 * suggestions accurate per surface (e.g. `task` only appears in task
 * listeners; `eventName` only in listener kinds).
 *
 * Two modes:
 *
 * 1. **Member completion**: triggered after a `.` following a known bean.
 *    Returns the bean's methods rendered as snippets so the cursor lands
 *    inside the parentheses with parameter placeholders.
 * 2. **Root completion**: returns the bean names themselves whenever a
 *    word is being typed at root scope.
 */
export class ScriptCompletionProvider implements CompletionItemProvider {
    /** Languages this provider participates in. */
    private static readonly LANGUAGES = ["groovy", "python", "ruby"] as const;

    /**
     * Registers the completion provider for every supported non-JS language
     * scoped to the `bpmn-script` scheme.
     */
    register(context: ExtensionContext): void {
        for (const language of ScriptCompletionProvider.LANGUAGES) {
            const filter: DocumentFilter = {
                scheme: "bpmn-script",
                language,
            };
            context.subscriptions.push(
                languages.registerCompletionItemProvider(
                    filter,
                    this,
                    ".",
                ),
            );
        }
    }

    provideCompletionItems(
        document: TextDocument,
        position: Position,
    ): CompletionItem[] {
        const kind = parseKindFromUri(document.uri.path);
        if (!kind) {
            return [];
        }
        const beans = beansFor(kind);

        const linePrefix = document
            .lineAt(position)
            .text.slice(0, position.character);

        const memberAccess = matchMemberAccess(linePrefix);
        if (memberAccess) {
            const bean = beans.find((b) => b.name === memberAccess);
            if (!bean) {
                return [];
            }
            return methodsForBean(bean).map(methodToCompletion);
        }

        return beans.map(beanToCompletion);
    }
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
    const placeholders = method.params
        .map((p, i) => `\${${i + 1}:${p.name}}`)
        .join(", ");
    item.insertText = new SnippetString(`${method.name}(${placeholders})`);

    const paramLines = method.params.map(
        (p) => `- \`${p.name}\` — \`${p.type}\``,
    );
    const docs = [method.description, "", ...paramLines].join("\n");
    item.documentation = new MarkdownString(docs);
    return item;
}
