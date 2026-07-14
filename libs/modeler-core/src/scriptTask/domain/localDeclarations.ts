/**
 * Lexical scan for identifiers declared in an inline script body, feeding the
 * root-completion mode of the script completion provider.
 *
 * VS Code's suggest model is winner-takes-all by provider group: because the
 * script provider always returns root items (the Camunda beans at minimum),
 * the built-in word-based provider — which would otherwise complete a local
 * `def myVar` — is never consulted. Locals therefore have to come from us.
 *
 * This is a deliberately slim, line-based fallback, not a parser: inline
 * scripts are short snippets, and once scripts live on disk (#1219) external
 * language servers own general language intelligence. Known, accepted gaps:
 * multi-declarators (`def a, b`), destructuring, dotted type names
 * (`java.util.List x`), function parameters, and declaration-shaped text
 * inside block comments or multiline strings.
 *
 * Groovy variable declarations additionally carry an inferred `typeHint`
 * (see {@link inferGroovyTypeHint}) so member completion can resolve a
 * cast-typed local (`def node = … as SpinJsonNode`). Accepted gaps there:
 * dotted type names in casts (`as org.camunda.spin.json.SpinJsonNode`), a
 * cast not at end of line (`(a as SpinJsonNode).prop(…)`), a later typed
 * re-declaration of a name first declared untyped (dedup keeps the first),
 * and a bare `def x` cast on a separate later assignment line.
 */

/** A single identifier declared in the script body. */
export interface LocalDeclaration {
    readonly name: string;
    /**
     * 0-based line of the first declaration — lets the provider suppress a
     * declaration completing itself while it is being typed.
     */
    readonly line: number;
    readonly kind: "variable" | "function";
    /**
     * Inferred Groovy type name (`SpinJsonNode`, `String`, `List`, …), when the
     * declaration line reveals one. Feeds typed-member completion; absent for
     * every non-Groovy language and for untyped Groovy declarations.
     */
    readonly typeHint?: string;
}

interface DeclarationMatcher {
    readonly kind: LocalDeclaration["kind"];
    // Capture group 1 is the declared name.
    readonly pattern: RegExp;
}

// Keywords a loose assignment pattern could capture (`if = …` in a mangled
// script, ruby `end`, …). Cheap insurance across all four languages.
const STOP_WORDS = new Set([
    "if",
    "for",
    "while",
    "return",
    "def",
    "else",
    "end",
    "true",
    "false",
    "null",
    "nil",
    "new",
    "in",
    "case",
]);

// A line whose first non-whitespace chars open a comment is skipped entirely.
// `*` catches the continuation lines of javadoc-style block comments.
const COMMENT_OPENERS: Record<string, readonly string[]> = {
    groovy: ["//", "/*", "*"],
    javascript: ["//", "/*", "*"],
    python: ["#"],
    ruby: ["#"],
};

/**
 * Matchers per VS Code language id (see `ScriptLanguage.MAPPINGS`). Function
 * patterns come first: a Groovy `def helper(` must classify as a function
 * before the variable pattern gets a chance to consider the same line.
 */
const MATCHERS: Record<string, readonly DeclarationMatcher[]> = {
    groovy: [
        { kind: "function", pattern: /^\s*(?:def|[A-Z]\w*(?:<[^>]*>)?)\s+([A-Za-z_$][\w$]*)\s*\(/ },
        // `=(?!=)` keeps comparisons (`def x == y` noise) out; `;|$` accepts a
        // bare `def x` declaration without initializer.
        { kind: "variable", pattern: /^\s*(?:def|final)\s+([A-Za-z_$][\w$]*)\s*(?:=(?!=)|;|$)/ },
        // Typed declaration (`String x = …`). The initializer is required so a
        // stray `Foo bar` expression line doesn't register a variable.
        { kind: "variable", pattern: /^\s*[A-Z]\w*(?:<[^>]*>)?\s+([A-Za-z_$][\w$]*)\s*=(?!=)/ },
    ],
    javascript: [
        { kind: "function", pattern: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
        // First declarator only; `let a, b` yields just `a` (accepted gap).
        { kind: "variable", pattern: /^\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)/ },
    ],
    python: [
        { kind: "function", pattern: /^\s*def\s+([A-Za-z_]\w*)\s*\(/ },
        { kind: "variable", pattern: /^\s*([A-Za-z_]\w*)\s*=(?!=)/ },
    ],
    ruby: [
        { kind: "function", pattern: /^\s*def\s+([a-z_]\w*[!?]?)\b/ },
        // The lookahead rejects `==`, `=~`, and hash-rocket `=>` lines.
        { kind: "variable", pattern: /^\s*([a-z_]\w*)\s*=(?![=~>])/ },
    ],
};

/**
 * Infers a Groovy type name from a variable-declaration line so member
 * completion can resolve a cast-typed local. Groovy-only: it is the sole
 * scripting language whose runtime resolves a Java-style cast to a concrete
 * SPIN type the built-in catalog knows.
 *
 * Priority follows Groovy runtime semantics:
 *  1. A trailing `as` cast is applied last at runtime, so it wins over a
 *     declared type (`SpinJsonNode n = x as String` yields a `String`).
 *  2. The leading type of a typed declaration (`List<String> xs = …` → `List`).
 *  3. A SPIN initializer (`= S(` / `= JSON(`), mirroring the producer heuristic
 *     in `processVariables.ts`.
 *
 * The name is stamped verbatim without validating it against the catalog:
 * `methodsForType()` returns `[]` for an unknown or primitive type, so a
 * harmless `String x = …` typing costs nothing.
 */
function inferGroovyTypeHint(lineText: string): string | undefined {
    const cast = /\bas\s+([A-Z]\w*)\s*;?\s*$/.exec(lineText);
    if (cast) {
        return cast[1];
    }
    const typed = /^\s*([A-Z]\w*)(?:<[^>]*>)?\s+[A-Za-z_$][\w$]*\s*=(?!=)/.exec(lineText);
    if (typed) {
        return typed[1];
    }
    if (/=\s*(?:S|JSON)\s*\(/.test(lineText)) {
        return "SpinJsonNode";
    }
    return undefined;
}

/**
 * Collects the identifiers declared in `scriptText` for the given VS Code
 * language id. Duplicate names collapse to their first declaration (stable
 * completion order, and the self-suppression line stays the earliest one).
 * Unknown language ids yield `[]` so a `plaintext` fallback tab stays silent.
 */
export function collectLocalDeclarations(
    scriptText: string,
    languageId: string,
): LocalDeclaration[] {
    const matchers = MATCHERS[languageId];
    if (!matchers) {
        return [];
    }
    const commentOpeners = COMMENT_OPENERS[languageId] ?? [];

    const byName = new Map<string, LocalDeclaration>();
    const lines = scriptText.split(/\r?\n/);
    for (let line = 0; line < lines.length; line++) {
        const text = lines[line];
        const trimmed = text.trimStart();
        if (commentOpeners.some((opener) => trimmed.startsWith(opener))) {
            continue;
        }
        for (const { kind, pattern } of matchers) {
            const match = pattern.exec(text);
            if (!match) {
                continue;
            }
            const name = match[1];
            if (!STOP_WORDS.has(name) && !byName.has(name)) {
                const typeHint =
                    kind === "variable" && languageId === "groovy"
                        ? inferGroovyTypeHint(text)
                        : undefined;
                byName.set(name, { name, line, kind, typeHint });
            }
            // One declaration per line: the first (most specific) matcher wins.
            break;
        }
    }
    return [...byName.values()];
}
