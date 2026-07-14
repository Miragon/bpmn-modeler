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
    TextEdit,
} from "vscode";

import {
    BeanDef,
    beansFor,
    COMPLEX_TYPES,
    GlobalFunctionDef,
    globalFunctionsFor,
    MethodDef,
    methodsForBean,
    methodsForType,
    TypeDef,
} from "@miragon/bpmn-modeler-core";
import {
    collectLocalDeclarations,
    groovyImportInsertionLine,
    LocalDeclaration,
    matchMemberAccess,
    matchVariableStringArg,
    parseEditorHashFromUri,
    parseKindFromUri,
    ScriptVariableStore,
    SettingsPort,
} from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-shared";

/**
 * Narrow view on {@link ScriptTaskService}: the provider only needs to know
 * whether a document is one of the service's open scripts. Keeps the
 * dependency injectable in tests without constructing the whole service.
 */
export interface OpenScriptRegistry {
    getEditorIdForScriptUri(uriPath: string): string | undefined;
}

/**
 * VS Code language-feature provider that powers the *Camunda-specific* part
 * of IntelliSense for inline Camunda 7 scripts.
 *
 * Since scripts became real files under `tmp/scripting/`, general language
 * intelligence is external tooling's job: tsserver serves JavaScript (typed
 * beans/SPIN via the generated `camunda.d.ts`), and users can install a
 * Groovy/Python/Ruby language server. This provider covers only what no
 * external tool can know — the Camunda execution context:
 *
 * - For Groovy/Python/Ruby: kind-scoped beans and their methods, SPIN
 *   globals, plus a slim local-declaration scan as a fallback for users
 *   without a language server (our root items suppress VS Code's word-based
 *   suggestions, which live in a lower provider group).
 * - For JavaScript: only the dynamic surface a static d.ts cannot express —
 *   process variables and `getVariable("…")` string-argument completion.
 *
 * The provider derives the script's *kind* (script task / execution
 * listener / task listener) from the path slug — written by
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
 * 2. **Member completion**: triggered after a `.` following a known bean, a
 *    cast-typed local (`def node = … as SpinJsonNode`, Groovy/Python/Ruby), or
 *    a process variable carrying a `typeHint` whose catalog type exposes
 *    methods (e.g. a SPIN-typed `var node = S(…)`, gated by `scripting.spin`).
 *    A typed local shadows a same-named process variable, matching runtime
 *    scoping. Returns the methods rendered as snippets so the cursor lands
 *    inside the parentheses with parameter placeholders.
 * 3. **Root completion**: returns the SPIN global functions (`S`/`JSON`, when
 *    the `scripting.spin` setting is on), the bean names, the process
 *    variables, and identifiers declared in the script body (slim lexical
 *    scan — see {@link collectLocalDeclarations}) whenever a word is being
 *    typed at root scope. In Groovy scripts the SPIN items additionally carry
 *    their import statement as an `additionalTextEdits` entry (skipped when
 *    the script already imports the symbol — see
 *    {@link groovyImportInsertionLine}), and importable SPIN type names
 *    (`SpinJsonNode`) are offered as class completions for typed declarations.
 *
 * The provider depends on a {@link ScriptVariableStore} (populated by the
 * webview's live variable extraction) so suggestions reflect the current model
 * without reopening the script.
 */
export class ScriptCompletionProvider implements CompletionItemProvider {
    // Languages this provider participates in. Public so the sibling
    // `ScriptDeclareVariableCodeAction` registers for exactly the same set.
    static readonly LANGUAGES = ["javascript", "groovy", "python", "ruby"] as const;

    /**
     * Path glob matching script files wherever the base directory resolved to
     * (workspace config folder or os tmpdir) — the `tmp/scripting` marker
     * segments are the invariant. A glob can't verify the file is *ours*, so
     * {@link OpenScriptRegistry} is re-checked inside the provider.
     */
    static readonly PATH_GLOB = "**/tmp/scripting/**";

    constructor(
        private readonly store: ScriptVariableStore,
        private readonly settings: SettingsPort,
        private readonly openScripts: OpenScriptRegistry,
    ) {}

    /**
     * Registers the completion provider for every supported language scoped
     * to the script directory. Quote characters trigger variable-name
     * completion inside `getVariable("…`; `.` triggers member completion.
     */
    register(context: ExtensionContext): void {
        for (const language of ScriptCompletionProvider.LANGUAGES) {
            const filter: DocumentFilter = {
                scheme: "file",
                language,
                pattern: ScriptCompletionProvider.PATH_GLOB,
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
        // The glob is a heuristic any same-named user directory satisfies;
        // only documents the service tracks as open scripts get suggestions.
        if (!this.openScripts.getEditorIdForScriptUri(document.uri.path)) {
            return [];
        }
        const kind = parseKindFromUri(document.uri.path);
        if (!kind) {
            return [];
        }
        const beans = beansFor(kind);
        const linePrefix = document.lineAt(position).text.slice(0, position.character);

        // JavaScript gets its static surface (beans, bean methods, SPIN
        // globals, locals) from tsserver via the generated `camunda.d.ts` —
        // duplicating it here would double every entry in the merged list.
        // Only the dynamic, model-derived items stay on this provider.
        const jsAmbient = document.languageId === "javascript";

        // Mode 1: cursor inside a `getVariable("…` style string argument.
        if (matchVariableStringArg(linePrefix)) {
            return this.variableItems(document);
        }

        // A quote trigger that is *not* inside a variable-string argument must
        // not dump bean/root completions into an arbitrary string literal.
        if (context.triggerCharacter === '"' || context.triggerCharacter === "'") {
            return [];
        }

        // Mode 2: member access on a known bean, or on a typed process variable.
        // An unknown qualifier with no resolvable type stays empty; never fall
        // back to root items here.
        const memberAccess = matchMemberAccess(linePrefix);
        if (memberAccess) {
            const bean = beans.find((b) => b.name === memberAccess);
            if (bean) {
                return jsAmbient ? [] : methodsForBean(bean).map(methodToCompletion);
            }
            // Not a bean: a cast-typed local or a producer-heuristic process
            // variable (e.g. SpinJsonNode) may resolve. Gated by the same
            // setting as the SPIN globals — SpinJsonNode is the only type-method
            // surface today, so the flag governs it end to end.
            if (this.settings.getScriptingSpin()) {
                // A typed local wins over a same-named store variable: a `def`
                // re-declaration shadows the process-variable binding at runtime
                // in Groovy, so the lexically visible cast is authoritative.
                // Skipped for JS — tsserver owns JS locals via `camunda.d.ts`.
                if (!jsAmbient) {
                    const local = collectLocalDeclarations(
                        document.getText(),
                        document.languageId,
                    ).find((decl) => decl.name === memberAccess && decl.typeHint);
                    if (local?.typeHint) {
                        return methodsForType(local.typeHint).map(methodToCompletion);
                    }
                }
                const variable = this.variablesFor(document).find((v) => v.name === memberAccess);
                if (variable?.typeHint) {
                    return methodsForType(variable.typeHint).map(methodToCompletion);
                }
            }
            return [];
        }

        // Mode 3: root — globals first, then beans, then process variables, then
        // local declarations. The setting is read live on every invocation, so a
        // toggle takes effect on the next completion request with no reload.
        const spinEnabled = this.settings.getScriptingSpin();
        const globals = spinEnabled && !jsAmbient ? globalFunctionsFor(kind) : [];
        // Importable type names only in Groovy: it is the sole language where a
        // script names a SPIN type directly (`SpinJsonNode node = …`) and where
        // the attached Java-style import line is valid syntax.
        const importableTypes =
            spinEnabled && document.languageId === "groovy"
                ? COMPLEX_TYPES.filter((type) => type.groovyImport)
                : [];
        const scriptText = document.getText();
        const variables = this.variablesFor(document);
        const beanNames = new Set(beans.map((b) => b.name));
        // Catalog/model items win any name clash — they carry type and docs; a
        // same-named local would insert identical text anyway (and a variable
        // named `execution` would be shadowed by the bean at runtime).
        const taken = new Set([
            ...beanNames,
            ...variables.map((v) => v.name),
            ...globals.map((g) => g.name),
            ...importableTypes.map((t) => t.name),
        ]);
        // tsserver already completes JavaScript locals from real source; the
        // lexical fallback only serves the languages without a language server.
        const locals = jsAmbient
            ? []
            : collectLocalDeclarations(scriptText, document.languageId)
                  .filter((decl) => !taken.has(decl.name))
                  // A declaration must not complete itself while it is being
                  // typed. Over-suppression when the name is re-declared on a
                  // later line is accepted as cosmetic.
                  .filter((decl) => decl.line !== position.line);
        const languageId = document.languageId;
        return [
            ...globals.map((fn) =>
                withGroovyImport(globalToCompletion(fn), fn.groovyImport, languageId, scriptText),
            ),
            ...importableTypes.map((type) =>
                withGroovyImport(typeToCompletion(type), type.groovyImport, languageId, scriptText),
            ),
            ...(jsAmbient ? [] : beans.map(beanToCompletion)),
            ...variables.filter((v) => !beanNames.has(v.name)).map(variableToCompletion),
            ...locals.map(localToCompletion),
        ];
    }

    /** Process-variable completions for the editor the script URI belongs to. */
    private variableItems(document: TextDocument): CompletionItem[] {
        return this.variablesFor(document).map(variableToCompletion);
    }

    /**
     * Raw process variables for the editor the script URI belongs to. The
     * member path needs the `typeHint` carried on {@link VariableDef}, which the
     * pre-mapped {@link variableItems} completions discard.
     */
    private variablesFor(document: TextDocument): VariableDef[] {
        const editorHash = parseEditorHashFromUri(document.uri.path) ?? "";
        return this.store.getByEditorHash(editorHash);
    }
}

/**
 * Attaches the symbol's Groovy import as an additional edit, applied together
 * with the completion insert. Groovy-only: the other JSR-223 languages bind
 * SPIN through their own mechanisms (`Java.type`, `from … import`), where a
 * Java-style import line would be a syntax error. Skipped when the script
 * already satisfies the import (exactly or via wildcard).
 */
function withGroovyImport(
    item: CompletionItem,
    groovyImport: string | undefined,
    languageId: string,
    scriptText: string,
): CompletionItem {
    if (!groovyImport || languageId !== "groovy") {
        return item;
    }
    const line = groovyImportInsertionLine(scriptText, groovyImport);
    if (line !== undefined) {
        item.additionalTextEdits = [TextEdit.insert(new Position(line, 0), `${groovyImport}\n`)];
    }
    return item;
}

function typeToCompletion(type: TypeDef): CompletionItem {
    const item = new CompletionItem(type.name, CompletionItemKind.Class);
    // The import statement as detail tells the user which package the bare
    // name will resolve against before they accept.
    item.detail = type.groovyImport;
    item.documentation = new MarkdownString(type.description);
    return item;
}

function localToCompletion(decl: LocalDeclaration): CompletionItem {
    const item = new CompletionItem(
        decl.name,
        decl.kind === "function" ? CompletionItemKind.Function : CompletionItemKind.Variable,
    );
    // A cast-typed local reads like a typed process variable at root.
    item.detail = decl.kind === "function" ? "local function" : (decl.typeHint ?? "local variable");
    return item;
}

function variableToCompletion(variable: VariableDef): CompletionItem {
    const item = new CompletionItem(variable.name, CompletionItemKind.Variable);
    item.detail = variable.typeHint ?? "process variable";
    // Author-supplied description leads; the heuristic `origin` follows as a
    // muted line so a manifest variable reads as documentation, not provenance.
    const docs = variable.description
        ? `${variable.description}\n\n_${variable.origin}_`
        : variable.origin;
    item.documentation = new MarkdownString(docs);
    return item;
}

function beanToCompletion(bean: BeanDef): CompletionItem {
    const item = new CompletionItem(bean.name, CompletionItemKind.Variable);
    item.detail = `${bean.name}: ${bean.type}`;
    item.documentation = new MarkdownString(bean.description);
    return item;
}

function globalToCompletion(fn: GlobalFunctionDef): CompletionItem {
    const item = new CompletionItem(fn.name, CompletionItemKind.Function);
    item.detail = `${fn.name}(${fn.params
        .map((p) => `${p.name}: ${p.type}`)
        .join(", ")}): ${fn.returnType}`;

    // Same snippet convention as methods: drop the cursor on the first
    // parameter, or inside empty parens for zero-arg calls.
    const placeholders = fn.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
    item.insertText = new SnippetString(`${fn.name}(${placeholders})`);

    const paramLines = fn.params.map((p) => `- \`${p.name}\` — \`${p.type}\``);
    const docs = [fn.description, "", ...paramLines].join("\n");
    item.documentation = new MarkdownString(docs);
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
